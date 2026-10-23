# Hyprland

El compositor y lo que gira a su alrededor: atajos, reposo, pantalla de bloqueo y los monitores de cada máquina. Parte de los [dotfiles](../../.github/README.md).

## Archivos

`hyprland.conf` solo hace `source` de los demás archivos de `~/.config/hypr/`:

| Archivo | Qué hay |
|---|---|
| `host.conf` | Enlace (**no trackeado**) a `hosts/<hostname>.conf`: la disposición de los monitores de esta máquina y sus roles `$mon1/$mon2/$mon3`. Lo crea `scripts/machine-setup.sh` |
| `hosts/` | Un archivo por máquina (`yt-work.conf`, `yt-home.conf`) y `default.conf`. Ver [Varias máquinas](../dotfiles/MACHINES.md#varias-máquinas) |
| `colors.conf` | Colores de Matugen: se genera en cada máquina y **no se trackea** ([Matugen](../matugen/README.md)) |
| `autostart.conf` | Lo que se lanza al iniciar sesión (`exec-once`): [la lista](../dotfiles/SERVICES.md#procesos-que-lanza-hyprland-no-son-servicios) |
| `keybindings.conf` | Los atajos de teclado (abajo) |
| `workspace.conf` | Los workspaces 1–30 repartidos entre los monitores según los roles de `host.conf` |
| `window.conf`, `decoration.conf`, `layout.conf`, `animation.conf`, `windowrules.conf` | Bordes y espacios, decoración (esquinas, sombra y blur), layout (dwindle y master), animaciones y reglas de ventanas |
| `keyboard.conf`, `cursor.conf`, `environment.conf`, `misc.conf`, `custom.conf` | Teclado (`latam`), cursor, variables de entorno, opciones varias y ajustes propios |
| `hypridle.conf` | Reposo (abajo) |
| `hyprlock.conf`, `lock-fonts/` | Pantalla de bloqueo: [LOCKSCREEN.md](LOCKSCREEN.md) |
| `scripts/` | Los scripts (abajo) |

## Scripts

| Script | Qué hace |
|---|---|
| `machine-setup.sh` | Prepara lo propio de cada máquina que no está en git (el enlace `host.conf` y los colores por defecto de Matugen). Lo llaman `install.sh` y el autostart; `--force` vuelve a elegir |
| `start-bar.sh` | Lanza la barra de AGS de forma segura al iniciar sesión ([Barra](../ags/README.md)) |
| `lock.sh`, `lock-info.sh`, `lock-dim.sh`, `lock-font.sh` | Pantalla de bloqueo: bloqueo sin zombis, sus datos, el brillo y las tipografías ([LOCKSCREEN.md](LOCKSCREEN.md)) |
| `restore-wallpaper.sh` | Arranca `awww` y pone el último wallpaper elegido |
| `wallpaperSelect.sh`, `color-swatch.py` | El selector de wallpaper y colores con Matugen (`Super + W`) |
| `init-workspaces.sh`, `workspace-nav.sh`, `toggle-main-monitors.sh`, `focus-within-monitor.sh`, `lib-monitors.sh` | Workspaces y foco independientes por monitor (`lib-monitors.sh` les dice qué bloque de workspaces tiene cada monitor) |
| `keybindings.sh` | Muestra la lista de atajos (`Super + /`) |
| `toggle-animations.sh` | Activa o desactiva las animaciones (`Super + Shift + A`) |
| `wlogout.sh` | El menú de salida, centrado en el monitor con foco |

## Atajos de teclado principales

`Super + /` muestra la lista completa de atajos.

### Aplicaciones

| Tecla | Acción |
|---|---|
| `Super + Enter` | Terminal (Kitty) |
| `Super + D` | Lanzador (Rofi) |
| `Super + B` | Brave |
| `Super + E` | Explorador de archivos (Thunar) |
| `Super + W` | Selector de wallpaper y colores |
| `Super + V` | Historial del portapapeles |
| `Ctrl + Tab` | Selector de ventanas (wofi) |

### Ventanas

| Tecla | Acción |
|---|---|
| `Super + Q` | Cerrar ventana |
| `Super + Shift + Q` | Matar el proceso de la ventana |
| `Super + F` / `Super + M` | Pantalla completa / maximizar |
| `Super + T` | Alternar flotante |
| `Super + Shift + T` | Todo el workspace flotante |
| `Super + h/j/k/l` | Mover el foco (sin salir del monitor) |
| `Super + Alt + h/j/k/l` | Intercambiar ventanas |
| `Super + Ctrl + h/j/k/l` | Redimensionar |
| `Super + Shift + J` / `Super + Shift + K` | Cambiar la orientación del split / intercambiar el split |
| `Super + arrastrar` (clic izq. / der.) | Mover / redimensionar |
| `Alt + Tab` | Ciclar ventanas |

### Workspaces y monitores

| Tecla | Acción |
|---|---|
| `Super + 1–0` | Workspace 1–10 del monitor activo |
| `Super + Shift + 1–0` | Mover ventana a ese workspace |
| `Super + Tab` | Alternar el foco entre DP-1 y HDMI-A-1 |
| `Super + F1 / F2 / F3` | Enfocar SAC / ASUS / laptop |
| `Super + Shift + F1 / F2 / F3` | Mover ventana a ese monitor |
| `Super + Ctrl + W` | Reparar workspaces (si quedaron en el monitor equivocado) |

### Sistema

| Tecla | Acción |
|---|---|
| `Super + Shift + L` | Bloquear pantalla (`hypr/scripts/lock.sh`, ver [Pantalla de bloqueo](LOCKSCREEN.md)) |
| `Super + Ctrl + Q` | Menú de salida (wlogout) |
| `Super + Ctrl + R` | Recargar Hyprland |
| `Super + Shift + A` | Activar/desactivar animaciones |
| `Print` / `Super + Print` | Captura completa / de región (en `~/Pictures/Screenshots/`, que el atajo crea si falta) |
| `Super + Shift + rueda` / `Super + Shift + Z` | Zoom / restablecer zoom |
| Teclas multimedia | Volumen, brillo y reproducción (Spotify tiene prioridad) |
| `Caps Lock` mantenido + `h/j/k/l` | Scroll (Kanata) |

## Reposo y bloqueo

Hypridle (`hypridle.conf`) bloquea la sesión a los 15 minutos sin uso (`loginctl lock-session`, que llega a `scripts/lock.sh`), apaga las pantallas a los 30 (`dpms off`; al volver las enciende) y **no suspende**: aquí `systemctl suspend` cuelga en s2idle (el bloque `listener` del final, comentado, es para volver a activarlo en otra máquina). Hypridle no recarga solo su config: `pkill -x hypridle; hyprctl dispatch exec hypridle`. El bloqueo en sí: [LOCKSCREEN.md](LOCKSCREEN.md).

## Monitores y workspaces

Cada máquina define sus monitores en `hosts/<hostname>.conf` y qué monitor cumple cada rol; cómo configurarlos y cómo agregar una máquina nueva: [paso 24 de la instalación](../dotfiles/INSTALL.md#24-configurar-monitores) y [Varias máquinas](../dotfiles/MACHINES.md#varias-máquinas). `Super + 1–0` va al workspace N del monitor activo (`scripts/workspace-nav.sh`).
