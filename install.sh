#!/bin/bash
# Matisantillan11/ai-toolbox Gemini/Antigravity Installer
set -e

echo "🚀 Bootstrapping AI-Toolbox to Antigravity (Gemini)..."

# Create a temporary directory for the clone
TEMP_DIR=$(mktemp -d)
REPO_URL="https://github.com/Matisantillan11/ai-toolbox.git"

# Clone the repository quietly
echo "📦 Downloading the latest AI skills & agents..."
git clone --quiet --depth 1 "$REPO_URL" "$TEMP_DIR"

INSTALL_SCRIPT="$TEMP_DIR/scripts/install_antigravity_knowledge.py"

# Verify script was downloaded and execute it
if [ -f "$INSTALL_SCRIPT" ]; then
    # Since we are running the python script from the user's current directory,
    # it will inject the .gemini Knowledge Items right here!
    python3 "$INSTALL_SCRIPT"
else
    echo "❌ Error: Could not locate installation script inside the repository."
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Clean up
rm -rf "$TEMP_DIR"

echo "✨ All done! Your project is now supercharged with the ai-toolbox KIs."
echo "🧪 To test it, ask Gemini: 'Run the init-project skill' and watch it go!"
