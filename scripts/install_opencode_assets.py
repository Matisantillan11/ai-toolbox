#!/usr/bin/env python3
import argparse
import json
import shutil
from pathlib import Path


COLOR_MAP = {
    "purple": "accent",
    "red": "error",
    "orange": "warning",
    "green": "success",
    "blue": "info",
    "yellow": "warning",
}


def split_frontmatter(content: str) -> tuple[str, str]:
    if not content.startswith("---\n"):
        return "", content

    end_marker = "\n---\n"
    end_index = content.find(end_marker, 4)
    if end_index == -1:
        return "", content

    frontmatter = content[4:end_index]
    body = content[end_index + len(end_marker) :]
    return frontmatter, body


def parse_frontmatter_value(frontmatter: str, key: str) -> str | None:
    lines = frontmatter.splitlines()
    index = 0
    prefix = f"{key}:"

    while index < len(lines):
        line = lines[index]
        if not line.startswith(prefix):
            index += 1
            continue

        value = line[len(prefix) :].strip()
        if value in {">", "|"}:
            index += 1
            parts = []
            while index < len(lines):
                nested = lines[index]
                if nested.startswith("  "):
                    parts.append(nested.strip())
                    index += 1
                    continue
                break
            return " ".join(part for part in parts if part).strip() or None

        return value or None

    return None


def ensure_source_layout(source_dir: Path) -> None:
    required_paths = [source_dir / "skills", source_dir / "agents"]
    for path in required_paths:
        if not path.exists():
            raise FileNotFoundError(f"Missing required path: {path}")


def copy_skills(source_dir: Path, target_skills_dir: Path) -> None:
    skills_dir = source_dir / "skills"
    target_skills_dir.mkdir(parents=True, exist_ok=True)

    print("\nInstalling skills...")
    for skill_path in sorted(skills_dir.iterdir()):
        if not skill_path.is_dir():
            continue

        target_dir = target_skills_dir / skill_path.name
        if target_dir.exists():
            shutil.rmtree(target_dir)

        shutil.copytree(skill_path, target_dir)
        print(f"  installed skill: {skill_path.name}")


def render_permission_block() -> list[str]:
    return [
        "permission:",
        "  read: allow",
        "  edit: allow",
        "  glob: allow",
        "  grep: allow",
        "  bash: allow",
        "  task: allow",
        "  todowrite: allow",
        "  skill: allow",
        "  question: allow",
        '  "mcp__ai__toolbox__*": allow',
        '  "mcp__clickup__*": allow',
        '  "mcp__github__*": allow',
    ]


def export_agents(source_dir: Path, target_agents_dir: Path) -> None:
    agents_dir = source_dir / "agents"
    target_agents_dir.mkdir(parents=True, exist_ok=True)

    print("\nInstalling agents...")
    for agent_path in sorted(agents_dir.glob("*.md")):
        content = agent_path.read_text(encoding="utf-8")
        frontmatter, body = split_frontmatter(content)

        description = parse_frontmatter_value(frontmatter, "description") or (
            f"OpenCode export of {agent_path.stem} from ai-toolbox"
        )
        color = COLOR_MAP.get(parse_frontmatter_value(frontmatter, "color") or "", "primary")

        file_name = agent_path.name
        mode = "all" if file_name == "orchestrator-agent.md" else "subagent"

        exported_frontmatter = [
            "---",
            f"description: {json.dumps(description)}",
            f"mode: {mode}",
            f"color: {json.dumps(color)}",
            *render_permission_block(),
            "---",
            "",
            "OpenCode compatibility note:",
            "- This agent intentionally does not pin a model.",
            "- AI Toolbox skills are available separately; load only the ones that fit the task.",
            "",
        ]

        target_path = target_agents_dir / file_name
        target_path.write_text("\n".join(exported_frontmatter) + body, encoding="utf-8")
        print(f"  installed agent: {agent_path.stem}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install AI Toolbox skills and agents into OpenCode."
    )
    parser.add_argument(
        "--global",
        action="store_true",
        dest="global_install",
        help="Install into ~/.config/opencode instead of the current project.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    source_dir = script_dir.parent
    ensure_source_layout(source_dir)

    if args.global_install:
        target_root = Path.home() / ".config" / "opencode"
        install_label = str(target_root)
    else:
        target_root = Path.cwd() / ".opencode"
        install_label = str(target_root)

    print(f"Installing AI Toolbox into OpenCode at {install_label}")

    copy_skills(source_dir, target_root / "skills")
    export_agents(source_dir, target_root / "agents")

    print("\nInstallation complete.")
    if args.global_install:
        print("OpenCode will load these assets from ~/.config/opencode.")
    else:
        print("OpenCode will load these assets from the local .opencode directory.")


if __name__ == "__main__":
    main()
