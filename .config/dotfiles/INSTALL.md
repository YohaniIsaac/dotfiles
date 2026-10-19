# Instalación de Arch Linux desde cero

Guía completa, de la ISO al escritorio funcionando. Los pasos 1–16 se hacen desde el USB de instalación; del 17 en adelante, ya en el sistema nuevo. Si solo quieres poner estos dotfiles en un Arch que ya tienes, empieza en el [paso 18](#18-instalar-todos-los-paquetes).

El índice de todo el repo está en el [README principal](../../.github/README.md).

## Instalación del sistema (desde el USB)

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

Elige el nombre que quieras para tu máquina (sin espacios ni caracteres especiales). Los dotfiles usan el hostname para saber en qué máquina están (ver [Varias máquinas](MACHINES.md#varias-máquinas)): la del trabajo es `yt-work` y la de la casa `yt-home`.

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

Las dependencias de Neovim (Zathura, `python-pynvim`, `neovim-remote`) ya vienen en `packages.txt`. El detalle de plugins y atajos está en el [README de la config de Neovim](https://github.com/YohaniIsaac/nvim#readme) (`~/.config/nvim/README.md`).

---

### 22. Habilitar servicios de audio y Bluetooth

```bash
systemctl --user enable --now pipewire pipewire-pulse
sudo systemctl enable --now bluetooth
```

La lista de todo lo que arranca solo, y cómo apagarlo, está en [SERVICES.md](SERVICES.md).

---

### 23. Wallpapers y colores (Matugen)

El repo solo trae `~/Pictures/wallpapers/groot_1.jpg`. Copia el resto de tus wallpapers desde la otra máquina (no están en git porque pesan ~215 MB):

```bash
rsync -av otra-maquina:Pictures/wallpapers/ ~/Pictures/wallpapers/
```

No hace falta generar colores a mano: `install.sh` (paso 18) copia los colores por defecto, que son los de `groot_1.jpg` (ver [Matugen](../matugen/README.md)). La primera sesión arranca con ese wallpaper y esos colores. Después eliges tu wallpaper con `Super + W` y Matugen genera los colores de esta máquina.

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

Para una máquina nueva, copia `hosts/default.conf` como `hosts/<hostname>.conf`, ajústalo y corre `~/.config/hypr/scripts/machine-setup.sh --force`. Detalles en [Varias máquinas](MACHINES.md#varias-máquinas).

---

### 25. Kanata (scroll con el teclado)

```bash
bash ~/.config/kanata/setup.sh
```

El script instala la regla udev y la carga de `uinput`, crea el grupo, agrega tu usuario y habilita `kanata.service`. **Reinicia** después: el servicio no puede abrir `/dev/uinput` hasta entonces. Cómo funciona, cómo lanzarlo a mano sin reiniciar y qué hacer si una tecla deja de funcionar: [README de Kanata](../kanata/README.md).
