#!/bin/bash
# restore-wallpaper.sh — Arranca awww y pone el último wallpaper elegido con Super+W.
#
# wallpaperSelect.sh deja ~/.current_wallpaper como symlink al wallpaper elegido, y los
# colores de Matugen corresponden a ese. En una instalación nueva ese symlink no existe,
# así que se usa groot_1.jpg, que sí está en el repo, junto con sus colores
# (matugen/defaults/, los copia apply-defaults.sh si todavía no hay colores generados).
#
# Antes esto era `awww-daemon && awww img lofirain.png`, pero awww-daemon no termina, así
# que la segunda parte nunca se ejecutaba. Solo funcionaba porque awww recuerda el último
# fondo en su caché, y en una máquina nueva no hay caché.

# Primero los colores: la barra de AGS no compila sin ags/colors.scss
"$HOME/.config/matugen/apply-defaults.sh"

awww-daemon &

# Esperar a que el daemon responda (máx. ~10 s)
for _ in $(seq 50); do
  awww query >/dev/null 2>&1 && break
  sleep 0.2
done

wallpaper=$(readlink -e "$HOME/.current_wallpaper") || wallpaper="$HOME/Pictures/wallpapers/groot_1.jpg"
awww img "$wallpaper" --transition-type none
