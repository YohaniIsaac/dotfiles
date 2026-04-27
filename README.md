# Dotfiles — Arch Linux + Hyprland

Setup personal con Hyprland, Waybar, Rofi, Matugen (Material You theming), Kitty y Neovim.

## Vista general

| Componente | Programa |
|---|---|
| WM | Hyprland |
| Bar | Waybar |
| Launcher | Rofi |
| Terminal | Kitty |
| Shell | Zsh + Starship |
| Editor | Neovim |
| Notificaciones | SwayNC |
| Bloqueo de pantalla | Hyprlock |
| Idle | Hypridle |
| Fondo de pantalla | awww |
| Temas dinámicos | Matugen (Material You) |
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

```bash
echo "archlinux" > /etc/hostname
```

Editar `/etc/hosts`:

```
127.0.0.1   localhost
::1         localhost
127.0.1.1   archlinux.localdomain archlinux
```

---

### 13. Configurar usuario y contraseñas

```bash
# Contraseña de root
passwd

# Crear usuario
useradd -m -G wheel,audio,video,input,storage,optical -s /bin/zsh yt
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

Clona el dotfiles primero para tener el `packages.txt`:

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

Instala los paquetes:

```bash
yay -S --needed - < ~/packages.txt
```

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

Abre Neovim para que instale los plugins automáticamente:

```bash
nvim
```

---

### 22. Habilitar servicios de audio y Bluetooth

```bash
systemctl --user enable --now pipewire pipewire-pulse
sudo systemctl enable --now bluetooth
```

---

### 23. Configurar SDDM

```bash
sudo systemctl enable sddm
```

Para cambiar el tema, edita `/etc/sddm.conf` o usa `sddm-kcm` si lo tienes instalado.

---

### 24. Generar caché de wallpapers (Matugen)

Agrega tus wallpapers a `~/Pictures/wallpapers/` y luego:

```bash
hypr-generate-colors-wallpapers
```

Esto pre-genera todas las combinaciones de color para el selector de wallpapers (`Super + W`).

---

### 25. Configurar monitores

Edita `~/.config/hypr/monitors.conf` según tu setup:

```bash
# Un solo monitor
monitor = , preferred, auto, 1

# Dual monitor (como este config)
monitor = HDMI-A-1, 1920x1080@74.97, 0x0, 1
monitor = eDP-1, preferred, 1920x1080, 1.25
```

Identifica los nombres de tus monitores con:

```bash
hyprctl monitors
```

---

## Atajos de teclado principales

| Tecla | Acción |
|---|---|
| `Super + Enter` | Abrir terminal (Kitty) |
| `Super + D` | Lanzador (Rofi) |
| `Super + B` | Brave Browser |
| `Super + E` | Explorador de archivos (Thunar) |
| `Super + W` | Selector de wallpaper |
| `Super + Q` | Cerrar ventana |
| `Super + F` | Pantalla completa |
| `Super + T` | Flotante |
| `Super + L` | Bloquear pantalla |
| `Super + Ctrl + Q` | Menú de salida |
| `Super + V` | Historial del portapapeles |
| `Super + Tab` | Cambiar monitor |
| `Super + 1–9` | Cambiar workspace |
| `Super + Shift + 1–9` | Mover ventana a workspace |
| `Print` | Captura de pantalla completa |
| `Super + Print` | Captura de región |

---

## Estructura del dotfiles

```
~
├── .config/
│   ├── hypr/          # Hyprland: ventanas, animaciones, keybindings, etc.
│   ├── waybar/        # Barra de estado
│   ├── rofi/          # Launcher y temas
│   ├── kitty/         # Terminal
│   ├── nvim/          # Neovim (submódulo git)
│   ├── ranger/        # File manager TUI
│   ├── matugen/       # Templates para theming dinámico
│   └── starship.toml  # Prompt de shell
├── .local/bin/
│   └── hypr-generate-colors-wallpapers
├── .gitconfig
├── .ssh/config
├── .zshrc
└── packages.txt
```

---

## Theming dinámico con Matugen

El sistema usa [Matugen](https://github.com/InioX/matugen) para generar colores Material You a partir del wallpaper. Al seleccionar un wallpaper con `Super + W`:

1. Escoge el wallpaper
2. Elige el color base (de 6 opciones extraídas de la imagen)
3. Elige el esquema de color (Tonal Spot, Vibrant, Expressive, etc.)

Los colores se aplican automáticamente a Hyprland, Waybar y Rofi mediante templates en `~/.config/matugen/templates/`.
