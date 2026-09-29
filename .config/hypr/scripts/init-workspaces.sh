#!/bin/bash
# init-workspaces.sh — Fuerza la posición correcta de workspaces al inicio
# Se ejecuta desde autostart con un delay para esperar que los monitores estén listos.
# Qué monitor es dueño de cada bloque (1-10, 11-20, 21-30) sale de workspace.conf y
# hosts/<hostname>.conf; los monitores que no están conectados se saltan.

source "$(dirname "$0")/lib-monitors.sh"

# Esperar a que Hyprland tenga los monitores disponibles
sleep 2

CONNECTED=$(hyprctl monitors -j | jq -r '.[].name')

# Anclar cada bloque de 10 workspaces a su monitor
for start in 1 11 21; do
    mon=$(monitor_of_ws "$start")
    grep -qx -- "$mon" <<< "$CONNECTED" || continue
    for i in $(seq "$start" $((start + 9))); do
        hyprctl dispatch moveworkspacetomonitor "$i" "$mon" 2>/dev/null
    done
done

# Establecer el workspace inicial de cada monitor disponible
for start in 1 11 21; do
    mon=$(monitor_of_ws "$start")
    grep -qx -- "$mon" <<< "$CONNECTED" || continue
    hyprctl dispatch focusmonitor "$mon"
    hyprctl dispatch workspace "$start"
done
