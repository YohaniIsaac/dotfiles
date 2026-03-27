#!/usr/bin/env bash
# Install updates in a kitty terminal
kitty -e bash -c "yay -Syu; echo 'Done. Press any key to close.'; read -n1"
