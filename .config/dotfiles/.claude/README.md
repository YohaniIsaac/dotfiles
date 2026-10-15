# Referencias de diseño

Repositorios y páginas de los que se toman ideas (diseño, estructura, widgets) para el escritorio: la barra y los popups de AGS, Rofi, los dashboards, la pantalla de bloqueo y el tema. Son inspiración: no se copia código sin revisar su licencia ni sin adaptarlo a las reglas de [CLAUDE.md](CLAUDE.md) (una config para todas las laptops por hostname, sin rutas absolutas, colores de Matugen sin trackear y nada de subscribe dentro de un poll).

Nuestro stack es **AGS v3 + Astal (GTK4) + gnim** sobre Hyprland. Los repos con el mismo stack se pueden leer como código; los de Quickshell, Waybar o Eww sirven para el diseño y hay que reescribirlos.

Última revisión: 2026-10-02 (los 20 enlaces responden).

## Configuración general

| Referencia | Qué es | Stack |
|---|---|---|
| [Astal showcases](https://aylur.github.io/astal/showcases/) | Galería de shells y configuraciones hechos con Astal. Incluye Marble Shell, Tokyob0t's Desktop, HyprPanel y Delta Shell. | Astal / AGS |
| [end-4/dots-hyprland](https://github.com/end-4/dots-hyprland) | Configuración de Hyprland muy trabajada: barra, barras laterales, vista general con previsualización de las apps, tema Material que se adapta al fondo de pantalla, integración con IA y herramientas como traducción de pantalla. | Quickshell (QtQuick) |
| [HyDE-Project/HyDE](https://github.com/HyDE-Project/HyDE) | Entorno sobre Hyprland con cambio de tema y de fondo de pantalla, lanzadores Rofi y Wallbash (colores generados desde el fondo, como nuestro Matugen). Pensado para un Arch mínimo. | Hyprland, Rofi, Wallbash |

## Barra y popups

| Referencia | Qué es | Stack |
|---|---|---|
| [Aylur/marble-shell](https://github.com/Aylur/marble-shell) | Shell de escritorio para Wayland de Aylur, autor de AGS y Astal. Aparece en la galería de Astal. Usa Gnim v2; aquí está instalado gnim 1.9.1, así que hay que comprobar la API antes de copiar un patrón. | Gnim v2, TypeScript |
| [sejjy/mechabar](https://github.com/sejjy/mechabar) | Configuración modular de Waybar con varios temas Catppuccin (Mocha, Macchiato, Frappe y Latte). Waybar ya no está en nuestra config (se eliminó el 2026-09-29): solo sirve como referencia visual. | Waybar |

## Dashboard, Rofi y widgets

| Referencia | Qué es | Stack |
|---|---|---|
| [elkowar/eww](https://github.com/elkowar/eww) | Sistema de widgets independiente escrito en Rust. Los widgets se definen en Yuck y se estilizan con SCSS. Es la base de los tres repos siguientes. | Rust, GTK3, Yuck + SCSS |
| [Saimoomedits/eww-widgets](https://github.com/Saimoomedits/eww-widgets) | Widgets de Eww con barras minimalistas y limpias; el repositorio muestra capturas y GIFs. | Eww |
| [Axarva/dotfiles-2.0](https://github.com/Axarva/dotfiles-2.0) | Configuración de XMonad con widgets de Eww (dashboard y barra lateral), menús de Rofi y barra tint2, con scripts de instalación para varias distros. Pensada para una pantalla de 1366×768. | Eww, Rofi, tint2 |
| [adi1090x/widgets](https://github.com/adi1090x/widgets) | Colección de widgets de Eww con dos estilos, "Arin" y "Dashboard", pensados para 1920×1080, con integraciones como clima y correo. | Eww |

## Pantalla de bloqueo

Añadida por Claude el 2026-10-01, al hacer la pantalla de bloqueo.

| Referencia | Qué es | Stack |
|---|---|---|
| [pinkSakoora/sakoora.hyprlock](https://github.com/pinkSakoora/sakoora.hyprlock) | Estilos de hyprlock con instalador: tarjetas redondeadas translúcidas con reloj, fecha, reproductor, red, bluetooth y batería, y scripts para cada widget. **Licencia GPL-3.0: no se copia código.** El `style-1` es el diseño que se tomó de base para `hypr/hyprlock.conf` (tarjetas sobre el fondo desenfocado); el código es propio. | Hyprland, hyprlock |
| [MrVivekRajan/Hyprlock-Styles](https://github.com/MrVivekRajan/Hyprlock-Styles) | Diez estilos de hyprlock, cada uno un `hyprlock.conf` suelto. **Licencia GPL-3.0: no se copia código.** El `style-7` (hora grande con las horas en un color y los minutos en otro, apiladas y desplazadas) y el `style-8` (la fecha en dos colores) son lo que se tomó para la hora y la fecha de `hypr/hyprlock.conf`, con colores de Matugen; las capturas están en el README del repo. | Hyprland, hyprlock |

## Audio y ecualizador

Añadidas por Claude durante la investigación del popup de audio (2026-09-30); se pueden quitar si no interesan.

| Referencia | Qué es | Stack |
|---|---|---|
| [bhack/mini-eq](https://github.com/bhack/mini-eq) | Ecualizador paramétrico compacto de todo el sistema para PipeWire, con `filter-chain` y biquads nativos. | GTK/Libadwaita, PipeWire |
| [AlejandroZmtZ/EQ-Space-for-Linux](https://github.com/AlejandroZmtZ/EQ-Space-for-Linux) | EQ paramétrico con interfaz gráfica: una ruta de EQ de sistema, selector de la salida física y volumen y mute por aplicación. | Python, PipeWire |
| [knightinfected/PipeWireController](https://github.com/knightinfected/PipeWireController/) | Centro de control de audio: enrutado, EQ paramétrico como dispositivo de salida y reglas por aplicación. | GTK4/Libadwaita, PipeWire |
| [wwmm/easyeffects](https://github.com/wwmm/easyeffects) | Efectos y ecualizador para las apps de PipeWire. Una cadena global de entrada y otra de salida; su línea de comandos solo carga presets y hace bypass. | PipeWire |
| [seele-shell #59](https://github.com/silas00301/seele-shell/pull/59) y [dotfiles #26](https://github.com/fhlkfds/dotfiles/pull/26) | Dos PR que añaden un mezclador por aplicación a un panel de audio: cómo se resuelve el nombre y el icono de cada app, el tope de 100 % y los sliders dentro de contenedores con scroll. | Quickshell (QML) |

## Por investigar (añadidas 2026-10-01)

Solo se guardan los enlaces y lo que se quiere sacar de cada uno; nada está implementado ni investigado a fondo.

| Referencia | Qué es | Qué se quiere sacar |
|---|---|---|
| [omarchy-coppernight-theme](https://github.com/hembramnishant50-glitch/omarchy-coppernight-theme#-%E7%BE%8E%E5%AD%A6--the-design-philosophy) | Tema oscuro para Omarchy (índigo con acentos cobre), con más de 50 configuraciones de apps. Licencia MIT solo según la insignia de su README: el repo no trae archivo `LICENSE`. | **Gestor de archivos**: configura Nautilus (colores de fondo) y un tema para Yazi (gestor de terminal). Además, ideas generales de diseño; su filosofía (sección "The design philosophy") es usar el índigo para el espacio vacío y reservar el cobre para los puntos focales. |
| [vyrx-dev/symphony](https://github.com/vyrx-dev/symphony) | Escritorio Arch + Hyprland minimalista (Waybar, Rofi, SwayNC, Matugen, Fish + Starship) con dos modos: Vibe y Focus (este último sin animaciones, bordes mínimos y sin transparencia). Licencia MIT. **Archivado el 2026-05-15**. | Posible cambio de la barra a algo más minimalista. Waybar: solo sirve de referencia visual, hay que reescribirlo en AGS. |
| [LoneWolf4713/seraphic.dotfiles](https://github.com/LoneWolf4713/seraphic.dotfiles) | Dotfiles de Hyprland con paleta Everblush (Waybar, Rofi, Hyprlock, SwayNC, Spicetify). **Sin licencia explícita**: no copiar código. | **Fondo de pantalla con movimiento**: según su README usa `swww` (que ya tenemos como `awww`) y `mpvpaper` (vídeo como fondo). Revisar cómo lo hace y si es viable aquí. |

## Reproductor de música (añadidas 2026-10-15)

Referencias vistas al hacer que la píldora de música se llene con el progreso de la canción.

| Referencia | Qué es | Qué se saca |
|---|---|---|
| [end-4: WavyLine.qml](https://github.com/end-4/dots-hyprland/blob/main/dots/.config/quickshell/ii/modules/common/widgets/WavyLine.qml) y [PlayerControl.qml](https://github.com/end-4/dots-hyprland/blob/main/dots/.config/quickshell/ii/modules/ii/mediaControls/PlayerControl.qml) | Tarjeta del reproductor de dots-hyprland: barra de progreso ondulada solo mientras suena (recta en pausa), colores sacados de la carátula, carátula desenfocada de fondo y título sin los grupos entre corchetes o paréntesis del principio (típicos de YouTube y anime; no toca los sufijos). **Licencia GPL-3.0: no se copia código.** | La onda que solo existe sonando; paleta del reproductor a partir de la carátula. |
| [Ironbar: módulo music](https://github.com/JakeStanger/ironbar/wiki/music) | Barra en Rust (GTK). Su módulo de música tiene título con desplazamiento tipo marquesina (velocidad, pausa y comportamiento al pasar el ratón configurables), popup con carátula, slider de posición y volumen. MIT. | Marquesina para títulos largos. |
| [m3e_seekbar](https://pub.dev/packages/m3e_seekbar) | Paquete de Flutter que copia la barra "squiggly" del reproductor de Android: la amplitud de la onda crece al reproducir y se aplana al pausar o arrastrar. MIT. | Animar la amplitud (de 0 a la normal) al reproducir/pausar en vez de cortar la onda. |
| [LRCLIB](https://lrclib.net) | API pública y gratuita de letras, sin clave: `GET /api/get?track_name=…&artist_name=…&duration=…` devuelve letra plana y sincronizada (`[mm:ss.xx] línea`). Probada el 2026-10-15. Envía título y artista a un servicio externo. | Letra de la línea actual en la barra o en el popup. |
| [boring.notch](https://github.com/TheBoredTeam/boring.notch) | "Notch" para macOS con actividad de música: visualizador de espectro con audio real, carátula y tiempo restante. **Licencia GPL-3.0: no se copia código.** | Idea de visualizador y de mostrar el tiempo restante. |

## Animación de popups y cierre al hacer clic fuera (añadidas 2026-10-15)

Solo investigación y notas: nada de esto está implementado.

| Referencia | Qué es | Qué se saca |
|---|---|---|
| [boring.notch](https://github.com/TheBoredTeam/boring.notch), sobre todo [ContentView.swift](https://github.com/TheBoredTeam/boring.notch/blob/main/boringNotch/ContentView.swift) | Notch de macOS con SwiftUI. **Licencia GPL-3.0: no se copia código; sí se pueden tomar las ideas y los números.** | Apertura con muelle ligeramente rebotante (respuesta 0,42 s, amortiguación 0,8), cierre sin rebote (0,45 s, amortiguación 1,0), contenido que entra con escala 0,8 anclada arriba más opacidad (0,35 s), radios de las esquinas que cambian entre abierto y cerrado, apertura al pasar el ratón con retardo y gestos de arrastre vertical para abrir o cerrar. |
| [end-4: Appearance.qml](https://github.com/end-4/dots-hyprland/blob/main/dots/.config/quickshell/ii/modules/common/Appearance.qml), [Revealer.qml](https://github.com/end-4/dots-hyprland/blob/main/dots/.config/quickshell/ii/modules/common/widgets/Revealer.qml) y [GlobalFocusGrab.qml](https://github.com/end-4/dots-hyprland/blob/main/dots/.config/quickshell/ii/services/GlobalFocusGrab.qml) | Curvas de animación y revelador de dots-hyprland. **GPL-3.0: no se copia código.** | Curvas Bézier con sobreimpulso estilo Material 3 Expressive (la rápida dura 350 ms; la normal, 500 ms) y un servicio único que cierra todos los popups al hacer clic fuera: registra los "descartables" y deja la barra como "persistente". |
| [Quickshell: HyprlandFocusGrab](https://quickshell.outfoxxed.me/docs/types/Quickshell.Hyprland/HyprlandFocusGrab) y [PopupWindow.grabFocus](https://quickshell.org/docs/v0.3.2/types/Quickshell/PopupWindow) | Documentación del mecanismo que usan los shells de Quickshell: el protocolo de agarre de foco de Hyprland emite `cleared` al hacer clic fuera de las ventanas listadas. | El patrón "cerrar al hacer clic fuera"; en AGS (GTK4) no hay enlace a ese protocolo, así que hay que buscar otra vía. |
| [Hyprland: animaciones](https://wiki.hypr.land/0.56.0/Configuring/Advanced-and-Cool/Animations/) y [reglas de capa](https://wiki.hypr.land/Configuring/Basics/Window-Rules/) | El compositor anima la apertura y el cierre de las capas con los nodos `layersIn` y `layersOut` (estilos `slide`, `popin` y `fade`), y una regla de capa `animation` fija el estilo de una capa concreta según su `namespace`. Desde Hyprland 0.55 `hyprlang` está en desuso a favor de Lua. | Animar los popups sin gastar CPU en AGS (hoy ya hacen `fade`); los popups necesitan su propio `namespace` para distinguirlos de la barra. |
| [caelestia-dots/shell](https://github.com/caelestia-dots/shell) | "Shell fluido y que cambia de forma" para Quickshell, con popouts de la barra y dashboard. **GPL-3.0: no se copia código.** El README no explica sus animaciones; habría que leer el código. | Ver cómo hace que los popups crezcan desde la barra. |
| [jimallen/quickshell](https://github.com/jimallen/quickshell) | Barra de Quickshell para Hyprland con popups tipo notch, con esquinas cóncavas que conectan con la barra según su README. MIT. No comprobé si animan. | El aspecto de popup "pegado" a la barra. |
| [marble-shell](https://github.com/Aylur/marble-shell) | Mismo stack que el nuestro (AGS y gnim en TypeScript); sus popups usan componentes `MenuRevealer` y `NotificationRevealer`. **Licencia CC BY-NC 4.0 (no comercial): no se copia código.** | Cómo hace Aylur los menús desplegables y las notificaciones con reveladores de GTK. |
| [GTK4: Gtk.Revealer](https://docs.gtk.org/gtk4/enum.RevealerTransitionType.html) | Widget de GTK que anima mostrar y ocultar su hijo (deslizar, fundir). Ojo: oculta el contenido, pero el margen, el relleno y el borde del propio revelador siguen visibles. | Animar dentro del popup sin tocar el compositor. |
| [DynamicNotchKit](https://github.com/MrKai77/DynamicNotchKit) (MIT), [dynamicnotch](https://github.com/jackson-storm/dynamicnotch) (GPL-3.0) y [DynamicWin](https://github.com/FlorianButz/DynamicWin) (CC BY-SA 4.0) | Proyectos de "isla dinámica" para macOS y Windows. No revisé su código. | Más ideas de desplegado con muelle. |

## Cómo usar esta lista

- Antes de diseñar un widget nuevo (por ejemplo, el ecualizador del popup de audio), mirar cómo se resuelve aquí y decidir qué patrón encaja con nuestro stack.
- Empezar por los repos con el mismo stack (Astal, gnim); el resto se toma como diseño.
- No copiar código sin revisar la licencia: los repos de dotfiles de este proyecto son públicos.
- Añadir aquí cada referencia nueva con qué es, su stack y para qué se mira.
