#!/usr/bin/env python3
"""Install AI Toolbox assets for Codex CLI.

Supports two modes:

1. **Legacy (default):** copies skills into ``<project>/.agents/skills/`` and
   exports agents as TOML into ``<project>/.codex/agents/``. This is the
   per-project approach used before Codex had plugin support.

2. **Plugin (``--plugin``):** installs ai-toolbox as a native Codex plugin
   so it is available across all projects. Creates a local marketplace at
   ``~/.ai-toolbox/codex-marketplace/`` that mirrors the repo's marketplace
   structure (with ``.agents/plugins/marketplace.json`` pointing at the
   plugin directory), then registers it with ``codex plugin marketplace add``
   and installs via ``codex plugin add``.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Legacy mode: per-project installation
# ---------------------------------------------------------------------------

def rewrite_skill_file(skill_dir: Path) -> None:
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        raise FileNotFoundError(f"Missing skill file: {skill_file}")

    content = skill_file.read_text(encoding="utf-8")
    frontmatter, body = split_frontmatter(content)
    name = parse_frontmatter_value(frontmatter, "name") or skill_dir.name
    description = parse_frontmatter_value(frontmatter, "description")
    if not description:
        raise ValueError(f"Skill {name} is missing a description in {skill_file}")

    skill_file.write_text(
        "\n".join(
            [
                "---",
                f"name: {name}",
                f"description: {description}",
                "---",
                "",
            ]
        )
        + body,
        encoding="utf-8",
    )


def copy_skills(source_dir: Path, target_dir: Path) -> None:
    skills_dir = source_dir / "skills"
    target_dir.mkdir(parents=True, exist_ok=True)

    print("\n📦 Installing Codex skills...")
    for skill_path in sorted(skills_dir.iterdir()):
        if not skill_path.is_dir():
            continue

        destination = target_dir / skill_path.name
        if destination.exists():
            shutil.rmtree(destination)

        shutil.copytree(skill_path, destination)
        rewrite_skill_file(destination)
        print(f"  ✅ Installed skill: {skill_path.name}")


def toml_multiline(value: str) -> str:
    escaped = value.replace('"""', '\\"\\"\\"').rstrip()
    return f'"""\n{escaped}\n"""'


def export_agents(source_dir: Path, target_dir: Path) -> None:
    agents_dir = source_dir / "agents"
    target_dir.mkdir(parents=True, exist_ok=True)

    print("\n🤖 Installing Codex agents...")
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
        print(f"  ✅ Installed agent: {name}")


def install_legacy(source_dir: Path) -> None:
    """Per-project install: skills -> .agents/skills, agents -> .codex/agents."""
    target_project_dir = Path.cwd()

    print(f"🚀 Installing AI Toolbox into Codex (legacy mode) at {target_project_dir}")

    copy_skills(source_dir, target_project_dir / ".agents" / "skills")
    export_agents(source_dir, target_project_dir / ".codex" / "agents")

    print("\n🎉 Codex legacy installation complete.")
    print("👉 Codex will load skills from .agents/skills and custom agents from .codex/agents.")


# ---------------------------------------------------------------------------
# Plugin mode: native Codex plugin installation
# ---------------------------------------------------------------------------

MARKETPLACE_NAME = "ai-toolbox"


def _ai_toolbox_home() -> Path:
    env = os.environ.get("AI_TOOLBOX_HOME_DIR")
    if env:
        return Path(env)
    return Path.home() / ".ai-toolbox"


def _marketplace_root() -> Path:
    return _ai_toolbox_home() / "codex-marketplace"


def create_marketplace(source_dir: Path) -> Path:
    """Create a local Codex marketplace directory containing the ai-toolbox plugin.

    Codex marketplaces need:
      - ``.agents/plugins/marketplace.json`` at the root (declares plugins)
      - Plugin directories referenced by marketplace.json, each with
        ``.codex-plugin/plugin.json``

    The ai-toolbox repo already has both. This function copies the essential
    plugin files into ``~/.ai-toolbox/codex-marketplace/plugins/ai-toolbox/``
    and writes the marketplace manifest at the marketplace root.
    """
    marketplace_root = _marketplace_root()
    plugin_dir = marketplace_root / "plugins" / "ai-toolbox"

    print(f"\n📦 Creating Codex marketplace at {marketplace_root}...")

    # Remove old plugin copy if it exists
    if plugin_dir.exists():
        shutil.rmtree(plugin_dir)

    plugin_dir.mkdir(parents=True, exist_ok=True)

    # Copy the essential plugin files
    _copy_plugin_files(source_dir, plugin_dir)

    # Write the marketplace manifest
    manifest_dir = marketplace_root / ".agents" / "plugins"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / "marketplace.json"
    manifest_path.write_text(
        json.dumps(
            {
                "name": MARKETPLACE_NAME,
                "interface": {"displayName": "AI Toolbox"},
                "plugins": [
                    {
                        "name": "ai-toolbox",
                        "source": {"source": "local", "path": "./plugins/ai-toolbox"},
                        "policy": {"installation": "AVAILABLE"},
                        "category": "Productivity",
                    }
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"  ✅ Plugin files copied to {plugin_dir}")
    print(f"  ✅ Marketplace manifest written to {manifest_path}")
    return marketplace_root


def _copy_plugin_files(source_dir: Path, dest_dir: Path) -> None:
    """Copy only the files needed for the Codex plugin."""
    dest_dir.mkdir(parents=True, exist_ok=True)

    # .codex-plugin/ manifest
    codex_plugin_src = source_dir / ".codex-plugin"
    if codex_plugin_src.exists():
        dest_codex = dest_dir / ".codex-plugin"
        if dest_codex.exists():
            shutil.rmtree(dest_codex)
        shutil.copytree(codex_plugin_src, dest_codex)

    # skills/
    skills_src = source_dir / "skills"
    if skills_src.exists():
        dest_skills = dest_dir / "skills"
        if dest_skills.exists():
            shutil.rmtree(dest_skills)
        shutil.copytree(skills_src, dest_skills)

    # agents/ (Codex can reference these)
    agents_src = source_dir / "agents"
    if agents_src.exists():
        dest_agents = dest_dir / "agents"
        if dest_agents.exists():
            shutil.rmtree(dest_agents)
        shutil.copytree(agents_src, dest_agents)

    # hooks/ (lifecycle hooks for Codex)
    hooks_src = source_dir / "hooks"
    if hooks_src.exists():
        dest_hooks = dest_dir / "hooks"
        if dest_hooks.exists():
            shutil.rmtree(dest_hooks)
        shutil.copytree(hooks_src, dest_hooks)

    # AGENTS.md
    agents_md = source_dir / "AGENTS.md"
    if agents_md.exists():
        shutil.copy2(agents_md, dest_dir / "AGENTS.md")

    # README.md
    readme = source_dir / "README.md"
    if readme.exists():
        shutil.copy2(readme, dest_dir / "README.md")


def register_marketplace(marketplace_root: Path) -> bool:
    """Register the local marketplace with Codex using ``codex plugin marketplace add``."""
    codex = shutil.which("codex")
    if not codex:
        print("  ⚠️  Codex CLI not found — skipping marketplace registration.")
        print(f"     Run manually: codex plugin marketplace add {marketplace_root}")
        return False

    # Check if the marketplace is already registered
    try:
        result = subprocess.run(
            [codex, "plugin", "marketplace", "list"],
            capture_output=True, text=True, timeout=15,
        )
        if MARKETPLACE_NAME in result.stdout:
            print(f"  ℹ️  Marketplace '{MARKETPLACE_NAME}' already registered — upgrading...")
            subprocess.run(
                [codex, "plugin", "marketplace", "upgrade", MARKETPLACE_NAME],
                capture_output=True, text=True, timeout=30,
            )
            return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    # Register the marketplace
    print("\n🔗 Registering marketplace with Codex...")
    try:
        result = subprocess.run(
            [codex, "plugin", "marketplace", "add", str(marketplace_root)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            print(f"  ✅ Marketplace registered: {MARKETPLACE_NAME}")
            return True
        else:
            stderr = result.stderr.strip()
            if "already" in stderr.lower():
                print("  ℹ️  Marketplace already registered.")
                return True
            print(f"  ⚠️  Registration returned: {stderr}")
            print(f"     Run manually: codex plugin marketplace add {marketplace_root}")
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        print(f"  ⚠️  Could not register marketplace: {exc}")
        print(f"     Run manually: codex plugin marketplace add {marketplace_root}")
        return False


def install_plugin_via_cli(marketplace_name: str) -> bool:
    """Install the ai-toolbox plugin via ``codex plugin add``."""
    codex = shutil.which("codex")
    if not codex:
        return False

    plugin_ref = f"ai-toolbox@{marketplace_name}"
    print(f"\n🔌 Installing plugin: {plugin_ref}...")

    try:
        result = subprocess.run(
            [codex, "plugin", "add", plugin_ref],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            print(f"  ✅ Plugin installed: {plugin_ref}")
            return True
        else:
            stderr = result.stderr.strip()
            if "already" in stderr.lower():
                print("  ℹ️  Plugin already installed.")
                return True
            print(f"  ⚠️  Plugin install returned: {stderr}")
            print(f"     Run manually: codex plugin add {plugin_ref}")
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        print(f"  ⚠️  Could not install plugin: {exc}")
        print(f"     Run manually: codex plugin add {plugin_ref}")
        return False


def install_plugin(source_dir: Path) -> None:
    """Native Codex plugin install: marketplace + plugin add."""
    print("🚀 Installing AI Toolbox as a native Codex plugin...")

    # 1. Create the local marketplace with plugin files
    marketplace_root = create_marketplace(source_dir)

    # 2. Register the marketplace with Codex
    marketplace_registered = register_marketplace(marketplace_root)

    # 3. Install the plugin
    if marketplace_registered:
        install_plugin_via_cli(MARKETPLACE_NAME)

    print("\n🎉 Codex plugin installation complete.")
    print("👉 Skills are available via $skill-name in any Codex session.")
    print("ℹ️  MCP server (NKN) is configured separately via install.sh or config.toml.")
    print("ℹ️  Token-usage collection for Codex is not yet supported (no lifecycle hooks).")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    script_dir = Path(__file__).resolve().parent
    source_dir = script_dir.parent

    plugin_mode = "--plugin" in sys.argv

    if plugin_mode:
        install_plugin(source_dir)
    else:
        install_legacy(source_dir)


if __name__ == "__main__":
    main()
