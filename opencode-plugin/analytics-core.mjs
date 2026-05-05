const ORCHESTRATOR_AGENT = "orchestrator-agent"

const AI_TOOLBOX_AGENTS = new Set([
  ORCHESTRATOR_AGENT,
  "planning-features-agent",
  "feature-discovery-agent",
  "plan-expert-agent",
  "implement-task-agent",
  "design-system-setup-agent",
])

export function createSessionState(parentID = null) {
  return {
    parentID,
    messages: new Map(),
    skillCallIDs: new Set(),
  }
}

export function isAiToolboxAgent(agent) {
  return AI_TOOLBOX_AGENTS.has(agent)
}

export function getTokensSpent(tokens) {
  if (!tokens) {
    return 0
  }

  if (typeof tokens.total === "number") {
    return tokens.total
  }

  return [
    tokens.input,
    tokens.output,
    tokens.reasoning,
    tokens.cache?.read,
    tokens.cache?.write,
  ].reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0)
}

function ensureMessage(state, messageID) {
  const existing = state.messages.get(messageID)
  if (existing) {
    return existing
  }

  const created = {
    agent: null,
    tokensSpent: 0,
    completed: false,
    skills: [],
  }
  state.messages.set(messageID, created)
  return created
}

export function registerSkillCall(state, part) {
  if (part.type !== "tool" || part.tool !== "skill") {
    return false
  }

  if (state.skillCallIDs.has(part.callID)) {
    return false
  }

  const input = part.state?.input
  const skillName = typeof input?.name === "string" ? input.name : null
  if (!skillName) {
    return false
  }

  state.skillCallIDs.add(part.callID)
  ensureMessage(state, part.messageID).skills.push(skillName)
  return true
}

export function registerAssistantMessage(state, message) {
  if (message.role !== "assistant" || !message.time?.completed || !isAiToolboxAgent(message.agent)) {
    return false
  }

  const record = ensureMessage(state, message.id)
  record.agent = message.agent
  record.tokensSpent = getTokensSpent(message.tokens)
  record.completed = true
  return true
}

function classifyName(name, type) {
  if (name.includes("review") || name.includes("qa")) {
    return "qa"
  }

  if (name.includes("design")) {
    return "design"
  }

  if (name.includes("plan")) {
    return "planning"
  }

  if (name.includes("refactor")) {
    return "refactor"
  }

  if (name.includes("feature") || name.includes("discovery") || name.includes("implement") || name.includes("create-pr")) {
    return "feature"
  }

  return type === "skill" ? "research" : "research"
}

function allocateTokensByCount(totalTokens, counts) {
  const entries = [...counts.entries()]
  const totalCalls = entries.reduce((sum, [, count]) => sum + count, 0)

  if (totalCalls === 0) {
    return new Map()
  }

  let remainingTokens = totalTokens
  let remainingCalls = totalCalls
  const allocation = new Map()

  for (const [name, count] of entries) {
    const tokensForName = remainingCalls === 0 ? 0 : Math.round((remainingTokens * count) / remainingCalls)
    allocation.set(name, tokensForName)
    remainingTokens -= tokensForName
    remainingCalls -= count
  }

  return allocation
}

export function buildExecutionRecords(sessionID, state) {
  const records = []
  const agentTotals = new Map()
  const skillTotals = new Map()

  for (const message of state.messages.values()) {
    if (!message.completed || !message.agent) {
      continue
    }

    const callerAgent = message.agent === ORCHESTRATOR_AGENT
      ? ORCHESTRATOR_AGENT
      : state.parentID
        ? ORCHESTRATOR_AGENT
        : message.agent

    const agentKey = `${callerAgent}:${message.agent}`
    const agentExisting = agentTotals.get(agentKey) ?? {
      callerAgent,
      invokedName: message.agent,
      invocationType: "agent",
      actionClassification: classifyName(message.agent, "agent"),
      callCount: 0,
      tokensSpent: 0,
    }
    agentExisting.callCount += 1
    agentExisting.tokensSpent += message.tokensSpent
    agentTotals.set(agentKey, agentExisting)

    if (message.skills.length === 0) {
      continue
    }

    const skillCounts = new Map()
    for (const skillName of message.skills) {
      skillCounts.set(skillName, (skillCounts.get(skillName) ?? 0) + 1)
    }

    const skillTokens = allocateTokensByCount(message.tokensSpent, skillCounts)
    for (const [skillName, callCount] of skillCounts.entries()) {
      const skillKey = `${message.agent}:${skillName}`
      const skillExisting = skillTotals.get(skillKey) ?? {
        callerAgent: message.agent,
        invokedName: skillName,
        invocationType: "skill",
        actionClassification: classifyName(skillName, "skill"),
        callCount: 0,
        tokensSpent: 0,
      }
      skillExisting.callCount += callCount
      skillExisting.tokensSpent += skillTokens.get(skillName) ?? 0
      skillTotals.set(skillKey, skillExisting)
    }
  }

  for (const record of agentTotals.values()) {
    records.push({
      ...record,
      runId: `${sessionID}:agent:${record.callerAgent}:${record.invokedName}`,
      trace: `agent:${record.invokedName}`,
    })
  }

  for (const record of skillTotals.values()) {
    records.push({
      ...record,
      runId: `${sessionID}:skill:${record.callerAgent}:${record.invokedName}`,
      trace: `skill:${record.invokedName}`,
    })
  }

  return records
}
