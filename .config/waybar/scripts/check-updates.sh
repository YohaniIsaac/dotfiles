#!/usr/bin/env bash
# Check for pacman + AUR updates and output JSON for waybar

threshhold_yellow=25
threshhold_red=100

# Wait for pacman lock
while [ -f "/var/lib/pacman/db.lck" ]; do sleep 1; done

# Count pacman updates
updates_pacman=$(checkupdates 2>/dev/null | wc -l)

# Count AUR updates
if command -v yay &>/dev/null; then
    updates_aur=$(yay -Qum 2>/dev/null | wc -l)
elif command -v paru &>/dev/null; then
    updates_aur=$(paru -Qum 2>/dev/null | wc -l)
else
    updates_aur=0
fi

updates=$((updates_pacman + updates_aur))

[ "$updates" -eq 0 ] && exit 0

css_class="green"
[ "$updates" -gt "$threshhold_yellow" ] && css_class="yellow"
[ "$updates" -gt "$threshhold_red" ]   && css_class="red"

printf '{"text": "%s", "tooltip": "Click to update system", "class": "%s"}' "$updates" "$css_class"
