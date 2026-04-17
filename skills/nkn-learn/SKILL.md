---
name: nkn-learn
description: Synthesize architectural decisions, reasoning, and key learnings and propose storing them in the Neural Knowledge Network (NKN).
argument-hint: [--topic <value>]
allowed-tools: Bash, Read, AskUserQuestion
effort: medium
---

# nkn-learn

Use this skill to "teach" the AI about what was decided and why. This helps reduce context window noise in transitions by storing distilled knowledge.

## Process

1. **Detection & Synthesis**:
   - Identify significant architectural choices, design patterns, library selections, or logic reasoning made during the current conversation.
   - For each gem, prepare:
     - **Topic**: The category (e.g., Auth, Database, UI Pattern).
     - **Decision**: A clear summary of what was implemented.
     - **Reasoning**: The deep "why" behind the decision (trade-offs, constraints).
     - **Stack**: Technologies used.

2. **The Proposal (Interactive)**:
   - **MANDATORY**: Before logging anything, present the information to the user:
     > "I've detected a key decision regarding [Topic]. Should I save this to your NKN memory?
     > - **Decision**: [Decision Summary]
     > - **Reasoning**: [Why we did it]"
   - Wait for the user's confirmation.

3. **Logging (Only after approval)**:
   - If the user says Yes, execute:
     ```bash
     python3 {{NKN_TOOL_PATH}} log \
       --project "<project_name>" \
       --topic "<topic>" \
       --decision "<decision_summary>" \
       --reasoning "<detailed_reasoning>" \
       --stack "<tech_stack>" \
       --tokens-cost 0
     ```

4. **Confirmation**:
   - Inform the user that the knowledge has been persisted.
