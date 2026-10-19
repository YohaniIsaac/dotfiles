# Fuentes

Parte de los [dotfiles](../../.github/README.md).

No hay un lugar único: el sistema (fontconfig) sabe qué fuentes existen y cada aplicación elige la suya por nombre.

| Qué | Dónde |
|---|---|
| Instalar fuentes del sistema | `packages.txt` (`ttf-jetbrains-mono-nerd`, `ttf-firacode-nerd`, `noto-fonts`…): quedan en `/usr/share/fonts/` |
| Fuentes de usuario, sin sudo | `~/.local/share/fonts/<carpeta>/` y después `fc-cache -f` (ahí van Josefin Sans y Oxygen Mono) |
| Qué ve fontconfig | `fc-list : family`, `fc-match "<nombre>"`. No hay `~/.config/fontconfig`: `monospace` cae en Noto Sans Mono y `sans-serif` en Noto Sans |
| Barra y popups (AGS) | `$font` en `ags/_shared.scss`: una sola variable para toda la barra |
| Terminal | `kitty/kitty.conf` (`font_family`) |
| Rofi | `rofi/config.rasi` (`font:`) |
| Pantalla de bloqueo | presets de `hypr/lock-fonts/`, con `hypr/scripts/lock-font.sh` (ver [Pantalla de bloqueo](../hypr/LOCKSCREEN.md)) |
| Aplicaciones GTK sin configuración propia (Thunar, pavucontrol…) | `gsettings get org.gnome.desktop.interface font-name` (hoy "Adwaita Sans 11") |

Un nombre que fontconfig no conoce no da error: la aplicación cae en Noto Sans sin avisar. Se comprueba con `fc-list -q ":family=<nombre>"`.
