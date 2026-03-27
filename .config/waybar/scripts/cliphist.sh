#!/usr/bin/env bash
# Clipboard manager using cliphist + rofi
case $1 in
    d) cliphist list | rofi -dmenu -replace | cliphist delete ;;
    w) cliphist wipe ;;
    *) cliphist list | rofi -dmenu -replace | cliphist decode | wl-copy ;;
esac
