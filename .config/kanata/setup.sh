#!/usr/bin/env bash
# setup.sh — Deja kanata listo en una máquina nueva.
#
# Kanata lee los teclados (/dev/input, grupo input) y crea un teclado virtual en
# /dev/uinput, que por defecto solo puede usar root. Este script copia a /etc la
# regla udev y la carga del módulo que están en system/, crea el grupo uinput,
# agrega al usuario a input y uinput, y habilita el servicio de usuario.
#
# Después hay que REINICIAR: el servicio corre bajo el user manager de systemd,
# que conserva los grupos con los que arrancó.

set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo groupadd -f -r uinput
sudo install -Dm644 "$dir/system/99-input.rules" /etc/udev/rules.d/99-input.rules
sudo install -Dm644 "$dir/system/uinput.conf" /etc/modules-load.d/uinput.conf
sudo modprobe uinput
sudo udevadm control --reload-rules
sudo udevadm trigger --action=add --sysname-match=uinput
sudo usermod -aG input,uinput "$USER"

systemctl --user daemon-reload
systemctl --user enable kanata.service

cat <<EOF

Listo. Reinicia para que kanata.service arranque con el grupo uinput.
Para usarlo antes de reiniciar:
  sg uinput -c "setsid -f kanata --cfg $HOME/.config/kanata/scroll.kbd >> $HOME/.cache/kanata-manual.log 2>&1 < /dev/null"
EOF
