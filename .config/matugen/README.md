# Theming dinámico con Matugen

Parte de los [dotfiles](../../.github/README.md).

El sistema usa [Matugen](https://github.com/InioX/matugen) para generar colores Material You a partir del wallpaper. Al seleccionar un wallpaper con `Super + W`:

1. Escoge el wallpaper
2. Elige el color base (de 6 opciones extraídas de la imagen)
3. Elige el esquema de color (Tonal Spot, Vibrant, Expressive, etc.)

Matugen pone el wallpaper con awww y genera los colores desde los templates de `~/.config/matugen/templates/`:

| Destino | Cuándo se aplica |
|---|---|
| Hyprland (`hypr/colors.conf`) | Al instante (`hyprctl reload`) |
| Rofi (`rofi/colors.rasi`) | La próxima vez que se abre |
| AGS (`ags/colors.scss`) | Al reiniciar la barra: `ags quit` (start-bar.sh la relanza) |

Esos tres archivos de colores **no se trackean**: cada máquina genera los suyos según sus wallpapers, y así no cambian en git cada vez que eliges otro.

`hypr/colors.conf` trae al final tres variantes con transparencia (`$lock_card`, `$lock_card_border`, `$lock_field`) que usa `hyprlock.conf`: hyprlang no puede aplicar alfa a una variable, así que las genera la propia plantilla (`templates/hypr-colors.conf`) y también están en `defaults/hypr-colors.conf`. Si cambias su transparencia, cámbiala en la plantilla y vuelve a elegir un wallpaper.

Lo que sí está en el repo es un tema por defecto para una máquina nueva: el wallpaper `~/Pictures/wallpapers/groot_1.jpg` y sus colores en `~/.config/matugen/defaults/`. `~/.config/matugen/apply-defaults.sh` copia esos colores **solo a los archivos que todavía no existen**, así que nunca pisa los de tu wallpaper actual. Sin ellos, Hyprland arranca con errores, Rofi no abre y la barra de AGS no compila. Lo llama `hypr/scripts/machine-setup.sh` (desde `install.sh` y al iniciar sesión). Al iniciar sesión, `hypr/scripts/restore-wallpaper.sh` además vuelve a poner el último wallpaper elegido (`~/.current_wallpaper`), o `groot_1.jpg` si todavía no elegiste ninguno.

Para cambiar el tema por defecto: elige el wallpaper con `Super + W`, agrégalo al repo (`Pictures/` está ignorado, por eso el `-f`) y copia sus colores a `defaults/`:

```bash
dotfiles add -f ~/Pictures/wallpapers/<nuevo-wallpaper>
cp ~/.config/hypr/colors.conf ~/.config/matugen/defaults/hypr-colors.conf
cp ~/.config/rofi/colors.rasi ~/.config/matugen/defaults/rofi-colors.rasi
cp ~/.config/ags/colors.scss  ~/.config/matugen/defaults/ags-colors.scss
```

Si cambias el nombre del wallpaper por defecto, actualiza también el fallback de `restore-wallpaper.sh`.

## Archivos

| Archivo | Qué hay |
|---|---|
| `config.toml` | Qué plantilla va a qué destino |
| `templates/` | Cómo se aplican los colores a Hyprland, Rofi y AGS |
| `defaults/` | Los colores de `groot_1.jpg`: el tema de una máquina nueva |
| `apply-defaults.sh` | Copia `defaults/` solo donde todavía no hay colores |
