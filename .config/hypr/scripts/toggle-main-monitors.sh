#!/bin/bash
# Alterna el foco entre los monitores externos (ordenados de izquierda a derecha).
# Si hay menos de dos externos (p.ej. casa: laptop + 1 monitor), alterna entre todos.
mapfile -t MONS < <(hyprctl monitors -j | jq -r 'sort_by(.x) | .[] | select(.name | startswith("eDP") | not) | .name')
CURRENT=$(hyprctl monitors -j | jq -r '.[] | select(.focused==true) | .name')

if [ "${#MONS[@]}" -lt 2 ]; then
    hyprctl dispatch focusmonitor +1
    exit
fi

NEXT=${MONS[0]}
for i in "${!MONS[@]}"; do
    if [ "${MONS[$i]}" = "$CURRENT" ]; then
        NEXT=${MONS[$(( (i + 1) % ${#MONS[@]} ))]}
    fi
done
hyprctl dispatch focusmonitor "$NEXT"
