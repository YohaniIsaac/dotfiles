#!/usr/bin/env bash
# locktest.sh — prueba ~/.config/hypr/scripts/lock.sh contra el compositor ANIDADO (nunca el real),
# con el PAM falso de dump.so.
#   T1 bloquear · T2 repetir con la sesión bloqueada (no-op) · T3 desbloquear con hyprlock que no
#   sale (el PAM falso reproduce el bug del zombi) y comprobar que el vigilante lo mata · T4 dos
#   lanzamientos simultáneos → un solo hyprlock · T5 volver a bloquear con el zombi aún vivo.
SRC="$(dirname "$(readlink -f "$0")")"
W="${LOCK_HARNESS_DIR:-${XDG_RUNTIME_DIR:?}/lock-harness}"
[ -s "$W/sig" ] || { echo "no hay arnés: corre harness-up.sh"; exit 1; }
SIG=$(cat "$W/sig"); WL=$(cat "$W/wl")
[ "$SIG" != "$HYPRLAND_INSTANCE_SIGNATURE" ] || { echo "ABORTO: firma de la sesión real"; exit 1; }
export HYPRLAND_INSTANCE_SIGNATURE="$SIG" WAYLAND_DISPLAY="$WL" LD_PRELOAD="$W/dump.so"
nm -D "$W/dump.so" | grep -q ' T pam_authenticate' || { echo "ABORTO: sin PAM falso"; exit 1; }
LOCK="$HOME/.config/hypr/scripts/lock.sh"
hc() { hyprctl --instance "$SIG" "$@"; }
nested() { local p; for p in $(pgrep -x hyprlock); do tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -qx "WAYLAND_DISPLAY=$WL" && echo $p; done; }
ok()   { printf '  ✔ %s\n' "$*"; }
bad()  { printf '  ✘ %s\n' "$*"; FAIL=1; }
wait_locked() { for _ in $(seq 100); do [ "$(hc locked)" = "$1" ] && return 0; sleep 0.1; done; return 1; }
fl0=$(faillock --user "$USER" | grep -c ' V$')

"$SRC/unlock.sh" >/dev/null 2>&1; sleep 1
echo "T1 bloquear"
"$LOCK" & lp1=$!
wait_locked true && ok "compositor anidado: locked=true" || bad "no bloqueó"
n=$(nested | wc -l); [ "$n" = 1 ] && ok "un solo hyprlock" || bad "hyprlock en la sesión anidada: $n"

echo "T2 repetir con la sesión bloqueada (no-op)"
t0=$(date +%s%N); "$LOCK"; rc=$?; t1=$(( ($(date +%s%N) - t0) / 1000000 ))
[ "$rc" = 0 ] && ok "salió con 0 en ${t1} ms" || bad "código $rc"
n=$(nested | wc -l); [ "$n" = 1 ] && ok "sigue habiendo un solo hyprlock" || bad "ahora hay $n"

echo "T3 desbloquear con hyprlock que no sale (zombi simulado por el PAM falso)"
hp=$(nested | head -1); kill -USR1 "$hp"
wait_locked false && ok "compositor: locked=false" || bad "no desbloqueó"
sleep 1; kill -0 "$hp" 2>/dev/null && ok "hyprlock $hp sigue vivo tras desbloquear (como el bug upstream)" || ok "hyprlock salió solo"
for _ in $(seq 80); do kill -0 "$lp1" 2>/dev/null || break; sleep 0.1; done
kill -0 "$lp1" 2>/dev/null && bad "lock.sh no terminó" || ok "lock.sh terminó (el vigilante actuó)"
kill -0 "$hp" 2>/dev/null && bad "el zombi $hp sigue vivo" || ok "el zombi fue eliminado"

echo "T4 dos lanzamientos simultáneos"
"$LOCK" & "$LOCK" &
wait_locked true && ok "bloqueado" || bad "no bloqueó"
sleep 1; n=$(nested | wc -l); [ "$n" = 1 ] && ok "exactamente un hyprlock" || bad "hay $n hyprlock"

echo "T5 desbloquear, dejar el zombi y volver a bloquear (el guard no debe fiarse de procesos)"
hp=$(nested | head -1); kill -USR1 "$hp"; wait_locked false
sleep 0.3
kill -0 "$hp" 2>/dev/null && ok "zombi $hp vivo en el momento de re-bloquear" || ok "(ya no había zombi)"
"$LOCK" &
wait_locked true && ok "re-bloqueó con el zombi presente" || bad "NO re-bloqueó (el bug de pidof)"

echo "limpieza"
sleep 1; hp=$(nested | tail -1); [ -n "$hp" ] && kill -USR1 "$hp"; wait_locked false
for _ in $(seq 80); do [ -z "$(nested)" ] && break; sleep 0.1; done
[ -z "$(nested)" ] && ok "sin hyprlock restantes" || { bad "quedan: $(nested | tr '\n' ' ')"; for p in $(nested); do kill -KILL "$p"; done; }
fl1=$(faillock --user "$USER" | grep -c ' V$')
[ "$fl0" = "$fl1" ] && ok "faillock intacto ($fl1 registros)" || bad "faillock cambió ($fl0 → $fl1)"
[ -z "${FAIL:-}" ] && echo "TODO OK" || echo "HAY FALLOS"
