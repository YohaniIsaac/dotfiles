#!/bin/bash
# Re-apply monitor configuration after resume from suspend
# This fixes the common issue where external monitors don't
# properly reconfigure after waking up.

sleep 2

export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t /tmp/hypr/ 2>/dev/null | head -1)

if [ -z "$HYPRLAND_INSTANCE_SIGNATURE" ]; then
    exit 0
fi

hyprctl keyword monitor "HDMI-A-1, disable"
sleep 2
hyprctl keyword monitor "HDMI-A-1, 2560x1440@144, 0x0, 1"
hyprctl keyword monitor "eDP-1, 2560x1600@165, 2560x0, 2"
