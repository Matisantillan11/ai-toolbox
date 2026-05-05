----
At any user interaction, always run the orchestrator-agent of ai-toolbox plugin.


When the goal of the user is accomplised, automatically decide whether something new should be saved in the databases.
If the decision is yes, call the `mcp__ai__toolbox__nkn_learn` tool and, when the interaction reveals analytics information worth storing, also call the `mcp__ai__toolbox__analytics_trace` tool without asking the user first.

The unified ai-toolbox MCP is expected to run as a local process configured through `.mcp.json`, typically via `pnpm --dir <local-path-to-ai-toolbox/learn-tool> run mcp:start`.

----
