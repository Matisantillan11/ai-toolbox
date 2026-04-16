#!/usr/bin/env python3
import os
import shutil
import json
from pathlib import Path

def install_antigravity_knowledge():
    print("🚀 Installing AI-Toolbox to Antigravity (Gemini)...")
    
    # Get the repo root dynamically so this script works on any user's machine
    script_dir = Path(__file__).resolve().parent
    source_dir = script_dir.parent
    
    # Check if we found the skills directory
    if not (source_dir / "skills").exists():
        print("❌ Error: Could not find the 'skills' directory. Make sure this script is run from the 'scripts/' directory.")
        return

    # Put the knowledge in the project level directory where the user executes the script
    target_project_dir = Path.cwd()
    ki_base_dir = target_project_dir / ".gemini/antigravity/knowledge"
    ki_base_dir.mkdir(parents=True, exist_ok=True)

    # 1. Convert Skills
    print("\n📦 Converting skills to Knowledge Items...")
    skills_dir = source_dir / "skills"
    if skills_dir.exists():
        for skill_path in skills_dir.iterdir():
            if skill_path.is_dir():
                skill_name = skill_path.name
                ki_dir = ki_base_dir / f"skill_{skill_name}"
                artifacts_dir = ki_dir / "artifacts"
                
                # Clean up existing KI if it exists to overwrite fresh
                if ki_dir.exists():
                    shutil.rmtree(ki_dir)
                    
                ki_dir.mkdir(parents=True, exist_ok=True)
                artifacts_dir.mkdir(parents=True, exist_ok=True)
                
                metadata = {
                    "title": f"Skill: {skill_name}",
                    "summary": f"Use this knowledge item when the user types `/{skill_name}` or asks to run the '{skill_name}' skill/workflow. It contains the exact prompt instructions to follow.",
                    "references": []
                }
                with open(ki_dir / "metadata.json", "w") as f:
                    json.dump(metadata, f, indent=2)
                
                for item in skill_path.iterdir():
                    if item.is_file():
                        shutil.copy2(item, artifacts_dir / item.name)
                    elif item.is_dir():
                        shutil.copytree(item, artifacts_dir / item.name, dirs_exist_ok=True)
                        
                templates_dir = source_dir / "templates"
                if templates_dir.exists():
                    # Extract text from the skill artifacts
                    skill_text = ""
                    for item in artifacts_dir.rglob('*'):
                        if item.is_file() and item.suffix in ['.md', '.txt']:
                            skill_text += item.read_text(errors='ignore')
                    
                    # Only copy templates that are actually referenced in this skill
                    copied_templates = False
                    for template_file in templates_dir.iterdir():
                        if template_file.is_file() and template_file.name in skill_text:
                            if not copied_templates:
                                (artifacts_dir / "templates").mkdir(exist_ok=True)
                                copied_templates = True
                            shutil.copy2(template_file, artifacts_dir / "templates" / template_file.name)
                    
                print(f"  ✅ Installed KI: {skill_name}")

    # 2. Convert Agents
    print("\n🤖 Converting agents to Knowledge Items...")
    agents_dir = source_dir / "agents"
    if agents_dir.exists():
        for agent_path in agents_dir.iterdir():
            if agent_path.is_file() and agent_path.name.endswith(".md"):
                agent_name = agent_path.stem.replace("-agent", "")
                ki_dir = ki_base_dir / f"agent_{agent_name}"
                artifacts_dir = ki_dir / "artifacts"
                
                if ki_dir.exists():
                    shutil.rmtree(ki_dir)
                    
                ki_dir.mkdir(parents=True, exist_ok=True)
                artifacts_dir.mkdir(parents=True, exist_ok=True)
                
                metadata = {
                    "title": f"Agent persona: {agent_name}",
                    "summary": f"Use this knowledge item when the user types `/{agent_name}` or `/{agent_name}-agent`, or wants you to act as the '{agent_name}' agent. It contains the instructions.",
                    "references": []
                }
                with open(ki_dir / "metadata.json", "w") as f:
                    json.dump(metadata, f, indent=2)
                
                shutil.copy2(agent_path, artifacts_dir / agent_path.name)
                print(f"  ✅ Installed KI: {agent_name}")

    print("\n🎉 Installation complete! Gemini/Antigravity will now globally recognize these workflows.")

if __name__ == "__main__":
    install_antigravity_knowledge()
