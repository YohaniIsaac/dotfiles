#!/usr/bin/env bash
# shot.sh <config> <salida.png> [escala=1] — bloquea la sesión ANIDADA (nunca la real) con esa
# config de hyprlock y guarda el fotograma que dibuja, tal cual (volcado de eglSwapBuffers).
#
# Variables: SETTLE (s que espera tras bloquear antes de volcar, 2 por defecto), EXTRA_ENV (p. ej.
# "PATH=/stub:$PATH XDG_CACHE_HOME=/tmp/x" para correr hyprlock con otro entorno), KEEP=1 (dejar
# el bloqueo puesto; se desbloquea con unlock.sh).
#
# Seguridad: hyprlock arranca una conversación PAM al bloquear y, si muere con ella pendiente,
# pam_faillock lo cuenta como un login fallido de tu usuario (3 = cuenta bloqueada 10 min, también
# para sudo). Por eso corre con el PAM falso de dump.so, y este script se niega si no se aplica.
SRC="$(dirname "$(readlink -f "$0")")"
W="${LOCK_HARNESS_DIR:-${XDG_RUNTIME_DIR:?}/lock-harness}"
[ -s "$W/sig" ] || { echo "no hay arnés: corre harness-up.sh"; exit 1; }
cd "$W" || exit 1
SIG=$(cat sig); WL=$(cat wl); OUT=$(cat out)
hc() { hyprctl --instance "$SIG" "$@"; }

conf=$(readlink -f "$1"); png="$2"; scale="${3:-1}"
[ -S "$XDG_RUNTIME_DIR/$WL" ] || { echo "no hay compositor anidado en $WL"; exit 1; }
[ "$SIG" != "$HYPRLAND_INSTANCE_SIGNATURE" ] || { echo "ABORTO: la firma del arnés es la de la sesión real"; exit 1; }
nm -D "$W/dump.so" 2>/dev/null | grep -q ' T pam_authenticate' || { echo "ABORTO: dump.so sin PAM falso"; exit 1; }
LD_PRELOAD="$W/dump.so" ldd /usr/bin/hyprlock 2>/dev/null | grep -q 'dump.so' || { echo "ABORTO: LD_PRELOAD no se aplica a hyprlock"; exit 1; }
faillock_before=$(faillock --user "$USER" 2>/dev/null | grep -c ' V$')

"$SRC/unlock.sh"
hc keyword monitor "$OUT,1920x1080@60,0x0,$scale" >/dev/null; sleep 0.4

# Copia de pruebas = la config + una etiqueta invisible que cambia cada 150 ms, para que hyprlock
# redibuje (una escena estática casi no hace eglSwapBuffers y no habría fotograma que volcar).
{ cat "$conf"; cat <<'EOF'

label {
    monitor =
    text = cmd[update:150] date +%N
    color = rgba(0, 0, 0, 0)
    font_size = 8
    position = 0, 0
    halign = left
    valign = top
}
EOF
} > test.conf

mkdir -p frames; find frames -maxdepth 1 -type f -delete
env ${EXTRA_ENV:-} LD_PRELOAD="$W/dump.so" DUMP_DIR="$W/frames" WAYLAND_DISPLAY="$WL" \
  nohup setsid hyprlock --config "$W/test.conf" --no-fade-in >hyprlock.out 2>&1 </dev/null &
echo $! > hyprlock.pid

for _ in $(seq 60); do [ "$(hc locked)" = true ] && break; sleep 0.2; done
if [ "$(hc locked)" != true ]; then echo "no llegó a bloquear:"; tail -5 hyprlock.out | cut -c1-200; "$SRC/unlock.sh"; exit 1; fi
sleep "${SETTLE:-2}"
echo 1 > frames/trigger
for _ in $(seq 60); do [ -e frames/trigger ] || break; sleep 0.1; done   # el shim lo borra DESPUÉS de escribir
f=$(ls frames/frame-*.rgba 2>/dev/null | tail -1)
if [ -z "$f" ]; then echo "no hubo fotograma"; "$SRC/unlock.sh"; exit 1; fi
dims=$(basename "$f" | sed -E 's/frame-([0-9]+x[0-9]+)-.*/\1/')
magick -size "$dims" -depth 8 "rgba:$f" -flip -alpha off "$png" && echo "ok $png ($dims)"
[ -n "${KEEP:-}" ] || "$SRC/unlock.sh"

faillock_after=$(faillock --user "$USER" 2>/dev/null | grep -c ' V$')
[ "$faillock_after" -eq "$faillock_before" ] || echo "⚠ faillock de $USER cambió ($faillock_before → $faillock_after): resetear con 'faillock --user $USER --reset'"
