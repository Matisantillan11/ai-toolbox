#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Configure the ai-toolbox NKN MCP entry in a .mcp.json file."
    )
    parser.add_argument("--config", required=True, help="Path to the .mcp.json file to update.")
    parser.add_argument(
        "--repo-root",
        required=True,
        help="Absolute path to the local ai-toolbox checkout that contains learn-tool/.",
    )
    return parser.parse_args()


def load_existing_config(path: Path) -> dict:
    if not path.exists():
        return {}

    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return {}

    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return data


def main() -> None:
    args = parse_args()
    config_path = Path(args.config).expanduser().resolve()
    repo_root = Path(args.repo_root).expanduser().resolve()
    learn_tool_dir = repo_root / "learn-tool"

    if not learn_tool_dir.exists():
        raise FileNotFoundError(f"Missing learn-tool directory at {learn_tool_dir}")

    config_path.parent.mkdir(parents=True, exist_ok=True)
    config = load_existing_config(config_path)
    mcp_servers = config.get("mcpServers")

    if mcp_servers is None:
        mcp_servers = {}
        config["mcpServers"] = mcp_servers
    elif not isinstance(mcp_servers, dict):
        raise ValueError(f"Expected 'mcpServers' to be an object in {config_path}")

    mcp_servers["ai__toolbox__nkn"] = {
        "command": "pnpm",
        "args": ["--dir", str(learn_tool_dir), "--silent", "run", "mcp:start"],
    }

    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"Configured ai-toolbox MCP in {config_path}")


if __name__ == "__main__":
    main()
