# Dotfiles — Arch Linux + Hyprland

Setup personal con Hyprland, AGS (Astal/GTK4), Rofi, Matugen (Material You theming), Kitty y Neovim.

## Vista general

| Componente | Programa |
|---|---|
| WM | Hyprland |
| Barra | AGS v3 (Astal/GTK4) |
| Launcher | Rofi |
| Terminal | Kitty |
| Shell | Zsh + Starship |
| Editor | Neovim (submódulo) |
| Notificaciones | SwayNC |
| Bloqueo de pantalla | Hyprlock |
| Idle | Hypridle (apaga pantallas, sin auto-suspend) |
| Fondo de pantalla | awww |
| Temas dinámicos | Matugen (Material You) |
| Remapeo de teclado | Kanata |
| Display Manager | SDDM |

---

## Instalación de Arch Linux desde cero

### 1. Preparar el medio de instalación

Descarga la ISO desde [archlinux.org](https://archlinux.org/download/) y escríbela en un USB:

```bash
dd bs=4M if=archlinux-*.iso of=/dev/sdX status=progress oflag=sync
```

Arranca desde el USB. Si estás en UEFI, asegúrate de que el modo Secure Boot esté desactivado.

---

### 2. Conectarse a internet

Si estás en Wi-Fi, usa `iwctl`:

```bash
iwctl
device list
station wlan0 scan
station wlan0 get-networks
station wlan0 connect "SSID"
exit
```

Verifica la conexión:

```bash
ping -c 3 archlinux.org
```

---

### 3. Actualizar el reloj del sistema

```bash
timedatectl set-ntp true
```

---

### 4. Particionar el disco

Identifica el disco:

```bash
lsblk
```

Crea las particiones con `fdisk` (o `cfdisk` si prefieres ncurses):

```bash
fdisk /dev/nvme0n1   # o /dev/sda según tu disco
```

#### Esquema recomendado (UEFI + GPT)

| Partición | Tamaño | Tipo | Punto de montaje |
|---|---|---|---|
| `/dev/nvme0n1p1` | 512 MB | EFI System | `/boot/efi` |
| `/dev/nvme0n1p2` | 8–16 GB | Linux swap | `[SWAP]` |
| `/dev/nvme0n1p3` | Resto | Linux filesystem | `/` |

Comandos en `fdisk`:
1. `g` — crear tabla GPT
2. `n` → tamaño `+512M` → tipo `t` → `1` (EFI)
3. `n` → tamaño `+16G` → tipo `t` → `19` (swap)
4. `n` → resto del disco (Linux filesystem)
5. `w` → guardar

---

### 5. Formatear las particiones

```bash
mkfs.fat -F32 /dev/nvme0n1p1
mkswap /dev/nvme0n1p2
mkfs.ext4 /dev/nvme0n1p3
```

---

### 6. Montar las particiones

```bash
mount /dev/nvme0n1p3 /mnt
mkdir -p /mnt/boot/efi
mount /dev/nvme0n1p1 /mnt/boot/efi
swapon /dev/nvme0n1p2
```

---

### 7. Instalar el sistema base

```bash
pacstrap -K /mnt base base-devel linux linux-firmware linux-headers nano vim git
```

Agrega también el microcódigo de tu CPU: `intel-ucode` (Intel) o `amd-ucode` (AMD). GRUB lo carga solo al regenerar su config en el paso 14.

---

### 8. Generar fstab

```bash
genfstab -U /mnt >> /mnt/etc/fstab
cat /mnt/etc/fstab   # verificar
```

---

### 9. Entrar al nuevo sistema (chroot)

```bash
arch-chroot /mnt
```

---

### 10. Configurar zona horaria

```bash
ln -sf /usr/share/zoneinfo/America/Santiago /etc/localtime
hwclock --systohc
```

---

### 11. Configurar idioma y locale

```bash
nano /etc/locale.gen
```

Descomentar:
```
es_CL.UTF-8 UTF-8
en_US.UTF-8 UTF-8
```

```bash
locale-gen
echo "LANG=es_CL.UTF-8" > /etc/locale.conf
echo "KEYMAP=la-latin1" > /etc/vconsole.conf
```

---

### 12. Configurar hostname

Elige el nombre que quieras para tu máquina (sin espacios ni caracteres especiales). Los dotfiles usan el hostname para saber en qué máquina están (ver [Varias máquinas](#varias-máquinas)): la del trabajo es `yt-work` y la de la casa `yt-home`.

```bash
echo "tu-hostname" > /etc/hostname
```

Luego edita `/etc/hosts` usando **el mismo nombre** que elegiste:

```bash
nano /etc/hosts
```

```
127.0.0.1   localhost
::1         localhost
127.0.1.1   tu-hostname.localdomain tu-hostname
```

> **¿Por qué?** `/etc/hosts` es el DNS local de tu máquina. Sin esa entrada, tu equipo no puede resolver su propio nombre: herramientas de red, algunas apps y `sudo` en ciertos entornos buscan el hostname en un servidor DNS externo y fallan. Esta línea le dice al sistema "si alguien pregunta por ese nombre, soy yo mismo". El nombre en `/etc/hosts` **debe coincidir exactamente** con el que escribiste en `/etc/hostname`.

---

### 13. Configurar usuario y contraseñas

```bash
# Contraseña de root
passwd

# Crear usuario (con bash por ahora — zsh se instala y configura en el paso 19)
useradd -m -G wheel,audio,video,input,storage,optical -s /bin/bash yt
passwd yt

# Habilitar sudo para el grupo wheel
EDITOR=nano visudo
# Descomentar: %wheel ALL=(ALL:ALL) ALL
```

---

### 14. Instalar y configurar GRUB

```bash
pacman -S grub efibootmgr

grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=ARCH
grub-mkconfig -o /boot/grub/grub.cfg
```

---

### 15. Habilitar servicios esenciales

```bash
pacman -S networkmanager

systemctl enable NetworkManager
systemctl enable sddm
```

---

### 16. Salir y reiniciar

```bash
exit
umount -R /mnt
reboot
```

Retira el USB antes de que arranque.

---

## Post-instalación

Inicia sesión con tu usuario y conecta a internet desde NetworkManager:

```bash
nmtui
```

---

### 17. Instalar yay (AUR helper)

```bash
git clone https://aur.archlinux.org/yay.git
cd yay && makepkg -si
cd .. && rm -rf yay
```

---

### 18. Instalar todos los paquetes

Clona el dotfiles primero para tener el `packages.txt` (en `.config/dotfiles/`):

```bash
git clone --bare git@github.com:YohaniIsaac/dotfiles.git $HOME/.dotfiles
alias dotfiles='git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
dotfiles checkout
```

> Si hay conflictos por archivos existentes, muévelos:
> ```bash
> mkdir -p ~/.config-backup && dotfiles checkout 2>&1 | grep "^\s" | awk '{print $1}' | xargs -I{} mv ~/{} ~/.config-backup/{}
> dotfiles checkout
> ```

Un clon `--bare` no configura el fetch del remoto, así que `dotfiles status` nunca avisaría de commits sin pushear o sin bajar. Para arreglarlo:

```bash
dotfiles config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
dotfiles fetch origin
dotfiles branch --set-upstream-to=origin/main main
```

Instala los paquetes:

```bash
bash ~/.config/dotfiles/install.sh
```

Esto instala primero las fuentes (evita el prompt de proveedor `ttf-font`) y luego el resto de paquetes definidos en `packages.txt`, ignorando comentarios y líneas vacías.

---

### 19. Configurar el shell

```bash
chsh -s /usr/bin/zsh
```

---

### 20. Configurar SSH

Copia tus claves SSH o genera nuevas:

```bash
ssh-keygen -t ed25519 -C "tu@email.com" -f ~/.ssh/id_github
ssh-keygen -t ed25519 -C "tu@email.com" -f ~/.ssh/id_ed25519
```

Agrega las claves públicas a GitHub / Forgejo / servidores remotos.

---

### 21. Configurar Neovim

El config de Neovim se incluye como submódulo:

```bash
dotfiles submodule update --init --recursive
```

Abre Neovim para que instale los plugins y los Language Servers automáticamente:

```bash
nvim
```

Las dependencias de Neovim (Zathura, `python-pynvim`, `neovim-remote`) ya vienen en `packages.txt`. El detalle de plugins y atajos está en `~/.config/nvim/README.md`.

---

### 22. Habilitar servicios de audio y Bluetooth

```bash
systemctl --user enable --now pipewire pipewire-pulse
sudo systemctl enable --now bluetooth
```

---

### 23. Wallpapers y colores (Matugen)

El repo solo trae `~/Pictures/wallpapers/groot_1.jpg`. Copia el resto de tus wallpapers desde la otra máquina (no están en git porque pesan ~215 MB):

```bash
rsync -av otra-maquina:Pictures/wallpapers/ ~/Pictures/wallpapers/
```

No hace falta generar colores a mano: `install.sh` (paso 18) copia los colores por defecto, que son los de `groot_1.jpg` (ver [Theming](#theming-dinámico-con-matugen)). La primera sesión arranca con ese wallpaper y esos colores. Después eliges tu wallpaper con `Super + W` y Matugen genera los colores de esta máquina.

Para que el selector de wallpapers (`Super + W`) muestre los colores de cada imagen, pre-genera su caché:

```bash
hypr-generate-colors-wallpapers
```

---

### 24. Configurar monitores

Los monitores de cada máquina están en `~/.config/hypr/hosts/<hostname>.conf` (`yt-work.conf`, `yt-home.conf`). `install.sh` ya enlazó el de esta máquina como `~/.config/hypr/host.conf`. Identifica los nombres de tus monitores y ajusta ese archivo:

```bash
hyprctl monitors
```

Cada archivo define la disposición (`monitor = …`) y qué monitor cumple cada rol:

```bash
$mon1 = HDMI-A-1   # workspaces 1–10 y Super + F1
$mon2 = eDP-1      # workspaces 11–20 y Super + F2
$mon3 = none       # workspaces 21–30 y Super + F3 ("none" si no hay)
```

Para una máquina nueva, copia `hosts/default.conf` como `hosts/<hostname>.conf`, ajústalo y corre `~/.config/hypr/scripts/machine-setup.sh --force`. Detalles en [Varias máquinas](#varias-máquinas).

---

### 25. Kanata (scroll con el teclado)

Kanata lee los teclados y crea un teclado virtual en `/dev/uinput`, que por defecto solo puede usar root. Todo lo necesario está en `~/.config/kanata/`: la config (`scroll.kbd`), los archivos de sistema (`system/`) y un script que los instala:

```bash
bash ~/.config/kanata/setup.sh
```

El script copia `system/99-input.rules` a `/etc/udev/rules.d/` y `system/uinput.conf` a `/etc/modules-load.d/`, crea el grupo `uinput`, agrega tu usuario a `input` y `uinput`, y habilita `kanata.service`.

El servicio recién puede abrir `/dev/uinput` después de **reiniciar**. Cerrar sesión no alcanza si el user manager de systemd (`systemd --user`) sigue vivo, porque conserva los grupos con los que arrancó. Si no puedes reiniciar todavía, lánzalo a mano con el grupo nuevo. `sg` funciona apenas eres miembro, sin volver a entrar:

```bash
sg uinput -c "setsid -f kanata --cfg $HOME/.config/kanata/scroll.kbd >> $HOME/.cache/kanata-manual.log 2>&1 < /dev/null"
```

La salida va a un archivo a propósito: si kanata escribe en una terminal que ya se cerró (por ejemplo, al desconectarse un teclado Bluetooth), se cae. Después de reiniciar, el servicio toma el control solo.

La configuración está en `~/.config/kanata/scroll.kbd`: un toque corto de Caps Lock funciona normal, y mantenido + `h/j/k/l` hace scroll. Para cerrar kanata en una emergencia: `Ctrl izq + Espacio + Esc`.

---

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
| `Super + Shift + L` | Bloquear pantalla |
| `Super + Ctrl + Q` | Menú de salida (wlogout) |
| `Super + Ctrl + R` | Recargar Hyprland |
| `Super + Shift + A` | Activar/desactivar animaciones |
| `Print` / `Super + Print` | Captura completa / de región (en `~/Pictures/Screenshots/`) |
| `Super + Shift + rueda` / `Super + Shift + Z` | Zoom / restablecer zoom |
| Teclas multimedia | Volumen, brillo y reproducción (Spotify tiene prioridad) |
| `Caps Lock` mantenido + `h/j/k/l` | Scroll (Kanata) |

---

## Estructura del dotfiles

```
~
├── .claude/
│   ├── CLAUDE.md              # Reglas globales para Claude Code
│   ├── settings.json          # Configuración de Claude Code
│   └── claude-powerline.json  # Statusline de Claude Code (tema tokyo-night)
├── .config/
│   ├── ags/                   # Barra (AGS v3 / Astal GTK4) + popup de Spotify
│   ├── dotfiles/              # Documentación, paquetes e instalación
│   │   ├── .claude/CLAUDE.md  # Contexto del escritorio para Claude Code
│   │   ├── README.md
│   │   ├── packages.txt       # Paquetes del sistema (pacman + AUR)
│   │   └── install.sh         # Instala packages.txt (ejecutar tras clonar)
│   ├── hypr/                  # Hyprland: ventanas, keybindings, autostart…
│   │   ├── hosts/             # Monitores de cada máquina: yt-work, yt-home, default
│   │   ├── host.conf          # Symlink (no trackeado) al hosts/<hostname>.conf de esta máquina
│   │   └── scripts/           # machine-setup.sh, start-bar.sh, restore-wallpaper.sh, workspaces…
│   ├── kanata/                # Remapeo de teclado (Caps Lock + hjkl = scroll)
│   │   ├── scroll.kbd         # Config de kanata
│   │   ├── system/            # Regla udev y carga de uinput (van en /etc)
│   │   └── setup.sh           # Instala system/, grupos y servicio (paso 25)
│   ├── kitty/                 # Terminal
│   ├── matugen/               # Theming dinámico (Material You)
│   │   ├── templates/         # Cómo se aplican los colores a Hyprland, Rofi y AGS
│   │   ├── defaults/          # Colores de groot_1.jpg, el tema de una máquina nueva
│   │   └── apply-defaults.sh  # Copia defaults/ solo donde todavía no hay colores
│   ├── nvim/                  # Neovim (submódulo git)
│   ├── ranger/rc.conf         # File manager TUI (solo los cambios sobre el default)
│   ├── rofi/                  # Launcher y temas
│   ├── systemd/user/          # kanata.service
│   └── starship.toml          # Prompt de shell
├── .local/bin/
│   ├── hypr-generate-colors-wallpapers
│   └── joulescope             # Lanza la UI de Joulescope desde su venv
├── Pictures/wallpapers/       # Solo groot_1.jpg está en el repo; el resto se agrega a mano
├── .gitconfig
├── .gitignore                 # Qué NO se trackea desde $HOME
├── .gitignore_global          # Ignores globales de git (core.excludesFile)
├── .minirc.dfl                # Config por defecto de minicom
├── .ssh/config                # Solo la config, nunca las claves
└── .zshrc
```

---

## Theming dinámico con Matugen

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

Lo que sí está en el repo es un tema por defecto para una máquina nueva: el wallpaper `~/Pictures/wallpapers/groot_1.jpg` y sus colores en `~/.config/matugen/defaults/`. `~/.config/matugen/apply-defaults.sh` copia esos colores **solo a los archivos que todavía no existen**, así que nunca pisa los de tu wallpaper actual. Sin ellos, Hyprland arranca con errores, Rofi no abre y la barra de AGS no compila. Lo llama `hypr/scripts/machine-setup.sh` (desde `install.sh` y al iniciar sesión). Al iniciar sesión, `hypr/scripts/restore-wallpaper.sh` además vuelve a poner el último wallpaper elegido (`~/.current_wallpaper`), o `groot_1.jpg` si todavía no elegiste ninguno.

Para cambiar el tema por defecto: elige el wallpaper con `Super + W`, agrégalo al repo (`Pictures/` está ignorado, por eso el `-f`) y copia sus colores a `defaults/`:

```bash
dotfiles add -f ~/Pictures/wallpapers/<nuevo-wallpaper>
cp ~/.config/hypr/colors.conf ~/.config/matugen/defaults/hypr-colors.conf
cp ~/.config/rofi/colors.rasi ~/.config/matugen/defaults/rofi-colors.rasi
cp ~/.config/ags/colors.scss  ~/.config/matugen/defaults/ags-colors.scss
```

Si cambias el nombre del wallpaper por defecto, actualiza también el fallback de `restore-wallpaper.sh`.

---

## Barra (AGS)

Una barra por monitor, arriba (`~/.config/ags/widget/bars/BottomBar.tsx`):

- **Izquierda:** workspaces del monitor
- **Centro:** reloj y Spotify (clic → popup del reproductor)
- **Derecha:** CPU/RAM/temperatura (clic → btop), volumen (rueda = volumen general, clic → popup de audio), red, batería, notificaciones y apagado (clic → wlogout, clic derecho → hyprlock)

Hyprland la lanza con `~/.config/hypr/scripts/start-bar.sh`, no con `ags run` directo. El script:

- espera a D-Bus y a pipewire/wireplumber (en frío, AGS arrancaba antes que el audio y moría);
- relanza la barra si se cae;
- evita instancias duplicadas con `flock`;
- deja el log en `~/.cache/ags-start.log`.

Para reiniciarla (por ejemplo, después de cambiar colores o código): `ags quit`.

### Volumen y popup de audio

- **Rueda** sobre el módulo de volumen: sube o baja el volumen general de a 5 % (tope 100 %; subir también des-silencia). En el touchpad los deltas fraccionarios se acumulan hasta completar un paso.
- **Clic**: abre `widget/AudioPopup.tsx` bajo el módulo, en el monitor de esa barra. Trae:
  - el selector de salida: un clic deja el dispositivo como salida por defecto, igual que en pavucontrol, y WirePlumber lo recuerda;
  - el volumen general, con su botón de silencio;
  - un slider con silencio por cada aplicación que tenga un stream abierto (la lista se actualiza en vivo).
- Esc o clic afuera lo cierra. `ags toggle audio-popup` lo abre desde la terminal, en el monitor con foco.
- Todo sale de AstalWp por señales (`widget/audio.ts`), sin polling ni subprocesos. No hay ecualizador todavía: PipeWire no tiene EQ por aplicación, y uno global o por grupos de apps se haría con `filter-chain` (notas en `.config/dotfiles/.claude/CLAUDE.md`).

> **Ojo al programar widgets:** nunca llames desde `createPoll`/`execAsync` a un comando que no termina (modo subscribe/follow/watch, como `swaync-client -swb`). Cada tick deja un proceso colgado, y al final se agotan los file descriptors del bus de sesión y se cierran todas las apps. El detalle está en el comentario de las notificaciones en `BottomBar.tsx`.

---

## Servicios systemd de usuario

| Servicio | Función |
|---|---|
| `kanata.service` | Remapeo de teclado (lo habilita `~/.config/kanata/setup.sh`, ver paso 25) |

---

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

Siguiendo los pasos 18–25 queda todo lo que está en el repo. Esto no está en git y hay que traerlo o rehacerlo a mano:

| Qué | Cómo |
|---|---|
| Claves SSH (y GPG, si usas) | Copiarlas o generarlas de nuevo (paso 20) |
| Wallpapers (~215 MB) | `rsync` de `~/Pictures/wallpapers/` (paso 23) |
| Perfil de Brave | Brave Sync |
| Skill `scout` de Claude Code | Clonar `YohaniIsaac/scout-skills` en `~/personal-git/` y `ln -s ~/personal-git/scout-skills ~/.claude/skills/scout` |
| Repos personales y de trabajo | Clonarlos en `~/personal-git/` y `~/git/` |
| Reglas udev de herramientas embebidas (OpenOCD, J-Link, Joulescope) | Vienen con cada herramienta; se reinstalan con ella |

Y esto es **específico de esta laptop**. No lo copies tal cual; revísalo:

- **Parámetros del kernel** en `/etc/default/grub` (`i915.enable_psr=0 intel_idle.max_cstate=1 pcie_aspm=off nvme_core.default_ps_max_latency_us=0`) y `/etc/systemd/logind.conf.d/no-suspend.conf` (ignora cerrar la tapa). Son mitigaciones para los cuelgues de este hardware y gastan más batería. No están en el repo a propósito.
- **Suspensión desactivada** en `hypr/hypridle.conf`: aquí `systemctl suspend` cuelga en s2idle. En otra máquina puedes volver a activarla descomentando el bloque `listener` del final.
- **Monitores**: van en `hypr/hosts/<hostname>.conf` (paso 24 y [Varias máquinas](#varias-máquinas)).

---

## Mantenimiento del repo

- **Repos públicos:** este repo y el de Neovim son públicos en GitHub. Nada de claves, tokens ni URLs privadas.
- **Ignore global:** `~/.gitignore_global` ignora `.claude/`, `*.md` y `*.txt` en todos los repos, así que los archivos nuevos de ese tipo no aparecen en `dotfiles status` y hay que agregarlos con `dotfiles add -f <ruta>`. Los ya trackeados se actualizan normal, salvo los que están dentro de un directorio `.claude/` (como `.claude/settings.json`): ahí `dotfiles add` avisa "paths are ignored" y sale con error aunque igual los agrega, así que conviene usar `dotfiles add -u -- <ruta>`.
- **Submódulo de Neovim:** los cambios se commitean dentro de `~/.config/nvim` y después se actualiza el puntero con `dotfiles add .config/nvim`. Al subir, primero `git -C ~/.config/nvim push` y después `dotfiles push`.
- **Cuidado con el work-tree:** es todo `$HOME`, así que nada de `dotfiles reset --hard`, `checkout .` ni `stash` sin revisar antes.
