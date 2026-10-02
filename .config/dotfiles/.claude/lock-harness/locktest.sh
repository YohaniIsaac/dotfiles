#!/usr/bin/env bash
# locktest.sh — prueba ~/.config/hypr/scripts/lock.sh contra el compositor ANIDADO (nunca el real),
# con el PAM falso de dump.so.
#   T1 bloquear · T2 repetir con la sesión bloqueada (no-op) · T3 desbloquear con hyprlock que no
#   sale (el PAM falso reproduce el bug del zombi) y comprobar que el vigilante lo mata · T4 dos
#   lanzamientos simultáneos → un solo hyprlock · T5 volver a bloquear con el zombi aún vivo ·
#   T6 el brillo baja al bloquear y vuelve al desbloquear · T7 y vuelve si hyprlock sale/muere ·
#   T8 con la sesión bloqueada y sin hyprlock (cayó), lock.sh lo relanza · T9 un brillo guardado de
#   un bloqueo anterior se devuelve antes de bajar · T10 y si matan a lock.sh con TERM · T11 el
#   restore de un lock.sh viejo no deshace el brillo de un bloqueo ajeno · T12 un monitor DDC dormido al
#   desbloquear se devuelve cuando despierta · T13 un monitor sin DDC y lento no retrasa el bloqueo ni
#   impide bajar al resto · T14 el filtro de los monitores sin DDC se genera ANTES de lanzar hyprlock ·
#   T15 un dim retrasado por el candado del estado no baja el brillo de una sesión ya desbloqueada.
# Para probar una copia de lock.sh (y sus scripts hermanos): LOCK_SH=/ruta/lock.sh ./locktest.sh
# El brillo se prueba SIEMPRE con stub/brightnessctl (una retroiluminación inventada en $W/fake-bl) y
# stub/ddcutil (monitores inventados en $W/fake-ddc, con un sysfs de DRM inventado en $W/fake-drm);
# la retroiluminación y el ASUS reales no se tocan, y el script lo comprueba al terminar.
SRC="$(dirname "$(readlink -f "$0")")"
W="${LOCK_HARNESS_DIR:-${XDG_RUNTIME_DIR:?}/lock-harness}"
[ -s "$W/sig" ] || { echo "no hay arnés: corre harness-up.sh"; exit 1; }
SIG=$(cat "$W/sig"); WL=$(cat "$W/wl")
[ "$SIG" != "$HYPRLAND_INSTANCE_SIGNATURE" ] || { echo "ABORTO: firma de la sesión real"; exit 1; }
export HYPRLAND_INSTANCE_SIGNATURE="$SIG" WAYLAND_DISPLAY="$WL" LD_PRELOAD="$W/dump.so"
nm -D "$W/dump.so" | grep -q ' T pam_authenticate' || { echo "ABORTO: sin PAM falso"; exit 1; }
LOCK="${LOCK_SH:-$HOME/.config/hypr/scripts/lock.sh}"
# Brillo falso: sin esto, lock.sh bajaría de verdad la retroiluminación del portátil.
export PATH="$SRC/stub:$PATH" FAKE_BL="$W/fake-bl" XDG_STATE_HOME="$W/state" LOCK_DIM_PERCENT=50   # fijo: las pruebas esperan 21333 → 1333
export FAKE_DDC="$W/fake-ddc" LOCK_DIM_DRM="$W/fake-drm" XDG_CACHE_HOME="$W/cache"   # caché propia: ni el log ni el filtro reales se ensucian
rm -rf "$XDG_CACHE_HOME"
[ "$(command -v brightnessctl)" = "$SRC/stub/brightnessctl" ] || { echo "ABORTO: brightnessctl no es el falso"; exit 1; }
[ "$(command -v ddcutil)" = "$SRC/stub/ddcutil" ] || { echo "ABORTO: ddcutil no es el falso"; exit 1; }
real_bl=$(/usr/bin/brightnessctl -m 2>/dev/null); real_ddc=$(/usr/bin/ddcutil --bus 8 getvcp 10 --terse 2>/dev/null)
rm -rf "$FAKE_BL" "$XDG_STATE_HOME"; mkdir -p "$FAKE_BL"
# Monitores inventados: el ASUS (bus 8, DDC bien), el SAC (bus 12, sin DDC) y el panel del portátil
mk_ddc() {
  rm -rf "$LOCK_DIM_DRM" "$FAKE_DDC"; mkdir -p "$LOCK_DIM_DRM" "$FAKE_DDC/8" "$FAKE_DDC/12"
  local c; for c in "eDP-1 connected" "HDMI-A-1 connected 8" "DP-1 connected 12"; do
    set -- $c; mkdir -p "$LOCK_DIM_DRM/card1-$1"; echo "$2" > "$LOCK_DIM_DRM/card1-$1/status"
    [ -n "${3:-}" ] && ln -sfn "../fake-i2c/i2c-$3" "$LOCK_DIM_DRM/card1-$1/ddc"
  done
  echo 100 > "$FAKE_DDC/8/value"; echo 100 > "$FAKE_DDC/8/max"; touch "$FAKE_DDC/12/fail"
}
mk_ddc
raw()   { cat "$FAKE_BL/raw" 2>/dev/null || echo 21333; }
d8()    { cat "$FAKE_DDC/8/value" 2>/dev/null; }
# dispositivo y valor original guardados de la retroiluminación (bl) y de los monitores (ddc); el último
# campo de cada línea es el PID del lock.sh dueño. Sirve también el formato antiguo ("<dispositivo> <crudo>").
state()  { awk '$1=="bl"{print $2" "$3} $1!="bl"&&$1!="ddc"{print $1" "$2}' "$XDG_STATE_HOME/hypr/lock-brightness" 2>/dev/null | grep . || echo none; }
dstate() { awk '$1=="ddc"{print $2" "$3}' "$XDG_STATE_HOME/hypr/lock-brightness" 2>/dev/null | grep . || echo none; }
wait_raw() { for _ in $(seq "${2:-40}"); do [ "$(raw)" = "$1" ] && return 0; sleep 0.1; done; return 1; }
wait_d8()  { for _ in $(seq "${2:-40}"); do [ "$(d8)" = "$1" ] && return 0; sleep 0.1; done; return 1; }
# El hyprlock que sostiene el bloqueo es el MÁS NUEVO: un zombi de un caso anterior puede seguir vivo
# (un re-bloqueo a los 0,3 s no da los 3 s desbloqueado que el vigilante exige para matarlo).
holder() { nested | tail -1; }
# Cada caso de brillo parte de una sesión limpia: sin lock.sh vigilando, sin hyprlock y desbloqueada.
LOCKPIDS=()
reset_session() {
  local p pids=("${LOCKPIDS[@]}")
  for p in "${pids[@]}"; do kill -TERM "$p" 2>/dev/null; done; LOCKPIDS=()
  ready; for p in $(nested); do kill -USR1 "$p" 2>/dev/null; done
  wait_locked false; sleep 0.5
  for p in $(nested); do kill -KILL "$p" 2>/dev/null; done
  # que terminen los lock.sh (su restore de salida usa los falsos): si no, reiniciarlos les pisa el estado
  for p in "${pids[@]}"; do for _ in $(seq 80); do kill -0 "$p" 2>/dev/null || break; sleep 0.1; done; done
  sleep 0.3; echo 21333 > "$FAKE_BL/raw"; rm -f "$XDG_STATE_HOME/hypr/lock-brightness"; mk_ddc
}
hc() { hyprctl --instance "$SIG" "$@"; }
# Un hyprlock recién arrancado muere con SIGUSR1 (aún no instaló su manejador) y deja la sesión bloqueada
# SIN cliente: antes de desbloquear, esperar a que los de la sesión anidada lleven ≥ 2 s vivos.
ready() { local p a; for p in $(nested); do for _ in $(seq 40); do a=$(ps -o etimes= -p "$p" 2>/dev/null | tr -d ' '); [ -z "$a" ] || [ "$a" -ge 2 ] && break; sleep 0.1; done; done; }
nested() { local p; for p in $(pgrep -x hyprlock); do tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -qx "WAYLAND_DISPLAY=$WL" && echo $p; done; }
ok()   { printf '  ✔ %s\n' "$*"; }
bad()  { printf '  ✘ %s\n' "$*"; FAIL=1; }
wait_locked() { for _ in $(seq 100); do [ "$(hc locked)" = "$1" ] && return 0; sleep 0.1; done; return 1; }
fl0=$(faillock --user "$USER" | grep -c ' V$')

"$SRC/unlock.sh" >/dev/null 2>&1; sleep 1
if [ "$(hc locked)" = true ] && [ -z "$(nested)" ]; then   # quedó bloqueado sin cliente (una ejecución anterior)
  echo "(el anidado estaba bloqueado sin cliente: lo recupero)"
  "$LOCK" & rp=$!; sleep 3; ready; ready; kill -USR1 "$(holder)"; wait_locked false
  kill -TERM "$rp" 2>/dev/null; for p in $(nested); do kill -KILL "$p" 2>/dev/null; done; sleep 1; rm -rf "$XDG_STATE_HOME" ; mk_ddc
fi
echo "T1 bloquear"
"$LOCK" & lp1=$!; LOCKPIDS+=($lp1)
wait_locked true && ok "compositor anidado: locked=true" || bad "no bloqueó"
n=$(nested | wc -l); [ "$n" = 1 ] && ok "un solo hyprlock" || bad "hyprlock en la sesión anidada: $n"

echo "T2 repetir con la sesión bloqueada (no-op)"
t0=$(date +%s%N); "$LOCK"; rc=$?; t1=$(( ($(date +%s%N) - t0) / 1000000 ))
[ "$rc" = 0 ] && ok "salió con 0 en ${t1} ms" || bad "código $rc"
n=$(nested | wc -l); [ "$n" = 1 ] && ok "sigue habiendo un solo hyprlock" || bad "ahora hay $n"

echo "T3 desbloquear con hyprlock que no sale (zombi simulado por el PAM falso)"
ready; hp=$(nested | head -1); kill -USR1 "$hp"
wait_locked false && ok "compositor: locked=false" || bad "no desbloqueó"
sleep 1; kill -0 "$hp" 2>/dev/null && ok "hyprlock $hp sigue vivo tras desbloquear (como el bug upstream)" || ok "hyprlock salió solo"
for _ in $(seq 80); do kill -0 "$lp1" 2>/dev/null || break; sleep 0.1; done
kill -0 "$lp1" 2>/dev/null && bad "lock.sh no terminó" || ok "lock.sh terminó (el vigilante actuó)"
kill -0 "$hp" 2>/dev/null && bad "el zombi $hp sigue vivo" || ok "el zombi fue eliminado"

echo "T4 dos lanzamientos simultáneos"
"$LOCK" & LOCKPIDS+=($!); "$LOCK" & LOCKPIDS+=($!)
wait_locked true && ok "bloqueado" || bad "no bloqueó"
sleep 1; n=$(nested | wc -l); [ "$n" = 1 ] && ok "exactamente un hyprlock" || bad "hay $n hyprlock"

echo "T5 desbloquear, dejar el zombi y volver a bloquear (el guard no debe fiarse de procesos)"
ready; hp=$(nested | head -1); kill -USR1 "$hp"; wait_locked false
sleep 0.3
kill -0 "$hp" 2>/dev/null && ok "zombi $hp vivo en el momento de re-bloquear" || ok "(ya no había zombi)"
"$LOCK" & LOCKPIDS+=($!)
wait_locked true && ok "re-bloqueó con el zombi presente" || bad "NO re-bloqueó (el bug de pidof)"

echo "T6 brillo: baja al bloquear y vuelve al desbloquear (con el zombi de PAM falso: lo detecta el vigilante)"
reset_session
"$LOCK" & lp=$!; LOCKPIDS+=($lp)
wait_locked true && wait_raw 1333 && ok "brillo bajado a $(raw) (50 % en la escala perceptual)" || bad "el brillo no bajó (es $(raw))"
wait_d8 6 && ok "el ASUS (DDC) bajó a $(d8)" || bad "el ASUS no bajó (es $(d8))"
[ "$(state)" = "fake_backlight 21333" ] && ok "original guardado: $(state)" || bad "estado guardado: $(state)"
[ "$(dstate)" = "HDMI-A-1 100" ] && ok "original del ASUS guardado: $(dstate)" || bad "estado DDC: $(dstate)"
[ "$(grep -c 'bus=12 setvcp' "$FAKE_DDC/log")" = 0 ] && ok "al SAC (sin DDC) no se le escribió nada" || bad "se escribió al SAC"
ready; kill -USR1 "$(holder)"
wait_locked false; wait_raw 21333 80 && ok "brillo devuelto a $(raw) al desbloquear" || bad "no se devolvió (es $(raw))"
wait_d8 100 80 && ok "el ASUS volvió a $(d8)" || bad "el ASUS no volvió (es $(d8))"
[ "$(state)" = none ] && [ "$(dstate)" = none ] && ok "estado borrado" || bad "queda estado: $(state) / $(dstate)"

echo "T7 brillo: vuelve al instante si hyprlock sale con la sesión aún bloqueada"
reset_session
"$LOCK" & lp=$!; LOCKPIDS+=($lp)
wait_locked true && wait_raw 1333 && ok "bajado" || bad "no bajó"
kill -KILL "$(holder)"
wait_raw 21333 15 && ok "devuelto $(raw) en menos de 1,5 s tras salir hyprlock" || bad "no se devolvió (es $(raw))"
wait_d8 100 15 && ok "y el ASUS ($(d8))" || bad "el ASUS no volvió (es $(d8))"
for _ in $(seq 30); do kill -0 "$lp" 2>/dev/null || break; sleep 0.1; done
kill -0 "$lp" 2>/dev/null && bad "lock.sh no terminó" || ok "lock.sh terminó"
[ "$(hc locked)" = true ] && ok "el compositor sigue bloqueado (sin cliente: 'lockscreen app died')" || bad "locked=$(hc locked)"

echo "T8 recuperación: bloqueada y sin hyprlock → lock.sh lo relanza (la guarda no se fía de locked=true)"
[ -z "$(nested)" ] && ok "no hay hyprlock" || bad "hay hyprlock: $(nested | tr '\n' ' ')"
"$LOCK" & lp=$!; LOCKPIDS+=($lp)
for _ in $(seq 60); do [ -n "$(nested)" ] && break; sleep 0.1; done
[ -n "$(nested)" ] && ok "hyprlock relanzado ($(holder))" || bad "NO se relanzó"
wait_raw 1333 && wait_d8 6 && ok "y el brillo volvió a bajar (portátil y ASUS)" || bad "brillo $(raw) / ASUS $(d8)"
ready; kill -USR1 "$(holder)"; wait_locked false; wait_raw 21333 80 && wait_d8 100 80 && ok "desbloqueado y brillo devuelto" || bad "brillo $(raw) / ASUS $(d8)"

echo "T9 un brillo guardado de un bloqueo anterior se devuelve antes de bajar"
reset_session
mkdir -p "$XDG_STATE_HOME/hypr"; printf 'fake_backlight 21333\nddc HDMI-A-1 100 777\n' > "$XDG_STATE_HOME/hypr/lock-brightness"   # una en formato antiguo y otra en el nuevo
echo 1333 > "$FAKE_BL/raw"; echo 6 > "$FAKE_DDC/8/value"
"$LOCK" & lp=$!; LOCKPIDS+=($lp)
wait_locked true; sleep 1.5
[ "$(state)" = "fake_backlight 21333" ] && [ "$(raw)" = 1333 ] && ok "portátil: se devolvió lo viejo y se bajó desde el original (21333), no desde el valor bajo" || bad "estado $(state), crudo $(raw)"
[ "$(dstate)" = "HDMI-A-1 100" ] && [ "$(d8)" = 6 ] && ok "ASUS: igual (original 100)" || bad "estado DDC $(dstate), ASUS $(d8)"

echo "T10 si matan a lock.sh con TERM, el brillo vuelve"
kill -TERM "$lp"; wait_raw 21333 30 && wait_d8 100 30 && ok "devuelto $(raw) y ASUS $(d8) tras TERM" || bad "no se devolvió (es $(raw), ASUS $(d8))"
[ "$(state)" = none ] && [ "$(dstate)" = none ] && ok "estado borrado" || bad "queda estado: $(state) / $(dstate)"
LOCKPIDS=()
reset_session

echo "T11 el 'restore' de un lock.sh viejo no deshace el brillo de un bloqueo ajeno"
reset_session
"$LOCK" & lp=$!; LOCKPIDS+=($lp)
wait_locked true && wait_raw 1333 && ok "bloqueo en curso con el brillo bajado" || bad "no bajó"
"$(dirname "$LOCK")/lock-dim.sh" restore 999999
[ "$(raw)" = 1333 ] && [ "$(d8)" = 6 ] && ok "restore de otro dueño (999999) ignorado: sigue en $(raw) y el ASUS en $(d8)" || bad "se devolvió el brillo ajeno ($(raw), ASUS $(d8))"
reset_session

echo "T12 un monitor DDC dormido al desbloquear: lock.sh reintenta y lo devuelve cuando despierta"
reset_session
"$LOCK" & lp=$!; LOCKPIDS+=($lp)
wait_locked true && wait_raw 1333 && wait_d8 6 && ok "bajados" || bad "no bajaron ($(raw) / $(d8))"
echo $(( $(date +%s) + 5 )) > "$FAKE_DDC/8/asleep_until"; t0=${EPOCHREALTIME/./}
ready; kill -USR1 "$(holder)"; wait_locked false
wait_raw 21333 30 && ok "el portátil volvió enseguida ($(raw))" || bad "el portátil no volvió ($(raw))"
sleep 1; [ "$(d8)" = 6 ] && [ "$(dstate)" = "HDMI-A-1 100" ] && ok "el ASUS dormido sigue bajo y su original sigue guardado" || bad "ASUS $(d8), estado $(dstate)"
wait_d8 100 120 && ok "al despertar lo devolvió a $(d8) ($(( (${EPOCHREALTIME/./} - t0) / 1000 )) ms tras desbloquear)" || bad "el ASUS no volvió (es $(d8))"
for _ in $(seq 100); do kill -0 "$lp" 2>/dev/null || break; sleep 0.1; done
kill -0 "$lp" 2>/dev/null && bad "lock.sh no terminó" || ok "lock.sh terminó"
[ "$(dstate)" = none ] && ok "estado DDC borrado" || bad "queda estado DDC: $(dstate)"

echo "T13 un monitor sin DDC y lento (el SAC, 2 s por orden) ni retrasa el bloqueo más de ~1 s ni impide bajar al resto"
reset_session; echo 2 > "$FAKE_DDC/12/delay"
t0=${EPOCHREALTIME/./}; "$LOCK" & lp=$!; LOCKPIDS+=($lp)
wait_locked true; e=$(( (${EPOCHREALTIME/./} - t0) / 1000 ))
[ "$e" -lt 2500 ] && ok "bloqueó en ${e} ms (el sondeo del filtro espera 1 s como mucho)" || bad "bloqueó en ${e} ms (el SAC lo retrasó)"
wait_d8 6 60 && wait_raw 1333 && ok "el portátil y el ASUS bajaron (en paralelo al SAC)" || bad "portátil $(raw), ASUS $(d8)"
[ "$(grep -c 'bus=12 setvcp' "$FAKE_DDC/log")" = 0 ] && ok "al SAC no se le escribió nada" || bad "se escribió al SAC"
reset_session

echo "T14 el filtro de brillo del monitor sin DDC (el SAC) lo escribe lock.sh antes de lanzar hyprlock"
reset_session; ovl="$XDG_CACHE_HOME/hyprlock/dim-overlay.conf"; rm -f "$ovl"
"$LOCK" & lp=$!; LOCKPIDS+=($lp)
for _ in $(seq 100); do [ -n "$(nested)" ] && break; sleep 0.05; done
[ -s "$ovl" ] && ok "el archivo ya existía cuando arrancó hyprlock" || bad "hyprlock arrancó sin filtro"
grep -q 'monitor = DP-1' "$ovl" && ! grep -q 'monitor = HDMI-A-1' "$ovl" && ok "filtro solo para el SAC (DP-1), no para el ASUS" || bad "contenido inesperado: $(grep monitor "$ovl" | tr '\n' ' ')"
grep -q 'rgba(000000' "$ovl" && grep -q 'size = 1920, 1080' "$ovl" && ok "color y tamaño de pantalla: $(grep -o 'rgba(000000[0-9a-f]*)' "$ovl")" || bad "sin color/tamaño"
wait_locked true && ok "y bloqueó con él" || bad "no bloqueó"
reset_session

echo "T15 un dim retrasado por el candado del estado no baja el brillo si la sesión ya se desbloqueó"
reset_session; mkdir -p "$XDG_STATE_HOME/hypr"
flock "$XDG_STATE_HOME/hypr/lock-brightness.lock" sleep 4 & holdpid=$!      # el candado ocupado 4 s: el dim espera
"$LOCK" & lp=$!; LOCKPIDS+=($lp)
wait_locked true; sleep 1; ready; kill -USR1 "$(holder)"; wait_locked false && ok "desbloqueado mientras el dim esperaba el candado" || bad "no desbloqueó"
seen=0; for _ in $(seq 80); do [ "$(raw)" = 1333 ] || [ "$(d8)" = 6 ] && seen=1; sleep 0.1; done
[ "$seen" = 0 ] && ok "el brillo no se bajó en ningún momento (laptop $(raw), ASUS $(d8))" || bad "se bajó el brillo con la sesión ya desbloqueada"
grep -q 'no se baja el brillo' "$XDG_CACHE_HOME/hyprlock/lock.log" && ok "anotado en el log" || bad "sin nota en el log"
wait $holdpid 2>/dev/null; reset_session

echo "limpieza"
sleep 1; ready; hp=$(nested | tail -1); [ -n "$hp" ] && kill -USR1 "$hp"; wait_locked false
[ "$(hc locked)" = false ] && ok "sesión anidada desbloqueada al terminar" || bad "el anidado quedó bloqueado"
for _ in $(seq 80); do [ -z "$(nested)" ] && break; sleep 0.1; done
[ -z "$(nested)" ] && ok "sin hyprlock restantes" || { bad "quedan: $(nested | tr '\n' ' ')"; for p in $(nested); do kill -KILL "$p"; done; }
[ "$(/usr/bin/brightnessctl -m 2>/dev/null)" = "$real_bl" ] && ok "retroiluminación REAL intacta ($real_bl)" || bad "la retroiluminación real cambió: $real_bl → $(/usr/bin/brightnessctl -m)"
[ "$(/usr/bin/ddcutil --bus 8 getvcp 10 --terse 2>/dev/null)" = "$real_ddc" ] && ok "ASUS REAL intacto ($real_ddc)" || bad "el ASUS real cambió"
fl1=$(faillock --user "$USER" | grep -c ' V$')
[ "$fl0" = "$fl1" ] && ok "faillock intacto ($fl1 registros)" || bad "faillock cambió ($fl0 → $fl1)"
[ -z "${FAIL:-}" ] && echo "TODO OK" || echo "HAY FALLOS"
