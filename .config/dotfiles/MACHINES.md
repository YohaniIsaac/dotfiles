# Varias máquinas y llevar la config a otra máquina

Cómo una sola config sirve para varias laptops, y qué hay que traer o revisar al llevarla a otra. Parte de los [dotfiles](../../.github/README.md).

## Varias máquinas

Una sola config y un solo repo para todas las laptops. La llave es el **hostname** (`yt-work`, `yt-home`), no el usuario: el usuario es `yt` en todas, así `$HOME` y las rutas son iguales. Se resuelve con dos técnicas, de la más a la menos preferida:

**1. Detectar en vez de suponer**, sin saber en qué máquina estás:

- `.zshrc` agrega cada herramienta solo si existe: el JDK más nuevo que bajó Gradle, `bossac` del Zephyr SDK instalado, `/opt/ba2-toolchain`, opencode y opam.
- La barra busca el sensor de temperatura por nombre (`coretemp` en Intel, `k10temp`/`zenpower` en AMD).
- El dashboard de Neovim solo muestra los proyectos que existen en esa máquina.
- Rutas relativas o con `~`, nunca `/home/yt/…`.

**2. Un archivo por máquina** para lo que no se puede detectar: los monitores. `~/.config/hypr/hosts/<hostname>.conf` define la disposición y los roles `$mon1/$mon2/$mon3`. `workspace.conf` y los atajos F1–F3 usan esas variables, y `workspace-nav.sh`, `init-workspaces.sh`, `toggle-main-monitors.sh` y la barra le preguntan a Hyprland qué bloque de workspaces tiene cada monitor (`hyprctl workspacerules -j`, en `hypr/scripts/lib-monitors.sh`). No hay nombres de monitor escritos a mano fuera de `hosts/`.

`~/.config/hypr/scripts/machine-setup.sh` enlaza `hosts/<hostname>.conf` como `hypr/host.conf` (o `hosts/default.conf` si esa máquina todavía no tiene archivo) y pone los colores por defecto de Matugen. Solo crea lo que falta; lo llaman `install.sh` y el autostart. Si cambias el hostname o creas el archivo de una máquina: `machine-setup.sh --force`.

**Identidad de git:** la global (`~/.gitconfig`) es la de Innovex, en todas las máquinas. En cada repo personal se configura a mano:

```bash
git config user.name YohaniIsaac
git config user.email yohani.tripai.yt@gmail.com
```

**Agregar una máquina nueva:**

```bash
sudo hostnamectl set-hostname yt-home    # y cambia el nombre en /etc/hosts (paso 12)
cp ~/.config/hypr/hosts/default.conf ~/.config/hypr/hosts/yt-home.conf   # si no existe
nvim ~/.config/hypr/hosts/yt-home.conf   # monitores según `hyprctl monitors`
~/.config/hypr/scripts/machine-setup.sh --force
dotfiles add .config/hypr/hosts/yt-home.conf && dotfiles commit -m "hypr: monitores de yt-home"
```

> Cambia el hostname justo antes de reiniciar. Brave, Discord y Spotify guardan el hostname en el lock de su perfil (`SingletonLock` → `arch-<pid>`). Si cambia con ellas abiertas, al abrir un link o relanzarlas creen que el perfil está en uso "en otro computador" hasta que las cierres y las vuelvas a abrir.

---

## Llevar esta config a otra máquina

Siguiendo los pasos 18–25 de la [guía de instalación](INSTALL.md#post-instalación) queda todo lo que está en el repo. Esto no está en git y hay que traerlo o rehacerlo a mano:

| Qué | Cómo |
|---|---|
| Claves SSH (y GPG, si usas) | Copiarlas o generarlas de nuevo (paso 20) |
| Wallpapers (~215 MB) | `rsync` de `~/Pictures/wallpapers/` (paso 23) |
| Perfil de Brave | Brave Sync |
| Navegador por defecto (los enlaces que abren Discord, Spotify o la terminal) | `xdg-settings set default-web-browser brave-browser.desktop`. `~/.config/mimeapps.list` no va a git: los programas lo reescriben (Brave, `xdg-settings`, el instalador de Claude Code) |
| Avatar de la pantalla de bloqueo | Copiar la foto como `~/.face` (sin ella se ve un icono) |
| Fuentes Josefin Sans y Oxygen Mono (presets de la pantalla de bloqueo) | `~/.config/hypr/scripts/lock-font.sh install` (las baja de Google Fonts). Sin Josefin Sans el bloqueo usa `jetbrains` |
| Ciudad del clima del bloqueo | Crear `~/.config/hypr/weather.conf` a mano (`LOCATION=…`, `COUNTRY=…`; ver [Pantalla de bloqueo](../hypr/LOCKSCREEN.md)). Es local, no está en git |
| Celular para `adb.service` y `cel` | Crear `~/.config/adb/device.conf` a mano con `ADB_DEVICE=<ip>:5555` (ver [Servicios habilitados](SERVICES.md)). Es local, no está en git. Sin él, el servicio levanta `adb` y no reconecta nada, y `cel` usa el único celular conectado por cable. La IP cambia con la red: se edita ahí |
| `cel` (celular con el táctil roto, por scrcpy) | Instalar `scrcpy`, `clang` y `lld` (están comentados en `packages.txt`). La primera vez, con el cable: `adb tcpip 5555` y aceptar la llave RSA en el celular (`~/.android/` no va a git). `cel` compila `touchgrab` y copia el vigilante al celular solo. Paso a paso en el [README de `cel`](../../.local/share/cel/README.md) |
| Skill `scout` de Claude Code | Clonar `YohaniIsaac/scout-skills` en `~/personal-git/` y `ln -s ~/personal-git/scout-skills ~/.claude/skills/scout` |
| Repos personales y de trabajo | Clonarlos en `~/personal-git/` y `~/git/` |
| Reglas udev de herramientas embebidas (OpenOCD, J-Link, Joulescope) | Vienen con cada herramienta; se reinstalan con ella |
| Entorno de Python del Joulescope (`~/.local/bin/joulescope` lo lanza desde `~/.venv/joulescope`) | `python -m venv ~/.venv/joulescope && ~/.venv/joulescope/bin/pip install joulescope_ui` (aquí: 1.4.2). Los `.venv/` no van a git |

Y esto es **específico de esta laptop**. No lo copies tal cual; revísalo:

- **Parámetros del kernel** en `/etc/default/grub` (`i915.enable_psr=0 intel_idle.max_cstate=1 pcie_aspm=off nvme_core.default_ps_max_latency_us=0`) y `/etc/systemd/logind.conf.d/no-suspend.conf` (ignora cerrar la tapa). Son mitigaciones para los cuelgues de este hardware y gastan más batería. No están en el repo a propósito.
- **Suspensión desactivada** en `hypr/hypridle.conf`: aquí `systemctl suspend` cuelga en s2idle. En otra máquina puedes volver a activarla descomentando el bloque `listener` del final.
- **Monitores**: van en `hypr/hosts/<hostname>.conf` (paso 24 y [Varias máquinas](#varias-máquinas)).
