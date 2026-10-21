# Dotfiles — Arch Linux + Hyprland

Setup personal con Hyprland, AGS (Astal/GTK4), Rofi, Matugen (Material You theming), Kitty y Neovim. Una sola config para varias laptops: cada una se distingue por su hostname.

Este README es solo el índice. Cada herramienta documenta lo suyo en su carpeta de `~/.config/`, y lo que vale para todo el repo está en [`.config/dotfiles/`](../.config/dotfiles/).

## Vista general

| Componente | Programa | Documentación |
|---|---|---|
| WM | Hyprland | [Hyprland: archivos, atajos y scripts](../.config/hypr/README.md) |
| Barra | AGS v3 (Astal/GTK4) | [Barra y popups](../.config/ags/README.md) |
| Launcher | Rofi | — |
| Terminal | Kitty | — |
| Shell | Zsh + Starship | — |
| Editor | Neovim (submódulo) | [README de Neovim](https://github.com/YohaniIsaac/nvim#readme) |
| Notificaciones | SwayNC | — |
| Bloqueo de pantalla | Hyprlock | [Pantalla de bloqueo](../.config/hypr/LOCKSCREEN.md) |
| Idle | Hypridle (apaga pantallas, sin auto-suspend) | [Reposo y bloqueo](../.config/hypr/README.md#reposo-y-bloqueo) |
| Fondo de pantalla | awww | — |
| Temas dinámicos | Matugen (Material You) | [Matugen](../.config/matugen/README.md) |
| Remapeo de teclado | Kanata | [Kanata](../.config/kanata/README.md) |
| Display Manager | SDDM | — |

## Empezar

En un Arch ya instalado y con tu clave SSH en GitHub:

```bash
git clone --bare git@github.com:YohaniIsaac/dotfiles.git $HOME/.dotfiles
alias dotfiles='git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
dotfiles checkout          # si choca con archivos que ya existen, la guía dice cómo moverlos
bash ~/.config/dotfiles/install.sh
```

Para instalar Arch desde la ISO, con todos los pasos y sus porqués, y para lo que `install.sh` no hace (submódulo de Neovim, SSH, wallpapers, monitores, Kanata): la [guía de instalación](../.config/dotfiles/INSTALL.md).

## Documentación

| Tema | Dónde |
|---|---|
| Instalación de Arch desde cero (25 pasos) | [`.config/dotfiles/INSTALL.md`](../.config/dotfiles/INSTALL.md) |
| Varias máquinas (hostname, monitores) y qué llevar a otra | [`.config/dotfiles/MACHINES.md`](../.config/dotfiles/MACHINES.md) |
| Servicios que arrancan solos y cómo apagarlos | [`.config/dotfiles/SERVICES.md`](../.config/dotfiles/SERVICES.md) |
| Fuentes: dónde se instalan y cuál usa cada aplicación | [`.config/dotfiles/FONTS.md`](../.config/dotfiles/FONTS.md) |
| Paquetes del sistema (pacman y AUR) | [`.config/dotfiles/packages.txt`](../.config/dotfiles/packages.txt) |
| Hyprland: archivos, scripts, **atajos de teclado**, reposo | [`.config/hypr/README.md`](../.config/hypr/README.md) |
| Pantalla de bloqueo: diseño, brillo, clima, tipografías | [`.config/hypr/LOCKSCREEN.md`](../.config/hypr/LOCKSCREEN.md) |
| Barra y popups de Spotify, audio y red | [`.config/ags/README.md`](../.config/ags/README.md) |
| Colores dinámicos a partir del wallpaper | [`.config/matugen/README.md`](../.config/matugen/README.md) |
| Remapeo de teclado (Caps Lock + `hjkl` = scroll) | [`.config/kanata/README.md`](../.config/kanata/README.md) |
| Celular de pruebas con el táctil roto, por scrcpy (`cel`) | [`.local/share/cel/README.md`](../.local/share/cel/README.md) |
| Neovim: plugins y atajos | [README de Neovim](https://github.com/YohaniIsaac/nvim#readme) (repo propio, submódulo en `.config/nvim`) |

## Estructura

```
~
├── .claude/                   # Configuración global de Claude Code (CLAUDE.md, settings, statusline)
├── .github/README.md          # Este índice (en .github/ para que GitHub lo muestre en la portada)
├── .config/
│   ├── adb/device.conf        # Celular que adb.service reconecta por Wi-Fi (local, NO trackeado)
│   ├── ags/                   # Barra y popups (AGS v3 / Astal GTK4)
│   ├── dotfiles/              # Documentación general, paquetes e instalación
│   │   ├── INSTALL.md, MACHINES.md, SERVICES.md, FONTS.md
│   │   ├── packages.txt       # Paquetes del sistema (pacman + AUR)
│   │   ├── install.sh         # Instala packages.txt (ejecutar tras clonar)
│   │   └── .claude/           # Contexto y herramientas para Claude Code (CLAUDE.md, referencias, arnés de pruebas)
│   ├── hypr/                  # Hyprland, hyprlock, hypridle, scripts y monitores por máquina (hosts/)
│   ├── kanata/                # Remapeo de teclado
│   ├── kitty/                 # Terminal
│   ├── matugen/               # Colores dinámicos (Material You)
│   ├── nvim/                  # Neovim (submódulo git)
│   ├── ranger/rc.conf         # File manager TUI (solo los cambios sobre el default)
│   ├── rofi/                  # Launcher y temas
│   ├── systemd/user/          # kanata.service y adb.service
│   └── starship.toml          # Prompt de shell
├── .local/bin/                # hypr-generate-colors-wallpapers, joulescope, cel
├── .local/share/cel/          # Fuentes de cel (celular de pruebas por scrcpy); el binario touchgrab se compila en cada máquina
├── Pictures/wallpapers/       # Solo groot_1.jpg está en el repo; el resto se agrega a mano
├── .gitconfig, .gitignore, .gitignore_global, .minirc.dfl, .zshrc
└── .ssh/config                # Solo la config, nunca las claves
```

## Mantenimiento del repo

- **Repos públicos:** este repo y el de Neovim son públicos en GitHub. Nada de claves, tokens ni URLs privadas.
- **Dónde se documenta cada cosa:** lo de una herramienta, en su carpeta; lo de todo el repo, en `.config/dotfiles/`; este README solo enlaza. Vive en `.github/README.md` porque GitHub solo muestra un README en la portada si está en la raíz, en `.github/` o en `docs/`, y la raíz de este repo es `$HOME`.
- **Nada se trackea solo:** un archivo nuevo no entra al repo hasta que lo agregues, y el `.gitignore` más el ignore global ocultan varios tipos (`*.md`, `*.txt`, `*.log`, `.claude/`, carpetas enteras de `~/.config`). Al terminar un cambio conviene preguntarse qué archivos de configuración nuevos creó y decidir cada uno: trackearlo, o ignorarlo con una regla en `.gitignore` para que no estorbe en `dotfiles status`.
- **Ignore global:** `~/.gitignore_global` ignora `.claude/`, `*.md` y `*.txt` en todos los repos, así que los archivos nuevos de ese tipo no aparecen en `dotfiles status` y hay que agregarlos con `dotfiles add -f <ruta>`. Los ya trackeados se actualizan normal, salvo los que están dentro de un directorio `.claude/` (como `.claude/settings.json`): ahí `dotfiles add` avisa "paths are ignored" y sale con error aunque igual los agrega, así que conviene usar `dotfiles add -u -- <ruta>`.
- **Submódulo de Neovim:** los cambios se commitean dentro de `~/.config/nvim` y después se actualiza el puntero con `dotfiles add .config/nvim`. Al subir, primero `git -C ~/.config/nvim push` y después `dotfiles push`.
- **Cuidado con el work-tree:** es todo `$HOME`, así que nada de `dotfiles reset --hard`, `checkout .` ni `stash` sin revisar antes.
