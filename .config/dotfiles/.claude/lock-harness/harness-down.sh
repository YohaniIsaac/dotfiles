#!/usr/bin/env bash
# harness-down.sh — Cierra el compositor anidado de pruebas (solo el que levantó harness-up.sh).
set -u
W="${LOCK_HARNESS_DIR:-${XDG_RUNTIME_DIR:?}/lock-harness}"
[ -s "$W/sig" ] || { echo "no hay arnés levantado"; exit 0; }
sig=$(cat "$W/sig"); pid=$(cat "$W/pid" 2>/dev/null)
[ "$sig" != "$HYPRLAND_INSTANCE_SIGNATURE" ] || { echo "ABORTO: la firma del arnés es la de la sesión real"; exit 1; }

"$(dirname "$(readlink -f "$0")")/unlock.sh" >/dev/null 2>&1
hyprctl --instance "$sig" dispatch exit >/dev/null 2>&1
for _ in $(seq 30); do [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
# solo si sigue vivo y de verdad es el nuestro (su línea de comandos lleva nuestra config)
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q "$W/hyprland.conf"; then
  kill "$pid"
fi
rm -f "$W/sig" "$W/wl" "$W/out" "$W/pid" "$W/hyprlock.pid"
find "$W/frames" -maxdepth 1 -type f -delete 2>/dev/null   # cada volcado pesa 8 MB y $XDG_RUNTIME_DIR es RAM

# Hyprland deja la carpeta de su instancia al salir. Solo si el proceso murió y no es la firma real:
# se borran los archivos que crea y rmdir (si hubiera algo más, no se borra).
d="$XDG_RUNTIME_DIR/hypr/$sig"
if [ -d "$d" ] && { [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; } && [ "$sig" != "$HYPRLAND_INSTANCE_SIGNATURE" ]; then
  rm -f "$d/hyprland.log" "$d/.socket.sock" "$d/.socket2.sock" "$d/.lock"
  rmdir "$d" 2>/dev/null
fi
echo "arnés cerrado"
