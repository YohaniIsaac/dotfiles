#!/bin/bash
# workspace-nav.sh — Navegación de workspaces independiente por monitor
# Uso:
#   workspace-nav.sh goto  [1-10]   — ir al workspace N del monitor activo
#   workspace-nav.sh move  [1-10]   — mover ventana al workspace N del monitor activo
#   workspace-nav.sh next           — siguiente workspace en el monitor activo
#   workspace-nav.sh prev           — workspace anterior en el monitor activo

ACTION=$1
NUM=$2

ACTIVE_MONITOR=$(hyprctl monitors -j | jq -r '.[] | select(.focused == true) | .name')

if [ "$ACTIVE_MONITOR" = "HDMI-A-1" ]; then
    OFFSET=0
    MIN=1
    MAX=10
else
    OFFSET=10
    MIN=11
    MAX=20
fi

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
