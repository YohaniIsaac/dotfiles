#!/bin/bash

CONFIG_DIR="$HOME/.config/hypr"

declare -A VARS
VARS[mainMod]="SUPER"
VARS[terminal]="kitty"
VARS[fileManager]="thunar"
VARS[menu]="rofi"

while IFS= read -r line; do
    [[ "$line" =~ ^\$([A-Za-z_]+)[[:space:]]*=[[:space:]]*(.+) ]] && VARS["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
done < <(cat "$CONFIG_DIR"/*.conf 2>/dev/null)

expand() {
    local str="$1" changed=1
    while [[ $changed -eq 1 ]]; do
        changed=0
        for v in "${!VARS[@]}"; do
            local n="${str//\$$v/${VARS[$v]}}"
            [[ "$n" != "$str" ]] && str="$n" && changed=1
        done
    done
    echo "$str"
}

exec_desc() {
    local cmd="$1"
    cmd="$(expand "$cmd")"
    # Strip shell redirections and pipelines for display
    cmd="${cmd%% 2>/dev/null*}"
    cmd="${cmd%% |*}"
    # If it's a complex command (awk, grep, etc), mark it as such
    if echo "$cmd" | grep -qE '\$\(|awk|grep|xargs'; then
        echo "(comando complejo)"
        return
    fi
    # Get the binary/script name (first token)
    local first
    first="$(echo "$cmd" | awk '{print $1}' | xargs basename 2>/dev/null)"
    echo "${first:-exec}"
}

human_desc() {
    local d="$1" p
    p="$(expand "$2")"
    case "$d" in
        exec)            exec_desc "$p" ;;
        killactive)      echo "Cerrar ventana activa" ;;
        togglefloating)  echo "Alternar flotante" ;;
        fullscreen)      [[ "$p" == "1" ]] && echo "Maximizar (sin barra)" || echo "Pantalla completa" ;;
        layoutmsg)
            case "$p" in
                togglesplit) echo "Alternar dirección del split" ;;
                swapsplit)   echo "Swap ventana principal ↔ pila" ;;
                *)           echo "Layout: $p" ;;
            esac ;;
        swapwindow)      echo "Intercambiar ventana →$p" ;;
        movefocus)       echo "Mover foco →$p" ;;
        resizeactive)    echo "Redimensionar ventana" ;;
        cyclenext)       echo "Siguiente ventana" ;;
        focusmonitor)    echo "Foco al monitor siguiente" ;;
        movewindow)      echo "Mover ventana →$p" ;;
        workspaceopt)    echo "Workspace: $p" ;;
        *)               echo "$d${p:+ $p}" ;;
    esac
}

is_section_header() {
    local s="$1"
    # Valid section: short, no shell-special chars, no arrows or parentheses in middle
    [[ ${#s} -gt 60 ]] && return 1
    [[ "$s" =~ [→\(\)] ]] && return 1
    [[ "$s" =~ ^[-=] ]] && return 1
    return 0
}

output=""
section=""

while IFS= read -r line; do
    line="$(echo "$line" | sed 's/[[:space:]]*$//')"

    if [[ "$line" =~ ^#[[:space:]]*-+$ ]] || [[ "$line" =~ ^#[[:space:]]*-{3,} ]]; then
        continue
    fi

    if [[ "$line" =~ ^#[[:space:]]*([^-].+)$ ]]; then
        candidate="${BASH_REMATCH[1]}"
        is_section_header "$candidate" && section="$candidate"
        continue
    fi

    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ ! "$line" =~ ^bind[a-z]*[[:space:]]*= ]] && continue

    rest="${line#*= }"

    # Skip mouse and XF86 hardware keys (not useful in viewer)
    [[ "$rest" =~ mouse: || "$rest" =~ mouse_ ]] && continue
    [[ "${rest,,}" =~ xf86 ]] && continue

    # Inline comment override
    inline=""
    if [[ "$rest" =~ [[:space:]]#[[:space:]](.+)$ ]]; then
        inline="${BASH_REMATCH[1]}"
        rest="${rest%%  #*}"
        rest="${rest%% #*}"
    fi

    IFS=',' read -ra parts <<< "$rest"
    mods="$(expand "$(echo "${parts[0]}" | xargs)")"
    key="$(echo "${parts[1]:-}" | xargs)"
    key="${key^^}"
    dispatcher="$(echo "${parts[2]:-}" | xargs)"
    param="$(echo "${parts[3]:-}" | xargs)"

    [[ -z "$key" || -z "$dispatcher" ]] && continue
    [[ "$dispatcher" == "bringactivetotop" ]] && continue

    desc="${inline:-$(human_desc "$dispatcher" "$param")}"
    [[ -z "$desc" ]] && continue

    output+="$(printf '%-32s  %-22s %s' "$mods + $key" "[${section:-General}]" "$desc")"$'\n'

done < <(cat "$CONFIG_DIR/keybindings.conf" "$CONFIG_DIR/custom.conf" 2>/dev/null)

[[ -z "$output" ]] && notify-send "Keybindings" "No se encontraron atajos de teclado" && exit 1

echo "$output" | rofi \
    -dmenu \
    -i \
    -p "  Keybindings" \
    -theme ~/.config/rofi/config.rasi \
    -no-custom \
    -font "monospace 10"
