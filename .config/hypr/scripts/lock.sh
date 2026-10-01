#!/bin/bash
# lock.sh — Bloquea la sesión con hyprlock una sola vez y sin dejar zombis.
#
# Lo usan el atajo (Super+Shift+L), el lock_cmd de hypridle (inactividad, wlogout y antes de
# suspender, que pasan por `loginctl lock-session`) y el clic derecho del botón de apagado de la
# barra. No lo llames con `hyprlock` directo.
#
# Problema: el guard de la wiki (`pidof hyprlock || hyprlock`) da por hecho que el proceso
# desaparece al desbloquear. hyprlock 0.9.6 a veces no sale (hyprlock#1076, #416, #791): un
# zombi hacía que `pidof` respondiera siempre que sí y el bloqueo por inactividad no lanzara
# nada (se notó el 2026-10-01: llevaba desde el 9-sep). Además, el atajo lanzaba hyprlock sin
# guard y una doble pulsación creaba el duplicado que luego se quedaba colgado.
#
# Solución:
#   1. Preguntar al compositor (`hyprctl locked`), no mirar procesos.
#   2. Serializar el lanzamiento con un flock corto (solo hasta que el compositor confirma el
#      bloqueo; no dura lo que hyprlock, o un zombi bloquearía todo igual).
#   3. Matar (SIGKILL) los hyprlock de ESTA sesión que sigan vivos con la sesión desbloqueada, y
#      vigilar el que lanzamos: si tras desbloquear no sale en 3 s, matarlo. SIGKILL y no
#      SIGTERM/SIGUSR1: una salida "elegante" con la conversación PAM pendiente cuenta como un
#      login fallido en pam_faillock (3 = cuenta bloqueada 10 min, también para sudo).
#   4. La salida de hyprlock va a un archivo: con un pipe cerrado (p. ej. si lo lanza la barra de
#      AGS y esta se reinicia) un SIGPIPE mataría al bloqueador y la sesión quedaría en la
#      pantalla de "lockscreen app died".
#
# Los datos de la pantalla (fondo, avatar, clima) los prepara lock-info.sh antes de lanzar.

cache="${XDG_CACHE_HOME:-$HOME/.cache}/hyprlock"
mkdir -p "$cache"
log="$cache/lock.log"
[[ $(stat -c %s "$log" 2>/dev/null || echo 0) -gt 102400 ]] && : > "$log"

is_locked()   { [[ "$(hyprctl locked 2>/dev/null)" == true ]]; }
is_unlocked() { [[ "$(hyprctl locked 2>/dev/null)" == false ]]; }
note()        { printf '%s lock.sh: %s\n' "$(date '+%F %T')" "$*" >> "$log"; }

# hyprlock de esta sesión de Wayland (hay más de uno si se prueba con un Hyprland anidado)
session_hyprlocks() {
  local p
  for p in $(pgrep -x hyprlock); do
    tr '\0' '\n' < "/proc/$p/environ" 2>/dev/null | grep -qx "WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-wayland-1}" && echo "$p"
  done
}

# Ya bloqueado → nada que hacer (doble pulsación, hypridle y atajo a la vez…)
is_locked && exit 0

# Datos de la pantalla. Nunca debe impedir ni retrasar el bloqueo más de 3 s.
info="$HOME/.config/hypr/scripts/lock-info.sh"
[[ -x "$info" ]] && timeout 3 "$info" prepare >/dev/null 2>&1

exec 9>"${XDG_RUNTIME_DIR:-/tmp}/hyprlock-launch.lock"
flock -w 5 9 || { note "no se obtuvo el flock de lanzamiento"; exit 1; }
is_locked && exit 0

# Con la sesión desbloqueada y el flock en la mano, un hyprlock de más de 10 s no sostiene
# ningún bloqueo: es un zombi (o un duplicado colgado). Fuera.
if is_unlocked; then
  for p in $(session_hyprlocks); do
    age=$(ps -o etimes= -p "$p" 2>/dev/null | tr -d ' ')
    if [[ -n "$age" && "$age" -gt 10 ]]; then
      kill -KILL "$p" 2>/dev/null && note "hyprlock zombi $p (${age}s) eliminado"
    fi
  done
fi

hyprlock "$@" >>"$log" 2>&1 9>&- </dev/null &
pid=$!

# Esperar a que el compositor confirme el bloqueo (hasta 30 s).
for _ in $(seq 600); do
  is_locked && break
  kill -0 "$pid" 2>/dev/null || { wait "$pid"; code=$?; note "hyprlock terminó sin bloquear (código $code)"; exit "$code"; }
  sleep 0.05
done
exec 9>&-   # el flock solo cubre el lanzamiento

if ! is_locked; then
  note "hyprlock no bloqueó en 30 s; se mata"
  kill -KILL "$pid" 2>/dev/null
  exit 1
fi

# Vigilar: si el compositor dice desbloqueado 3 s seguidos y hyprlock sigue vivo, es el bug.
unlocked_for=0
while kill -0 "$pid" 2>/dev/null; do
  sleep 1
  if is_unlocked; then
    unlocked_for=$((unlocked_for + 1))
    if (( unlocked_for >= 3 )); then
      kill -KILL "$pid" 2>/dev/null && note "hyprlock $pid no salió tras desbloquear; eliminado"
      break
    fi
  else
    unlocked_for=0
  fi
done
exit 0
