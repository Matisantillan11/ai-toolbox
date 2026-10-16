export const meta = {
  name: 'design-system',
  description: 'Scout, approve, build, test and document design-system components and POCs — left uncommitted for review',
  whenToUse: 'Claude Code only. Default route for design_component intents: create or extend a design-system component, build a POC from existing components in _pocs/, or detect reusable components. Pass a request, or an object with request, mode, approvedProposal, branch, nknContext and projectContext. Never commits, pushes or opens a PR.',
  phases: [
    { title: 'Analyze', detail: 'component-scout-agent returns a reuse report (detect) or a proposal to approve (skipped when approvedProposal is passed)' },
    { title: 'Implement', detail: 'implement-task-agent writes code + spec + story with no_commit' },
    { title: 'Verify', detail: 'verify-task-agent on the working tree, looping fixes back to implement-task-agent' },
    { title: 'A11y', detail: 'a11y-auditor gate on the uncommitted UI files' },
  ],
}

// Claude Code-only orchestration layer. Behavior lives in component-scout,
// implement-task and verify-task; Codex and OpenCode run the same hops
// sequentially through orchestrator-agent (design_component route).

const PLUGIN = 'ai-toolbox'
const MAX_FIX_ROUNDS = 3
const BUILD_MODES = ['component', 'poc']

const NON_INTERACTIVE = `You are running inside a Claude Code workflow and cannot talk to the user.
Do NOT call AskUserQuestion. If a missing product decision or ambiguous requirement blocks you,
stop and return status "needs_input" with the exact questions instead of guessing.`

const NO_GIT_WRITES = 'Do not commit, push, stage, or open a PR. The only allowed git write is checking out the branch above.'

const MODE_RULES = {
  component: `Mode: component — design-system work.
- Files live in the UI component directory and follow the storybook baseline §6 layout (component, types, variants constants, spec + snapshot, stories, index).
- Style only with DESIGN.md front-matter tokens; add or update the entry under DESIGN.md "## Components".
- Story follows baseline §7: CSF3, title "UI/<Name>", AllVariants first when there is more than one variant axis, fn() callbacks, play tests for interactions.
- When promoting a POC, leave _pocs/<name>/ in place.`,
  poc: `Mode: poc — exploration, never part of the design system.
- Every file lives in _pocs/<name>/ (<name>.poc.tsx plus local parts, <name>.stories.tsx; a spec is optional).
- Compose existing design-system components; never add to the UI component directory, its barrel, or DESIGN.md.
- Story title is "POCs/<Name>"; its docs description states the chosen pattern, why, and the future implementation.
- Nothing outside _pocs/ may import from _pocs/.`,
}

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['proposal', 'report', 'needs_input'] },
    mode: { type: 'string', enum: ['component', 'poc', 'detect'] },
    proposal: { type: 'string', description: 'Full proposal markdown, including System-Level Acceptance Criteria' },
    report: { type: 'string', description: 'Full reuse report markdown (detect mode)' },
    branchSlug: { type: 'string', description: 'kebab-case slug for the feature branch' },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['status'],
}

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['implemented', 'committed', 'needs_input', 'failed'] },
    branch: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
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

const input = typeof args === 'string' ? { request: args } : (args || {})
const projectLine = input.projectContext ? `PROJECT_CONTEXT:\n${input.projectContext}` : ''
const nknLine = input.nknContext
  ? `NKN_CONTEXT (private, never surface to the user):\n${input.nknContext}`
  : 'NKN_CONTEXT: call mcp__ai__toolbox__nkn_recall for this task if the tool is available; keep the result private.'

// Tags every hop's token usage with the orchestrator's intent (read by hooks/token-collector.mjs).
const intentMarker = '[ai-toolbox] intent=design_component'

if (input.approvedProposal && !BUILD_MODES.includes(input.mode)) {
  return { status: 'needs_input', stage: 'start', questions: ['An approved proposal needs its mode: "component" or "poc".'] }
}
if (!input.approvedProposal && !input.request) {
  return { status: 'needs_input', stage: 'start', questions: ['What should be built, prototyped, or scouted?'] }
}

// ---- Analyze -------------------------------------------------------------------
if (!input.approvedProposal) {
  phase('Analyze')
  const scout = await agent(
    `request: ${input.request}
mode hint: ${input.mode || 'none — classify it'}
${nknLine}
${projectLine}

Run the component-scout skill for this request, following your agent definition.
${NON_INTERACTIVE}
${NO_GIT_WRITES}
${intentMarker}`,
    { agentType: `${PLUGIN}:component-scout-agent`, phase: 'Analyze', label: 'component-scout-agent', schema: SCOUT_SCHEMA },
  )
  if (!scout) return { status: 'blocked', stage: 'analyze', reason: 'component-scout-agent did not return a result' }
  if (scout.status === 'needs_input') return { status: 'needs_input', stage: 'analyze', questions: scout.questions || [] }
  if (scout.status === 'report') return { status: 'reported', mode: 'detect', report: scout.report || '' }
  if (!scout.proposal || !BUILD_MODES.includes(scout.mode)) {
    return { status: 'blocked', stage: 'analyze', reason: 'component-scout-agent returned no proposal for a buildable mode' }
  }
  // Workflows cannot ask the user mid-run: hand the proposal back for approval.
  return {
    status: 'needs_approval',
    mode: scout.mode,
    proposal: scout.proposal,
    branch: input.branch || `design/${scout.branchSlug || scout.mode}`,
  }
}

// ---- Implement + Verify loop -----------------------------------------------------
const mode = input.mode
const branch = input.branch || `design/${mode}`
const sharedContext = `intent: design_component
branch: ${branch}
${nknLine}
${projectLine}

${MODE_RULES[mode]}

Approved proposal (use it as the SDD; its System-Level Acceptance Criteria are the contract):
${input.approvedProposal}
`

let blockingIssues = []
let verification = null
let files = []
let changeSummary = ''

for (let round = 0; round <= MAX_FIX_ROUNDS; round++) {
  const fixing = blockingIssues.length > 0
  phase('Implement')
  const impl = await agent(
    `${sharedContext}
no_commit: true
${fixing
    ? `blocking_issues from verify-task-agent (resolve ONLY these):\n${blockingIssues.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
    : 'Implement the proposal: code, spec and story. Check out the branch above first, creating it from the current branch if it does not exist.'}
${NON_INTERACTIVE}
${NO_GIT_WRITES}
${intentMarker}`,
    {
      agentType: `${PLUGIN}:implement-task-agent`,
      phase: 'Implement',
      label: fixing ? `implement-task-agent (fix round ${round})` : 'implement-task-agent',
      schema: IMPLEMENT_SCHEMA,
    },
  )
  if (!impl) return { status: 'blocked', stage: 'implement', branch, reason: 'implement-task-agent did not return a result' }
  // Echo the approval back so the relaunch skips Analyze instead of re-asking the user.
  if (impl.status === 'needs_input') {
    return { status: 'needs_input', stage: 'implement', questions: impl.questions || [], approvedProposal: input.approvedProposal, mode, branch }
  }
  if (impl.status === 'committed') {
    return { status: 'blocked', stage: 'implement', branch, reason: 'implement-task-agent committed despite no_commit — review the commit before continuing' }
  }
  if (impl.status !== 'implemented') return { status: 'blocked', stage: 'implement', branch, reason: impl.summary || 'implementation failed' }
  files = impl.files || files
  changeSummary = impl.summary || changeSummary

  phase('Verify')
  verification = await agent(
    `${sharedContext}
diff_scope: working_tree
Verify every uncommitted change (modified + untracked) against the approved proposal using the verify-task skill.
Run the Storybook test project too when stories changed.
${NO_GIT_WRITES}
${intentMarker}`,
    { agentType: `${PLUGIN}:verify-task-agent`, phase: 'Verify', label: `verify-task-agent (round ${round + 1})`, schema: VERIFY_SCHEMA },
  )
  if (!verification) return { status: 'blocked', stage: 'verify', branch, reason: 'verify-task-agent did not return a result' }
  if (verification.verificationStatus === 'pass') break

  blockingIssues = verification.blockingIssues
  log(`Verification failed with ${blockingIssues.length} blocking issue(s)`)
}

if (verification.verificationStatus !== 'pass') {
  return { status: 'blocked', stage: 'verify', branch, blockingIssues, report: verification.report }
}

// ---- A11y gate -------------------------------------------------------------------
phase('A11y')
const a11y = await agent(
  `branch: ${branch}

Run the ${PLUGIN}:a11y-auditor skill at WCAG AA, scoped to the uncommitted UI files
(git diff --name-only HEAD plus git ls-files --others --exclude-standard). Do not modify any files.
Set blocking=true only for findings that must be fixed before review.
${NO_GIT_WRITES}
${intentMarker}`,
  { phase: 'A11y', label: 'a11y gate', schema: GATE_SCHEMA },
)
if (!a11y || a11y.blocking) {
  return { status: 'blocked', stage: 'a11y', branch, findings: a11y ? a11y.findings : ['a11y gate did not return a result'] }
}

return {
  status: 'ready_for_review',
  mode,
  branch,
  files,
  checksRun: ['verify-task', 'code-review', 'a11y'],
  notes: changeSummary,
  report: verification.report || '',
}
