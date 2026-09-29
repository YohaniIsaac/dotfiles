#!/bin/bash
# start-bar.sh — Lanza la barra de AGS de forma segura al inicio de sesión.
#
# Problema que resuelve: en arranque en frío, `exec-once = ags run` disparaba AGS
# ANTES de que pipewire/wireplumber estuvieran listos. AstalWp se inicializa async
# (Wp.get_default() puede devolver null hasta que emite "ready"), así que la barra
# crasheaba al arrancar y no aparecía (ags issues #626 / #533). Antes no se notaba
# porque AGS se lanzaba a mano, con los servicios de audio ya arriba.
#
# Solución: esperar (acotado a ~10s) a que los servicios de audio estén activos, con
# un pequeño colchón para NetworkManager / D-Bus, y recién ahí lanzar AGS.

# Esperar el bus de sesión D-Bus (xdg-desktop-portal/polkit arrancan en paralelo vía
# otros exec-once y tardan en registrarse — sin esto, AGS puede morir en silencio en
# arranque en frío real vía exec-once, aunque relanzado a mano después ya funcione bien).
for _ in $(seq 1 40); do
  [ -S "${XDG_RUNTIME_DIR}/bus" ] && break
  sleep 0.25
done

for _ in $(seq 1 40); do
  systemctl --user -q is-active wireplumber pipewire && break
  sleep 0.25
done

sleep 0.5   # colchón para que NetworkManager / D-Bus / portal terminen de exponerse

# GTK 4.22 usa el renderer VULKAN por defecto en Wayland. Se mantiene CAIRO (software)
# como precaución de bajo costo: AGS quedó EXONERADO de los apagones del PC (probado
# repetidas veces — crashea igual en waybar, sin AGS corriendo), pero mientras el root
# cause real (NVMe APST / GPU RC6) se sigue confirmando, no tiene sentido reintroducir
# esta variable. Si el sistema queda estable, se puede probar GSK_RENDERER=gl después.
export GSK_RENDERER=cairo

# Red de seguridad ante crashes. Historia: entre el 9 y el 28 de julio de 2026 AGS agotaba
# sus file descriptors ("Too many open files") y terminaba en SEGFAULT. Al principio se culpó
# a libastal-hyprland-git, pero esa librería solo era la primera víctima. La causa real era
# `swaync-client -swb` dentro de un poll de BottomBar.tsx: ese modo se suscribe y nunca
# termina, así que cada tick dejaba un proceso colgado. Quedó arreglado el 2026-07-28
# (ver el comentario en BottomBar.tsx). Regla: nunca meter comandos subscribe/follow/watch
# en un poll.
#
# Igual se mantiene: la barra se relanza sola si muere (bucle de abajo; `sleep 2` evita un
# crash-loop apretado si algo queda roto de forma permanente), y sin core dumps. Con la
# fuga, gjs llegaba a ~10GB antes de crashear y systemd-coredump intentó volcar toda esa
# memoria: dejó el sistema sin RAM más de 10 minutos y obligó a un apagado físico
# (2026-07-09). `ulimit -c 0` evita que eso se repita si algún día vuelve a crashear.
ulimit -c 0

# Guard contra instancias duplicadas: si este script ya está corriendo (por ejemplo, se
# lanzó a mano estando activo el exec-once), se sale en vez de apilar una segunda barra.
# Dos AGS simultáneos no solo se superponen visualmente — DUPLICAN la tasa de spawn de
# subprocesos, que fue lo que aceleró el agotamiento de fds hasta tumbar dbus-broker y
# cerrar todas las apps (2026-07-28). `flock` con -n falla al toque si ya hay dueño.
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/ags-start.lock"
if ! flock -n 9; then
  echo "start-bar.sh: ya hay una instancia corriendo — saliendo." >&2
  exit 0
fi

# Log a archivo: exec-once no captura stdout/stderr de AGS. Se trunca en cada (re)lanzamiento.
while true; do
  ags run "$HOME/.config/ags" > "$HOME/.cache/ags-start.log" 2>&1
  sleep 2
done
