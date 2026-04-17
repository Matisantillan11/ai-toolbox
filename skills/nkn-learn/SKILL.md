---
name: nkn-learn
description: Synthesize architectural decisions, reasoning, and key learnings from the current session and store them in the Neural Knowledge Network (NKN).
argument-hint: [--topic <value>]
allowed-tools: Read, RunCommand, AskUserQuestion
effort: medium
---

# nkn-learn

Use this skill at the end of a task or session to "teach" the AI about what was decided and why. This helps reduce context window noise in transition by storing distilled knowledge.

## Process

1. **Session Analysis**: 
   - Review the entire conversation history.
   - Identify significant architectural choices, design patterns, library selections, or logic reasoning.
   - Ignore trivial tasks (e.g., "fix typo", "change color").

2. **Synthesis**:
   - For each identifed "Knowledge Gem", prepare the following:
     - **Topic**: The category (e.g., Auth, Database, UI Pattern).
     - **Decision**: A clear summary of what was implemented.
     - **Reasoning**: The deep "why" behind the decision (trade-offs, constraints).
     - **Stack**: Technologies used.

3. **Logging**:
   - Execute the following command for each gem:
     ```bash
     python3 scripts/nkn_tool.py log \
       --project "<project_name>" \
       --topic "<topic>" \
       --decision "<decision_summary>" \
       --reasoning "<detailed_reasoning>" \
       --stack "<tech_stack>" \
       --tokens-cost <estimated_tokens>
     ```

4. **Confirmation**:
   - Inform the user that the knowledge has been persisted to their local NKN.

> [!TIP]
> This skill should be invoked automatically by the AI when it detects a major architectural milestone is reached, or manually by the user with `/nkn-learn`.
