#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


START_MARKER = "# BEGIN AI TOOLBOX NKN MCP"
END_MARKER = "# END AI TOOLBOX NKN MCP"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Configure the ai-toolbox NKN MCP entry for supported clients."
    )
    parser.add_argument("--config", required=True, help="Path to the config file to update.")
    parser.add_argument(
        "--repo-root",
        required=True,
        help="Absolute path to the local ai-toolbox checkout that contains learn-tool/.",
    )
    parser.add_argument(
        "--format",
        required=True,
        choices=["json", "codex"],
        help="Config format to update.",
    )
    return parser.parse_args()


def learn_tool_dir(repo_root: Path) -> Path:
    path = repo_root / "learn-tool"
    if not path.exists():
        raise FileNotFoundError(f"Missing learn-tool directory at {path}")
    return path


def load_json_config(path: Path) -> dict:
    if not path.exists():
        return {}

    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return {}

    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return data


def update_json_config(config_path: Path, repo_root: Path) -> None:
    config = load_json_config(config_path)
    mcp_servers = config.get("mcpServers")

    if mcp_servers is None:
        mcp_servers = {}
        config["mcpServers"] = mcp_servers
    elif not isinstance(mcp_servers, dict):
        raise ValueError(f"Expected 'mcpServers' to be an object in {config_path}")

    mcp_servers["ai__toolbox__nkn"] = {
        "command": "pnpm",
        "args": ["--dir", str(learn_tool_dir(repo_root)), "--silent", "run", "mcp:start"],
    }

    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def render_codex_block(repo_root: Path) -> str:
    return "\n".join(
        [
            START_MARKER,
            '[mcp_servers.ai__toolbox__nkn]',
            'command = "pnpm"',
            f'args = ["--dir", "{learn_tool_dir(repo_root)}", "--silent", "run", "mcp:start"]',
            END_MARKER,
        ]
    )


def replace_or_append_toml(content: str, block: str) -> str:
    if START_MARKER in content and END_MARKER in content:
        start = content.index(START_MARKER)
        end = content.index(END_MARKER) + len(END_MARKER)
        updated = content[:start] + block + content[end:]
    else:
        updated = content.rstrip()
        if updated:
            updated += "\n\n"
        updated += block

    return updated.rstrip() + "\n"


def update_codex_config(config_path: Path, repo_root: Path) -> None:
    existing = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    updated = replace_or_append_toml(existing, render_codex_block(repo_root))
    config_path.write_text(updated, encoding="utf-8")


def main() -> None:
    args = parse_args()
    config_path = Path(args.config).expanduser().resolve()
    repo_root = Path(args.repo_root).expanduser().resolve()

    config_path.parent.mkdir(parents=True, exist_ok=True)

    if args.format == "json":
        update_json_config(config_path, repo_root)
    else:
        update_codex_config(config_path, repo_root)

    print(f"Configured ai-toolbox MCP in {config_path}")


if __name__ == "__main__":
    main()
