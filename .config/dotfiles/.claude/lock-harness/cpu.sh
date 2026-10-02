#!/usr/bin/env bash
# cpu.sh <config> [segundos=30] — bloquea el compositor ANIDADO con esa config, TAL CUAL (sin la etiqueta
# de redibujado de shot.sh), y mide el CPU de hyprlock + sus hijos en ms por segundo.
H=$HOME/.config/dotfiles/.claude/lock-harness
W=${LOCK_HARNESS_DIR:-$XDG_RUNTIME_DIR/lock-harness}
secs=${2:-30}
[ -s "$W/sig" ] || { echo "no hay arnés"; exit 1; }
SIG=$(cat "$W/sig"); WL=$(cat "$W/wl"); OUT=$(cat "$W/out")
[ "$SIG" != "$HYPRLAND_INSTANCE_SIGNATURE" ] || { echo "ABORTO: firma real"; exit 1; }
nm -D "$W/dump.so" 2>/dev/null | grep -q ' T pam_authenticate' || { echo "ABORTO: dump.so sin PAM falso"; exit 1; }
LD_PRELOAD="$W/dump.so" ldd /usr/bin/hyprlock 2>/dev/null | grep -q 'dump.so' || { echo "ABORTO: LD_PRELOAD no se aplica"; exit 1; }
fl_before=$(faillock --user "$USER" 2>/dev/null | grep -c ' V$')
"$H/unlock.sh"
hyprctl --instance "$SIG" keyword monitor "$OUT,1920x1080@60,0x0,1" >/dev/null; sleep 0.4
cp "$(readlink -f "$1")" "$W/cpu.conf"
mkdir -p "$W/frames"; find "$W/frames" -maxdepth 1 -type f -delete
env ${EXTRA_ENV:-} LD_PRELOAD="$W/dump.so" DUMP_DIR="$W/frames" WAYLAND_DISPLAY="$WL" \
  nohup setsid hyprlock --config "$W/cpu.conf" --no-fade-in >"$W/hyprlock.out" 2>&1 </dev/null &
echo $! > "$W/hyprlock.pid"
for _ in $(seq 60); do [ "$(hyprctl --instance "$SIG" locked)" = true ] && break; sleep 0.2; done
[ "$(hyprctl --instance "$SIG" locked)" = true ] || { echo "no bloqueó"; "$H/unlock.sh"; exit 1; }
pid=$(cat "$W/hyprlock.pid")
sleep "${SETTLE:-3}"
tk() { awk '{print $14+$15+$16+$17}' /proc/$pid/stat; }
a=$(tk); sleep "$secs"; b=$(tk)
"$H/unlock.sh" >/dev/null 2>&1
fl_after=$(faillock --user "$USER" 2>/dev/null | grep -c ' V$')
[ "$fl_after" -eq "$fl_before" ] || echo "⚠ faillock cambió ($fl_before → $fl_after)"
echo "$(( (b-a) * 1000 / 100 / secs )) ms de CPU por segundo  [$(( b-a )) ticks en ${secs}s]"
