import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

// Runs each Claude Code workflow script against stubbed agent()/parallel()/phase()/log()
// so the control flow (gates, fix loop, early exits) can be checked without Claude Code.

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

function loadWorkflow(name) {
  const path = fileURLToPath(new URL(`../workflows/${name}.js`, import.meta.url))
  const source = readFileSync(path, "utf-8")
  const metaMatch = source.match(/export const meta = (\{[\s\S]*?\n\})\n/)
  assert.ok(metaMatch, `${name}.js must start with a literal export const meta`)
  const meta = Function(`return (${metaMatch[1]})`)()
  const body = source.replace("export const meta", "const meta")
  const run = new AsyncFunction("agent", "parallel", "phase", "log", "args", body)
  return { meta, run }
}

function harness(respond) {
  const calls = []
  const phases = []
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts })
    return respond({ prompt, opts, calls })
  }
  const parallel = async (thunks) => Promise.all(thunks.map((thunk) => thunk().catch(() => null)))
  return { calls, phases, agent, parallel, phase: (title) => phases.push(title), log: () => {} }
}

function execute(workflow, args, respond) {
  const h = harness(respond)
  return workflow.run(h.agent, h.parallel, h.phase, h.log, args).then((result) => ({ result, ...h }))
}

const labelsOf = (calls) => calls.map((call) => call.opts.label)

const repoPath = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url))

test("every workflow agentType resolves to an agent file", () => {
  for (const file of readdirSync(repoPath("workflows")).filter((f) => f.endsWith(".js"))) {
    const source = readFileSync(repoPath(`workflows/${file}`), "utf-8")
    for (const [, name] of source.matchAll(/agentType: [`'](?:\$\{PLUGIN\}|ai-toolbox):([a-z-]+)[`']/g)) {
      assert.ok(existsSync(repoPath(`agents/${name}.md`)), `${file}: agents/${name}.md does not exist`)
    }
  }
  const scout = repoPath("agents/component-scout-agent.md")
  assert.ok(existsSync(scout), "agents/component-scout-agent.md does not exist")
  const frontmatter = readFileSync(scout, "utf-8").split("---")[1]
  assert.match(frontmatter, /skills:\n(?:\s+- .+\n)*\s+- component-scout\n/)
  assert.ok(existsSync(repoPath("skills/component-scout/SKILL.md")), "skills/component-scout/SKILL.md does not exist")
})

test("every phase() title is declared in meta.phases", () => {
  for (const name of ["deliver-task", "bug-fix", "design-system"]) {
    const { meta } = loadWorkflow(name)
    const declared = meta.phases.map((p) => p.title)
    const source = readFileSync(fileURLToPath(new URL(`../workflows/${name}.js`, import.meta.url)), "utf-8")
    for (const [, title] of source.matchAll(/phase: '([^']+)'|phase\('([^']+)'\)/g)) {
      if (title) assert.ok(declared.includes(title), `${name}: phase '${title}' missing from meta.phases`)
    }
    assert.equal(meta.name, name)
  }
})

test("deliver-task runs plan → implement → verify → gates → PR on the happy path", async () => {
  const workflow = loadWorkflow("deliver-task")
  const { result, calls } = await execute(workflow, { request: "add a health endpoint", intent: "refactor" }, ({ opts }) => {
    if (opts.label === "plan-expert-agent") return { status: "ok", sdd: "SDD body", subtasks: [{ id: "1", title: "x" }], branchSlug: "health" }
    if (opts.label === "implement-task-agent") return { status: "committed", commitSha: "abc" }
    if (opts.label.startsWith("verify-task-agent")) return { verificationStatus: "pass", blockingIssues: [], uiChangesDetected: false }
    if (opts.label === "security gate") return { gate: "security", blocking: false, findings: [] }
    if (opts.label === "create-pr") return { status: "opened", prUrl: "https://example/pr/1" }
    throw new Error(`unexpected agent ${opts.label}`)
  })

  assert.equal(result.status, "delivered")
  assert.equal(result.intent, "refactor")
  for (const call of calls) assert.match(call.prompt, /^\[ai-toolbox\] intent=refactor$/m)
  assert.equal(result.branch, "refactor/health")
  assert.deepEqual(labelsOf(calls), ["plan-expert-agent", "implement-task-agent", "verify-task-agent (round 1)", "security gate", "create-pr"])
  assert.equal(calls[0].opts.agentType, "ai-toolbox:plan-expert-agent")
  assert.match(calls[1].prompt, /SDD body/)
})

test("deliver-task skips planning when an SDD is supplied and runs a11y for UI diffs", async () => {
  const workflow = loadWorkflow("deliver-task")
  const { result, calls } = await execute(workflow, { sdd: "given SDD", intent: "implementation", ticketId: "CU-1", branch: "CU-1-x" }, ({ opts }) => {
    if (opts.label === "implement-task-agent") return { status: "committed" }
    if (opts.label.startsWith("verify-task-agent")) return { verificationStatus: "pass", blockingIssues: [], uiChangesDetected: true }
    if (opts.label.endsWith("gate")) return { gate: opts.label, blocking: false, findings: [] }
    if (opts.label === "create-pr") return { status: "opened", prUrl: "u" }
    throw new Error(`unexpected agent ${opts.label}`)
  })

  assert.equal(result.status, "delivered")
  assert.ok(!labelsOf(calls).includes("plan-expert-agent"))
  assert.ok(labelsOf(calls).includes("a11y gate"))
  assert.match(calls.at(-1).prompt, /--ticket-id CU-1/)
})

test("deliver-task feeds blocking issues back to implement and never opens a PR without PASS", async () => {
  const workflow = loadWorkflow("deliver-task")
  const { result, calls } = await execute(workflow, { sdd: "s", branch: "b" }, ({ opts }) => {
    if (opts.label.startsWith("implement-task-agent")) return { status: "committed" }
    if (opts.label.startsWith("verify-task-agent")) return { verificationStatus: "fail", blockingIssues: ["lint fails"], uiChangesDetected: false }
    throw new Error(`unexpected agent ${opts.label}`)
  })

  assert.equal(result.status, "blocked")
  assert.equal(result.stage, "verify")
  assert.ok(!labelsOf(calls).includes("create-pr"))
  assert.equal(calls.filter((c) => c.opts.label.startsWith("verify-task-agent")).length, 4)
  assert.match(calls[2].prompt, /1\. lint fails/)
})

test("deliver-task recovers when a fix round passes verification", async () => {
  const workflow = loadWorkflow("deliver-task")
  let verifyCount = 0
  const { result } = await execute(workflow, { sdd: "s", branch: "b" }, ({ opts }) => {
    if (opts.label.startsWith("implement-task-agent")) return { status: "committed" }
    if (opts.label.startsWith("verify-task-agent")) {
      verifyCount += 1
      return verifyCount === 1
        ? { verificationStatus: "fail", blockingIssues: ["test x"], uiChangesDetected: false }
        : { verificationStatus: "pass", blockingIssues: [], uiChangesDetected: false }
    }
    if (opts.label.endsWith("gate")) return { gate: "security", blocking: false, findings: [] }
    if (opts.label === "create-pr") return { status: "opened", prUrl: "u" }
    throw new Error(`unexpected agent ${opts.label}`)
  })
  assert.equal(result.status, "delivered")
})

test("deliver-task returns needs_input instead of asking the user", async () => {
  const workflow = loadWorkflow("deliver-task")
  const { result, calls } = await execute(workflow, "do the thing", () => ({ status: "needs_input", questions: ["Which API?"] }))
  assert.deepEqual(result, { status: "needs_input", stage: "plan", questions: ["Which API?"] })
  assert.match(calls[0].prompt, /Do NOT call AskUserQuestion/)
})

test("deliver-task blocks the PR when a gate fails", async () => {
  const workflow = loadWorkflow("deliver-task")
  const { result, calls } = await execute(workflow, { sdd: "s", branch: "b" }, ({ opts }) => {
    if (opts.label.startsWith("implement-task-agent")) return { status: "committed" }
    if (opts.label.startsWith("verify-task-agent")) return { verificationStatus: "pass", blockingIssues: [], uiChangesDetected: false }
    if (opts.label === "security gate") return { gate: "security", blocking: true, findings: ["SQL injection"] }
    throw new Error(`unexpected agent ${opts.label}`)
  })
  assert.equal(result.status, "blocked")
  assert.equal(result.stage, "deliver")
  assert.ok(!labelsOf(calls).includes("create-pr"))
})

test("deliver-task keeps the SDD out of gate and PR prompts", async () => {
  const workflow = loadWorkflow("deliver-task")
  const { calls } = await execute(workflow, { sdd: "SECRET-SDD-BODY", branch: "b" }, ({ opts }) => {
    if (opts.label.startsWith("implement-task-agent")) return { status: "committed", summary: "added endpoint" }
    if (opts.label.startsWith("verify-task-agent")) return { verificationStatus: "pass", blockingIssues: [], uiChangesDetected: true }
    if (opts.label.endsWith("gate")) return { gate: opts.label, blocking: false, findings: [] }
    if (opts.label === "create-pr") return { status: "opened", prUrl: "u" }
    throw new Error(`unexpected agent ${opts.label}`)
  })
  for (const call of calls.filter((c) => c.opts.phase === "Deliver")) {
    assert.doesNotMatch(call.prompt, /SECRET-SDD-BODY/, `${call.opts.label} should not receive the SDD`)
    assert.match(call.prompt, /branch: b/)
  }
  assert.match(calls.at(-1).prompt, /change summary: added endpoint/)
})

const bugResponder = (overrides = {}) => ({ opts }) => {
  if (overrides[opts.label]) return overrides[opts.label]()
  if (opts.label === "bug-fix-agent (reproduce)") return { status: "reproduced", testFiles: ["a.test.ts"], failingCommand: "pnpm test a", rootCause: "off by one in a.ts:10", branchSlug: "off-by-one" }
  if (opts.label.startsWith("bug-fix-agent (fix")) return { status: "committed", commitSha: "f1x", summary: "clamp index" }
  if (opts.label.startsWith("verify-task-agent")) return { verificationStatus: "pass", blockingIssues: [], uiChangesDetected: false }
  if (opts.label.endsWith("gate")) return { gate: "security", blocking: false, findings: [] }
  if (opts.label === "create-pr") return { status: "opened", prUrl: "https://example/pr/2" }
  throw new Error(`unexpected agent ${opts.label}`)
}

test("bug-fix runs reproduce → fix → verify → gates → PR", async () => {
  const workflow = loadWorkflow("bug-fix")
  const { result, calls } = await execute(workflow, "list crashes on empty page", bugResponder())
  assert.equal(result.status, "delivered")
  assert.equal(result.branch, "fix/off-by-one")
  for (const call of calls) assert.match(call.prompt, /^\[ai-toolbox\] intent=bug_fix$/m)
  assert.deepEqual(labelsOf(calls), ["bug-fix-agent (reproduce)", "bug-fix-agent (fix)", "verify-task-agent (round 1)", "security gate", "create-pr"])
  assert.equal(calls[0].opts.agentType, "ai-toolbox:bug-fix-agent")
  assert.match(calls[1].prompt, /mode: fix[\s\S]*root cause: off by one in a.ts:10/)
  assert.match(calls[2].prompt, /System-Level Acceptance Criteria[\s\S]*pnpm test a/)
  assert.doesNotMatch(calls[3].prompt, /root cause/)
})

test("bug-fix stops when the bug cannot be reproduced", async () => {
  const workflow = loadWorkflow("bug-fix")
  const { result, calls } = await execute(workflow, { request: "flaky", ticketId: "CU-7" }, bugResponder({
    "bug-fix-agent (reproduce)": () => ({ status: "cannot_reproduce", attempts: "ran suite 5x" }),
  }))
  assert.equal(result.status, "blocked")
  assert.equal(result.stage, "reproduce")
  assert.equal(calls.length, 1)
  assert.match(calls[0].prompt, /branch: CU-7-fix/)
})

test("bug-fix loops verify failures back to the fix hop and caps the rounds", async () => {
  const workflow = loadWorkflow("bug-fix")
  const { result, calls } = await execute(workflow, "bug", ({ opts, ...rest }) => {
    if (opts.label.startsWith("verify-task-agent")) return { verificationStatus: "fail", blockingIssues: ["regression in b.test.ts"], uiChangesDetected: false }
    return bugResponder()({ opts, ...rest })
  })
  assert.equal(result.status, "blocked")
  assert.equal(result.stage, "verify")
  assert.ok(!labelsOf(calls).includes("create-pr"))
  assert.equal(calls.filter((c) => c.opts.label.startsWith("bug-fix-agent (fix")).length, 4)
  assert.match(calls.find((c) => c.opts.label === "bug-fix-agent (fix round 1)").prompt, /1\. regression in b.test.ts/)
})

test("bug-fix asks for input when nothing describes the bug", async () => {
  const workflow = loadWorkflow("bug-fix")
  const { result, calls } = await execute(workflow, {}, () => { throw new Error("no agents expected") })
  assert.equal(result.status, "needs_input")
  assert.equal(calls.length, 0)
})

// ---- design-system -------------------------------------------------------------

const designResponder = (overrides = {}) => ({ opts }) => {
  if (overrides[opts.label]) return overrides[opts.label]()
  if (opts.label === "component-scout-agent") return { status: "proposal", mode: "component", proposal: "P", branchSlug: "stepper" }
  if (opts.label.startsWith("implement-task-agent")) return { status: "implemented", files: ["a.tsx"], summary: "added Stepper" }
  if (opts.label.startsWith("verify-task-agent")) return { verificationStatus: "pass", blockingIssues: [], uiChangesDetected: true }
  if (opts.label === "a11y gate") return { gate: "a11y", blocking: false, findings: [] }
  throw new Error(`unexpected agent ${opts.label}`)
}
const approved = { approvedProposal: "P", mode: "component", branch: "design/x" }

test("design-system detect mode returns the report without implementing", async () => {
  const workflow = loadWorkflow("design-system")
  const { result, calls } = await execute(workflow, "what can I reuse for a pricing table?", designResponder({
    "component-scout-agent": () => ({ status: "report", mode: "detect", report: "R" }),
  }))
  assert.deepEqual(result, { status: "reported", mode: "detect", report: "R" })
  assert.deepEqual(labelsOf(calls), ["component-scout-agent"])
  assert.equal(calls[0].opts.agentType, "ai-toolbox:component-scout-agent")
})

test("design-system pauses for approval after analysis", async () => {
  const workflow = loadWorkflow("design-system")
  const { result, calls } = await execute(workflow, { request: "POC of a checkout summary" }, designResponder({
    "component-scout-agent": () => ({ status: "proposal", mode: "poc", proposal: "P", branchSlug: "checkout" }),
  }))
  assert.deepEqual(result, { status: "needs_approval", mode: "poc", proposal: "P", branch: "design/checkout" })
  assert.equal(calls.length, 1)
})

test("design-system with an approved proposal skips analysis and ends ready for review", async () => {
  const workflow = loadWorkflow("design-system")
  const { result, calls } = await execute(workflow, approved, designResponder())
  assert.deepEqual(labelsOf(calls), ["implement-task-agent", "verify-task-agent (round 1)", "a11y gate"])
  for (const call of calls) assert.match(call.prompt, /^\[ai-toolbox\] intent=design_component$/m)
  assert.equal(result.status, "ready_for_review")
  assert.equal(result.branch, "design/x")
  assert.deepEqual(result.files, ["a.tsx"])
  assert.deepEqual(result.checksRun, ["verify-task", "code-review", "a11y"])
  assert.match(calls[0].prompt, /no_commit: true/)
  assert.match(calls[0].prompt, /\nP\n/)
  assert.match(calls[1].prompt, /diff_scope: working_tree/)
})

test("design-system loops fixes and blocks after 3 rounds", async () => {
  const workflow = loadWorkflow("design-system")
  const { result, calls } = await execute(workflow, approved, designResponder({
    "verify-task-agent (round 1)": () => ({ verificationStatus: "fail", blockingIssues: ["story missing"], uiChangesDetected: true }),
    "verify-task-agent (round 2)": () => ({ verificationStatus: "fail", blockingIssues: ["story missing"], uiChangesDetected: true }),
    "verify-task-agent (round 3)": () => ({ verificationStatus: "fail", blockingIssues: ["story missing"], uiChangesDetected: true }),
    "verify-task-agent (round 4)": () => ({ verificationStatus: "fail", blockingIssues: ["story missing"], uiChangesDetected: true }),
  }))
  assert.equal(result.status, "blocked")
  assert.equal(result.stage, "verify")
  assert.equal(calls.filter((c) => c.opts.label.startsWith("verify-task-agent")).length, 4)
  assert.match(calls.find((c) => c.opts.label === "implement-task-agent (fix round 1)").prompt, /1\. story missing/)
  assert.ok(!labelsOf(calls).includes("a11y gate"))
})

test("design-system never commits, pushes or opens a PR", async () => {
  const workflow = loadWorkflow("design-system")
  const first = await execute(workflow, "add a Stepper component", designResponder())
  const second = await execute(workflow, approved, designResponder())
  const calls = [...first.calls, ...second.calls]
  assert.ok(!labelsOf(calls).includes("create-pr"))
  for (const call of calls) {
    assert.match(call.prompt, /Do not commit, push, stage, or open a PR/, `${call.opts.label} lacks the no-git-writes rule`)
    assert.doesNotMatch(call.prompt, /create-pr/, `${call.opts.label} mentions create-pr`)
  }
})

test("design-system surfaces needs_input from analysis", async () => {
  const workflow = loadWorkflow("design-system")
  const { result, calls } = await execute(workflow, "build a reusable POC", designResponder({
    "component-scout-agent": () => ({ status: "needs_input", mode: "component", questions: ["Which mode?"] }),
  }))
  assert.deepEqual(result, { status: "needs_input", stage: "analyze", questions: ["Which mode?"] })
  assert.match(calls[0].prompt, /Do NOT call AskUserQuestion/)
})

test("design-system rejects an approved proposal without a buildable mode", async () => {
  const workflow = loadWorkflow("design-system")
  for (const args of [{ approvedProposal: "P" }, { approvedProposal: "P", mode: "detect" }]) {
    const { result, calls } = await execute(workflow, args, designResponder())
    assert.equal(result.status, "needs_input")
    assert.equal(result.stage, "start")
    assert.equal(calls.length, 0)
  }
})

test("design-system blocks when the scout returns nothing", async () => {
  const workflow = loadWorkflow("design-system")
  const { result } = await execute(workflow, "add a Stepper", designResponder({ "component-scout-agent": () => null }))
  assert.equal(result.status, "blocked")
  assert.equal(result.stage, "analyze")
})

test("design-system blocks when implement commits despite no_commit", async () => {
  const workflow = loadWorkflow("design-system")
  const { result, calls } = await execute(workflow, approved, designResponder({
    "implement-task-agent": () => ({ status: "committed", commitSha: "abc" }),
  }))
  assert.equal(result.status, "blocked")
  assert.equal(result.stage, "implement")
  assert.match(result.reason, /no_commit/)
  assert.equal(calls.length, 1)
})

test("design-system treats a missing a11y result as blocking", async () => {
  const workflow = loadWorkflow("design-system")
  const { result } = await execute(workflow, approved, designResponder({ "a11y gate": () => null }))
  assert.equal(result.status, "blocked")
  assert.equal(result.stage, "a11y")
})

test("design-system keeps the approval when implement needs input", async () => {
  const workflow = loadWorkflow("design-system")
  const { result } = await execute(workflow, approved, designResponder({
    "implement-task-agent": () => ({ status: "needs_input", questions: ["Which icon?"] }),
  }))
  assert.deepEqual(result, { status: "needs_input", stage: "implement", questions: ["Which icon?"], approvedProposal: "P", mode: "component", branch: "design/x" })
})

test("design-system review summary carries the verification report", async () => {
  const workflow = loadWorkflow("design-system")
  const { result } = await execute(workflow, approved, designResponder({
    "verify-task-agent (round 1)": () => ({ verificationStatus: "pass", blockingIssues: [], uiChangesDetected: true, report: "VR" }),
  }))
  assert.equal(result.report, "VR")
})
