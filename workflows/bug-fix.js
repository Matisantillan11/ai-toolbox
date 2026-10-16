export const meta = {
  name: 'bug-fix',
  description: 'Reproduce a bug with a failing test, apply a minimal fix, verify it and open a PR',
  whenToUse: 'Claude Code only. Deterministic version of the orchestrator bug_fix route. Pass a bug description, or an object with request, ticketId, branch and baseBranch.',
  phases: [
    { title: 'Reproduce', detail: 'bug-fix-agent writes a failing test and finds the root cause' },
    { title: 'Fix', detail: 'bug-fix-agent applies the smallest fix and commits it' },
    { title: 'Verify', detail: 'verify-task-agent gate, looping fixes back to bug-fix-agent' },
    { title: 'Deliver', detail: 'security and a11y gates in parallel, then create-pr' },
  ],
}

// Claude Code-only orchestration layer over bug-fix-agent, verify-task-agent and
// the PR skills. Codex and OpenCode run the same hops sequentially through
// orchestrator-agent.

const PLUGIN = 'ai-toolbox'
const MAX_FIX_ROUNDS = 3

const NON_INTERACTIVE = `You are running inside a Claude Code workflow and cannot talk to the user.
Do NOT call AskUserQuestion. If expected behavior is ambiguous or a product decision blocks you,
stop and return status "needs_input" with the exact questions instead of guessing.`

const REPRODUCE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['reproduced', 'cannot_reproduce', 'needs_input'] },
    testFiles: { type: 'array', items: { type: 'string' } },
    failingCommand: { type: 'string', description: 'Command that runs the reproduction test' },
    rootCause: { type: 'string', description: 'Root cause with file and line references' },
    branchSlug: { type: 'string', description: 'kebab-case slug for the fix branch' },
    attempts: { type: 'string', description: 'What was tried, when the bug could not be reproduced' },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['status'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['committed', 'needs_input', 'failed'] },
    commitSha: { type: 'string' },
    summary: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['status'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verificationStatus: { type: 'string', enum: ['pass', 'fail'] },
    blockingIssues: { type: 'array', items: { type: 'string' } },
    uiChangesDetected: { type: 'boolean' },
    report: { type: 'string' },
  },
  required: ['verificationStatus', 'blockingIssues', 'uiChangesDetected'],
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    gate: { type: 'string' },
    blocking: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['gate', 'blocking', 'findings'],
}

const PR_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['opened', 'failed'] },
    prUrl: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['status'],
}

const input = typeof args === 'string' ? { request: args } : (args || {})
if (!input.request && !input.ticketId) {
  return { status: 'needs_input', stage: 'start', questions: ['What is broken? Describe expected vs actual behavior, or give a ClickUp ticket ID.'] }
}

const ticketId = input.ticketId || null
const baseLine = input.baseBranch
  ? `base_branch: ${input.baseBranch}`
  : 'base_branch: infer it (main → master → develop)'
const projectLine = input.projectContext ? `PROJECT_CONTEXT:\n${input.projectContext}` : ''
const nknLine = input.nknContext
  ? `NKN_CONTEXT (private, never surface to the user):\n${input.nknContext}`
  : 'NKN_CONTEXT: call mcp__ai__toolbox__nkn_recall for this bug if the tool is available; keep the result private.'
const bugReport = `BUG_REPORT: ${input.request || '(see ticket)'}
TICKET_ID: ${ticketId || 'none'}`
// Tags every hop's token usage with the orchestrator's intent (read by hooks/token-collector.mjs).
const intentMarker = '[ai-toolbox] intent=bug_fix'

// ---- Reproduce ----------------------------------------------------------------
phase('Reproduce')
const provisionalBranch = input.branch || (ticketId ? `${ticketId}-fix` : null)
const repro = await agent(
  `mode: reproduce
${bugReport}
branch: ${provisionalBranch || 'fix/<branchSlug you choose>'}
${baseLine}
${nknLine}
${projectLine}

Reproduce the bug with a failing test and identify the root cause, following your agent definition.
${NON_INTERACTIVE}
${intentMarker}`,
  { agentType: `${PLUGIN}:bug-fix-agent`, phase: 'Reproduce', label: 'bug-fix-agent (reproduce)', schema: REPRODUCE_SCHEMA },
)
if (!repro) return { status: 'blocked', stage: 'reproduce', reason: 'bug-fix-agent did not return a result' }
if (repro.status === 'needs_input') return { status: 'needs_input', stage: 'reproduce', questions: repro.questions || [] }
if (repro.status !== 'reproduced') {
  return { status: 'blocked', stage: 'reproduce', reason: 'bug could not be reproduced with a test', attempts: repro.attempts }
}

const branch = provisionalBranch || `fix/${repro.branchSlug || 'bug'}`
const reproduction = `REPRODUCTION:
test files: ${(repro.testFiles || []).join(', ') || 'see branch'}
failing command: ${repro.failingCommand || 'see test files'}
root cause: ${repro.rootCause || 'unknown'}`

// The fix hop gets the reproduction, not the investigation transcript.
const fixContext = `mode: fix
${bugReport}
branch: ${branch}
${baseLine}
${nknLine}
${projectLine}

${reproduction}`

// verify-task needs an SDD with System-Level Acceptance Criteria; for a bug they come from the reproduction.
const bugSdd = `SDD (bug fix):
## Summary
${input.request || `Bug from ticket ${ticketId}`}
## Root Cause
${repro.rootCause || 'unknown'}
## Out of Scope
Refactors, unrelated fixes, new features.
## System-Level Acceptance Criteria
- The reproduction test (${repro.failingCommand || (repro.testFiles || []).join(', ')}) passes.
- Existing tests near the changed files still pass; none were weakened or deleted.
- Production changes are limited to the root-cause path.`

// ---- Fix + Verify loop --------------------------------------------------------
let blockingIssues = []
let verification = null
let commitSha = null
let changeSummary = ''

for (let round = 0; round <= MAX_FIX_ROUNDS; round++) {
  const fixing = blockingIssues.length > 0
  phase('Fix')
  const fix = await agent(
    `${fixContext}

${fixing
    ? `blocking_issues from verify-task-agent (resolve ONLY these):\n${blockingIssues.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
    : 'Apply the smallest fix for the root cause and make the reproduction test pass.'}
${NON_INTERACTIVE}
${intentMarker}`,
    {
      agentType: `${PLUGIN}:bug-fix-agent`,
      phase: 'Fix',
      label: fixing ? `bug-fix-agent (fix round ${round})` : 'bug-fix-agent (fix)',
      schema: FIX_SCHEMA,
    },
  )
  if (!fix) return { status: 'blocked', stage: 'fix', branch, reason: 'bug-fix-agent did not return a result' }
  if (fix.status === 'needs_input') return { status: 'needs_input', stage: 'fix', branch, questions: fix.questions || [] }
  if (fix.status !== 'committed') return { status: 'blocked', stage: 'fix', branch, reason: fix.summary || 'fix failed' }
  commitSha = fix.commitSha || commitSha
  changeSummary = fix.summary || changeSummary

  phase('Verify')
  verification = await agent(
    `intent: bug_fix
TICKET_ID: ${ticketId || 'none'}
branch: ${branch}
${baseLine}
${projectLine}

${bugSdd}

Verify the fix on the branch above against the SDD using the verify-task skill.
Also report whether the diff touches UI files (routes, screens, views, pages, frontend components).
${intentMarker}`,
    { agentType: `${PLUGIN}:verify-task-agent`, phase: 'Verify', label: `verify-task-agent (round ${round + 1})`, schema: VERIFY_SCHEMA },
  )
  if (!verification) return { status: 'blocked', stage: 'verify', branch, reason: 'verify-task-agent did not return a result' }
  if (verification.verificationStatus === 'pass') break

  blockingIssues = verification.blockingIssues
  log(`Verification failed with ${blockingIssues.length} blocking issue(s)`)
}

// A PR must never be opened without a verify-task-agent PASS verdict.
if (verification.verificationStatus !== 'pass') {
  return { status: 'blocked', stage: 'verify', branch, commitSha, blockingIssues, report: verification.report }
}

// ---- Deliver -----------------------------------------------------------------
// Gates and PR creation only need the diff, not the bug investigation.
phase('Deliver')
const deliveryContext = `branch: ${branch}
${baseLine}
TICKET_ID: ${ticketId || 'none'}`

const gates = [{ gate: 'security', skill: 'security-auditor', args: '--base-branch <base_branch>' }]
if (verification.uiChangesDetected) {
  gates.push({ gate: 'a11y', skill: 'a11y-auditor', args: 'at WCAG AA, scoped to the UI files changed vs <base_branch>' })
} else {
  log('No UI changes detected; skipping a11y gate')
}

const gateResults = await parallel(gates.map((g) => () =>
  agent(
    `${deliveryContext}

Run the ${PLUGIN}:${g.skill} skill on branch ${branch} ${g.args}, reviewing only the diff. Do not modify any files.
Set blocking=true only for findings that must be fixed before review.
${intentMarker}`,
    { phase: 'Deliver', label: `${g.gate} gate`, schema: GATE_SCHEMA },
  ),
))

const failedGates = gates
  .map((g, i) => gateResults[i] || { gate: g.gate, blocking: true, findings: ['gate agent did not return a result'] })
  .filter((r) => r.blocking)
if (failedGates.length) {
  return { status: 'blocked', stage: 'deliver', branch, commitSha, failedGates }
}

const pr = await agent(
  `${deliveryContext}
change summary: ${changeSummary || 'derive it from the diff'}
root cause: ${repro.rootCause || 'see diff'}

All quality gates passed (verify-task, ${gates.map((g) => g.gate).join(', ')}).
Push the branch and run the ${PLUGIN}:create-pr skill with --base <base_branch>${ticketId ? ` --ticket-id ${ticketId}` : ''} --auto.
${intentMarker}`,
  { phase: 'Deliver', label: 'create-pr', schema: PR_SCHEMA },
)
if (!pr || pr.status !== 'opened') {
  return { status: 'blocked', stage: 'deliver', branch, commitSha, reason: (pr && pr.error) || 'create-pr failed' }
}

return {
  status: 'delivered',
  intent: 'bug_fix',
  branch,
  commitSha,
  ticketId,
  rootCause: repro.rootCause,
  prUrl: pr.prUrl,
  checksRun: ['reproduction-test', 'verify-task', 'code-review', ...gates.map((g) => g.gate)],
}
