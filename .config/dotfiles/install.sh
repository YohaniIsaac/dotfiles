#!/usr/bin/env bash
set -euo pipefail

PACKAGES="$HOME/.config/dotfiles/packages.txt"

parse_packages() {
    grep -vE '^[[:space:]]*(#|$)' "$1"
}

# Install noto-fonts first so yay never prompts for a ttf-font provider
echo "==> Installing fonts..."
yay -S --needed --noconfirm noto-fonts noto-fonts-emoji

echo "==> Installing packages..."
parse_packages "$PACKAGES" | yay -S --needed -

# Default Matugen colors (from groot_1.jpg) so Hyprland, Rofi and AGS start themed;
# only fills in the color files that don't exist yet
echo "==> Default colors..."
bash "$HOME/.config/matugen/apply-defaults.sh"
