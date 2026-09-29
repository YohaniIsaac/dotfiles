# lib-monitors.sh — Qué bloque de workspaces tiene cada monitor.
#
# La fuente de verdad son las reglas de workspace.conf, que usan $mon1/$mon2/$mon3 de
# hosts/<hostname>.conf. Acá se leen desde Hyprland, así ningún script tiene nombres de
# monitor escritos a mano. Uso: source "$(dirname "$0")/lib-monitors.sh"

# Primer workspace del bloque de un monitor (1, 11 o 21); vacío si no tiene regla.
ws_start_of() {
  hyprctl workspacerules -j | jq -r --arg m "$1" \
    'first(.[] | select(.monitor == $m and .default == true) | .workspaceString) // empty'
}

# Monitor asignado a un workspace (ej: 1 → DP-1); vacío si no hay regla.
monitor_of_ws() {
  hyprctl workspacerules -j | jq -r --arg w "$1" \
    'first(.[] | select(.workspaceString == $w) | .monitor) // empty'
}

# Nombre del monitor con el foco.
focused_monitor() {
  hyprctl monitors -j | jq -r '.[] | select(.focused == true) | .name'
}
