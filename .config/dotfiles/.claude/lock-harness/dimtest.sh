#!/usr/bin/env bash
# dimtest.sh — pruebas de hypr/scripts/lock-dim.sh contra una retroiluminación, un sysfs de DRM y unos
# monitores DDC INVENTADOS (stub/brightnessctl, stub/ddcutil): no toca ninguna pantalla real ni el
# estado real, y no necesita el compositor anidado. Al terminar comprueba que la retroiluminación del
# portátil y el brillo DDC del ASUS (solo lectura) siguen como estaban.
#   LOCK_DIM=/ruta/lock-dim.sh ./dimtest.sh      (por defecto, el instalado)
SRC="$(dirname "$(readlink -f "$0")")"
DIM="${LOCK_DIM:-$HOME/.config/hypr/scripts/lock-dim.sh}"
T="${XDG_RUNTIME_DIR:?}/dimtest"
export PATH="$SRC/stub:$PATH" FAKE_BL="$T/bl" FAKE_DDC="$T/ddc" LOCK_DIM_DRM="$T/drm" XDG_STATE_HOME="$T/state" XDG_CACHE_HOME="$T/cache" LOCK_DIM_PERCENT=50 FAKE_BL_NAME=intel_backlight
[ "$(command -v brightnessctl)" = "$SRC/stub/brightnessctl" ] && [ "$(command -v ddcutil)" = "$SRC/stub/ddcutil" ] || { echo "ABORTO: brightnessctl/ddcutil no son los falsos"; exit 1; }
[ -x "$DIM" ] || { echo "no existe $DIM"; exit 1; }
real_bl=$(/usr/bin/brightnessctl -m 2>/dev/null); real_ddc=$(/usr/bin/ddcutil --bus 8 getvcp 10 --terse 2>/dev/null)

FAIL=
ok()  { printf '  ✔ %s\n' "$*"; }
bad() { printf '  ✘ %s\n' "$*"; FAIL=1; }
chk() { if [ "$2" = "$3" ]; then ok "$1: $2"; else bad "$1: obtenido [$2] esperado [$3]"; fi; }
raw()  { cat "$T/bl/raw" 2>/dev/null; }
d()    { cat "$T/ddc/$1/value" 2>/dev/null; }
st()   { sort "$T/state/hypr/lock-brightness" 2>/dev/null | paste -sd'|' | grep . || echo none; }
calls() { grep -c "bus=$1 $2" "$T/ddc/log" 2>/dev/null || true; }
ms()   { echo $(( (${EPOCHREALTIME/./} - $1) / 1000 )); }

fresh() {   # pantallas inventadas: portátil, ASUS (DDC bien, bus 8), SAC (DDC roto, bus 12), un DP desconectado
  rm -rf "$T"; mkdir -p "$T/drm" "$T/ddc/8" "$T/ddc/12" "$T/bl" "$T/cache"
  conn() { mkdir -p "$T/drm/card1-$1"; echo "$2" > "$T/drm/card1-$1/status"; [ -n "${3:-}" ] && ln -s "../fake-i2c/i2c-$3" "$T/drm/card1-$1/ddc"; return 0; }
  conn eDP-1 connected; conn HDMI-A-1 connected 8; conn DP-1 connected 12; conn DP-2 disconnected 13
  echo 21333 > "$T/bl/raw"; echo 100 > "$T/ddc/8/value"; echo 100 > "$T/ddc/8/max"; touch "$T/ddc/12/fail"
}

echo "D1 dim (dueño 111): portátil y ASUS bajan; el SAC (sin DDC) se omite"
fresh; "$DIM" dim 111
chk "portátil" "$(raw)" 1333; chk "ASUS" "$(d 8)" 6
chk "estado" "$(st)" "bl intel_backlight 21333 111|ddc HDMI-A-1 100 111"
[ "$(calls 12 setvcp)" = 0 ] && ok "al SAC no se le escribió nada" || bad "se escribió al SAC"
grep -q 'DP-1 (bus 12): sin respuesta' "$T/cache/hyprlock/lock.log" && ok "el fallo del SAC quedó en el log" || bad "no hay nota del SAC en el log"
echo "D2 segundo dim: no vuelve a guardar el valor bajo"; "$DIM" dim 111
chk "portátil" "$(raw)" 1333; chk "ASUS" "$(d 8)" 6; chk "estado" "$(st)" "bl intel_backlight 21333 111|ddc HDMI-A-1 100 111"
echo "D3 restore de otro dueño: no toca nada"; "$DIM" restore 222
chk "portátil" "$(raw)" 1333; chk "ASUS" "$(d 8)" 6
echo "D4 restore del dueño"; "$DIM" restore 111
chk "portátil" "$(raw)" 21333; chk "ASUS" "$(d 8)" 100; chk "estado" "$(st)" none

echo "D5 monitor dormido al devolver, sin reintentos: queda guardado; el siguiente restore lo devuelve"
fresh; "$DIM" dim 111; echo $(( $(date +%s) + 3 )) > "$T/ddc/8/asleep_until"
"$DIM" restore 111 0
chk "portátil (sí volvió)" "$(raw)" 21333; chk "ASUS (sigue bajo)" "$(d 8)" 6; chk "estado" "$(st)" "ddc HDMI-A-1 100 111"
sleep 3.3; "$DIM" restore -
chk "ASUS tras despertar" "$(d 8)" 100; chk "estado" "$(st)" none
echo "D6 monitor dormido con reintentos (10 s): lo devuelve en cuanto despierta"
fresh; "$DIM" dim 111; echo $(( $(date +%s) + 3 )) > "$T/ddc/8/asleep_until"
t0=${EPOCHREALTIME/./}; "$DIM" restore 111 10; e=$(ms $t0)
chk "ASUS" "$(d 8)" 100; chk "estado" "$(st)" none
{ [ "$e" -ge 2000 ] && [ "$e" -le 7000 ]; } && ok "tardó ${e} ms (esperó al despertar, sin agotar los 10 s)" || bad "tardó ${e} ms"

echo "D7 un monitor ya muy bajo (≤ 20 % perceptual) no se baja más"
fresh; echo 10000 > "$T/ddc/8/max"; echo 10 > "$T/ddc/8/value"; "$DIM" dim 111
chk "ASUS" "$(d 8)" 10; chk "estado" "$(st)" "bl intel_backlight 21333 111"
echo "D8 adopción: una línea vieja de otro dueño se queda con el original y pasa a ser mía"
fresh; mkdir -p "$T/state/hypr"; printf 'bl intel_backlight 21333 999\nddc HDMI-A-1 100 999\n' > "$T/state/hypr/lock-brightness"; echo 1333 > "$T/bl/raw"; echo 6 > "$T/ddc/8/value"   # ya bajados, con los originales guardados
"$DIM" dim 111
chk "estado" "$(st)" "bl intel_backlight 21333 111|ddc HDMI-A-1 100 111"; chk "portátil sigue bajo" "$(raw)" 1333; chk "ASUS sigue bajo" "$(d 8)" 6
"$DIM" restore 111; chk "portátil" "$(raw)" 21333; chk "ASUS" "$(d 8)" 100
echo "D9 estado en el formato antiguo (portátil solo)"
fresh; mkdir -p "$T/state/hypr"; echo "intel_backlight 21333 555" > "$T/state/hypr/lock-brightness"; echo 1333 > "$T/bl/raw"; "$DIM" restore 555
chk "3 campos" "$(raw)" 21333; chk "estado" "$(st)" none
echo "intel_backlight 21333" > "$T/state/hypr/lock-brightness"; echo 1333 > "$T/bl/raw"; "$DIM" restore -
chk "2 campos" "$(raw)" 21333; chk "estado" "$(st)" none
echo "D10 LOCK_DIM_DDC=0: solo el portátil"
fresh; LOCK_DIM_DDC=0 "$DIM" dim 111
chk "portátil" "$(raw)" 1333; chk "ASUS" "$(d 8)" 100; chk "estado" "$(st)" "bl intel_backlight 21333 111"
echo "D11 un monitor se desconectó mientras estaba bloqueado: se descarta su línea"
fresh; "$DIM" dim 111; echo disconnected > "$T/drm/card1-HDMI-A-1/status"; "$DIM" restore 111
chk "estado" "$(st)" none; chk "portátil" "$(raw)" 21333
grep -q 'HDMI-A-1: ya no está conectado' "$T/cache/hyprlock/lock.log" && ok "quedó anotado" || bad "sin nota en el log"
echo "D12 la orden de devolver falla: la línea se conserva y se reintenta en el siguiente restore"
fresh; "$DIM" dim 111; touch "$T/ddc/8/fail"; "$DIM" restore 111 0
chk "estado" "$(st)" "ddc HDMI-A-1 100 111"; rm "$T/ddc/8/fail"; "$DIM" restore -; chk "ASUS" "$(d 8)" 100; chk "estado" "$(st)" none
echo "D13 las órdenes a los monitores van EN PARALELO (3 monitores de 1,5 s por orden)"
fresh; conn() { mkdir -p "$T/drm/card1-$1"; echo "$2" > "$T/drm/card1-$1/status"; ln -sfn "../fake-i2c/i2c-$3" "$T/drm/card1-$1/ddc"; }
conn DP-2 connected 13; mkdir -p "$T/ddc/13"; echo 100 > "$T/ddc/13/value"; echo 100 > "$T/ddc/13/max"
for b in 8 12 13; do echo 1.5 > "$T/ddc/$b/delay"; done
t0=${EPOCHREALTIME/./}; "$DIM" dim 111; e=$(ms $t0)
chk "ASUS" "$(d 8)" 6; chk "DP-2" "$(d 13)" 6
[ "$e" -lt 4700 ] && ok "dim tardó ${e} ms (en serie serían ≥ 7000)" || bad "dim tardó ${e} ms: no es paralelo"
"$DIM" restore 111
echo "D14 dos dim a la vez: el estado queda coherente (los originales, no los valores bajos)"
fresh; "$DIM" dim 111 & "$DIM" dim 222 & wait
chk "portátil" "$(raw)" 1333; chk "ASUS" "$(d 8)" 6
case "$(st)" in "bl intel_backlight 21333 "*"|ddc HDMI-A-1 100 "*) ok "originales intactos: $(st)" ;; *) bad "estado: $(st)" ;; esac
"$DIM" restore -; chk "portátil" "$(raw)" 21333; chk "ASUS" "$(d 8)" 100
echo "D15 porcentajes: '08' (octal) no rompe, y el de los monitores puede ser propio"
fresh; LOCK_DIM_PERCENT=08 "$DIM" dim 111 2>"$T/err"; chk "stderr vacío" "$(cat "$T/err")" ""; chk "portátil (mínimo 2)" "$(raw)" 2; chk "ASUS (mínimo 1)" "$(d 8)" 1; "$DIM" restore -
fresh; LOCK_DIM_PERCENT=50 LOCK_DIM_PERCENT_DDC=75 "$DIM" dim 111; chk "portátil al 50" "$(raw)" 1333; chk "ASUS al 75" "$(d 8)" 32; "$DIM" restore -
fresh; echo 60 > "$T/ddc/8/value"; "$DIM" dim 111; chk "ASUS desde 60 (curva e4)" "$(d 8)" 4; "$DIM" restore -; chk "vuelve a 60" "$(d 8)" 60
echo "D16 valores de porcentaje no válidos: nada cambia"
for v in 100 0 abc 150 -5; do fresh; LOCK_DIM_PERCENT=$v "$DIM" dim 111; chk "LOCK_DIM_PERCENT=$v" "$(raw) $(d 8) $(st)" "21333 100 none"; done

echo "O1 filtro: solo para el monitor sin DDC (el SAC), con la opacidad de la curva de luz"
ovl="$T/cache/hyprlock/dim-overlay.conf"; hexa() { python3 -c "print(format(int((1-($1/100)**(4/2.2))*255+0.5),'02x'))"; }
fresh; LOCK_DIM_PERCENT=60 "$DIM" overlay
chk "monitores con filtro" "$(grep -c '^shape {' "$ovl")" 1
chk "es el SAC" "$(grep -c 'monitor = DP-1' "$ovl")" 1; chk "no el ASUS" "$(grep -c 'monitor = HDMI-A-1' "$ovl")" 0
chk "color (60 %)" "$(grep -o 'rgba(000000[0-9a-f]*)' "$ovl")" "rgba(000000$(hexa 60))"
chk "va por encima de todo" "$(grep -c 'zindex = 9' "$ovl")" 1; chk "tamaño de la pantalla (1920×1080; no más grande)" "$(grep -c 'size = 1920, 1080' "$ovl")" 1
grep -q 'filtro de brillo.*DP-1' "$T/cache/hyprlock/lock.log" && ok "anotado en el log" || bad "sin nota"
echo "O2 la opacidad sigue al porcentaje (50 → $(hexa 50), 75 → $(hexa 75), 90 → $(hexa 90))"
for p in 50 75 90; do fresh; LOCK_DIM_PERCENT=$p "$DIM" overlay; chk "$p %" "$(grep -o 'rgba(000000[0-9a-f]*)' "$ovl")" "rgba(000000$(hexa $p))"; done
fresh; LOCK_DIM_PERCENT=60 LOCK_DIM_PERCENT_SOFT=40 "$DIM" overlay; chk "porcentaje propio del filtro (40)" "$(grep -o 'rgba(000000[0-9a-f]*)' "$ovl")" "rgba(000000$(hexa 40))"
fresh; LOCK_DIM_PERCENT=60 LOCK_DIM_PERCENT_DDC=30 "$DIM" overlay; chk "hereda el de los monitores (30)" "$(grep -o 'rgba(000000[0-9a-f]*)' "$ovl")" "rgba(000000$(hexa 30))"
echo "O3 desactivado o sin efecto: el archivo existe pero sin filtros"
fresh; LOCK_DIM_SOFT=0 "$DIM" overlay; chk "LOCK_DIM_SOFT=0" "$(grep -c '^shape {' "$ovl")" 0
fresh; LOCK_DIM_DDC=0 "$DIM" overlay; chk "LOCK_DIM_DDC=0 (monitores en paz)" "$(grep -c '^shape {' "$ovl")" 0
for v in 100 0 abc 150; do fresh; LOCK_DIM_PERCENT=$v "$DIM" overlay; chk "LOCK_DIM_PERCENT=$v" "$([ -f "$ovl" ] && grep -c '^shape {' "$ovl")" 0; done
fresh; LOCK_DIM_PERCENT_DDC=100 "$DIM" overlay; chk "monitores al 100 (sin bajar)" "$(grep -c '^shape {' "$ovl")" 0
echo "O4 un conector sin bus I2C conocido y otro con DDC roto: los dos llevan filtro"
fresh; mkdir -p "$T/drm/card1-DP-3"; echo connected > "$T/drm/card1-DP-3/status"; "$DIM" overlay
chk "monitores con filtro" "$(grep -c '^shape {' "$ovl")" 2; chk "DP-3 (sin bus)" "$(grep -c 'monitor = DP-3' "$ovl")" 1; chk "DP-1 (DDC roto)" "$(grep -c 'monitor = DP-1' "$ovl")" 1
echo "O5 si el ASUS también falla, también lleva filtro; los desconectados y el portátil nunca"
fresh; touch "$T/ddc/8/fail"; "$DIM" overlay
chk "con filtro" "$(grep -c '^shape {' "$ovl")" 2; chk "HDMI-A-1" "$(grep -c 'monitor = HDMI-A-1' "$ovl")" 1; chk "eDP-1 nunca" "$(grep -c 'eDP-1' "$ovl")" 0; chk "DP-2 desconectado nunca" "$(grep -c 'DP-2' "$ovl")" 0
echo "O6 el sondeo es a la vez y no pasa de 1 s por monitor aunque se cuelgue"
fresh; echo 3 > "$T/ddc/8/delay"; echo 3 > "$T/ddc/12/delay"
t0=${EPOCHREALTIME/./}; "$DIM" overlay; e=$(ms $t0)
[ "$e" -lt 1800 ] && ok "tardó ${e} ms con dos monitores colgados (3 s por orden)" || bad "tardó ${e} ms"
chk "los colgados cuentan como sin DDC" "$(grep -c '^shape {' "$ovl")" 2
echo "O7 el archivo se rehace en cada llamada (no acumula)"
fresh; "$DIM" overlay; "$DIM" overlay; chk "una sola vez" "$(grep -c '^shape {' "$ovl")" 1; rm -f "$T/ddc/12/fail"; "$DIM" overlay; chk "al arreglarse el monitor, desaparece" "$(grep -c '^shape {' "$ovl")" 0

echo "limpieza"; rm -rf "$T"
[ "$(/usr/bin/brightnessctl -m 2>/dev/null)" = "$real_bl" ] && ok "retroiluminación REAL intacta" || bad "la retroiluminación real cambió"
[ "$(/usr/bin/ddcutil --bus 8 getvcp 10 --terse 2>/dev/null)" = "$real_ddc" ] && ok "ASUS REAL intacto ($real_ddc)" || bad "el ASUS real cambió"
[ -z "$FAIL" ] && echo "TODO OK" || echo "HAY FALLOS"
