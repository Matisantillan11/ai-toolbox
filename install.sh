#!/bin/bash
set -e

REPO_URL="https://github.com/Matisantillan11/ai-toolbox.git"
REPO_HTTP_URL="https://github.com/Matisantillan11/ai-toolbox"
CLAUDE_MARKETPLACE_SOURCE="https://github.com/Matisantillan11/ai-toolbox"
CLAUDE_MARKETPLACE_NAME="ai-toolbox"
INSTALL_ROOT="$HOME/.ai-toolbox"
CHECKOUT_DIR="$INSTALL_ROOT/repo"
PROJECT_ROOT="$PWD"
TARGETS=()
OPEN_CODE_ARGS=()
FORCE_CLEAN=0
INSTALL_SUCCESSES=()
INSTALL_FAILURES=()
CHECKBOX_OPTIONS=(claude antigravity opencode codex)
CHECKBOX_LABELS=(Claude Antigravity OpenCode Codex)
CHECKBOX_SELECTED=(0 0 0 0)

print_help() {
    cat <<'EOF'
Usage: install.sh [options]

Options:
  --targets <list>       Comma-separated targets: claude,antigravity,opencode,codex,all
  --global-opencode      Install OpenCode assets into ~/.config/opencode
  --force-clean          Remove existing AI Toolbox client assets before reinstalling
  --help                 Show this help message

Examples:
  bash install.sh
  bash install.sh --targets claude
  bash install.sh --targets antigravity,opencode
  bash install.sh --targets codex
  bash install.sh --targets opencode --force-clean
  bash install.sh --targets all --global-opencode

Interactive mode:
  Use arrow keys and space to select one or more CLIs, then press enter.
EOF
}

log_info() {
    printf '%s\n' "$1"
}

log_step() {
    printf '🚀 %s\n' "$1"
}

log_success() {
    printf '✅ %s\n' "$1"
}

log_warn() {
    printf '⚠️  %s\n' "$1"
}

log_error() {
    printf '❌ %s\n' "$1"
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
                expanded=(claude antigravity opencode codex)
                ;;
            claude|antigravity|opencode|codex)
                if ! contains_target "$item" "${expanded[@]}"; then
                    expanded+=("$item")
                fi
                ;;
            *)
                log_error "Unknown target '$item'. Use claude, antigravity, opencode, codex, or all."
                exit 1
                ;;
        esac
    done

    if contains_target all "${parts[@]}"; then
        TARGETS=(claude antigravity opencode codex)
    else
        TARGETS=("${expanded[@]}")
    fi
}

prompt_for_targets_fallback() {
    cat <<'EOF'
Choose install targets:
  1. Claude
  2. Antigravity
  3. OpenCode
  4. Codex
  5. All

Enter one or more values separated by commas (example: 1,3)
EOF
    printf '> '
    read -r selection

    case "$selection" in
        1) TARGETS=(claude) ;;
        2) TARGETS=(antigravity) ;;
        3) TARGETS=(opencode) ;;
        4) TARGETS=(codex) ;;
        5) TARGETS=(claude antigravity opencode codex) ;;
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
                    4) mapped+=(codex) ;;
                    5) mapped=(claude antigravity opencode codex) ;;
                    *)
                        log_error "Invalid selection '$part'."
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

render_checkbox_menu() {
    local current_index="$1"
    local index marker prefix option_name selected_count

    if command -v tput >/dev/null 2>&1; then
        tput clear
        tput cup 0 0
    else
        printf '\033[H\033[2J'
    fi

    selected_count=0
    for index in "${!CHECKBOX_SELECTED[@]}"; do
        if [ "${CHECKBOX_SELECTED[$index]}" -eq 1 ]; then
            selected_count=$((selected_count + 1))
        fi
    done

    echo "Choose which IDE/AI tool you want to install AI Toolbox"
    echo "Use ↑/↓ to move, space to toggle, enter to confirm."
    echo "Selected: $selected_count"
    echo

    for index in "${!CHECKBOX_OPTIONS[@]}"; do
        option_name="${CHECKBOX_LABELS[$index]}"
        if [ "${CHECKBOX_SELECTED[$index]}" -eq 1 ]; then
            marker="[x]"
        else
            marker="[ ]"
        fi

        if [ "$index" -eq "$current_index" ]; then
            prefix="❯"
        else
            prefix=" "
        fi

        printf '%s %s %s\n' "$prefix" "$marker" "$option_name"
    done
}

prompt_for_targets_checkbox() {
    local current_index=0
    local option_count=${#CHECKBOX_OPTIONS[@]}
    local key escape_sequence index

    while true; do
        render_checkbox_menu "$current_index"
        IFS= read -rsn1 key

        if [ "$key" = $'\x1b' ]; then
            IFS= read -rsn2 escape_sequence || true
            case "$escape_sequence" in
                '[A')
                    if [ "$current_index" -gt 0 ]; then
                        current_index=$((current_index - 1))
                    else
                        current_index=$((option_count - 1))
                    fi
                    ;;
                '[B')
                    if [ "$current_index" -lt $((option_count - 1)) ]; then
                        current_index=$((current_index + 1))
                    else
                        current_index=0
                    fi
                    ;;
            esac
            continue
        fi

        if [ "$key" = ' ' ]; then
            if [ "${CHECKBOX_SELECTED[$current_index]}" -eq 1 ]; then
                CHECKBOX_SELECTED[$current_index]=0
            else
                CHECKBOX_SELECTED[$current_index]=1
            fi
            continue
        fi

        if [ -z "$key" ]; then
            TARGETS=()
            for index in "${!CHECKBOX_OPTIONS[@]}"; do
                if [ "${CHECKBOX_SELECTED[$index]}" -eq 1 ]; then
                    TARGETS+=("${CHECKBOX_OPTIONS[$index]}")
                fi
            done

            if [ ${#TARGETS[@]} -eq 0 ]; then
                printf '\a'
                continue
            fi

            printf '\033[H\033[2J'
            return
        fi
    done
}

prompt_for_targets() {  
    if [ -t 0 ] && [ -t 1 ]; then
        prompt_for_targets_checkbox
    else
        prompt_for_targets_fallback
    fi
}

require_command() {
    local name="$1"
    if ! command -v "$name" >/dev/null 2>&1; then
        log_error "Required command '$name' is not installed or not in PATH."
        exit 1
    fi
}

ensure_repo_checkout() {
    require_command git

    mkdir -p "$INSTALL_ROOT"

    if [ -d "$CHECKOUT_DIR/.git" ]; then
        log_step "Updating local AI Toolbox checkout at $CHECKOUT_DIR..."
        if ! git -C "$CHECKOUT_DIR" pull --ff-only; then
            log_error "Could not fast-forward the existing checkout at $CHECKOUT_DIR."
            log_warn "Resolve the local checkout state manually or remove it and run the installer again."
            exit 1
        fi
        return
    fi

    if [ -e "$CHECKOUT_DIR" ] && [ ! -d "$CHECKOUT_DIR/.git" ]; then
        log_error "$CHECKOUT_DIR exists but is not a git checkout."
        exit 1
    fi

    log_step "Downloading AI Toolbox into $CHECKOUT_DIR..."
    git clone --quiet --depth 1 "$REPO_URL" "$CHECKOUT_DIR"
}

remove_path_if_exists() {
    local path="$1"
    if [ -e "$path" ]; then
        rm -rf "$path"
    fi
}

remove_file_if_exists() {
    local path="$1"
    if [ -f "$path" ]; then
        rm -f "$path"
    fi
}

cleanup_opencode_assets() {
    local target_root
    if [ ${#OPEN_CODE_ARGS[@]} -gt 0 ]; then
        target_root="$HOME/.config/opencode"
    else
        target_root="$PROJECT_ROOT/.opencode"
    fi

    log_step "Cleaning OpenCode assets in $target_root..."

    local skill_path skill_name agent_path
    for skill_path in "$CHECKOUT_DIR"/skills/*; do
        [ -d "$skill_path" ] || continue
        skill_name=$(basename "$skill_path")
        remove_path_if_exists "$target_root/skills/$skill_name"
    done

    for agent_path in "$CHECKOUT_DIR"/agents/*.md; do
        [ -f "$agent_path" ] || continue
        remove_file_if_exists "$target_root/agents/$(basename "$agent_path")"
    done
}

cleanup_codex_assets() {
    log_step "Cleaning Codex assets in $PROJECT_ROOT..."

    local skill_path skill_name agent_path agent_name
    for skill_path in "$CHECKOUT_DIR"/skills/*; do
        [ -d "$skill_path" ] || continue
        skill_name=$(basename "$skill_path")
        remove_path_if_exists "$PROJECT_ROOT/.agents/skills/$skill_name"
    done

    for agent_path in "$CHECKOUT_DIR"/agents/*.md; do
        [ -f "$agent_path" ] || continue
        agent_name=$(basename "$agent_path" .md)
        remove_file_if_exists "$PROJECT_ROOT/.codex/agents/$agent_name.toml"
    done
}

cleanup_antigravity_assets() {
    log_step "Cleaning Antigravity assets in $PROJECT_ROOT..."

    local skill_path skill_name agent_path agent_name
    for skill_path in "$CHECKOUT_DIR"/skills/*; do
        [ -d "$skill_path" ] || continue
        skill_name=$(basename "$skill_path")
        remove_path_if_exists "$PROJECT_ROOT/.gemini/antigravity/knowledge/skill_$skill_name"
        remove_file_if_exists "$PROJECT_ROOT/.agents/workflows/$skill_name.md"
    done

    for agent_path in "$CHECKOUT_DIR"/agents/*.md; do
        [ -f "$agent_path" ] || continue
        agent_name=$(basename "$agent_path" .md)
        agent_name=${agent_name%-agent}
        remove_path_if_exists "$PROJECT_ROOT/.gemini/antigravity/knowledge/agent_$agent_name"
    done
}

cleanup_claude_assets() {
    if ! command -v claude >/dev/null 2>&1; then
        log_warn "Skipping Claude cleanup because the Claude CLI is not installed."
        return
    fi

    log_step "Cleaning Claude plugin install..."
    claude plugins disable "ai-toolbox@$CLAUDE_MARKETPLACE_NAME" --scope user >/dev/null 2>&1 || true
    claude plugins uninstall "ai-toolbox@$CLAUDE_MARKETPLACE_NAME" --scope user >/dev/null 2>&1 || true
}

force_clean_selected_targets() {
    if [ "$FORCE_CLEAN" -ne 1 ]; then
        return
    fi

    ensure_repo_checkout
    echo
    log_step "Force-cleaning selected AI Toolbox assets..."

    local target
    for target in "${TARGETS[@]}"; do
        case "$target" in
            claude) cleanup_claude_assets ;;
            antigravity) cleanup_antigravity_assets ;;
            opencode) cleanup_opencode_assets ;;
            codex) cleanup_codex_assets ;;
        esac
    done
}

configure_client_mcp() {
    local client="$1"
    local config_path="$2"
    local config_format="$3"

    log_step "Configuring $client MCP..."
    python3 "$CHECKOUT_DIR/scripts/configure_ai_toolbox_mcp.py" \
        --config "$config_path" \
        --format "$config_format" \
        --repo-root "$CHECKOUT_DIR"
}

configure_selected_mcp() {
    local configured=0

    require_command python3
    require_command node
    require_command pnpm
    ensure_repo_checkout

    echo
    log_step "Installing learn-tool dependencies..."
    pnpm --dir "$CHECKOUT_DIR/learn-tool" install --silent

    log_step "Initializing NKN database..."
    node "$CHECKOUT_DIR/learn-tool/src/cli/nkn.js" init >/dev/null

    log_step "Installing analytics-tool dependencies..."
    pnpm --dir "$CHECKOUT_DIR/analytics-tool" install --silent

    log_step "Initializing analytics database..."
    node "$CHECKOUT_DIR/analytics-tool/src/cli/analytics-needs.js" init >/dev/null

    if contains_target claude "${TARGETS[@]}"; then
        configure_client_mcp "Claude" "$HOME/.claude.json" "claude"
        configured=1
    fi

    if contains_target antigravity "${TARGETS[@]}"; then
        configure_client_mcp "Antigravity" "$HOME/.gemini/antigravity/mcp_config.json" "antigravity"
        configured=1
    fi

    if contains_target opencode "${TARGETS[@]}"; then
        configure_client_mcp "OpenCode" "$HOME/.config/opencode/opencode.json" "opencode"
        configured=1
    fi

    if contains_target codex "${TARGETS[@]}"; then
        configure_client_mcp "Codex" "$HOME/.codex/config.toml" "codex"
        configured=1
    fi

    if [ "$configured" -eq 0 ]; then
        log_warn "No MCP target selected."
    fi
}

install_claude() {
    echo
    log_step "Installing Claude plugin..."

    require_command claude

    if ! claude plugins marketplace add "$CLAUDE_MARKETPLACE_SOURCE"; then
        claude plugins marketplace update "$CLAUDE_MARKETPLACE_NAME" || true
    fi

    if ! claude plugins install "$CLAUDE_MARKETPLACE_NAME" --scope user; then
        claude plugins enable "$CLAUDE_MARKETPLACE_NAME" --scope user
    fi

    log_success "Claude install complete."
}

install_antigravity() {
    echo
    log_step "Installing Antigravity knowledge..."
    ensure_repo_checkout

    local install_script="$CHECKOUT_DIR/scripts/install_antigravity_knowledge.py"
    if [ ! -f "$install_script" ]; then
        log_error "Could not locate the Antigravity installation script."
        exit 1
    fi

    python3 "$install_script"
    log_success "Antigravity install complete."
}

install_opencode() {
    echo
    log_step "Installing OpenCode assets..."
    ensure_repo_checkout

    local install_script="$CHECKOUT_DIR/scripts/install_opencode_assets.py"
    if [ ! -f "$install_script" ]; then
        log_error "Could not locate the OpenCode installation script."
        exit 1
    fi

    python3 "$install_script" "${OPEN_CODE_ARGS[@]}"
    log_success "OpenCode install complete."
}

install_codex() {
    echo
    log_step "Installing Codex assets..."
    require_command python3
    ensure_repo_checkout

    local install_script="$CHECKOUT_DIR/scripts/install_codex_assets.py"
    if [ ! -f "$install_script" ]; then
        log_error "Could not locate the Codex installation script."
        exit 1
    fi

    python3 "$install_script"
    log_success "Codex install complete."
}

run_target_install() {
    local target="$1"

    if "install_$target"; then
        INSTALL_SUCCESSES+=("$target")
    else
        INSTALL_FAILURES+=("$target")
        log_error "$target installation failed."
    fi
}

print_install_summary() {
    echo
    echo "📋 Installation summary"

    if [ ${#INSTALL_SUCCESSES[@]} -gt 0 ]; then
        local item
        for item in "${INSTALL_SUCCESSES[@]}"; do
            printf '  ✅ %s\n' "$item"
        done
    else
        echo "  ⚠️  No client installations completed successfully."
    fi

    if [ ${#INSTALL_FAILURES[@]} -gt 0 ]; then
        local item
        for item in "${INSTALL_FAILURES[@]}"; do
            printf '  ❌ %s\n' "$item"
        done
    fi
}

while [ $# -gt 0 ]; do
    case "$1" in
        --targets)
            if [ $# -lt 2 ]; then
                log_error "--targets requires a value."
                exit 1
            fi
            normalize_targets "$2"
            shift 2
            ;;
        --global-opencode)
            OPEN_CODE_ARGS+=(--global)
            shift
            ;;
        --force-clean)
            FORCE_CLEAN=1
            shift
            ;;
        --help|-h)
            print_help
            exit 0
            ;;
        *)
            log_error "Unknown option '$1'."
            print_help
            exit 1
            ;;
    esac
done

if [ ${#TARGETS[@]} -eq 0 ]; then
    log_step "Bootstrapping AI-Toolbox installer..."
    prompt_for_targets
fi

if [ ${#TARGETS[@]} -eq 0 ]; then
    log_error "No install targets selected."
    exit 1
fi

log_info "Selected targets: ${TARGETS[*]}"

force_clean_selected_targets

configure_selected_mcp

for target in "${TARGETS[@]}"; do
    run_target_install "$target"
done

print_install_summary

if [ ${#INSTALL_FAILURES[@]} -gt 0 ]; then
    exit 1
fi

echo
echo "🎉 All requested AI-Toolbox installs completed."
