---
name: nkn-recall
description: Query the Neural Knowledge Network (NKN) for past decisions, patterns, and reasoning relevant to the current task.
argument-hint: [--term <search_query>]
allowed-tools: Read, RunCommand
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
     python3 scripts/nkn_tool.py query --term "<keywords>"
     ```

3. **Context Injection**:
   - If results are found, read them carefully.
   - Present the relevant findings to the current session context: *"According to the NKN, we previously decided to [Decision] because [Reasoning]."*

> [!IMPORTANT]
> This skill should be run **automatically** at the start of any complex workflow to ensure architectural consistency.
