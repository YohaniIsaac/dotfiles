# Dotfiles – Contexto para Claude Code

Escritorio Arch Linux + Hyprland. La guía de instalación y el detalle de cada componente están en `../README.md`. Este archivo resume lo que conviene saber antes de tocar la config.

## Repo

- Repo bare en `~/.dotfiles` con work-tree `$HOME`:
  `alias dotfiles='git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'`
- **Los dos repos son públicos**: `YohaniIsaac/dotfiles` y el submódulo `YohaniIsaac/nvim` (`~/.config/nvim`). Revisar que no haya secretos antes de trackear algo.
- `~/.gitignore_global` ignora `.claude/`, `*.md` y `*.txt` en todos los repos: los archivos nuevos de ese tipo no salen en `dotfiles status` y se agregan con `dotfiles add -f`. Los ya trackeados se actualizan con `add` normal, salvo los que están dentro de un directorio `.claude/` (este CLAUDE.md, `~/.claude/*`): ahí `add` sale con código 1 aunque igual los stagea, y en una cadena con `&&` el archivo se cuela en el commit siguiente. Usar `dotfiles add -u -- <ruta>`.
- Orden de push: primero `~/.config/nvim` y después dotfiles. Si no, el puntero del submódulo apunta a un commit que no existe en GitHub.
- El repo bare no tiene fetch refspec: `origin/main` no se actualiza y `dotfiles status` no avisa de commits sin pushear. Para ver lo pendiente: `dotfiles fetch origin && dotfiles log FETCH_HEAD..main`.
- El work-tree es `$HOME`: nunca `reset --hard`, `checkout .` ni `stash` a ciegas. Para rehacer commits locales, `reset --soft` y `reset` (mixed) no tocan archivos.

## Monitores

| Monitor      | Conector | Modo              | Posición         | Workspaces       |
|--------------|----------|-------------------|------------------|------------------|
| SAC LED      | DP-1     | 1920×1080 @75 Hz  | arriba izquierda | 1–10 (principal) |
| ASUS VA27EHF | HDMI-A-1 | 1920×1080 @100 Hz | arriba derecha   | 11–20            |
| Laptop       | eDP-1    | preferred @1.25x  | abajo            | 21–30            |

`Super+1..0` va al workspace N *del monitor activo* (`hypr/scripts/workspace-nav.sh`). `Super+F1/F2/F3` enfoca SAC / ASUS / laptop.

## Barra (AGS v3 / Astal GTK4)

- Una sola barra por monitor, anclada arriba, en `widget/bars/BottomBar.tsx` (el nombre quedó de cuando estaba abajo):
  - Izquierda: workspaces del monitor.
  - Centro: reloj y Spotify (click → popup `media-popup` de `widget/MediaPlayer.tsx`).
  - Derecha: CPU/RAM/temperatura (click → `btop`; lee `/sys/class/hwmon/hwmon4`, que en esta laptop es `coretemp`), volumen, red, batería, notificaciones (swaync) y botón de apagado (click → `hypr/scripts/wlogout.sh`, click derecho → hyprlock).
- `widget/mpris.ts`: estado compartido de Spotify/MPRIS. `app.ts` registra el popup y crea una barra por monitor. Los prototipos viejos (`Bar.tsx`, `ClockBar.tsx`, `WorkspaceBar.tsx`, `SystemBar.tsx`) se borraron el 2026-09-29.
- Estilos: `style.scss` importa `_bar.scss` y `_mediaplayer.scss`. Los mixins están en `_shared.scss`. `colors.scss` lo genera Matugen, pero se trackea para que AGS compile en un clon nuevo.
- Librerías: AstalHyprland, AstalWp, AstalNetwork, AstalBattery y AstalMpris (paquetes `libastal-*-git`). La reactividad usa `gnim` (`createPoll`, `createExternal`, `.as()`).

### Arranque y reinicio

- `hypr/autostart.conf` lanza `~/.config/hypr/scripts/start-bar.sh`, nunca `ags run` directo. El script:
  - espera D-Bus y pipewire/wireplumber;
  - relanza AGS si muere;
  - usa `flock` para no duplicar instancias;
  - desactiva core dumps y fija `GSK_RENDERER=cairo`.
- Log: `~/.cache/ags-start.log` (se trunca en cada lanzamiento).
- Reiniciar la barra: `ags quit` (el loop la relanza en ~2 s). Si queda un `gjs` huérfano con el código viejo, hay que matarlo también.
- Colores nuevos de Matugen: la barra los toma al reiniciarse. El `post_hook` de AGS en `matugen/config.toml` está desactivado para no crear una segunda instancia.
- Compilar sin tocar la barra en vivo: `ags bundle ~/.config/ags/app.ts /tmp/ags-check.js`.

### Regla dura: nada de subscribe dentro de un poll

Nunca invocar comandos en modo subscribe/follow/watch (`swaync-client -swb`, `tail -f`, `pactl subscribe`…) desde `createPoll` o `execAsync`. Cada tick deja un proceso colgado con sus fds y su conexión a D-Bus. El 2026-07-28 esto agotó los fds de `dbus-broker` y cerró todas las apps.

Antes de meter un comando en un poll, verificar que termine: `timeout 5 <cmd>; echo $?`. Si el estado se usa en varios monitores, dejarlo a nivel de módulo (un solo poll compartido).

## Theming (Matugen)

`Super+W` → `hypr/scripts/wallpaperSelect.sh`: elige el wallpaper, el color base y el esquema. Después `matugen` rellena los templates de `~/.config/matugen/templates/`:
- `hypr/colors.conf` (+ `hyprctl reload`) y `rofi/colors.rasi`: generados e ignorados por git. En una instalación nueva hay que generarlos una vez (README, paso 23), o Hyprland arranca con errores y Rofi no abre.
- `ags/colors.scss`: generado, pero trackeado (ver arriba).
- `wallpaperSelect.sh` deja `~/.current_wallpaper` apuntando al elegido, y al iniciar sesión `hypr/scripts/restore-wallpaper.sh` lo vuelve a poner (o `groot_1.jpg`, que está en el repo). Ojo: `awww-daemon` no termina, así que nunca encadenar `awww-daemon && …`.

## Otros componentes

- **Kanata** (`kanata.service` de usuario, habilitado): remapeo de teclas, hoy Caps Lock mantenido + hjkl = scroll. Todo vive en `~/.config/kanata/`: `scroll.kbd`, `system/` (copias de `/etc/udev/rules.d/99-input.rules` y `/etc/modules-load.d/uinput.conf`) y `setup.sh`, que instala eso en una máquina nueva. El usuario ya está en `uinput` en `/etc/group`, pero el user manager de systemd arrancó antes de agregarlo: el servicio recién funciona tras reiniciar. Hasta entonces se lanza a mano con `sg uinput` (README, paso 25), con log en `~/.cache/kanata-manual.log`. Salida de emergencia: `Ctrl izq + Espacio + Esc`.
- **Hypridle**: sin auto-suspend. `systemctl suspend` cuelga en s2idle y nunca resume en este equipo.
- **Apagones en idle**: el problema es de i915/firmware, mitigado con parámetros del kernel en `/etc/default/grub` (NVMe APST, cstate, PSR, ASPM) y microcode. El lid switch se ignora en `/etc/systemd/logind.conf.d/no-suspend.conf`. Todo eso es de esta laptop y queda fuera del repo a propósito. AGS y waybar ya quedaron descartados como causa.
- **Waybar**: eliminada el 2026-09-29 (config, scripts, template de Matugen y paquete). `wlogout.sh` se movió a `hypr/scripts/`.
- **Calendario**: el popup de AGS, khal y el sync con Google Calendar se eliminaron el 2026-09-29. Quedan en el historial de git por si se retoma con otro enfoque.
- **Otra máquina**: el README tiene una sección "Llevar esta config a otra máquina" con lo que no está en git y lo que es específico de esta laptop.

## Comandos útiles

```bash
# Estado de la barra
pgrep -af 'start-bar.sh|ags run|gjs'
tail -n 50 ~/.cache/ags-start.log
hyprctl layers | grep -A3 Monitor

# Workspace activo por monitor
hyprctl monitors -j | jq '.[] | {name, ws: .activeWorkspace.id}'

# Volumen y batería
wpctl get-volume @DEFAULT_AUDIO_SINK@
cat /sys/class/power_supply/BAT0/{capacity,status}

# Caps Lock trabado en otro teclado (Hyprland hace OR de los locks al cambiar foco)
hyprctl devices -j | jq '.keyboards[] | {name, capsLock, main}'
```
