#!/bin/bash
# machine-setup.sh — Prepara lo que es propio de cada máquina y no está en git.
#
#   1. ~/.config/hypr/host.conf → hosts/<hostname>.conf (monitores y sus roles), o
#      hosts/default.conf si todavía no hay un archivo para este hostname.
#   2. Colores por defecto de Matugen (~/.config/matugen/apply-defaults.sh).
#
# Solo crea lo que falta; nunca pisa. Con --force vuelve a elegir el archivo de host
# (por ejemplo, después de cambiar el hostname o de crear hosts/<hostname>.conf).
# Lo llaman install.sh y autostart.conf (en cada inicio de sesión).

hypr="$HOME/.config/hypr"
changed=false

[[ "$1" == "--force" ]] && rm -f "$hypr/host.conf"

# -e es falso también para un symlink roto (por ejemplo, si se renombró el archivo de host)
if [[ ! -e "$hypr/host.conf" ]]; then
  host=$(hostnamectl hostname 2>/dev/null || uname -n)
  target="hosts/$host.conf"
  [[ -e "$hypr/$target" ]] || target="hosts/default.conf"
  ln -sfn "$target" "$hypr/host.conf" && echo "Monitores: host.conf → $target"
  changed=true
fi

colors=$("$HOME/.config/matugen/apply-defaults.sh")
[[ -n "$colors" ]] && { echo "$colors"; changed=true; }

# Dentro de Hyprland hay que recargar para que tome lo recién creado
if $changed && [[ -n "$HYPRLAND_INSTANCE_SIGNATURE" ]]; then
  hyprctl reload >/dev/null
fi

exit 0
