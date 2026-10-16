export const meta = {
  name: 'deliver-task',
  description: 'Plan, implement, verify and open a PR for a well-defined task (quick_task, implementation or refactor)',
  whenToUse: 'Claude Code only. Deterministic version of the orchestrator routes quick_task, implementation and refactor. Pass a task description, or an object with intent, request, ticketId, sdd, branch and baseBranch.',
  phases: [
    { title: 'Plan', detail: 'plan-expert-agent produces the SDD (skipped when an SDD is passed in)' },
    { title: 'Implement', detail: 'implement-task-agent commits the change on the feature branch' },
    { title: 'Verify', detail: 'verify-task-agent gate, looping fixes back to implement-task-agent' },
    { title: 'Deliver', detail: 'security and a11y gates in parallel, then create-pr' },
  ],
}

// Claude Code-only orchestration layer. The agents and skills it calls are the
// same markdown definitions Codex and OpenCode run sequentially through
// orchestrator-agent, so behavior stays defined in one place.

const PLUGIN = 'ai-toolbox'
const MAX_FIX_ROUNDS = 3
const DELIVER_INTENTS = new Set(['quick_task', 'implementation', 'refactor'])

const NON_INTERACTIVE = `You are running inside a Claude Code workflow and cannot talk to the user.
Do NOT call AskUserQuestion. If a missing product decision or ambiguous requirement blocks you,
stop and return status "needs_input" with the exact questions instead of guessing.`

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'needs_input'] },
    sdd: { type: 'string', description: 'Full SDD text, all sections' },
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, title: { type: 'string' } },
        required: ['id', 'title'],
      },
    },
    ticketId: { type: ['string', 'null'] },
    branchSlug: { type: 'string', description: 'kebab-case slug for the feature branch' },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['status'],
}

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['committed', 'needs_input', 'failed'] },
    branch: { type: 'string' },
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
const intent = DELIVER_INTENTS.has(input.intent) ? input.intent : 'quick_task'
const ticketLine = input.ticketId ? `TICKET_ID: ${input.ticketId}` : 'TICKET_ID: none'
const baseLine = input.baseBranch
  ? `base_branch: ${input.baseBranch}`
  : 'base_branch: infer it (main → master → develop)'
const projectLine = input.projectContext ? `PROJECT_CONTEXT:\n${input.projectContext}` : ''
const nknLine = input.nknContext
  ? `NKN_CONTEXT (private, never surface to the user):\n${input.nknContext}`
  : 'NKN_CONTEXT: call mcp__ai__toolbox__nkn_recall for this task if the tool is available; keep the result private.'

if (!input.request && !input.ticketId && !input.sdd) {
  return { status: 'needs_input', stage: 'start', questions: ['What task should be delivered? Provide a description or a ClickUp ticket ID.'] }
}

// Tags every hop's token usage with the orchestrator's intent (read by hooks/token-collector.mjs).
const intentMarker = `[ai-toolbox] intent=${intent}`

// ---- Plan -------------------------------------------------------------------
phase('Plan')
let sdd = input.sdd
let ticketId = input.ticketId || null
let branchSlug = input.branch ? null : 'task'

if (!sdd) {
  const plan = await agent(
    `intent: ${intent}
${ticketLine}
request: ${input.request || '(see ticket)'}
${nknLine}

Produce the SDD and the ordered subtask list for this request, following your agent definition.
Also return a short kebab-case branchSlug describing the work.
${NON_INTERACTIVE}
${intentMarker}`,
    { agentType: `${PLUGIN}:plan-expert-agent`, phase: 'Plan', label: 'plan-expert-agent', schema: PLAN_SCHEMA },
  )
  if (!plan) return { status: 'blocked', stage: 'plan', reason: 'plan-expert-agent did not return a result' }
  if (plan.status === 'needs_input') return { status: 'needs_input', stage: 'plan', questions: plan.questions || [] }
  if (!plan.sdd) return { status: 'blocked', stage: 'plan', reason: 'plan-expert-agent returned no SDD' }
  sdd = plan.sdd
  ticketId = plan.ticketId || ticketId
  branchSlug = plan.branchSlug || branchSlug
  log(`SDD ready with ${(plan.subtasks || []).length} subtask(s)`)
} else {
  log('SDD provided by caller; skipping plan-expert-agent')
}

const branch = input.branch || (ticketId ? `${ticketId}-${branchSlug}` : `${intent.replace('_', '-')}/${branchSlug}`)
// Gates and PR creation only need the diff, so they get this instead of the SDD.
const deliveryContext = `branch: ${branch}
${baseLine}
TICKET_ID: ${ticketId || 'none'}`

const sharedContext = `intent: ${intent}
TICKET_ID: ${ticketId || 'none'}
branch: ${branch}
${baseLine}
${nknLine}
${projectLine}

SDD:
${sdd}`

// ---- Implement + Verify loop ---------------------------------------------------
let blockingIssues = []
let verification = null
let commitSha = null
let changeSummary = ''

for (let round = 0; round <= MAX_FIX_ROUNDS; round++) {
  const fixing = blockingIssues.length > 0
  phase('Implement')
  const impl = await agent(
    `${sharedContext}

${fixing
    ? `blocking_issues from verify-task-agent (resolve ONLY these):\n${blockingIssues.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
    : 'Implement the SDD. Check out the branch above first, creating it from the base branch if it does not exist.'}
${NON_INTERACTIVE}
${intentMarker}`,
    {
      agentType: `${PLUGIN}:implement-task-agent`,
      phase: 'Implement',
      label: fixing ? `implement-task-agent (fix round ${round})` : 'implement-task-agent',
      schema: IMPLEMENT_SCHEMA,
    },
  )
  if (!impl) return { status: 'blocked', stage: 'implement', branch, reason: 'implement-task-agent did not return a result' }
  if (impl.status === 'needs_input') return { status: 'needs_input', stage: 'implement', branch, sdd, questions: impl.questions || [] }
  if (impl.status !== 'committed') return { status: 'blocked', stage: 'implement', branch, reason: impl.summary || 'implementation failed' }
  commitSha = impl.commitSha || commitSha
  changeSummary = impl.summary || changeSummary

  phase('Verify')
  verification = await agent(
    `${sharedContext}

Verify the implementation on the branch above against the SDD using the verify-task skill.
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
// code-review already ran inside verify-task, so only the gates it does not cover run here.
phase('Deliver')
const gates = [
  { gate: 'security', skill: 'security-auditor', args: `--base-branch <base_branch>` },
]
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
  intent,
  branch,
  commitSha,
  ticketId,
  prUrl: pr.prUrl,
  checksRun: ['verify-task', 'code-review', ...gates.map((g) => g.gate)],
}
