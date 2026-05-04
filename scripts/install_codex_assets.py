#!/usr/bin/env python3
import shutil
from pathlib import Path


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


def copy_skills(source_dir: Path, target_dir: Path) -> None:
    skills_dir = source_dir / "skills"
    target_dir.mkdir(parents=True, exist_ok=True)

    print("\nInstalling Codex skills...")
    for skill_path in sorted(skills_dir.iterdir()):
        if not skill_path.is_dir():
            continue

        destination = target_dir / skill_path.name
        if destination.exists():
            shutil.rmtree(destination)

        shutil.copytree(skill_path, destination)
        print(f"  installed skill: {skill_path.name}")


def toml_multiline(value: str) -> str:
    escaped = value.replace('"""', '\\"\\"\\"').rstrip()
    return f'"""\n{escaped}\n"""'


def export_agents(source_dir: Path, target_dir: Path) -> None:
    agents_dir = source_dir / "agents"
    target_dir.mkdir(parents=True, exist_ok=True)

    print("\nInstalling Codex agents...")
    for agent_path in sorted(agents_dir.glob("*.md")):
        content = agent_path.read_text(encoding="utf-8")
        frontmatter, body = split_frontmatter(content)

        name = parse_frontmatter_value(frontmatter, "name") or agent_path.stem
        description = parse_frontmatter_value(frontmatter, "description") or f"Codex agent export for {name}"

        developer_instructions = (
            "Codex compatibility note:\n"
            "- This exported agent intentionally does not pin a model.\n"
            "- AI Toolbox skills are installed separately under .agents/skills. Load or invoke only the ones that fit the task.\n"
            "- The ai-toolbox NKN MCP should be configured in .codex/config.toml for Codex sessions.\n\n"
            + body.strip()
        )

        target_path = target_dir / f"{name}.toml"
        target_path.write_text(
            "\n".join(
                [
                    f'name = "{name}"',
                    f'description = {toml_multiline(description)}',
                    f'developer_instructions = {toml_multiline(developer_instructions)}',
                    "",
                ]
            ),
            encoding="utf-8",
        )
        print(f"  installed agent: {name}")


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    source_dir = script_dir.parent
    target_project_dir = Path.cwd()

    copy_skills(source_dir, target_project_dir / ".agents" / "skills")
    export_agents(source_dir, target_project_dir / ".codex" / "agents")

    print("\nInstallation complete.")
    print("Codex will load skills from .agents/skills and custom agents from .codex/agents.")


if __name__ == "__main__":
    main()
