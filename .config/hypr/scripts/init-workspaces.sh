#!/bin/bash
# init-workspaces.sh — Fuerza la posición correcta de workspaces al inicio
# Se ejecuta desde autostart con un delay para esperar que los monitores estén listos

# Esperar a que Hyprland tenga los monitores disponibles
sleep 2

# Verificar qué monitores están conectados
DP=$(hyprctl monitors -j | jq -r '.[] | select(.name == "DP-1") | .name')
HDMI=$(hyprctl monitors -j | jq -r '.[] | select(.name == "HDMI-A-1") | .name')
EDP=$(hyprctl monitors -j | jq -r '.[] | select(.name == "eDP-1") | .name')

# Anclar workspaces 1-10 al DP-1 (primario / ASUS)
if [ -n "$DP" ]; then
    for i in $(seq 1 10); do
        hyprctl dispatch moveworkspacetomonitor $i DP-1 2>/dev/null
    done
fi

# Anclar workspaces 11-20 al HDMI-A-1 (secundario / SAC)
if [ -n "$HDMI" ]; then
    for i in $(seq 11 20); do
        hyprctl dispatch moveworkspacetomonitor $i HDMI-A-1 2>/dev/null
    done
fi

# Anclar workspaces 21-30 al eDP-1 (auxiliar / laptop)
if [ -n "$EDP" ]; then
    for i in $(seq 21 30); do
        hyprctl dispatch moveworkspacetomonitor $i eDP-1 2>/dev/null
    done
fi

# Establecer workspace inicial en cada monitor disponible
if [ -n "$DP" ]; then
    hyprctl dispatch focusmonitor DP-1
    hyprctl dispatch workspace 1
fi
if [ -n "$HDMI" ]; then
    hyprctl dispatch focusmonitor HDMI-A-1
    hyprctl dispatch workspace 11
fi
if [ -n "$EDP" ]; then
    hyprctl dispatch focusmonitor eDP-1
    hyprctl dispatch workspace 21
fi
