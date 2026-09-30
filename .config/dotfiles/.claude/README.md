# Referencias de diseño

Repositorios y páginas de los que se toman ideas (diseño, estructura, widgets) para el escritorio: la barra y los popups de AGS, Rofi, los dashboards y el tema. Son inspiración: no se copia código sin revisar su licencia ni sin adaptarlo a las reglas de [CLAUDE.md](CLAUDE.md) (una config para todas las laptops por hostname, sin rutas absolutas, colores de Matugen sin trackear y nada de subscribe dentro de un poll).

Nuestro stack es **AGS v3 + Astal (GTK4) + gnim** sobre Hyprland. Los repos con el mismo stack se pueden leer como código; los de Quickshell, Waybar o Eww sirven para el diseño y hay que reescribirlos.

Última revisión: 2026-09-30.

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

## Audio y ecualizador

Añadidas por Claude durante la investigación del popup de audio (2026-09-30); se pueden quitar si no interesan.

| Referencia | Qué es | Stack |
|---|---|---|
| [bhack/mini-eq](https://github.com/bhack/mini-eq) | Ecualizador paramétrico compacto de todo el sistema para PipeWire, con `filter-chain` y biquads nativos. | GTK/Libadwaita, PipeWire |
| [AlejandroZmtZ/EQ-Space-for-Linux](https://github.com/AlejandroZmtZ/EQ-Space-for-Linux) | EQ paramétrico con interfaz gráfica: una ruta de EQ de sistema, selector de la salida física y volumen y mute por aplicación. | Python, PipeWire |
| [knightinfected/PipeWireController](https://github.com/knightinfected/PipeWireController/) | Centro de control de audio: enrutado, EQ paramétrico como dispositivo de salida y reglas por aplicación. | GTK4/Libadwaita, PipeWire |
| [wwmm/easyeffects](https://github.com/wwmm/easyeffects) | Efectos y ecualizador para las apps de PipeWire. Una cadena global de entrada y otra de salida; su línea de comandos solo carga presets y hace bypass. | PipeWire |
| [seele-shell #59](https://github.com/silas00301/seele-shell/pull/59) y [dotfiles #26](https://github.com/fhlkfds/dotfiles/pull/26) | Dos PR que añaden un mezclador por aplicación a un panel de audio: cómo se resuelve el nombre y el icono de cada app, el tope de 100 % y los sliders dentro de contenedores con scroll. | Quickshell (QML) |

## Cómo usar esta lista

- Antes de diseñar un widget nuevo (por ejemplo, el ecualizador del popup de audio), mirar cómo se resuelve aquí y decidir qué patrón encaja con nuestro stack.
- Empezar por los repos con el mismo stack (Astal, gnim); el resto se toma como diseño.
- No copiar código sin revisar la licencia: los repos de dotfiles de este proyecto son públicos.
- Añadir aquí cada referencia nueva con qué es, su stack y para qué se mira.
