#!/bin/bash
# lock-dim.sh — Baja el brillo de las pantallas mientras la sesión está bloqueada y lo devuelve al
# desbloquear: la retroiluminación del portátil (brightnessctl) y los monitores externos que
# respondan a DDC/CI (ddcutil).
#
#   lock-dim.sh dim [dueño] [--if-locked]    guarda el brillo actual y lo baja a DIM_PERCENT %; con
#                                            --if-locked solo si el compositor sigue bloqueado al
#                                            obtener el candado (un dim retrasado no debe bajar el
#                                            brillo de una sesión que ya se desbloqueó)
#   lock-dim.sh restore [dueño|-] [segundos] devuelve lo guardado; "-" = sin dueño; segundos = cuánto
#                                            reintentar a un monitor que aún no responde (0 = un intento)
#   lock-dim.sh overlay                      escribe el filtro de los monitores que DDC no puede atenuar
#
# "dueño" es el PID del lock.sh que lo bajó. Con dueño, restore solo toca lo guardado por ese lock.sh:
# un vigilante viejo (el de un hyprlock zombi) que termine con otro bloqueo ya en marcha no debe
# devolver el brillo de ese otro. Sin dueño (limpieza antes de bloquear, arranque de Hyprland) devuelve
# lo que haya.
#
# Quién lo llama: lock.sh baja el brillo en cuanto el compositor confirma el bloqueo y lo devuelve al
# desbloquear, al terminar por cualquier motivo y antes de un bloqueo nuevo si quedó algo de uno
# anterior; autostart.conf lo llama al iniciar Hyprland (si el equipo se apagó o Hyprland murió con
# la sesión bloqueada, systemd-backlight restaura el nivel bajo en el arranque, pero lo guardado
# sigue aquí).
#
# Cuánto baja: DIM_PERCENT es un porcentaje del brillo actual medido con la misma curva que las teclas
# de brillo (keybindings.conf: `brightnessctl -e4 -n2`, perceptual, exponente 4). Por defecto 60: el
# usuario lo fue ajustando (50 → 75 → 60 el 2026-10-02: el 75, ~32 % de la luz, le seguía pareciendo
# demasiado brillante). 60 deja ~13 % de la luz, 75 ~32 % y 50 ~6 %; la mitad del valor crudo apenas se
# notaría. 100 = no tocar el brillo. Para probar otro valor sin editar nada: LOCK_DIM_PERCENT=50 lock.sh
# Los monitores usan la misma curva sobre su valor DDC (que es ~lineal en luz: el 60 % del portátil
# son ~13 sobre 100), y LOCK_DIM_PERCENT_DDC les da un porcentaje propio si hace falta afinarlos.
#
# Portátil: lo que el kernel expone en /sys/class/backlight (intel_backlight).
# Monitores externos: su brillo no está ahí sino dentro del monitor; se cambia por DDC/CI (VCP 0x10)
# con `ddcutil --bus N`, sobre el I2C del cable. Cada conector externo conectado se resuelve por sysfs
# (/sys/class/drm/card*-<conector>/ddc → i2c-N: sin `ddcutil detect`, que tarda segundos) y las
# órdenes van en paralelo y con timeout. Los que no responden se omiten (el SAC LED MONITOR de DP-1
# falla en 20 ms: "DDC communication failed") y quedan anotados en ~/.cache/hyprlock/lock.log.
# Requiere el paquete ddcutil y acceso a /dev/i2c-* (su regla udev da `uaccess` a la sesión).
# LOCK_DIM_DDC=0 los deja en paz.
#
# Monitores que DDC no puede atenuar (el SAC LED MONITOR de DP-1): `overlay` escribe en
# ~/.cache/hyprlock/dim-overlay.conf, que hyprlock.conf incluye, un `shape` negro translúcido por monitor
# y por encima de todo que simula la bajada. Es solo visual (la retroiluminación sigue igual: no ahorra
# energía) y solo vale durante el bloqueo, que es lo único que se ve. La opacidad sale de la misma curva
# de luz que el resto: una pantalla atenuada a DIM_PERCENT emite (DIM/100)^4 de su luz y hyprlock mezcla
# en sRGB (gamma ~2,2), así que alfa = 1 - (DIM/100)^(4/2,2) (60 → 0,60). lock.sh lo llama ANTES de
# lanzar hyprlock, que lee su config al arrancar. Cada monitor se sondea con un getvcp de 1 s, a la vez;
# sin ddcutil, o sin bus I2C conocido, el monitor cuenta como sin DDC. LOCK_DIM_SOFT=0 lo desactiva y
# LOCK_DIM_PERCENT_SOFT le da un porcentaje propio (por defecto el de los monitores).
#
# Estado (~/.local/state/hypr/lock-brightness, una línea por pantalla): `<tipo> <id> <valor> <dueño>`,
# tipo `bl` (id = dispositivo, valor = crudo) o `ddc` (id = conector, valor = VCP 0x10). Se guarda
# ANTES de bajar. El monitor se identifica por conector y no por número de bus, que puede cambiar de
# un arranque a otro. Si un monitor no responde al devolver, su línea se queda y se reintenta en el
# siguiente restore; un `dim` que encuentra la línea la adopta (cambia el dueño) en vez de guardar
# como original el valor ya bajado. Un candado (flock) evita que dos instancias pisen el estado.
#
# Si el brillo ya está en MIN_PERCENT % o menos no se baja más: una pantalla casi apagada al bloquear
# no se lee.

DIM_PERCENT=${LOCK_DIM_PERCENT:-60}
DIM_PERCENT_DDC=${LOCK_DIM_PERCENT_DDC:-$DIM_PERCENT}
DIM_PERCENT_SOFT=${LOCK_DIM_PERCENT_SOFT:-$DIM_PERCENT_DDC}
SOFT=${LOCK_DIM_SOFT:-1}                 # 1 = filtro en hyprlock para los monitores que DDC no puede atenuar
MIN_PERCENT=20
DDC=${LOCK_DIM_DDC:-1}
DDC_TIMEOUT=5            # s por orden a un monitor (los que no hablan DDC fallan antes)

state="${XDG_STATE_HOME:-$HOME/.local/state}/hypr/lock-brightness"
logf="${XDG_CACHE_HOME:-$HOME/.cache}/hyprlock/lock.log"
drm="${LOCK_DIM_DRM:-/sys/class/drm}"      # solo para probar con un sysfs inventado

note() { mkdir -p "${logf%/*}" 2>/dev/null; printf '%s lock-dim.sh: %s\n' "$(date '+%F %T')" "$*" >> "$logf" 2>/dev/null; }

valid_pct() { [[ $1 =~ ^[0-9]+$ ]] && (( 10#$1 > 0 && 10#$1 < 100 )); }

# ── Estado ────────────────────────────────────────────────────────────────────────────────────

declare -A VAL OWN        # claves "bl:<dispositivo>" y "ddc:<conector>"

load_state() {
  VAL=() OWN=()
  [[ -r $state ]] || return 0
  local a b c d
  while read -r a b c d; do
    [[ -n $a ]] || continue
    case $a in
      bl|ddc) ;;
      *) d=$c; c=$b; b=$a; a=bl ;;        # formato antiguo: <dispositivo> <crudo> [dueño]
    esac
    [[ -n $b && $c =~ ^[0-9]+$ ]] || continue
    VAL["$a:$b"]=$c; OWN["$a:$b"]=${d:-0}
  done < "$state"
}

save_state() {
  local k
  if (( ${#VAL[@]} )); then
    mkdir -p "${state%/*}" || return 1
    for k in "${!VAL[@]}"; do printf '%s %s %s %s\n' "${k%%:*}" "${k#*:}" "${VAL[$k]}" "${OWN[$k]:-0}"; done > "$state.tmp" \
      && mv -f "$state.tmp" "$state"
  else
    rm -f "$state"
  fi
}

take_lock() {   # <segundos de espera>
  mkdir -p "${state%/*}" 2>/dev/null || return 1
  exec 8>"$state.lock" || return 1
  flock -w "$1" 8
}

# ── Portátil (brightnessctl) ──────────────────────────────────────────────────────────────────

dim_backlight() {
  local owner=$1 line dev cur pct max target
  line=$(brightnessctl -m -e4 -c backlight 2>/dev/null) || return 0
  IFS=, read -r dev _ cur pct max <<<"$line"
  pct=${pct%\%}
  [[ -n $dev && $cur =~ ^[0-9]+$ && $pct =~ ^[0-9]+$ ]] || return 0
  if [[ -n ${VAL[bl:$dev]:-} ]]; then OWN["bl:$dev"]=$owner; return 0; fi   # lo bajó otro lock.sh: es mío ahora
  (( pct > MIN_PERCENT )) || return 0
  target=$(( pct * 10#$DIM_PERCENT / 100 )); (( target < 1 )) && target=1
  VAL["bl:$dev"]=$cur; OWN["bl:$dev"]=$owner
  if ! save_state; then unset "VAL[bl:$dev]" "OWN[bl:$dev]"; return 0; fi
  brightnessctl -q -e4 -n2 -d "$dev" set "${target}%" >/dev/null 2>&1 || { unset "VAL[bl:$dev]" "OWN[bl:$dev]"; save_state; }
}

restore_backlight() {   # <dueño o vacío>
  local owner=$1 k
  for k in "${!VAL[@]}"; do
    [[ ${k%%:*} == bl ]] || continue
    [[ -z $owner || ${OWN[$k]} == "$owner" ]] || continue
    brightnessctl -q -d "${k#*:}" set "${VAL[$k]}" >/dev/null 2>&1
    unset "VAL[$k]" "OWN[$k]"
  done
}

# ── Monitores externos (ddcutil) ──────────────────────────────────────────────────────────────

# "<conector> <bus>" de cada monitor externo conectado (no eDP/LVDS/DSI); bus "-" si no se sabe cuál es
ext_displays() {
  local c n l bus
  for c in "$drm"/card*-*; do
    [[ -e $c/status ]] || continue
    n=${c##*/}; n=${n#*-}
    case $n in eDP*|LVDS*|DSI*) continue ;; esac
    [[ $(<"$c/status") == connected ]] || continue
    bus=-
    if l=$(readlink "$c/ddc") && [[ ${l##*/} =~ ^i2c-([0-9]+)$ ]]; then bus=${BASH_REMATCH[1]}; fi
    echo "$n $bus"
  done
}

# los que además tienen un bus I2C conocido (los únicos a los que se les puede hablar DDC)
ddc_displays() { local n b; ext_displays | while read -r n b; do [[ $b != - ]] && echo "$n $b"; done; }

bus_of() { ddc_displays | while read -r n b; do [[ $n == "$1" ]] && { echo "$b"; break; }; done; }

# <valor actual> <máximo> → valor al que bajar, con la curva perceptual de exponente 4 (la de
# brightnessctl -e4), o -1 si no hay que bajar (ya está en MIN_PERCENT % o menos, o no es menor)
ddc_target() {
  awk -v c="$1" -v m="$2" -v d="$((10#$DIM_PERCENT_DDC))" -v lo="$MIN_PERCENT" 'BEGIN {
    p = 100 * (c / m) ^ 0.25
    if (p <= lo) { print -1; exit }
    v = int(m * (p * d / 10000) ^ 4 + 0.5)
    if (v < 1) v = 1
    print (v < c ? v : -1)
  }'
}

dim_ddc() {
  local owner=$1 conn bus tmp f cur max t
  local -A TGT BUS SEEN
  command -v ddcutil >/dev/null 2>&1 || return 0
  tmp=$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/lock-dim.XXXXXX") || return 0

  # 1) leer a la vez el brillo actual y el máximo de cada monitor externo
  while read -r conn bus; do
    [[ -n $bus ]] || continue
    SEEN[$conn]=$bus
    (
      out=$(timeout "$DDC_TIMEOUT" ddcutil --bus "$bus" getvcp 10 --terse 2>/dev/null) || exit 0
      read -r _ _ _ cur max <<<"$out"
      [[ $cur =~ ^[0-9]+$ && $max =~ ^[0-9]+$ ]] && (( max > 0 )) && echo "$bus $cur $max" > "$tmp/r.$conn"
    ) &
  done < <(ddc_displays)
  wait

  # 2) decidir y guardar ANTES de tocar nada. Con una línea ya guardada (otro lock.sh que no llegó a
  #    devolverlo) el original es el guardado, no el valor que se lee ahora (ya bajado).
  for conn in "${!SEEN[@]}"; do
    f=$tmp/r.$conn
    if [[ ! -e $f ]]; then note "DDC $conn (bus ${SEEN[$conn]}): sin respuesta; se deja como está"; continue; fi
    read -r bus cur max < "$f"
    BUS[$conn]=$bus
    if [[ -n ${VAL[ddc:$conn]:-} ]]; then cur=${VAL[ddc:$conn]}; OWN["ddc:$conn"]=$owner; fi   # adoptar la línea vieja
    t=$(ddc_target "$cur" "$max")
    [[ $t =~ ^[0-9]+$ ]] || continue
    TGT[$conn]=$t
    VAL["ddc:$conn"]=$cur; OWN["ddc:$conn"]=$owner
  done
  save_state || { rm -rf "$tmp"; return 0; }

  # 3) bajar a la vez
  for conn in "${!TGT[@]}"; do
    ( timeout "$DDC_TIMEOUT" ddcutil --bus "${BUS[$conn]}" setvcp 10 "${TGT[$conn]}" >/dev/null 2>&1 \
        || note "DDC $conn (bus ${BUS[$conn]}): no se pudo bajar el brillo" ) &
  done
  wait
  rm -rf "$tmp"
}

restore_ddc() {   # <dueño o vacío> <segundos de reintento>
  local owner=$1 retry=$2 k conn bus tmp
  local -a todo=() sent=()
  for k in "${!VAL[@]}"; do
    [[ ${k%%:*} == ddc ]] || continue
    [[ -z $owner || ${OWN[$k]} == "$owner" ]] && todo+=("${k#*:}")
  done
  (( ${#todo[@]} )) || return 0
  if ! command -v ddcutil >/dev/null 2>&1; then
    for conn in "${todo[@]}"; do note "DDC $conn: no hay ddcutil; se descarta lo guardado"; unset "VAL[ddc:$conn]" "OWN[ddc:$conn]"; done
    return 0
  fi
  tmp=$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/lock-dim.XXXXXX") || return 0
  for conn in "${todo[@]}"; do
    bus=$(bus_of "$conn")
    if [[ -z $bus ]]; then
      note "DDC $conn: ya no está conectado; se descarta lo guardado"
      unset "VAL[ddc:$conn]" "OWN[ddc:$conn]"; continue
    fi
    sent+=("$conn")
    (
      end=$(( SECONDS + retry ))
      while :; do
        timeout "$DDC_TIMEOUT" ddcutil --bus "$bus" setvcp 10 "${VAL[ddc:$conn]}" >/dev/null 2>&1 && { : > "$tmp/ok.$conn"; exit 0; }
        (( SECONDS >= end )) && exit 1
        sleep 1
      done
    ) &
  done
  wait
  for conn in "${sent[@]}"; do
    if [[ -e $tmp/ok.$conn ]]; then unset "VAL[ddc:$conn]" "OWN[ddc:$conn]"
    else note "DDC $conn: no respondió al devolver el brillo; queda guardado para el siguiente intento"
    fi
  done
  rm -rf "$tmp"
}

# ── Filtro para los monitores sin DDC ─────────────────────────────────────────────────────────

# "<ancho>, <alto>" en píxeles físicos de un monitor según Hyprland (intercambiados si está en vertical);
# 1920, 1080 si no se sabe. El tamaño del filtro tiene que ser el de la pantalla: medido con hyprlock 0.9.6,
# un shape de ese tamaño la cubre entera, uno algo mayor deja una esquina sin cubrir, y a partir de ~2×
# no se dibuja (8192 × 8192 no oscurecía nada).
monitor_size() {   # <conector> <json de hyprctl monitors -j>
  local sz
  sz=$(jq -r --arg n "$1" '.[] | select(.name == $n) | if .transform % 2 == 1 then "\(.height), \(.width)" else "\(.width), \(.height)" end' <<<"$2" 2>/dev/null | head -1)
  [[ $sz =~ ^[0-9]+,\ [0-9]+$ ]] && echo "$sz" || echo "1920, 1080"
}

# Escribe ~/.cache/hyprlock/dim-overlay.conf (siempre existe, aunque vacío: hyprlock.conf lo incluye).
cmd_overlay() {
  local out="${XDG_CACHE_HOME:-$HOME/.cache}/hyprlock/dim-overlay.conf" tmp conn bus hex json
  local -a soft=() probe=()
  mkdir -p "${out%/*}" 2>/dev/null || return 0
  if [[ $SOFT == 1 && $DDC == 1 ]] && valid_pct "$DIM_PERCENT" && valid_pct "$DIM_PERCENT_SOFT"; then
    tmp=$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/lock-dim.XXXXXX") || return 0
    while read -r conn bus; do
      if [[ $bus == - ]] || ! command -v ddcutil >/dev/null 2>&1; then soft+=("$conn"); continue; fi
      probe+=("$conn")
      ( timeout 1 ddcutil --bus "$bus" getvcp 10 --terse >/dev/null 2>&1 && : > "$tmp/ok.$conn" ) &
    done < <(ext_displays)
    wait
    for conn in "${probe[@]}"; do [[ -e $tmp/ok.$conn ]] || soft+=("$conn"); done
    rm -rf "$tmp"
  fi
  hex=$(awk -v d="$((10#$DIM_PERCENT_SOFT))" 'BEGIN { a = 1 - (d / 100) ^ (4 / 2.2); printf "%02x", a * 255 + 0.5 }' 2>/dev/null)
  (( ${#soft[@]} )) && json=$(hyprctl monitors -j 2>/dev/null)
  {
    echo "# Generado por lock-dim.sh en cada bloqueo; no se edita. Monitores que DDC/CI no puede atenuar:"
    echo "# un filtro negro translúcido simula la bajada de brillo (solo visual: la retroiluminación no cambia)."
    for conn in "${soft[@]}"; do
      [[ $hex =~ ^[0-9a-f]{2}$ ]] || break
      printf '\nshape {\n    monitor = %s\n    size = %s\n    color = rgba(000000%s)\n    rounding = 0\n    border_size = 0\n    position = 0, 0\n    halign = center\n    valign = center\n    zindex = 9\n}\n' "$conn" "$(monitor_size "$conn" "${json:-[]}")" "$hex"
    done
  } > "$out.tmp.$$" && mv -f "$out.tmp.$$" "$out"
  (( ${#soft[@]} )) && note "filtro de brillo (alfa 0x$hex) para: ${soft[*]}"
  return 0
}

# ── Órdenes ───────────────────────────────────────────────────────────────────────────────────

cmd_dim() {
  local owner=${1:-0}
  valid_pct "$DIM_PERCENT" || return 0
  take_lock 10 || { note "dim: el estado está ocupado; no se baja el brillo"; return 0; }
  if [[ ${2:-} == --if-locked && $(hyprctl locked 2>/dev/null) != true ]]; then
    note "dim: la sesión ya no está bloqueada; no se baja el brillo"; return 0
  fi
  load_state
  dim_backlight "$owner"
  if [[ $DDC == 1 ]] && valid_pct "$DIM_PERCENT_DDC"; then dim_ddc "$owner"; fi
  save_state
}

cmd_restore() {
  local owner=${1:--} retry=${2:-0}
  [[ $owner == - ]] && owner=""
  [[ $retry =~ ^[0-9]+$ ]] || retry=0
  [[ -e $state ]] || return 0
  # sin reintentos es el limpiador de antes de bloquear: no debe retrasar el bloqueo esperando a otro restore
  take_lock $(( retry > 0 ? retry + 5 : 1 )) || { note "restore: el estado está ocupado; se deja para el siguiente"; return 0; }
  load_state
  restore_backlight "$owner"
  restore_ddc "$owner" "$retry"
  save_state
}

case ${1:-} in
  dim)     shift; cmd_dim "$@" ;;
  restore) shift; cmd_restore "$@" ;;
  overlay) cmd_overlay ;;
  *) echo "uso: ${0##*/} dim [pid del lock.sh dueño] [--if-locked] | restore [pid|-] [segundos de reintento] | overlay" >&2; exit 2 ;;
esac
exit 0
