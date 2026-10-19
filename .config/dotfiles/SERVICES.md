# Servicios habilitados

Parte de los [dotfiles](../../.github/README.md).

Todo lo que arranca solo en esta config, para saber qué apagar en una máquina que no lo necesite. "En git" dice si la unidad viaja con el repo (las de `~/.config/systemd/user/` sí, salvo los enlaces `*.wants/` que crea `systemctl enable` y lo propio de esta máquina) o hay que crearla a mano. Ver lo activo: `systemctl --user list-unit-files --state=enabled` y `systemctl list-unit-files --state=enabled`.

## systemd de usuario (`systemctl --user …`)

| Servicio | Función | En git | Lo habilita | Para deshabilitarlo |
|---|---|---|---|---|
| `kanata.service` | Remapeo de teclado (scroll con el teclado) | Sí | `~/.config/kanata/setup.sh` ([paso 25](INSTALL.md#25-kanata-scroll-con-el-teclado)) | `systemctl --user disable --now kanata` |
| `pipewire`, `pipewire-pulse` (+ sus `.socket`), `wireplumber` | Audio | Vienen con los paquetes | [Paso 22](INSTALL.md#22-habilitar-servicios-de-audio-y-bluetooth) | `systemctl --user disable --now pipewire pipewire-pulse wireplumber` (la barra y su popup de audio dejan de funcionar) |
| `adb.service` | Servidor `adb` único y vigilado, compartido por terminal, scrcpy y Android Studio (rechaza `adb kill-server`). Reconecta el celular por Wi-Fi al arrancar | Sí. Solo corre si existe `~/Android/Sdk/platform-tools/adb`; la IP del celular va en `~/.config/adb/device.conf` (`ADB_DEVICE=<ip>:5555`), local y fuera de git | A mano: `systemctl --user enable --now adb` | `systemctl --user disable --now adb` |
| `forgejo-runner-cache-wipe.timer` | Borra cada domingo 03:00 la caché del runner local de Forgejo | **No**; hoy está **deshabilitado** | — | — |
| `p11-kit-server.socket` | Servidor PKCS#11 (preset de Arch) | Viene con el paquete | — | `systemctl --user disable p11-kit-server.socket` |

## systemd del sistema (`sudo systemctl …`)

| Servicio | Función | Lo habilita | Para deshabilitarlo |
|---|---|---|---|
| `NetworkManager` (+ `-dispatcher`, `-wait-online`) | Red (Wi-Fi/Ethernet); la barra y su popup de red lo usan | [Paso 15](INSTALL.md#15-habilitar-servicios-esenciales) | Solo si usas otro gestor de red |
| `sddm` | Pantalla de inicio de sesión | [Paso 15](INSTALL.md#15-habilitar-servicios-esenciales) | `sudo systemctl disable sddm` (entras por TTY y lanzas `Hyprland` a mano) |
| `bluetooth` | Bluetooth | [Paso 22](INSTALL.md#22-habilitar-servicios-de-audio-y-bluetooth) | `sudo systemctl disable --now bluetooth` |
| `systemd-timesyncd` | Hora por red (`timedatectl set-ntp true`, [paso 3](INSTALL.md#3-actualizar-el-reloj-del-sistema)) | Preset | `sudo systemctl disable --now systemd-timesyncd` |

## Procesos que lanza Hyprland (no son servicios)

Están en `~/.config/hypr/autostart.conf` como `exec-once`; para apagar uno, comenta su línea.

| Proceso | Función |
|---|---|
| `scripts/machine-setup.sh` | Crea lo propio de la máquina que no está en git (`host.conf`, colores por defecto) |
| `scripts/restore-wallpaper.sh` | Arranca `awww` y pone el último fondo |
| `swaync` | Notificaciones |
| `polkit-gnome-authentication-agent-1` | Ventana de contraseña para acciones con privilegios |
| `hypridle` | Apaga pantallas por inactividad y bloquea (sin auto-suspend) |
| `scripts/lock-dim.sh restore - 20` | Devuelve el brillo guardado si el equipo se apagó con la sesión bloqueada |
| `scripts/start-bar.sh` | Barra AGS (la relanza si cae) |
| `wl-paste --watch cliphist store` | Historial del portapapeles |
| `scripts/init-workspaces.sh` | Reparte los workspaces entre los monitores |
