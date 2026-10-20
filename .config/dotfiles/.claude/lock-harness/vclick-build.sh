#!/usr/bin/env bash
# vclick-build.sh — compila `vclick`, un puntero virtual (zwlr_virtual_pointer_v1) que mueve el cursor y hace
# clic en el compositor ANIDADO del arnés. Sirve para probar clics de verdad (cerrar un popup al pulsar fuera,
# botones…) sin tocar el puntero del usuario: Hyprland entrega los eventos solo al compositor al que se conecta.
#   ./vclick-build.sh                       → compila a $LOCK_HARNESS_DIR/vclick
#   WAYLAND_DISPLAY=$(cat $LOCK_HARNESS_DIR/wl) EXT_W=1920 EXT_H=1080 vclick click 1500 700 [272|273|274]
# EXT_W/EXT_H = tamaño del layout del anidado (con dos salidas de 1920x1080 en fila: 3840x1080).
# Se necesita wayland-scanner y las cabeceras de wayland-client (paquete `wayland`); el XML del protocolo lo
# trae esta carpeta (el de wlr-protocols no suele estar instalado).
set -eu
SRC="$(dirname "$(readlink -f "$0")")"
W="${LOCK_HARNESS_DIR:-${XDG_RUNTIME_DIR:?}/lock-harness}"
mkdir -p "$W/vclick-build"
wayland-scanner client-header "$SRC/vclick/wlr-virtual-pointer-unstable-v1.xml" "$W/vclick-build/vptr-client.h"
wayland-scanner private-code  "$SRC/vclick/wlr-virtual-pointer-unstable-v1.xml" "$W/vclick-build/vptr-code.c"
gcc -O2 -Wall -I"$W/vclick-build" -o "$W/vclick" "$SRC/vclick/vclick.c" "$W/vclick-build/vptr-code.c" -lwayland-client
echo "$W/vclick"
