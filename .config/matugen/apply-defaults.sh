#!/bin/bash
# apply-defaults.sh — Colores por defecto para una máquina nueva.
#
# Matugen genera los colores del escritorio en cada máquina según el wallpaper que elijas
# (Super+W), y esos archivos no se trackean. En defaults/ están los de groot_1.jpg, el único
# wallpaper del repo. Este script los copia solo a los archivos que todavía no existen, así
# que nunca pisa los colores del wallpaper que tengas elegido. Imprime lo que copió.
#
# Lo llama hypr/scripts/machine-setup.sh, que además recarga Hyprland si hizo falta.

defaults="$HOME/.config/matugen/defaults"

copy_default() {  # <archivo en defaults/> <destino>
  [[ -e "$2" ]] && return 0
  install -Dm644 "$defaults/$1" "$2" && echo "Colores por defecto: $2"
}

copy_default hypr-colors.conf "$HOME/.config/hypr/colors.conf"
copy_default rofi-colors.rasi "$HOME/.config/rofi/colors.rasi"
copy_default ags-colors.scss  "$HOME/.config/ags/colors.scss"

exit 0
