#!/bin/bash
# lock-font.sh — Tipografía de la pantalla de bloqueo: ver, cambiar e instalar presets.
#
#   lock-font.sh                     lista los presets (● = el activo) y las fuentes que les faltan
#   lock-font.sh <preset>            activa un preset (descarga antes las fuentes que le falten)
#   lock-font.sh install [<preset>]  solo descarga las fuentes; sin nombre, las de todos los presets
#
# Un preset es un archivo de hypr/lock-fonts/<nombre>.conf (ver jetbrains.conf, que explica el
# formato): la primera línea es "# Nombre — descripción", después las variables $lock_font_* y
# $lock_size_* que usa hyprlock.conf y, si la fuente no viene de un paquete, líneas
# "# descarga: <carpeta> <url> <url>…" con de dónde bajarla. Para probar otra fuente: copia un preset,
# cámbiale las familias y los tamaños y actívalo.
#
# El preset activo es el symlink hypr/lock-font.conf (por máquina: está en .gitignore); hyprlock lo
# lee en cada bloqueo, así que el cambio se ve la próxima vez que bloquees. Las fuentes bajadas van a
# ~/.local/share/fonts/<carpeta>/ junto con su licencia (OFL), sin sudo.

set -u

hypr="$HOME/.config/hypr"
presets="$hypr/lock-fonts"
active="$hypr/lock-font.conf"
fonts_dir="$HOME/.local/share/fonts"

die() { echo "lock-font.sh: $*" >&2; exit 1; }

current() { [[ -L $active ]] && basename "$(readlink "$active")" .conf; }

# Familias que usa un preset: los valores de sus variables $lock_font_*
families() {
  sed -n 's/^\$lock_font_[a-z]*[[:space:]]*=[[:space:]]*//p' "$1" | sed 's/[[:space:]]*#.*$//; s/[[:space:]]*$//' | sort -u
}

# Las que fontconfig no conoce (hyprlock/Pango caería a Noto Sans sin avisar)
missing() {
  local fam
  while IFS= read -r fam; do
    fc-list -q ":family=$fam" || echo "$fam"
  done < <(families "$1")
}

# download <carpeta> <url>…: baja a ~/.local/share/fonts/<carpeta>/ lo que todavía no esté
download() {
  local slug=$1 dest="$fonts_dir/$1" url name tmp changed=0
  shift
  mkdir -p "$dest" || die "no se pudo crear $dest"
  for url in "$@"; do
    name=${url##*/}
    name=$(printf '%b' "${name//%/\\x}")      # %5B → [
    name=${name//\[/_}; name=${name//\]/}      # JosefinSans[wght].ttf → JosefinSans_wght.ttf
    [[ -s $dest/$name ]] && continue
    tmp=$(mktemp "$dest/.dl.XXXXXX") || die "no se pudo escribir en $dest"
    echo "  descargando $name…"
    if ! curl -fsSL --max-time 90 -o "$tmp" "$url"; then
      rm -f "$tmp"; die "falló la descarga de $url"
    fi
    if [[ $name == *.ttf || $name == *.otf ]] && [[ -z $(fc-scan --format '%{family}' "$tmp" 2>/dev/null) ]]; then
      rm -f "$tmp"; die "$name no es una fuente válida (¿cambió la URL?)"
    fi
    mv "$tmp" "$dest/$name"
    changed=1
  done
  (( changed )) && fc-cache -f "$dest"
  return 0
}

install_preset() {
  local line slug rest
  while IFS= read -r line; do
    read -r slug rest <<<"$line"
    # shellcheck disable=SC2086   # rest son URLs separadas por espacios
    [[ -n $slug ]] && download "$slug" $rest
  done < <(sed -n 's/^# descarga:[[:space:]]*//p' "$1")
}

list() {
  local cur f name mark miss
  cur=$(current)
  for f in "$presets"/*.conf; do
    name=$(basename "$f" .conf)
    mark=' '; [[ $name == "$cur" ]] && mark='●'
    printf '%s %-10s %s\n' "$mark" "$name" "$(sed -n '1s/^# *//p' "$f")"
    miss=$(missing "$f" | paste -sd, -)
    [[ -n $miss ]] && printf '             sin instalar: %s (se descargan al activarlo)\n' "$miss"
  done
  return 0
}

activate() {
  local name=$1 f="$presets/$1.conf" miss
  [[ -f $f ]] || { echo "No existe el preset '$name'. Disponibles:"; list; exit 1; }
  install_preset "$f"
  miss=$(missing "$f" | paste -sd, -)
  if [[ -n $miss ]]; then
    echo "Faltan fuentes que el preset no sabe descargar: $miss" >&2
    echo "Instálalas con su paquete (ver packages.txt) o añade una línea '# descarga:' al preset." >&2
    exit 1
  fi
  ln -sfn "lock-fonts/$name.conf" "$active"
  echo "Tipografía del bloqueo: $name (se aplica la próxima vez que bloquees)"
}

case ${1:-} in
  "")         list ;;
  -h|--help)  sed -n '2,19p' "$0" ;;
  install)
    shift
    if [[ -n ${1:-} ]]; then
      [[ -f $presets/$1.conf ]] || die "no existe el preset '$1'"
      install_preset "$presets/$1.conf"
    else
      for f in "$presets"/*.conf; do install_preset "$f"; done
    fi ;;
  *)          activate "$1" ;;
esac
