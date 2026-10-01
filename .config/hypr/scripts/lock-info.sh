#!/bin/bash
# lock-info.sh — Datos para la pantalla de bloqueo (hypr/hyprlock.conf).
#
# hyprlock pinta texto con `cmd[update:N] <comando>`. Cada subcomando de aquí imprime UNA cosa y
# TERMINA: hyprlock se cuelga con comandos que no terminan (nada de --follow ni suscripciones),
# y cualquier trabajo lento (red, imágenes) se lanza aparte con `setsid -f` y sin heredar el
# stdout, o hyprlock esperaría a que cierre el pipe.
#
#   prepare                        lo llama lock.sh justo antes de lanzar hyprlock: fondo, avatar
#                                  y refresco del clima (si la caché tiene más de 20 min)
#   weekday | date                 "JUEVES" · "1 de octubre de 2026" (a mano: el locale es en_US)
#   (weekday, p-title y p-artist aceptan un factor de relleno de línea: $lock_pad del preset de fuente)
#   w-icon | w-temp | w-desc | w-range    clima, leído de la caché
#   p-title | p-artist | p-meta | p-idle | p-cover   reproductor (playerctl)
#   refresh | fetch-cover          uso interno (se lanzan desacoplados)
#
# Archivos locales (no se versionan; el repo es público):
#   ~/.config/hypr/weather.conf   ubicación del clima: LOCATION=<ciudad>  COUNTRY=<CL…>  (o LAT= y LON=)
#   ~/.face                       avatar (cualquier imagen; se recorta al centro en un cuadrado)
# Caché: ~/.cache/hyprlock (fondo, avatar, clima, portadas).
#
# Clima: Open-Meteo (https://open-meteo.com, datos CC BY 4.0, gratis sin clave para uso no
# comercial). La caché se considera válida 3 h; pasado eso no se muestra nada antes que un dato viejo.

set -u
# bash ≥ 5.2 trata un "&" sin comillas en el texto de reemplazo de ${var//a/b} como "lo encontrado"
# (esc() fabricaba "<lt;" al escapar "<"). Se desactiva y, además, esc() entrecomilla sus reemplazos.
shopt -u patsub_replacement 2>/dev/null

cache="${XDG_CACHE_HOME:-$HOME/.cache}/hyprlock"
wconf="$HOME/.config/hypr/weather.conf"
wjson="$cache/weather.json"
mkdir -p "$cache/covers"

# ── Utilidades ────────────────────────────────────────────────────────────────────────────────

# hyprlock interpreta Pango markup en las etiquetas: un título con "&" o "<" lo rompería.
esc()   { local s=$1; s=${s//&/'&amp;'}; s=${s//</'&lt;'}; s=${s//>/'&gt;'}; printf '%s' "$s"; }
trunc() { local s=$1; (( ${#s} > $2 )) && s="${s:0:$2-1}…"; printf '%s' "$s"; }

# Relleno de la caja del texto para fuentes cuyas tildes de mayúscula sobresalen (Josefin Sans: la É
# de MIÉRCOLES se recortaba). hyprlock dimensiona el texto con la caja lógica de la fuente y corta lo
# que sale de ella; `line_height` la agranda sin mover el texto. El factor es $lock_pad del preset
# (0 = nada). No sirve <br/>: hyprlock solo lo convierte en texto fijo, no en la salida de un
# cmd[...] (allí se vería literal).
lh_wrap() {  # <factor> <texto>
  if [[ $1 =~ ^[0-9]+(\.[0-9]+)?$ && $1 != 0 && $1 != 0.0 ]]; then
    printf '<span line_height="%s">%s</span>' "$1" "$2"
  else
    printf '%s' "$2"
  fi
}

urldecode() { local s=${1//+/ }; printf '%b' "${s//%/\\x}"; }

# Glifos Nerd Font (Material Design Icons) como bytes UTF-8, para no depender del locale.
G_SUNNY=$'\xf3\xb0\x96\x99'      # weather-sunny
G_NIGHT=$'\xf3\xb0\x96\x94'      # weather-night
G_PARTLY=$'\xf3\xb0\x96\x95'     # weather-partly-cloudy
G_NIGHT_PARTLY=$'\xf3\xb0\xbc\xb1'
G_CLOUDY=$'\xf3\xb0\x96\x90'
G_FOG=$'\xf3\xb0\x96\x91'
G_RAINY=$'\xf3\xb0\x96\x97'
G_POURING=$'\xf3\xb0\x96\x96'
G_SNOWY=$'\xf3\xb0\x96\x98'
G_STORM=$'\xf3\xb0\x99\xbe'      # weather-lightning-rainy
G_NOTE=$'\xf3\xb0\x8e\x87'       # music-note
G_PLAY=$'\xf3\xb0\x90\x8a'
G_PAUSE=$'\xf3\xb0\x8f\xa4'

ensure_transparent() {
  [[ -f $cache/transparent.png ]] || magick -size 8x8 xc:none "png32:$cache/transparent.png" 2>/dev/null
}

# ── Fecha ─────────────────────────────────────────────────────────────────────────────────────

WEEKDAYS=(DOMINGO LUNES MARTES MIÉRCOLES JUEVES VIERNES SÁBADO)
MONTHS=(enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre)

# LOCK_INFO_NOW (segundos desde la época) fija la fecha: solo para probar días y meses largos.
now_date() { date ${LOCK_INFO_NOW:+-d "@$LOCK_INFO_NOW"} "$@"; }

cmd_weekday() { lh_wrap "${1:-0}" "${WEEKDAYS[$(now_date +%w)]}"; }
cmd_date() {
  local d m y
  read -r d m y < <(now_date '+%-d %-m %Y')
  printf '%s de %s de %s' "$d" "${MONTHS[m-1]}" "$y"
}

# ── Clima ─────────────────────────────────────────────────────────────────────────────────────

conf_get() {   # valor de CLAVE en weather.conf, sin comillas
  local v; v=$(sed -n "s/^$1=//p" "$wconf" 2>/dev/null | head -1)
  v=${v%\"}; printf '%s' "${v#\"}"
}

is_number() { [[ $1 =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; }

resolve_coords() {   # imprime "lat lon"; busca por nombre una sola vez y lo guarda
  local lat lon loc country q resp
  lat=$(conf_get LAT); lon=$(conf_get LON)
  if is_number "$lat" && is_number "$lon"; then echo "$lat $lon"; return 0; fi
  loc=$(conf_get LOCATION); country=$(conf_get COUNTRY)
  [[ -n $loc ]] || return 1
  if [[ -f $cache/location.json ]] && [[ "$(jq -r '.key // empty' "$cache/location.json" 2>/dev/null)" == "$loc|$country" ]]; then
    jq -r '"\(.lat) \(.lon)"' "$cache/location.json"; return 0
  fi
  q=$(jq -rn --arg s "$loc" '$s|@uri')
  resp=$(curl -fsS --max-time 8 "https://geocoding-api.open-meteo.com/v1/search?name=$q&count=1&language=es&format=json${country:+&countryCode=$country}") || return 1
  jq -e '.results[0].latitude != null' <<<"$resp" >/dev/null 2>&1 || return 1
  jq -c --arg k "$loc|$country" '{key:$k, name:.results[0].name, region:.results[0].admin1, lat:.results[0].latitude, lon:.results[0].longitude}' <<<"$resp" \
    > "$cache/location.json.tmp" && mv "$cache/location.json.tmp" "$cache/location.json"
  jq -r '"\(.lat) \(.lon)"' "$cache/location.json"
}

cmd_refresh() {   # se lanza desacoplado; un solo refresco a la vez y nunca más de uno por minuto
  exec 8>"$cache/weather.lock"; flock -n 8 || return 0
  local now last=0 lat lon coords resp
  now=$(date +%s)
  [[ -f $cache/weather.attempt ]] && last=$(<"$cache/weather.attempt")
  (( now - last < 60 )) && return 0
  echo "$now" > "$cache/weather.attempt"
  coords=$(resolve_coords) || return 1
  read -r lat lon <<<"$coords"
  resp=$(curl -fsS --max-time 8 "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1") || return 1
  jq -e '.current.temperature_2m != null' <<<"$resp" >/dev/null 2>&1 || return 1
  jq -c --argjson t "$now" '. + {fetched: $t}' <<<"$resp" > "$wjson.tmp" && mv "$wjson.tmp" "$wjson"
}

maybe_refresh() {   # sin esperar: si la caché es vieja, refresca en segundo plano
  local fetched=0
  [[ -f $wjson ]] && fetched=$(jq -r '.fetched // 0' "$wjson" 2>/dev/null)
  (( $(date +%s) - fetched > 1200 )) && setsid -f "$0" refresh >/dev/null 2>&1 </dev/null
  return 0
}

wdata() {   # campo jq de la caché si tiene menos de 3 h; si no, falla (y no se muestra nada)
  [[ -f $wjson ]] || return 1
  local fetched; fetched=$(jq -r '.fetched // 0' "$wjson" 2>/dev/null) || return 1
  (( $(date +%s) - fetched <= 10800 )) || return 1
  jq -r "$1 // empty" "$wjson" 2>/dev/null
}

degrees() { local r; r=$(printf '%.0f' "$1"); [[ $r == -0 ]] && r=0; printf '%s°' "$r"; }

cmd_w_temp() {   # sin datos: "--°", para que la tarjeta no quede vacía
  local t; t=$(wdata .current.temperature_2m)
  if [[ -n $t ]]; then degrees "$t"; else printf -- '--°'; fi
}

cmd_w_range() {
  local lo hi
  lo=$(wdata '.daily.temperature_2m_min[0]') && hi=$(wdata '.daily.temperature_2m_max[0]') || return 0
  [[ -n $lo && -n $hi ]] && printf 'Mín %s   Máx %s' "$(degrees "$lo")" "$(degrees "$hi")"
  return 0
}

cmd_w_icon() {
  local code day
  code=$(wdata .current.weather_code)
  [[ -n $code ]] || { printf '%s' "$G_CLOUDY"; return 0; }
  day=$(wdata .current.is_day)
  case $code in
    0|1)             [[ $day == 1 ]] && printf '%s' "$G_SUNNY" || printf '%s' "$G_NIGHT" ;;
    2)               [[ $day == 1 ]] && printf '%s' "$G_PARTLY" || printf '%s' "$G_NIGHT_PARTLY" ;;
    3)               printf '%s' "$G_CLOUDY" ;;
    45|48)           printf '%s' "$G_FOG" ;;
    51|53|55|56|57|61|63|66|80|81) printf '%s' "$G_RAINY" ;;
    65|67|82)        printf '%s' "$G_POURING" ;;
    71|73|75|77|85|86) printf '%s' "$G_SNOWY" ;;
    95|96|99)        printf '%s' "$G_STORM" ;;
    *)               printf '%s' "$G_CLOUDY" ;;
  esac
}

cmd_w_desc() {
  local code
  maybe_refresh   # mientras la pantalla sigue bloqueada, esta etiqueta mantiene la caché al día
  code=$(wdata .current.weather_code) || { printf 'Sin datos del clima'; return 0; }
  case $code in
    0) printf 'Despejado' ;;                 1) printf 'Mayormente despejado' ;;
    2) printf 'Parcialmente nublado' ;;      3) printf 'Nublado' ;;
    45|48) printf 'Niebla' ;;                51|53|55) printf 'Llovizna' ;;
    56|57) printf 'Llovizna helada' ;;       61) printf 'Lluvia ligera' ;;
    63) printf 'Lluvia' ;;                   65) printf 'Lluvia fuerte' ;;
    66|67) printf 'Lluvia helada' ;;         71) printf 'Nieve ligera' ;;
    73) printf 'Nieve' ;;                    75) printf 'Nieve fuerte' ;;
    77) printf 'Granizo fino' ;;              80) printf 'Chubascos ligeros' ;;
    81) printf 'Chubascos' ;;                82) printf 'Chubascos fuertes' ;;
    85|86) printf 'Chubascos de nieve' ;;     95) printf 'Tormenta' ;;
    96|99) printf 'Tormenta con granizo' ;;   *) printf 'Sin datos del clima' ;;
  esac
}

# ── Reproductor ───────────────────────────────────────────────────────────────────────────────

# Un reproductor colgado no puede bloquear el hilo que hyprlock usa para actualizar todas las etiquetas.
pc() { timeout 2 playerctl "$@"; }

P="" PS=""
pick_player() {   # primero uno que esté sonando; si no, uno en pausa
  local p s paused=""
  while IFS= read -r p; do
    s=$(pc -p "$p" status 2>/dev/null) || continue
    [[ $s == Playing ]] && { P=$p; PS=$s; return 0; }
    [[ $s == Paused && -z $paused ]] && paused=$p
  done < <(pc -l 2>/dev/null)
  [[ -n $paused ]] && { P=$paused; PS=Paused; return 0; }
  return 1
}
meta() { pc -p "$P" metadata --format "$1" 2>/dev/null; }

cmd_p_title() {
  local lh=${1:-0}
  pick_player || { lh_wrap "$lh" '<span alpha="55%">Nada en reproducción</span>'; return 0; }
  local t; t=$(meta '{{title}}'); [[ -n $t ]] || t="Sin título"
  lh_wrap "$lh" "$(esc "$(trunc "$t" 22)")"
}
cmd_p_artist() {
  pick_player || return 0
  local a; a=$(meta '{{artist}}')
  [[ -n $a ]] && lh_wrap "${1:-0}" "$(esc "$(trunc "$a" 26)")"
  return 0
}
cmd_p_meta() {
  pick_player || return 0
  local app glyph=$G_PLAY; [[ $PS == Paused ]] && glyph=$G_PAUSE
  app=$(meta '{{playerName}}'); app=${app%%.*}
  printf '%s  %s' "$glyph" "$(esc "${app^}")"
}
cover_path() {   # ruta de la portada si ya está lista (si no, la descarga aparte y falla)
  pick_player || return 1
  local url f key out
  url=$(meta '{{mpris:artUrl}}')
  case $url in
    file://*)
      f=$(urldecode "${url#file://}")
      [[ -f $f ]] && { printf '%s' "$f"; return 0; } ;;
    http://*|https://*)
      key=$(printf '%s' "$url" | sha1sum | cut -c1-16)
      out="$cache/covers/$key.jpg"
      [[ -f $out ]] && { printf '%s' "$out"; return 0; }
      setsid -f "$0" fetch-cover "$url" "$out" >/dev/null 2>&1 </dev/null ;;
  esac
  return 1
}

# La nota musical ocupa el sitio de la portada cuando no hay reproductor o todavía no hay portada
# (un navegador no suele traerla); la portada, que va encima, la tapa en cuanto llega.
cmd_p_idle() { cover_path >/dev/null || printf '%s' "$G_NOTE"; return 0; }

cmd_p_cover() {
  ensure_transparent
  cover_path || printf '%s' "$cache/transparent.png"
}

cmd_fetch_cover() {   # <url> <destino>: descarga y deja la portada cuadrada
  local url=$1 out=$2 tmp
  exec 7>"$out.lock"; flock -n 7 || return 0
  tmp=$(mktemp "$cache/covers/dl.XXXXXX") || return 1
  curl -fsSL --max-time 10 -o "$tmp" "$url" \
    && magick "$tmp[0]" -resize 400x400^ -gravity center -extent 400x400 -quality 90 "$out.part.jpg" \
    && mv "$out.part.jpg" "$out"
  rm -f "$tmp" "$out.lock"
  find "$cache/covers" -type f -mtime +2 -delete 2>/dev/null
}

# ── Preparación (la llama lock.sh) ────────────────────────────────────────────────────────────

cmd_prepare() {
  local wp face preset

  # Fondo: el mismo wallpaper que el escritorio (wallpaperSelect.sh deja ~/.current_wallpaper;
  # en una máquina nueva, groot_1.jpg, igual que restore-wallpaper.sh).
  wp=$(readlink -e "$HOME/.current_wallpaper") || wp="$HOME/Pictures/wallpapers/groot_1.jpg"
  ln -sfn "$wp" "$cache/wallpaper"

  # Tipografía: si falta el enlace al preset activo (máquina nueva), el preset por defecto es sakoora
  # siempre que Josefin Sans esté instalada; si no, jetbrains, que viene de un paquete. Lo cambia
  # lock-font.sh, y `lock-font.sh install` baja las fuentes que falten.
  if [[ ! -e $HOME/.config/hypr/lock-font.conf ]]; then
    preset=sakoora
    fc-list -q ":family=Josefin Sans" || preset=jetbrains
    ln -sfn "lock-fonts/$preset.conf" "$HOME/.config/hypr/lock-font.conf"
  fi

  # Avatar: ~/.face recortado al centro en un cuadrado; sin foto, una imagen transparente (y
  # hyprlock deja ver el icono de reserva que hay debajo).
  ensure_transparent
  face="$HOME/.face"
  if [[ -f $face ]]; then
    if [[ ! -f $cache/avatar.png || $face -nt $cache/avatar.png ]]; then
      magick "$face[0]" -auto-orient -resize 512x512^ -gravity center -extent 512x512 "$cache/avatar.png.tmp.png" \
        && mv "$cache/avatar.png.tmp.png" "$cache/avatar.png"
    fi
  else
    cp -f "$cache/transparent.png" "$cache/avatar.png"
  fi

  maybe_refresh
}

case ${1:-} in
  prepare)    cmd_prepare ;;
  weekday)    shift; cmd_weekday "$@" ;;
  date)       cmd_date ;;
  w-icon)     cmd_w_icon ;;
  w-temp)     cmd_w_temp ;;
  w-desc)     cmd_w_desc ;;
  w-range)    cmd_w_range ;;
  p-title)    shift; cmd_p_title "$@" ;;
  p-artist)   shift; cmd_p_artist "$@" ;;
  p-meta)     cmd_p_meta ;;
  p-idle)     cmd_p_idle ;;
  p-cover)    cmd_p_cover ;;
  refresh)    cmd_refresh ;;
  fetch-cover) shift; cmd_fetch_cover "$@" ;;
  *) echo "uso: ${0##*/} prepare|weekday|date|w-icon|w-temp|w-desc|w-range|p-title|p-artist|p-meta|p-idle|p-cover" >&2; exit 2 ;;
esac
