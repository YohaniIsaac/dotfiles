#!/usr/bin/env bash
# harness-up.sh — Levanta el compositor ANIDADO donde se prueba hyprlock sin tocar la sesión real.
# Ver README.md de esta carpeta. Estado en $LOCK_HARNESS_DIR (por defecto $XDG_RUNTIME_DIR/lock-harness).
#
# Qué hace:
#   1. compila dump.so (volcado de fotogramas + PAM falso) en el directorio de estado;
#   2. lanza un Hyprland como ventana de TU sesión, en un workspace especial oculto
#      (sin DRM no arranca solo: necesita ser cliente de tu compositor);
#   3. le crea una salida virtual 1920x1080 (headless) y desactiva la de la ventana, que oculta
#      no puede presentar fotogramas y retrasaba el bloqueo ~2 s.
set -u
SRC="$(dirname "$(readlink -f "$0")")"
W="${LOCK_HARNESS_DIR:-${XDG_RUNTIME_DIR:?}/lock-harness}"
mkdir -p "$W"
[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ] || { echo "hay que correrlo dentro de una sesión de Hyprland"; exit 1; }

if [ -s "$W/wl" ] && [ -S "$XDG_RUNTIME_DIR/$(cat "$W/wl")" ]; then echo "ya está levantado ($(cat "$W/wl"))"; exit 0; fi

gcc -O2 -fPIC -shared -o "$W/dump.so" "$SRC/dump.c" -lEGL -lGLESv2 -ldl || exit 1

cat > "$W/hyprland.conf" <<'EOF'
misc {
    disable_hyprland_logo = true
    disable_splash_rendering = true
    allow_session_lock_restore = true
}
EOF

before_hypr=$(ls "$XDG_RUNTIME_DIR/hypr" | sort)
before_wl=$(ls "$XDG_RUNTIME_DIR" | grep -E '^wayland-[0-9]+$' | sort)
hyprctl dispatch exec "[workspace special:lockharness silent] env HYPRLAND_NO_CRASHREPORTER=1 Hyprland --config $W/hyprland.conf >$W/hyprland.out 2>&1" >/dev/null
for _ in $(seq 60); do
  wl=$(comm -13 <(echo "$before_wl") <(ls "$XDG_RUNTIME_DIR" | grep -E '^wayland-[0-9]+$' | sort) | head -1)
  [ -n "$wl" ] && break; sleep 0.25
done
sig=$(comm -13 <(echo "$before_hypr") <(ls "$XDG_RUNTIME_DIR/hypr" | sort) | head -1)
{ [ -n "${wl:-}" ] && [ -n "${sig:-}" ]; } || { echo "el compositor anidado no arrancó; mira $W/hyprland.out"; exit 1; }
[ "$sig" != "$HYPRLAND_INSTANCE_SIGNATURE" ] || { echo "ABORTO: la firma nueva es la de la sesión real"; exit 1; }
echo "$wl" > "$W/wl"; echo "$sig" > "$W/sig"
pgrep -f "[H]yprland --config $W/hyprland.conf" | head -1 > "$W/pid"
sleep 1

hc() { hyprctl --instance "$sig" "$@"; }
hc output create headless >/dev/null; sleep 0.5
out=$(hc monitors -j | jq -r '[.[] | select(.name | startswith("HEADLESS"))][0].name')
hc keyword monitor "WAYLAND-1,disable" >/dev/null
hc keyword monitor "$out,1920x1080@60,0x0,1" >/dev/null
echo "$out" > "$W/out"
echo "listo: display=$wl instancia=${sig:0:20}… salida=$out  estado en $W"
