#!/bin/bash
# init-workspaces.sh — Fuerza la posición correcta de workspaces al inicio
# Se ejecuta desde autostart con un delay para esperar que los monitores estén listos

# Esperar a que Hyprland tenga los monitores disponibles
sleep 2

# Verificar que ambos monitores estén conectados
HDMI=$(hyprctl monitors -j | jq -r '.[] | select(.name == "HDMI-A-1") | .name')
EDP=$(hyprctl monitors -j | jq -r '.[] | select(.name == "eDP-1") | .name')

if [ -n "$HDMI" ] && [ -n "$EDP" ]; then
    # Anclar workspaces 1-10 al HDMI (solo los que ya existen)
    for i in $(seq 1 10); do
        hyprctl dispatch moveworkspacetomonitor $i HDMI-A-1 2>/dev/null
    done

    # Anclar workspaces 11-20 al eDP-1 (solo los que ya existen)
    for i in $(seq 11 20); do
        hyprctl dispatch moveworkspacetomonitor $i eDP-1 2>/dev/null
    done

    # Establecer workspace inicial en cada monitor
    hyprctl dispatch focusmonitor HDMI-A-1
    hyprctl dispatch workspace 1
    hyprctl dispatch focusmonitor eDP-1
    hyprctl dispatch workspace 11
elif [ -z "$HDMI" ] && [ -n "$EDP" ]; then
    # Solo laptop, workspace 1 por defecto
    hyprctl dispatch workspace 1
fi
