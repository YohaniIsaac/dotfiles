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

# Per-machine files that are not in git: hypr/host.conf (by hostname) and the default
# Matugen colors (from groot_1.jpg). Only creates what is missing.
echo "==> Machine setup..."
bash "$HOME/.config/hypr/scripts/machine-setup.sh"
