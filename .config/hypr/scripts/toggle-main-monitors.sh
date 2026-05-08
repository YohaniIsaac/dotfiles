#!/bin/bash
CURRENT=$(hyprctl monitors -j | jq -r '.[] | select(.focused==true) | .name')
if [ "$CURRENT" = "DP-1" ]; then
    hyprctl dispatch focusmonitor HDMI-A-1
else
    hyprctl dispatch focusmonitor DP-1
fi
