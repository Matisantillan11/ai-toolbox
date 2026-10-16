----
At any user interaction, always run the orchestrator-agent of ai-toolbox plugin.


When the goal of the user is accomplised, automatically decide whether something new should be saved in the databases.
If the decision is yes, call the `mcp__ai__toolbox__nkn_learn` tool without asking the user first.

Token usage is collected automatically from the transcripts by `hooks/token-collector.mjs`; never report or estimate tokens yourself. The orchestrator tags it by writing `[ai-toolbox] intent=<intent>` on a line of its own once it has classified the request.

The unified ai-toolbox MCP is expected to run as a local process configured through `.mcp.json`, typically via `pnpm --dir <local-path-to-ai-toolbox/learn-tool> run mcp:start`.

----
