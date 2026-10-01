#!/usr/bin/env bash
# unlock.sh — Desbloquea la sesión ANIDADA del arnés con SIGUSR1 al hyprlock de pruebas, por PID
# (nunca por nombre: no tocar el hyprlock de la sesión real). Con el PAM falso de dump.so el proceso
# no sale solo tras desbloquear (imita el bug del zombi): si no sale, se mata por PID.
W="${LOCK_HARNESS_DIR:-${XDG_RUNTIME_DIR:?}/lock-harness}"
[ -s "$W/sig" ] || exit 0
SIG=$(cat "$W/sig")
[ "$SIG" != "$HYPRLAND_INSTANCE_SIGNATURE" ] || { echo "ABORTO: firma de la sesión real"; exit 1; }
if [ -f "$W/hyprlock.pid" ] && kill -0 "$(cat "$W/hyprlock.pid")" 2>/dev/null; then
  kill -USR1 "$(cat "$W/hyprlock.pid")"
  for _ in $(seq 40); do [ "$(hyprctl --instance "$SIG" locked)" = false ] && break; sleep 0.1; done
  for _ in $(seq 40); do kill -0 "$(cat "$W/hyprlock.pid")" 2>/dev/null || break; sleep 0.1; done
  kill -0 "$(cat "$W/hyprlock.pid")" 2>/dev/null && kill -KILL "$(cat "$W/hyprlock.pid")"
fi
exit 0
