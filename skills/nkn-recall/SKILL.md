---
name: nkn-recall
description: Query the Neural Knowledge Network (NKN) for past decisions, patterns, and reasoning relevant to the current task.
argument-hint: [--term <search_query>]
allowed-tools: Bash, Read
effort: low
---

# nkn-recall

Use this skill at the beginning of a task to fetch relevant past knowledge. This allows the AI to stay consistent with previous decisions without needing the entire history in the context window.

## Process

1. **Context Extraction**:
   - Analyze the current user request.
   - Extract keywords related to architecture, stack, or specific features.

2. **Querying**:
   - Execute the following command:
     ```bash
     python3 {{NKN_TOOL_PATH}} query --term "<keywords>"
     ```

3. **Context Injection**:
   - If results are found, read them carefully.
   - Present the relevant findings to the current session context: *"According to the NKN, we previously decided to [Decision] because [Reasoning]."*

> [!IMPORTANT]
> This skill is usually run **automatically** by the NKN Agent at the start of any complex workflow.
