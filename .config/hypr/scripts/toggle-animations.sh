#!/usr/bin/env bash

# Toggle animations
ANIMATIONS=$(hyprctl getoption animations:enabled | awk 'NR==2{print $2}')

if [ "$ANIMATIONS" = "1" ]; then
    hyprctl setoption animations:enabled 0
    notify-send "Animations" "Disabled"
else
    hyprctl setoption animations:enabled 1
    notify-send "Animations" "Enabled"
fi
