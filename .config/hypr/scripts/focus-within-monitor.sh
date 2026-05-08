#!/bin/bash
# Mueve el foco en la dirección indicada solo si no cruza de monitor.
# Uso: focus-within-monitor.sh [l|r|u|d]

DIR=$1
CURRENT_MONITOR=$(hyprctl monitors -j | jq -r '.[] | select(.focused==true) | .name')
CURRENT_WIN=$(hyprctl activewindow -j | jq -r '.address')

hyprctl dispatch movefocus "$DIR"

NEW_MONITOR=$(hyprctl monitors -j | jq -r '.[] | select(.focused==true) | .name')

if [ "$NEW_MONITOR" != "$CURRENT_MONITOR" ] && [ -n "$CURRENT_WIN" ] && [ "$CURRENT_WIN" != "null" ]; then
    hyprctl dispatch focuswindow "address:$CURRENT_WIN"
fi
