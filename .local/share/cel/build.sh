#!/usr/bin/env bash
# Compila touchgrab a partir de touchgrab.c. El programa corre EN EL CELULAR (Android, aarch64), no en el PC:
# no usa libc, solo syscalls directas, así que basta clang con lld y no hace falta ningún sysroot.
# El binario no va en git (lo ignora .gitignore): cada máquina lo compila y `cel` lo copia al celular.
# Con clang 22.1.8 sale byte a byte igual al que ya corría en el celular.
#
#   build.sh [salida]        por defecto, touchgrab junto a este script
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="${1:-$dir/touchgrab}"

for t in clang ld.lld; do
    command -v "$t" >/dev/null || { echo "build.sh: falta $t (sudo pacman -S clang lld)" >&2; exit 1; }
done

# Se compila en un directorio temporal y se instala al final: un fallo no deja un touchgrab a medias.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
clang --target=aarch64-linux-gnu -static -nostdlib -ffreestanding -fno-stack-protector -O2 \
    -fuse-ld=lld -Wl,--build-id=sha1 -o "$tmp/touchgrab" "$dir/touchgrab.c"
install -m 755 "$tmp/touchgrab" "$out"
