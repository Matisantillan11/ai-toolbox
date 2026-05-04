# Plan: Convert NKN learn/recall into a Node.js MCP

**Goal:** Replace the current `nkn-learn` and `nkn-recall` path with a Node.js MCP so all agents use one standardized interface by default.
**Scope:** Backend / API, Integrations, Testing, Infrastructure / DevOps, Documentation, Security
**Subtasks:** 6

---

### Subtask 1 — Audit current NKN behavior

#### Context
This project needs behavior parity with the existing learn/recall flow before any migration happens. The first step is to capture the current inputs, outputs, side effects, and failure modes.

#### What to implement
- Inspect the existing `nkn-learn` and `nkn-recall` implementations.
- Document current request/response shapes, error handling, and storage usage.
- Identify any local-file interactions and any assumptions made by downstream agents.
- Note anything that must remain unchanged during the MCP conversion.

#### Where
- `.opencode/skills/nkn-learn/SKILL.md`
- `.opencode/skills/nkn-recall/SKILL.md`
- `skills/nkn-learn/SKILL.md`
- `skills/nkn-recall/SKILL.md`
- Related NKN storage and local file modules

#### Acceptance criteria
- [ ] Current learn/recall behavior is documented in enough detail to implement parity.
- [ ] Existing inputs, outputs, and error cases are identified.
- [ ] Any local-file dependencies are explicitly listed.

#### Out of scope
N/A

#### Depends on
None

#### Technical notes
Focus on observable behavior, not assumptions. Capture empty-result recall behavior separately from actual failures.

#### Definition of done
- [ ] Implementation satisfies all acceptance criteria above
- [ ] Relevant unit or integration tests written and passing
- [ ] No new lint, type, or build errors introduced
- [ ] Code reviewed and approved by at least one teammate
- [ ] Any new public API or behavior is documented (inline or in relevant docs)

---

### Subtask 2 — Define the MCP tool contract

#### Context
The MCP needs a stable schema for `learn` and `recall` so all agents can call it consistently.

#### What to implement
- Define the Node.js MCP tool inputs and outputs for `learn` and `recall`.
- Preserve current behavior where possible, but normalize the shape where the existing contract is unclear.
- Specify how empty recall results are represented.
- Document any validation rules and any fields that must never be logged.

#### Where
- New MCP schema/types module
- Shared core contract definition
- Any adapter layer between agents and the NKN store

#### Acceptance criteria
- [ ] `learn` and `recall` schemas are defined in one place.
- [ ] Empty recall behavior is explicitly represented.
- [ ] Logging-safe fields and sensitive fields are identified.

#### Out of scope
Implementing the server runtime itself.

#### Depends on
- Subtask 1 — Audit current NKN behavior

#### Technical notes
Prefer a small contract surface. If current behavior is ambiguous, document the ambiguity instead of guessing.

#### Definition of done
- [ ] Implementation satisfies all acceptance criteria above
- [ ] Relevant unit or integration tests written and passing
- [ ] No new lint, type, or build errors introduced
- [ ] Code reviewed and approved by at least one teammate
- [ ] Any new public API or behavior is documented (inline or in relevant docs)

---

### Subtask 3 — Implement the shared NKN core

#### Context
The request handling logic should live outside the MCP wrapper so the behavior is reusable and testable.

#### What to implement
- Build a shared Node.js module for learn/recall behavior.
- Connect the module to the existing NKN store.
- Add local-file access where required by current behavior.
- Ensure recall can return an empty result without throwing.

#### Where
- New shared service/core directory
- Existing NKN store integration points
- Local file access helpers

#### Acceptance criteria
- [ ] Learn and recall logic is implemented as reusable core code.
- [ ] Existing store and file access work through the core module.
- [ ] Recall can return an empty result cleanly.

#### Out of scope
MCP protocol wiring.

#### Depends on
- Subtask 1 — Audit current NKN behavior
- Subtask 2 — Define the MCP tool contract

#### Technical notes
Keep the core free of MCP-specific concerns so it can be tested without a transport layer.

#### Definition of done
- [ ] Implementation satisfies all acceptance criteria above
- [ ] Relevant unit or integration tests written and passing
- [ ] No new lint, type, or build errors introduced
- [ ] Code reviewed and approved by at least one teammate
- [ ] Any new public API or behavior is documented (inline or in relevant docs)

---

### Subtask 4 — Build the Node.js MCP server wrapper

#### Context
The MCP server is the public entry point that agents will call.

#### What to implement
- Create the Node.js MCP server process.
- Register the `learn` and `recall` tools.
- Route each tool call into the shared NKN core.
- Map validation and runtime failures to clear MCP responses.

#### Where
- MCP server entrypoint
- MCP tool registration layer
- Tool handler modules

#### Acceptance criteria
- [ ] The MCP server starts and exposes `learn` and `recall`.
- [ ] Tool calls invoke the shared NKN core.
- [ ] Empty recall results are returned as valid MCP responses.

#### Out of scope
Agent migration and removal of old entry points.

#### Depends on
- Subtask 2 — Define the MCP tool contract
- Subtask 3 — Implement the shared NKN core

#### Technical notes
Keep wrapper logic thin. Most behavior should remain in the shared core.

#### Definition of done
- [ ] Implementation satisfies all acceptance criteria above
- [ ] Relevant unit or integration tests written and passing
- [ ] No new lint, type, or build errors introduced
- [ ] Code reviewed and approved by at least one teammate
- [ ] Any new public API or behavior is documented (inline or in relevant docs)

---

### Subtask 5 — Migrate agents to the MCP path

#### Context
The feature must become the default route for all agents, which means removing the old direct skill/agent usage.

#### What to implement
- Update agent configuration and references so they call the MCP by default.
- Remove or disable `nkn-learn` and `nkn-recall` skill/agent entry points.
- Verify that all agent consumers use the new MCP path.

#### Where
- Agent definitions
- Skill references
- Orchestration/config files
- Any startup or registration code that points at the old path

#### Acceptance criteria
- [ ] All agents are routed to the MCP by default.
- [ ] `nkn-learn` and `nkn-recall` are no longer used as skill/agent entry points.
- [ ] No remaining references point at the removed path in normal operation.

#### Out of scope
Changing the underlying NKN data model.

#### Depends on
- Subtask 4 — Build the Node.js MCP server wrapper

#### Technical notes
This is a full release, not a phased rollout. Watch for broken references in agent metadata and docs.

#### Definition of done
- [ ] Implementation satisfies all acceptance criteria above
- [ ] Relevant unit or integration tests written and passing
- [ ] No new lint, type, or build errors introduced
- [ ] Code reviewed and approved by at least one teammate
- [ ] Any new public API or behavior is documented (inline or in relevant docs)

---

### Subtask 6 — Add tests, logging, and documentation

#### Context
The migration needs to be verifiable and maintainable after rollout.

#### What to implement
- Add tests for the MCP wrapper and core behavior.
- Verify logging is present for requests and failures without sensitive payloads.
- Document how the MCP works, how agents use it, and what changed during migration.
- Confirm the strict access-control boundary is documented.

#### Where
- Test suite
- Logging middleware or utility modules
- README or equivalent documentation files
- Any maintainer-facing docs for the MCP

#### Acceptance criteria
- [ ] Tests cover success and empty-result cases.
- [ ] Logging is present and avoids sensitive content.
- [ ] Documentation explains the new Node.js MCP path.
- [ ] Strict access-control expectations are documented.

#### Out of scope
New feature work beyond learn/recall.

#### Depends on
- Subtask 2 — Define the MCP tool contract
- Subtask 3 — Implement the shared NKN core
- Subtask 4 — Build the Node.js MCP server wrapper
- Subtask 5 — Migrate agents to the MCP path

#### Technical notes
Treat observability and docs as part of the migration, not optional cleanup.

#### Definition of done
- [ ] Implementation satisfies all acceptance criteria above
- [ ] Relevant unit or integration tests written and passing
- [ ] No new lint, type, or build errors introduced
- [ ] Code reviewed and approved by at least one teammate
- [ ] Any new public API or behavior is documented (inline or in relevant docs)

---

## Open Questions
- Exact input/output shape for the `learn` and `recall` MCP tools
- Whether any additional access-control mechanism is needed beyond the MCP boundary

## Notes
This plan assumes a full cutover, behavior parity, and no compatibility shim. Recall should return an empty result rather than erroring when nothing is found.
