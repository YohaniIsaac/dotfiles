# Dotfiles — Arch Linux + Hyprland

Setup personal con Hyprland, AGS (Astal/GTK4), Rofi, Matugen (Material You theming), Kitty y Neovim.

## Vista general

| Componente | Programa |
|---|---|
| WM | Hyprland |
| Barra | AGS v3 (Astal/GTK4). Waybar queda desactivada, como respaldo |
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

Elige el nombre que quieras para tu máquina (sin espacios ni caracteres especiales):

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

### 23. Generar caché de wallpapers (Matugen)

Agrega tus wallpapers a `~/Pictures/wallpapers/` y luego:

```bash
hypr-generate-colors-wallpapers
```

Esto pre-genera todas las combinaciones de color para el selector de wallpapers (`Super + W`).

---

### 24. Configurar monitores

Edita `~/.config/hypr/monitors.conf` según tu setup. Así está en este equipo:

```bash
# DP-1 (SAC LED MONITOR) - arriba izquierda
monitor = DP-1, 1920x1080@74.97, 0x0, 1

# HDMI-A-1 (ASUS VA27EHF) - arriba derecha
monitor = HDMI-A-1, 1920x1080@100.05, 1920x1080, 1

# eDP-1 (laptop) - abajo del DP-1
monitor = eDP-1, preferred, 3840x2160, 1.25
```

Con un solo monitor basta con:

```bash
monitor = , preferred, auto, 1
```

Cada monitor tiene su propio rango de workspaces (`workspace.conf`): DP-1 usa 1–10, HDMI-A-1 11–20 y eDP-1 21–30. Si cambian los conectores, actualiza también `workspace.conf` y los atajos `Super + F1/F2/F3` de `custom.conf`.

Identifica los nombres de tus monitores con:

```bash
hyprctl monitors
```

---

### 25. Kanata (scroll con el teclado)

Kanata necesita escribir en `/dev/uinput`, así que el usuario tiene que estar en los grupos `input` y `uinput`:

```bash
sudo groupadd -f -r uinput
echo 'KERNEL=="uinput", MODE="0660", GROUP="uinput", OPTIONS+="static_node=uinput"' | sudo tee /etc/udev/rules.d/99-input.rules
echo uinput | sudo tee /etc/modules-load.d/uinput.conf
sudo usermod -aG input,uinput $USER
```

Después habilita el servicio:

```bash
systemctl --user enable kanata.service
```

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
│   └── settings.json          # Configuración de Claude Code
├── .config/
│   ├── ags/                   # Barra (AGS v3 / Astal GTK4) + popup de Spotify
│   ├── dotfiles/              # Documentación, paquetes e instalación
│   │   ├── .claude/CLAUDE.md  # Contexto del escritorio para Claude Code
│   │   ├── README.md
│   │   ├── packages.txt       # Paquetes del sistema (pacman + AUR)
│   │   └── install.sh         # Instala packages.txt (ejecutar tras clonar)
│   ├── hypr/                  # Hyprland: monitores, ventanas, keybindings, autostart…
│   │   └── scripts/           # start-bar.sh, workspaces, wallpaper, volumen…
│   ├── kanata/                # Remapeo de teclado (Caps Lock + hjkl = scroll)
│   ├── kitty/                 # Terminal
│   ├── matugen/               # Templates de theming dinámico (Material You)
│   ├── nvim/                  # Neovim (submódulo git)
│   ├── ranger/                # File manager TUI
│   ├── rofi/                  # Launcher y temas
│   ├── systemd/user/          # kanata.service
│   ├── waybar/                # Barra anterior (desactivada); AGS usa su scripts/wlogout.sh
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
| Waybar (`waybar/colors.css`) | Al instante, si está corriendo |
| AGS (`ags/colors.scss`) | Al reiniciar la barra: `ags quit` (start-bar.sh la relanza) |

Los tres primeros se generan solos y están en `.gitignore`. `ags/colors.scss` sí se trackea porque sin él AGS no compila en un clon nuevo; por eso aparece modificado cada vez que cambias de wallpaper.

---

## Barra (AGS)

Una barra por monitor, arriba (`~/.config/ags/widget/bars/BottomBar.tsx`):

- **Izquierda:** workspaces del monitor
- **Centro:** reloj y Spotify (clic → popup del reproductor)
- **Derecha:** CPU/RAM/temperatura (clic → btop), volumen, red, batería, notificaciones y apagado (clic → wlogout, clic derecho → hyprlock)

Hyprland la lanza con `~/.config/hypr/scripts/start-bar.sh`, no con `ags run` directo. El script:

- espera a D-Bus y a pipewire/wireplumber (en frío, AGS arrancaba antes que el audio y moría);
- relanza la barra si se cae;
- evita instancias duplicadas con `flock`;
- deja el log en `~/.cache/ags-start.log`.

Para reiniciarla (por ejemplo, después de cambiar colores o código): `ags quit`.

> **Ojo al programar widgets:** nunca llames desde `createPoll`/`execAsync` a un comando que no termina (modo subscribe/follow/watch, como `swaync-client -swb`). Cada tick deja un proceso colgado, y al final se agotan los file descriptors del bus de sesión y se cierran todas las apps. El detalle está en el comentario de las notificaciones en `BottomBar.tsx`.

---

## Servicios systemd de usuario

| Servicio | Función |
|---|---|
| `kanata.service` | Remapeo de teclado (ver paso 25; necesita el grupo `uinput`) |

```bash
systemctl --user enable --now kanata.service
```

---

## Mantenimiento del repo

- **Repos públicos:** este repo y el de Neovim son públicos en GitHub. Nada de claves, tokens ni URLs privadas.
- **Ignore global:** `~/.gitignore_global` ignora `.claude/`, `*.md` y `*.txt` en todos los repos, así que los archivos nuevos de ese tipo no aparecen en `dotfiles status` y hay que agregarlos con `dotfiles add -f <ruta>`. Los ya trackeados se actualizan normal, salvo los que están dentro de un directorio `.claude/` (como `.claude/settings.json`): ahí `dotfiles add` avisa "paths are ignored" y sale con error aunque igual los agrega, así que conviene usar `dotfiles add -u -- <ruta>`.
- **Submódulo de Neovim:** los cambios se commitean dentro de `~/.config/nvim` y después se actualiza el puntero con `dotfiles add .config/nvim`. Al subir, primero `git -C ~/.config/nvim push` y después `dotfiles push`.
- **Cuidado con el work-tree:** es todo `$HOME`, así que nada de `dotfiles reset --hard`, `checkout .` ni `stash` sin revisar antes.
