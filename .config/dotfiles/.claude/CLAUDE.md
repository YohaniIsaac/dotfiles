# Dotfiles – Contexto para Claude Code

Escritorio Arch Linux + Hyprland. La guía de instalación y el detalle de cada componente están en `../README.md`. Este archivo resume lo que conviene saber antes de tocar la config. Los repositorios de los que se toman ideas de diseño (barra, popups, Rofi, widgets) están en `README.md`, en esta misma carpeta `.claude/`: consultarlos antes de diseñar un widget nuevo.

## Repo

- Repo bare en `~/.dotfiles` con work-tree `$HOME`:
  `alias dotfiles='git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'`
- **Los dos repos son públicos**: `YohaniIsaac/dotfiles` y el submódulo `YohaniIsaac/nvim` (`~/.config/nvim`). Revisar que no haya secretos antes de trackear algo.
- `~/.gitignore_global` ignora `.claude/`, `*.md` y `*.txt` en todos los repos: los archivos nuevos de ese tipo no salen en `dotfiles status` y se agregan con `dotfiles add -f`. Los ya trackeados se actualizan con `add` normal, salvo los que están dentro de un directorio `.claude/` (este CLAUDE.md, `~/.claude/*`): ahí `add` sale con código 1 aunque igual los stagea, y en una cadena con `&&` el archivo se cuela en el commit siguiente. Usar `dotfiles add -u -- <ruta>`.
- Orden de push: primero `~/.config/nvim` y después dotfiles. Si no, el puntero del submódulo apunta a un commit que no existe en GitHub.
- El repo bare no tiene fetch refspec: `origin/main` no se actualiza y `dotfiles status` no avisa de commits sin pushear. Para ver lo pendiente: `dotfiles fetch origin && dotfiles log FETCH_HEAD..main`.
- El work-tree es `$HOME`: nunca `reset --hard`, `checkout .` ni `stash` a ciegas. Para rehacer commits locales, `reset --soft` y `reset` (mixed) no tocan archivos.

## Varias máquinas (hostname)

Una sola config para todas las laptops; la llave es el **hostname** (`yt-work` = esta laptop del trabajo, `yt-home` = la de la casa), nunca el usuario (`yt` en todas). Reglas:

- **Primero detectar** (`[[ -d … ]]`, buscar por nombre, `~` en vez de `/home/yt`). Nunca escribir rutas absolutas ni nombres de monitor fuera de `hypr/hosts/`.
- **Monitores**: `hypr/hosts/<hostname>.conf` define la disposición y los roles `$mon1/$mon2/$mon3` (bloques de workspaces 1–10/11–20/21–30 y Super+F1/F2/F3; `none` si no hay). `hypr/host.conf` es un symlink no trackeado que crea `hypr/scripts/machine-setup.sh` (`--force` para volver a elegir). Los scripts y la barra leen los roles desde Hyprland (`hyprctl workspacerules -j`, helpers en `hypr/scripts/lib-monitors.sh`).
- **Git**: la identidad global es la de Innovex (el default que quiere el usuario); en los repos personales él la configura a mano con `user.name`/`user.email` locales. No cambiarla ni agregar `includeIf`.
- `Hyprland --verify-config -c <archivo>` valida la sintaxis, pero **no** detecta variables sin definir: verificar la expansión en vivo con `hyprctl workspacerules -j` / `hyprctl binds`.

Monitores de `yt-work` (esta laptop):

| Monitor      | Conector | Modo              | Posición         | Rol / workspaces        |
|--------------|----------|-------------------|------------------|-------------------------|
| SAC LED      | DP-1     | 1920×1080 @75 Hz  | arriba izquierda | `$mon1` 1–10 (principal) |
| ASUS VA27EHF | HDMI-A-1 | 1920×1080 @100 Hz | arriba derecha   | `$mon2` 11–20           |
| Laptop       | eDP-1    | preferred @1.25x  | abajo            | `$mon3` 21–30           |

`Super+1..0` va al workspace N *del monitor activo* (`hypr/scripts/workspace-nav.sh`).

## Barra (AGS v3 / Astal GTK4)

- Una sola barra por monitor, anclada arriba, en `widget/bars/BottomBar.tsx` (el nombre quedó de cuando estaba abajo):
  - Izquierda: workspaces del monitor.
  - Centro: reloj y Spotify (click → popup `media-popup` de `widget/MediaPlayer.tsx`).
  - Derecha: CPU/RAM/temperatura (click → `btop`; el sensor se busca por nombre al arrancar: `coretemp`/`k10temp`/`zenpower`), volumen (rueda = volumen general en pasos de 5 %, click → popup `audio-popup` de `widget/AudioPopup.tsx`), red (click → popup `network-popup` de `widget/NetworkPopup.tsx`), batería, notificaciones (swaync) y botón de apagado (click → `hypr/scripts/wlogout.sh`, click derecho → hyprlock).
- `widget/mpris.ts`: estado compartido de Spotify/MPRIS. `widget/audio.ts`: estado compartido de AstalWp (salida por defecto, listas de salidas y streams, ajuste con la rueda). `widget/network.ts`: estado y lógica de red sobre libnm (Wi-Fi, Ethernet, conectar). `widget/Popup.tsx`: ventana layer-shell y colocación (`togglePopup`) que comparten los tres popups. `app.ts` registra los popups (`MediaPlayer`, `AudioPopup`, `NetworkPopup`) y crea una barra por monitor. Los prototipos viejos (`Bar.tsx`, `ClockBar.tsx`, `WorkspaceBar.tsx`, `SystemBar.tsx`) se borraron el 2026-09-29.
- Estilos: `style.scss` importa `_bar.scss`, `_mediaplayer.scss`, `_audio.scss` y `_network.scss`. Los mixins (`pill-look`, `bar-pill`, `slider-track` y los de popup: `popup-surface`, `popup-title`, `popup-hint`, `popup-row`, `popup-icon-button`), `$popup-hover-fill` y `$error` están en `_shared.scss`. `colors.scss` lo genera Matugen y no se trackea (ver Theming).
- Librerías: AstalHyprland, AstalWp, AstalNetwork (solo para compartir su `NM.Client`: ver la sección de red), AstalBattery y AstalMpris (paquetes `libastal-*-git`). La reactividad usa `gnim` (`createPoll`, `createExternal`, `createState`, `.as()`).
- Popups: se escriben con `<Popup name class width onShow>` de `widget/Popup.tsx` (ventana con anclaje, Esc y cierre al perder el foco, más un `.popup-root`). Un módulo de la barra los abre con `togglePopup("nombre", self)`, que fija monitor y `marginRight` con la ventana oculta y centra el popup bajo el módulo (recortado a 8 px del borde derecho; el de red queda pegado al borde porque su módulo está muy a la derecha). El de Spotify se sigue abriendo con `app.toggle_window("media-popup")`. Hyprland pone el mismo namespace (`gtk4-layer-shell`) a todas las ventanas de AGS: `hyprctl layers` no distingue un popup de otro.
- **Tamaño de un popup con lista que se llena tras abrir:** una ventana GTK4 `resizable` (el valor por defecto) solo crece hasta el MÍNIMO de su contenido una vez abierta, no hasta el natural. Con un `ScrolledWindow` (mínimo ~58 px, natural el de todas las filas) la ventana quedaba en lo que midió al abrir: el popup de red abre solo con la red conectada (NM no tiene en caché las demás hasta el escaneo, unos 3 s después) y quedaba con ~2 filas visibles y scroll aunque hubiera 8 redes (medido: ventana 171 px antes y después). `<Popup resizable={false}>` hace que la ventana siga el tamaño natural, creciendo y achicándose (171 → 343 px → 171). Se probó esa opción solo en el de red; audio y Spotify conservan el valor por defecto. La lista de redes pide un mínimo de 4 filas (`minContentHeight`, para no abrir enana) y un máximo de 7,5 (para que la octava asome cortada y se note el scroll); una fila mide 27 px + 2 de separación (8 filas = 230 px).
- Elementos JSX de AGS: lista fija (`box`, `button`, `entry`, `label`, `revealer`, `scrolledwindow`, `slider`, `switch`, `window`…). No existen `passwordentry` ni `spinner`: se usan las clases, `<Gtk.PasswordEntry>` y `<Gtk.Spinner>`. `For` reordena quitando y volviendo a añadir TODOS los hijos en cada emisión del array (un campo con foco lo pierde): hay que emitir solo cuando el orden cambia.

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

### Volumen y popup de audio (notas de AstalWp)

Código en `widget/audio.ts` (estado y ajuste con la rueda) y `widget/AudioPopup.tsx` (ventana). Lo que no se ve leyendo el código:

- **AstalWp no se entera de los cambios de la salida por defecto en esta máquina** (verificado el 2026-09-30). El metadata `default` que crea WirePlumber no reenvía sus actualizaciones a los clientes ya conectados: ni un cliente libwireplumber ni `pw-metadata -m` reciben nada tras el volcado inicial, mientras que el metadata `settings` (del servidor de PipeWire) sí entrega los eventos al instante. WirePlumber sí cambia el default y mueve los streams (~0.4 s), pero `wp.audio.default_speaker` (que en teoría se re-apunta solo) y `Endpoint.is_default` quedan congelados en el default del arranque. Leer el código de AstalWp decía lo contrario: el fuente no basta, hay que probar el cambio real. Consecuencia: no usar `default_speaker`, `is_default` ni `notify::is-default`. El default real se consulta en `audio.ts` con `pw-metadata -n default 0 default.audio.sink` (termina en ~10 ms, con `timeout 3` y una sola consulta a la vez) y se refresca al arrancar, al abrir el popup, tras elegir una salida, cuando llega `speaker-added`/`speaker-removed` y cada 3 s por si el cambio vino de fuera (pavucontrol, `wpctl`). De ahí sale `defaultEndpoint`, que usan el check, el volumen general y la rueda. Si algún día los eventos vuelven (tras reiniciar WirePlumber, quizá; el demonio llevaba desde el 2026-08-03 arriba), las consultas quedan como red de seguridad redundante.
- `set_is_default(true)` guarda el default *configurado* en WirePlumber (como pavucontrol): después de elegir una salida a mano, un dispositivo que aparece más tarde (los audífonos Bluetooth al conectarse) ya no toma el default solo.
- WirePlumber guarda el volumen y el mute de cada salida por puerto en `~/.local/state/wireplumber/default-routes` y los restaura al activarla. Los parlantes del portátil (`alsa_card.pci-0000_00_1f.3:output:analog-output-speaker`) están guardados con `"mute": true` y `channelVolumes` 0.001 (−60 dB), y el volumen/mute son de hardware (`HW_MUTE_CTRL`): al elegirlos no suenan aunque el slider suba. Por eso mover un slider y elegir una salida des-silencian (`setVolume` en `audio.ts` y `DeviceRow`), y las filas de salida muestran un icono si están silenciadas. Se comprueba el hardware con `awk '/^Node 0x14 /{n=1} n&&/Amp-Out vals/{print; n=0}' /proc/asound/card0/codec#0` (`0x80` = muteado; 0x14 es el pin de los parlantes del ALC257 de esta laptop). `wpctl set-mute 57 0` lo libera en ~1 s y WirePlumber no lo revierte.
- `audio.speakers` y `audio.streams` notifican al añadir o quitar, pero nacen vacías: siempre `createBinding` + `<For>`, nunca leerlas una vez.
- Una escritura de volumen se confirma de forma asíncrona (ida y vuelta a PipeWire): tras `node.volume = x`, la propiedad tarda unos ms en reflejarlo. Por eso `nudgeVolume` parte del último valor pedido si es reciente, y las pruebas no deben comprobar el resultado en el mismo tick.
- En un stream, `name` vale "Playback" y `state` queda fijo en 0 en esta build (no sirve para saber si suena). El nombre útil es `application.name`. El tema de iconos es Adwaita y no trae los de las apps: por eso se usan glifos Nerd Font por nombre.
- `Node.volume` se recorta a 0–1.5 y la escala es cúbica (coincide con `wpctl`); la UI topa en 100 %.
- Colocación: `togglePopup("audio-popup", self)` (`widget/Popup.tsx`) fija el monitor y `marginRight` con la ventana oculta (una superficie layer-shell mapeada no cambia de salida) y centra el popup bajo el módulo. Con `ags toggle audio-popup` se abre en el monitor con foco, pegado a la derecha.
- Ecualizador: pendiente. Es viable con `filter-chain` de PipeWire (biquads nativos, sin paquetes; ver `/usr/share/pipewire/filter-chain/sink-eq6.conf`). Cambiar una banda en vivo funciona con `pw-cli set-param <id-sink> Props '{ params = [ "eq_band_2:Gain" 6.0 ] }'` y mover un stream con `pw-metadata -n default <id-stream> target.object <sink>`; ambos se verificaron el 2026-09-30.
- Probar sin tocar el audio real: `ags bundle` genera un script bash autoextraíble, se ejecuta con `bash x.js`, no con `gjs`. Un arnés temporal con `instanceName` propio puede montar `AudioPopup()` y ejercer los widgets contra un sink nulo (`pactl load-module module-null-sink sink_name=…`) y un stream `pw-play -P '{ node.dont-fallback=true }' --target <sink-nulo>` con un WAV de silencio. Sin `dont-fallback`, un destino inexistente cae al default y suena en los audífonos. Un arnés no suscrito a `volState` lo ve con su valor inicial: suscribirse primero (`volState.subscribe(() => {})`), como hacen las etiquetas de la barra.
- Probar el cambio de salida de verdad (clic en la fila, `wpctl set-default`) mueve el audio del usuario unos segundos: avisar antes, comprobar que la integrada está a 0.10 (−60 dB, inaudible), restaurar con un `trap` (`wpctl set-default 77`) y dejar `default-nodes` en el mismo orden (el último elegido debe ser el de siempre).

### Red y popup de red (notas de NetworkManager / AstalNetwork)

Código en `widget/network.ts` (estado, conexión y funciones puras), `widget/NetworkPopup.tsx` (recibe un `NetStore`, por defecto el real) y `_network.scss`. Lo que no se ve leyendo el código:

- **No usar los envoltorios Wifi / Wired / AccessPoint de AstalNetwork**; solo `Network.get_default().client` (el `NM.Client`, que comparte la barra). Trampas de r908 (commit 11842ae), comprobadas en vivo o en el fuente (`lib/network/src/*.vala` en GitHub):
  - la PROPIEDAD `access_points` no se lee desde GJS ("Can't convert non-null pointer to JS value"); el método `get_access_points()` sí (*en vivo*);
  - `wifi` y `wired` se eligen una sola vez al construir; `wired` es solo el primero de los puertos Ethernet (aquí dos, de un dock USB) (*en vivo* + fuente). `Wired.internet` vale 0 (= conectado) por defecto aunque el estado sea `unavailable` (*en vivo*);
  - `AccessPoint.activate(password)` crea SIEMPRE un perfil `wpa-psk` fijado al BSSID: falla en redes abiertas, WPA3 y 802.1X (fuente); `Wifi.scanning` queda en true si el escaneo falla y `Wifi.ssid` no se limpia al desconectar (fuente).
- libnm sí entrega las señales (escaneo real: `access-point-added` y `notify::last-scan` llegan), por eso no hay sondeo ni subprocesos. `createState` (no `createExternal`: solo produce con suscriptores) con manejadores de señal siempre vivos, agrupados por un `scheduleSync` de 80 ms. La lista de redes solo se recalcula con el popup abierto.
- **`NM.Device` tiene su propio método `disconnect(cancellable)`** (desconecta el dispositivo) que tapa al `disconnect(id)` de GObject: para soltar señales de un dispositivo usar `GObject.signal_handler_disconnect(dev, id)` (lo encontró el verificador de tipos).
- **Solo se listan APs de infraestructura** (`ap.mode === 2`). Aquí un escaneo trae un nodo mesh 802.11s (`mode=4`, SAE, 4 BSSID) que parece una "red WPA3" pero no lo es: un perfil de infraestructura contra él da "802-11-wireless.mode: connection does not match access point". Un escaneo son APs, no redes: 12 APs → 4 redes (se agrupa por SSID y se toma el AP más fuerte).
- Perfil nuevo (`buildConnection`): sin BSSID, `mode=infrastructure`, autoconnect, clave dentro del perfil del sistema (`psk-flags` 0, como el de la red del trabajo) → no hace falta agente de secretos (`nm-applet` no corre). Tipos: abierta, `wpa-psk` (incluye las mixtas WPA2/WPA3), `sae`, `owe`; 802.1X/WEP se dejan a `nm-connection-editor`. `connection.verify()` NO rechaza una clave WPA corta: se valida aparte con `NM.utils_wpa_psk_valid` (8–63 o 64 hex; SAE admite cualquier longitud).
- Conectar: `activate_connection_async` / `add_and_activate_connection_async` solo confirman que NM aceptó la orden. El resultado real llega como cambios de estado del dispositivo: `stepAttempt` (pura, probada con secuencias simuladas) decide conectó/falló; `FAILED` con `NO_SECRETS` = "Contraseña incorrecta" y reabre el campo. Al cambiar de red el dispositivo pasa por `DEACTIVATING → DISCONNECTED` antes de avanzar: no es un fallo. Un perfil creado por el intento que falla se borra (si no, NM lo reintentaría solo con la clave mala).
- Mientras hay un campo de contraseña abierto o un intento en curso, la lista se congela (los datos se actualizan, el orden no): `<For>` reordena re-insertando todas las filas y el campo perdería el foco. Comprobado con un escaneo real con el campo abierto. El orden solo se recalcula al abrir el popup, al terminar un escaneo, al cambiar la red activa o el conjunto de redes.
- Escaneo: `NM.DeviceWifi.request_scan_async` directo con enfriamiento de 10 s (NM rechaza escaneos pegados) y fin por `notify::last-scan`, con un temporizador de seguridad de 12 s. Al abrir el popup se escanea solo: sin eso la lista trae apenas el AP conectado.
- Permisos: `nmcli general permissions` da `yes` para `enable-disable-wifi`, `network-control`, `settings.modify.system` y `wifi.scan` (sin contraseña de polkit).
- **Sin probar contra una red real** (falta un AP de prueba, p. ej. el hotspot del teléfono, y permiso para cortar la conexión unos segundos): conectar con contraseña a una red nueva (correcta e incorrecta), conectar a una guardada distinta, apagar/encender el Wi-Fi desde el interruptor, Ethernet con cable enchufado, y teclear en el campo con el teclado real. La máquina de estados y los perfiles sí se probaron (perfiles aceptados por NM en memoria y válidos contra los AP reales con `ap.connection_valid`).
- Probar sin tocar la red: `NM.Client.new(null)` (un `new NM.Client()` de GJS no se inicializa); perfiles de prueba con `add_connection2` (flags `IN_MEMORY | BLOCK_AUTOCONNECT`, SSID falso) y borrarlos al final; compatibilidad perfil↔AP con `ap.connection_valid(perfil)` (APs reales) o `SettingWireless.ap_security_compatible(sec, flags, wpa, rsn, modo)` (banderas sintéticas). Para ver estados del popup sin tocar la red, `NetworkPopup({ store, name })` acepta un `NetStore` falso.
- Capturas sin fotografiar el escritorio: renderizar solo el widget con `Gtk.WidgetPaintable.new(widget)` → `Gtk.Snapshot` → `widget.get_native().get_renderer().render_texture(node, null).save_to_png(ruta)`. Una ventana layer-shell se cierra sola si pierde el foco (comportamiento esperado): el arnés debe reabrirla y reintentar. En el arnés, crear los popups dentro de `main()` (fuera sale "out of tracking context").
- Verificador de tipos (no hay `tsc` instalado): `npm i typescript@5` en un directorio temporal y `tsc -p ~/.config/ags --noEmit --skipLibCheck`; hay 17 líneas de error de base (2 en `audio.ts`, el resto en librerías de ags/gnim): comparar contra esa base, no esperar cero.

### Regla dura: nada de subscribe dentro de un poll

Nunca invocar comandos en modo subscribe/follow/watch (`swaync-client -swb`, `tail -f`, `pactl subscribe`…) desde `createPoll` o `execAsync`. Cada tick deja un proceso colgado con sus fds y su conexión a D-Bus. El 2026-07-28 esto agotó los fds de `dbus-broker` y cerró todas las apps.

Antes de meter un comando en un poll, verificar que termine: `timeout 5 <cmd>; echo $?`. Si el estado se usa en varios monitores, dejarlo a nivel de módulo (un solo poll compartido).

## Theming (Matugen)

`Super+W` → `hypr/scripts/wallpaperSelect.sh`: elige el wallpaper, el color base y el esquema. Después `matugen` rellena los templates de `~/.config/matugen/templates/`:
- `hypr/colors.conf` (+ `hyprctl reload`), `rofi/colors.rasi` y `ags/colors.scss`: generados por máquina e **ignorados por git**. Idea del usuario: cada laptop genera sus colores según sus wallpapers; en el repo solo va un tema por defecto. No volver a trackear colores generados.
- Tema por defecto: `Pictures/wallpapers/groot_1.jpg` + sus colores en `matugen/defaults/`. `matugen/apply-defaults.sh` los copia solo donde falte un archivo de colores (nunca pisa). Lo llama `hypr/scripts/machine-setup.sh` (desde `install.sh` y el autostart), que recarga Hyprland si creó algo. Sin esos archivos, Hyprland da errores, Rofi no abre y AGS no compila.
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
