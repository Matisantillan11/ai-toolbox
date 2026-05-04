----
At any user interaction, always run the orchestrator-agent of ai-toolbox plugin.


When the goal of the user is accomplised, automatically decide whether something new should be saved in the database.
If the decision is yes, call the `mcp__ai__toolbox__nkn__learn` tool without asking the user first.

The ai-toolbox NKN MCP is expected to run as a local process configured through `.mcp.json`, typically via `pnpm --dir <local-path-to-ai-toolbox/learn-tool> run mcp:start`.

----
