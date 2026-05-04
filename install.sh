#!/bin/bash
set -e

REPO_URL="https://github.com/Matisantillan11/ai-toolbox.git"
REPO_HTTP_URL="https://github.com/Matisantillan11/ai-toolbox"
CLAUDE_MARKETPLACE_SOURCE="Matisantillan11/ai-toolbox"
CLAUDE_MARKETPLACE_NAME="matisantillan11-ai-toolbox"
INSTALL_ROOT="$HOME/.ai-toolbox"
CHECKOUT_DIR="$INSTALL_ROOT/repo"
PROJECT_ROOT="$PWD"
TARGETS=()
OPEN_CODE_ARGS=()

print_help() {
    cat <<'EOF'
Usage: install.sh [options]

Options:
  --targets <list>       Comma-separated targets: claude,antigravity,opencode,all
  --global-opencode      Install OpenCode assets into ~/.config/opencode
  --help                 Show this help message

Examples:
  bash install.sh
  bash install.sh --targets claude
  bash install.sh --targets antigravity,opencode
  bash install.sh --targets all --global-opencode
EOF
}

contains_target() {
    local needle="$1"
    shift
    for item in "$@"; do
        if [ "$item" = "$needle" ]; then
            return 0
        fi
    done
    return 1
}

normalize_targets() {
    local raw="$1"
    local expanded=()
    local item

    IFS=',' read -r -a parts <<< "$raw"
    for item in "${parts[@]}"; do
        item=$(printf '%s' "$item" | tr '[:upper:]' '[:lower:]' | xargs)
        [ -z "$item" ] && continue

        case "$item" in
            all)
                expanded=(claude antigravity opencode)
                ;;
            claude|antigravity|opencode)
                if ! contains_target "$item" "${expanded[@]}"; then
                    expanded+=("$item")
                fi
                ;;
            *)
                echo "Error: unknown target '$item'. Use claude, antigravity, opencode, or all."
                exit 1
                ;;
        esac
    done

    if contains_target all "${parts[@]}"; then
        TARGETS=(claude antigravity opencode)
    else
        TARGETS=("${expanded[@]}")
    fi
}

prompt_for_targets() {
    cat <<'EOF'
Choose install targets:
  1. Claude
  2. Antigravity
  3. OpenCode
  4. All

Enter one or more values separated by commas (example: 1,3)
EOF
    printf '> '
    read -r selection

    case "$selection" in
        1) TARGETS=(claude) ;;
        2) TARGETS=(antigravity) ;;
        3) TARGETS=(opencode) ;;
        4) TARGETS=(claude antigravity opencode) ;;
        *)
            local mapped=()
            local part
            IFS=',' read -r -a parts <<< "$selection"
            for part in "${parts[@]}"; do
                part=$(printf '%s' "$part" | xargs)
                case "$part" in
                    1) mapped+=(claude) ;;
                    2) mapped+=(antigravity) ;;
                    3) mapped+=(opencode) ;;
                    4) mapped=(claude antigravity opencode) ;;
                    *)
                        echo "Error: invalid selection '$part'."
                        exit 1
                        ;;
                esac
            done

            TARGETS=()
            for part in "${mapped[@]}"; do
                if ! contains_target "$part" "${TARGETS[@]}"; then
                    TARGETS+=("$part")
                fi
            done
            ;;
    esac
}

require_command() {
    local name="$1"
    if ! command -v "$name" >/dev/null 2>&1; then
        echo "Error: required command '$name' is not installed or not in PATH."
        exit 1
    fi
}

ensure_repo_checkout() {
    require_command git

    mkdir -p "$INSTALL_ROOT"

    if [ -d "$CHECKOUT_DIR/.git" ]; then
        echo "Updating local AI Toolbox checkout at $CHECKOUT_DIR..."
        if ! git -C "$CHECKOUT_DIR" pull --ff-only; then
            echo "Error: could not fast-forward the existing checkout at $CHECKOUT_DIR."
            echo "Resolve the local checkout state manually or remove it and run the installer again."
            exit 1
        fi
        return
    fi

    if [ -e "$CHECKOUT_DIR" ] && [ ! -d "$CHECKOUT_DIR/.git" ]; then
        echo "Error: $CHECKOUT_DIR exists but is not a git checkout."
        exit 1
    fi

    echo "Downloading AI Toolbox into $CHECKOUT_DIR..."
    git clone --quiet --depth 1 "$REPO_URL" "$CHECKOUT_DIR"
}

configure_learn_tool_mcp() {
    require_command python3
    require_command pnpm
    ensure_repo_checkout

    echo
    echo "Installing learn-tool dependencies..."
    pnpm --dir "$CHECKOUT_DIR/learn-tool" install --silent

    echo "Configuring project MCP..."
    python3 "$CHECKOUT_DIR/scripts/configure_mcp.py" \
        --config "$PROJECT_ROOT/.mcp.json" \
        --repo-root "$CHECKOUT_DIR"
}

install_claude() {
    echo
    echo "Installing Claude plugin..."

    require_command claude

    if ! claude plugin marketplace add "$CLAUDE_MARKETPLACE_SOURCE"; then
        claude plugin marketplace update "$CLAUDE_MARKETPLACE_NAME" || true
    fi

    if ! claude plugin install "ai-toolbox@$CLAUDE_MARKETPLACE_NAME" --scope user; then
        claude plugin enable "ai-toolbox@$CLAUDE_MARKETPLACE_NAME" --scope user
    fi

    echo "Claude install complete."
}

install_antigravity() {
    echo
    echo "Installing Antigravity knowledge..."
    ensure_repo_checkout

    local install_script="$CHECKOUT_DIR/scripts/install_antigravity_knowledge.py"
    if [ ! -f "$install_script" ]; then
        echo "Error: Could not locate the Antigravity installation script."
        exit 1
    fi

    python3 "$install_script"
    echo "Antigravity install complete."
}

install_opencode() {
    echo
    echo "Installing OpenCode assets..."
    ensure_repo_checkout

    local install_script="$CHECKOUT_DIR/scripts/install_opencode_assets.py"
    if [ ! -f "$install_script" ]; then
        echo "Error: Could not locate the OpenCode installation script."
        exit 1
    fi

    python3 "$install_script" "${OPEN_CODE_ARGS[@]}"
    echo "OpenCode install complete."
}

while [ $# -gt 0 ]; do
    case "$1" in
        --targets)
            if [ $# -lt 2 ]; then
                echo "Error: --targets requires a value."
                exit 1
            fi
            normalize_targets "$2"
            shift 2
            ;;
        --global-opencode)
            OPEN_CODE_ARGS+=(--global)
            shift
            ;;
        --help|-h)
            print_help
            exit 0
            ;;
        *)
            echo "Error: unknown option '$1'."
            print_help
            exit 1
            ;;
    esac
done

if [ ${#TARGETS[@]} -eq 0 ]; then
    echo "Bootstrapping AI-Toolbox installer..."
    prompt_for_targets
fi

if [ ${#TARGETS[@]} -eq 0 ]; then
    echo "Error: no install targets selected."
    exit 1
fi

echo "Selected targets: ${TARGETS[*]}"

configure_learn_tool_mcp

for target in "${TARGETS[@]}"; do
    case "$target" in
        claude) install_claude ;;
        antigravity) install_antigravity ;;
        opencode) install_opencode ;;
    esac
done

echo
echo "All requested AI-Toolbox installs completed."
