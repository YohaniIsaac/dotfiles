# Barra (AGS)

Parte de los [dotfiles](../../.github/README.md).

Una barra por monitor, arriba (`~/.config/ags/widget/bars/BottomBar.tsx`):

- **Izquierda:** workspaces del monitor
- **Centro:** reloj y Spotify. La píldora de Spotify se va llenando con la canción (borde de avance ondulado mientras suena); clic → popup del reproductor, y con el popup abierto la píldora cambia su texto de título y artista a tiempo transcurrido y restante y su relleno de progreso se desvanece (el progreso ya está en esos tiempos y en la barra del popup), para que píldora y popup sean de un mismo color; el relleno vuelve al cerrarlo
- **Derecha:** CPU/RAM/temperatura (clic → btop), volumen (rueda = volumen general, clic → popup de audio), red (clic → popup de red), batería, notificaciones y apagado (clic → wlogout, clic derecho → bloquear con `lock.sh`)

Hyprland la lanza con `~/.config/hypr/scripts/start-bar.sh`, no con `ags run` directo. El script:

- espera a D-Bus y a pipewire/wireplumber (en frío, AGS arrancaba antes que el audio y moría);
- relanza la barra si se cae;
- evita instancias duplicadas con `flock`;
- deja el log en `~/.cache/ags-start.log`.

Para reiniciarla (por ejemplo, después de cambiar colores o código): `ags quit`.

Los tres popups (Spotify, audio y red) comparten la ventana layer-shell y su colocación bajo el módulo que los abre: `widget/Popup.tsx`. Cada uno solo aporta su contenido.

Cada popup cuelga de su píldora como **una sola silueta con un solo marco**: la ventana del popup sube hasta el borde superior de la píldora y dibuja ella el marco completo (píldora, cuello y tarjeta, con el mismo borde y el mismo glow, en `widget/popupShape.ts`) mientras la píldora oculta el suyo (clases `fused` y `framed`). Los clics, el hover y el tooltip de la píldora siguen funcionando: la parte de la ventana que la cubre no recibe entradas.

**Cierre de los popups.** Solo hay uno abierto a la vez (abrir uno cierra el anterior) y se cierra con cualquiera de estas cosas:

- **Esc**, o al **perder el foco**: cambiar de ventana con el teclado, abrir rofi…
- Un **clic en cualquier otro sitio**: una ventana (la terminal, el IDE, el navegador) o el escritorio vacío, de cualquier monitor. Lo recoge una ventana transparente a pantalla completa por monitor, por encima de las ventanas y por debajo de los popups (`widget/PopupBackdrop.tsx`), que solo existe mientras hay un popup abierto y deja libre la franja de la barra. El clic que cierra se **consume**: no llega a la ventana de debajo (hace falta otro clic para usarla), como en cualquier menú. No se puede fiar solo del foco: con `input:mouse_refocus = false` en Hyprland (el ajuste de este escritorio) un clic en la ventana que ya estaba activa no le quita el foco al popup.
- Un clic en la **barra** fuera de los módulos que abren un popup (el reloj, los workspaces, los huecos…): cierra el popup y el clic sigue a su destino, así que un clic en un workspace lo cambia y cierra el popup a la vez. Los módulos que abren un popup (la píldora de Spotify, el volumen y la red) lo conmutan por su cuenta.
- Con una ventana a pantalla completa real (por ejemplo Spotify en su workspace) Hyprland oculta la capa de arriba: ahí el clic no cierra, solo Esc y el cambio de foco (la barra tampoco se ve).

## Volumen y popup de audio

- **Rueda** sobre el módulo de volumen: sube o baja el volumen general de a 5 % (tope 100 %; subir también des-silencia). En el touchpad los deltas fraccionarios se acumulan hasta completar un paso.
- **Clic**: abre `widget/AudioPopup.tsx` bajo el módulo, en el monitor de esa barra. Trae:
  - el selector de salida: un clic deja el dispositivo como salida por defecto, igual que en pavucontrol, y WirePlumber lo recuerda. Si el dispositivo estaba silenciado, lo des-silencia (mover cualquier slider también des-silencia), y las salidas silenciadas llevan un icono;
  - el volumen general, con su botón de silencio;
  - un slider con silencio por cada aplicación que tenga un stream abierto (la lista se actualiza en vivo).
- Esc o clic afuera lo cierra. `ags toggle audio-popup` lo abre desde la terminal, en el monitor con foco.
- Volumen, mute y las listas de salidas y aplicaciones salen de AstalWp por señales (`widget/audio.ts`). La **salida por defecto** se consulta con `pw-metadata` (una consulta que termina) al arrancar, al abrir el popup, tras elegir una salida y cada 3 s, porque AstalWp no se entera de los cambios de default en esta máquina. No hay ecualizador todavía: PipeWire no tiene EQ por aplicación, y uno global o por grupos de apps se haría con `filter-chain` (notas en [`.config/dotfiles/.claude/CLAUDE.md`](../dotfiles/.claude/CLAUDE.md)).

## Red y popup de red

- **Icono** del módulo: las barras de la señal del Wi-Fi (4 niveles), una alerta si está conectado pero sin internet, el icono vacío si está encendido sin conexión, tachado si está apagado, y el cable cuando la conexión principal es Ethernet.
- **Clic**: abre `widget/NetworkPopup.tsx` bajo el módulo, en el monitor de esa barra. Trae:
  - una fila de **Ethernet** con su estado (conectado y a qué velocidad, conectando, sin conexión o sin cable). Aunque haya varios puertos (un dock USB trae dos) se resume en una sola fila;
  - el **interruptor de Wi-Fi** (con el hardware apagado, por la tecla de modo avión, se ve apagado y no responde) y un botón para buscar redes. Al abrir el popup se hace un escaneo solo;
  - la lista de **redes cercanas**: la conectada arriba (con «Desconectar») y el resto por señal. Las redes guardadas y las abiertas se conectan con un clic; una red nueva con contraseña (WPA2 o WPA3) abre un campo de contraseña bajo su fila. Si la contraseña es incorrecta, el campo se vuelve a abrir con el aviso;
  - **Configuración avanzada…**, que abre `nm-connection-editor` para lo que el popup no hace: redes empresariales (802.1X), redes ocultas, IP fija, VPN y olvidar una red.
- Solo se listan puntos de acceso de infraestructura (se ocultan los nodos mesh y las redes ad-hoc). Las redes WEP o empresariales se muestran, pero avisan de que hay que usar Configuración avanzada.
- Esc (o clic afuera) cierra el popup; dentro del campo de contraseña, Esc cierra solo el campo. `ags toggle network-popup` lo abre desde la terminal.
- El estado sale de NetworkManager por señales (`widget/network.ts`, sobre libnm): sin sondeo ni subprocesos. Las contraseñas nuevas se guardan en el perfil del sistema de NetworkManager, nunca en estos dotfiles.
- **Estado de la verificación** (2026-09-30): probado con la red real de esta laptop (lista y agrupación de redes, escaneo, estado de Ethernet, perfiles aceptados por NetworkManager, clic en la barra, campo de contraseña y foco) y con datos simulados (todos los estados del popup y los pasos de una conexión fallida). **Sin probar todavía**: conectar con contraseña a una red nueva (correcta e incorrecta), apagar y encender el Wi-Fi, y Ethernet con el cable enchufado.

> **Ojo al programar widgets:** nunca llames desde `createPoll`/`execAsync` a un comando que no termina (modo subscribe/follow/watch, como `swaync-client -swb`). Cada tick deja un proceso colgado, y al final se agotan los file descriptors del bus de sesión y se cierran todas las apps. El detalle está en el comentario de las notificaciones en `BottomBar.tsx`.

## Archivos

| Archivo | Qué hay |
|---|---|
| `app.ts` | Punto de entrada: crea una barra por monitor y registra los popups; atiende `ags request popup <nombre> [monitor]` |
| `widget/bars/BottomBar.tsx` | La barra (el nombre quedó de cuando estaba abajo): workspaces, reloj, píldora de Spotify, módulos del sistema |
| `widget/Popup.tsx` | Ventana layer-shell de los popups, su colocación y el marco único con la píldora; `togglePopup`, `openPopup` |
| `widget/popupShape.ts` | Dibujo (Cairo) del marco: píldora, cuello y tarjeta, con su borde y su glow |
| `widget/MediaPlayer.tsx`, `AudioPopup.tsx`, `NetworkPopup.tsx` | El contenido de cada popup |
| `widget/mpris.ts`, `mediaFill.ts` | Estado de Spotify (posición, progreso, onda, tiempos) y dibujo del relleno de su píldora |
| `widget/audio.ts`, `widget/network.ts` | Estado compartido de audio (AstalWp) y de red (NetworkManager por libnm) |
| `style.scss` y `_*.scss` | Estilos; `_shared.scss` tiene las variables y los mixins, y `colors.scss` lo genera [Matugen](../matugen/README.md) (no se trackea) |
