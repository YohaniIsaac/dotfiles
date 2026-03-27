#!/usr/bin/env bash
# Toggle hypridle and report status as JSON for waybar

SERVICE="hypridle"

print_status() {
    if pgrep -x "$SERVICE" >/dev/null; then
        echo '{"text": "", "class": "active", "tooltip": "Screen locking active\nClick to deactivate"}'
    else
        echo '{"text": "", "class": "notactive", "tooltip": "Screen locking disabled\nClick to activate"}'
    fi
}

case "$1" in
    status)
        sleep 0.2
        print_status
        ;;
    toggle)
        if pgrep -x "$SERVICE" >/dev/null; then
            killall "$SERVICE"
        else
            "$SERVICE" &
        fi
        sleep 0.2
        print_status
        ;;
esac
