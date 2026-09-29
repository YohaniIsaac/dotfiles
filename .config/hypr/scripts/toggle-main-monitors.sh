#!/bin/bash
# toggle-main-monitors.sh — Alterna el foco entre el monitor 1 y el 2 de esta máquina
# (los dueños de los workspaces 1 y 11 en workspace.conf / hosts/<hostname>.conf).

source "$(dirname "$0")/lib-monitors.sh"

MON1=$(monitor_of_ws 1)
MON2=$(monitor_of_ws 11)

if [ "$(focused_monitor)" = "$MON1" ]; then
    hyprctl dispatch focusmonitor "$MON2"
else
    hyprctl dispatch focusmonitor "$MON1"
fi
