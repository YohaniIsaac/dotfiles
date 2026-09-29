#!/bin/bash
# workspace-nav.sh — Navegación de workspaces independiente por monitor
# Uso:
#   workspace-nav.sh goto  [1-10]   — ir al workspace N del monitor activo
#   workspace-nav.sh move  [1-10]   — mover ventana al workspace N del monitor activo
#   workspace-nav.sh next           — siguiente workspace en el monitor activo
#   workspace-nav.sh prev           — workspace anterior en el monitor activo

source "$(dirname "$0")/lib-monitors.sh"

ACTION=$1
NUM=$2

ACTIVE_MONITOR=$(focused_monitor)

# Bloque de 10 workspaces de este monitor según workspace.conf (1, 11 o 21).
# Un monitor sin regla (por ejemplo, uno que no está en hosts/<hostname>.conf) usa 1-10.
MIN=$(ws_start_of "$ACTIVE_MONITOR")
MIN=${MIN:-1}
OFFSET=$((MIN - 1))
MAX=$((MIN + 9))

case "$ACTION" in
    goto)
        TARGET=$((NUM + OFFSET))
        # Primero anclar el workspace a este monitor (evita que siga al otro monitor)
        hyprctl dispatch moveworkspacetomonitor $TARGET $ACTIVE_MONITOR
        hyprctl dispatch workspace $TARGET
        ;;
    move)
        TARGET=$((NUM + OFFSET))
        hyprctl dispatch moveworkspacetomonitor $TARGET $ACTIVE_MONITOR
        hyprctl dispatch movetoworkspace $TARGET
        ;;
    next)
        CURRENT=$(hyprctl monitors -j | jq -r '.[] | select(.focused == true) | .activeWorkspace.id')
        NEXT=$((CURRENT + 1))
        if [ $NEXT -gt $MAX ]; then NEXT=$MIN; fi
        hyprctl dispatch moveworkspacetomonitor $NEXT $ACTIVE_MONITOR
        hyprctl dispatch workspace $NEXT
        ;;
    prev)
        CURRENT=$(hyprctl monitors -j | jq -r '.[] | select(.focused == true) | .activeWorkspace.id')
        PREV=$((CURRENT - 1))
        if [ $PREV -lt $MIN ]; then PREV=$MAX; fi
        hyprctl dispatch moveworkspacetomonitor $PREV $ACTIVE_MONITOR
        hyprctl dispatch workspace $PREV
        ;;
esac
