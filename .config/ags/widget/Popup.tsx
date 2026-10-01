import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"

// ── Popups de la barra — ventana layer-shell + colocación bajo un módulo ─────────────────────
// Lo comparten MediaPlayer.tsx, AudioPopup.tsx y NetworkPopup.tsx: la ventana (anclaje, cierre con
// Esc o al perder el foco) y, para los que se abren desde un módulo de la barra, dónde aparecen.
// Cada popup solo aporta su contenido.
//
// Uso:  <Popup name="audio-popup" class="AudioPopup" width={340}> …contenido… </Popup>
//       onClicked={(self) => togglePopup("audio-popup", self)}   // en el módulo de la barra
// La clase CSS de la ventana es la que usan los estilos (window.AudioPopup …) y dentro va un
// `.popup-root` con el look de píldora (mixin popup-surface en _shared.scss).

const MARGIN_TOP  = 5   // gap visual real entre el popup y la barra (ver el comentario de la ventana)
const MARGIN_SIDE = 8   // distancia mínima al borde derecho del monitor

// Ancho de cada popup registrado: togglePopup lo necesita para centrarlo bajo el módulo.
const widths = new Map<string, number>()

type PopupProps = {
  name: string                          // nombre de la ventana (app.get_window, `ags toggle`)
  class: string                         // clase CSS de la ventana
  anchor?: "top-right" | "top-center"   // right: bajo un módulo de la derecha (togglePopup) · center: centrado arriba
  width?: number                        // ancho fijo del contenido
  // false = la ventana sigue el tamaño natural de su contenido, también cuando crece o se achica después de
  // abrirse. Una ventana GTK4 "resizable" solo crece hasta el MÍNIMO del contenido: una lista con
  // ScrolledWindow que se llena tras abrir (las redes llegan con el escaneo, unos segundos después) queda
  // recortada a su alto mínimo y hay que desplazarse (medido: 58 px de lista con 8 redes disponibles).
  resizable?: boolean
  orientation?: Gtk.Orientation
  spacing?: number
  onShow?: () => void                   // cada vez que se abre (clic o `ags toggle`)
  onHide?: () => void
  children?: JSX.Element | Array<JSX.Element>
}

export function Popup({
  name, class: cssClass, anchor = "top-right", width, onShow, onHide, children,
  resizable = true, orientation = Gtk.Orientation.VERTICAL, spacing = 8,
}: PopupProps) {
  if (width) widths.set(name, width)

  return (
    <window
      name={name}
      class={cssClass}
      visible={false}
      application={app}
      resizable={resizable}
      keymode={Astal.Keymode.ON_DEMAND}
      $={(self) => {
        // anchor y márgenes se fijan acá y no como props iniciales: con anchor en las props,
        // Gtk.Application no registra la ventana (app.get_window / toggle_window fallan con "no
        // window registered"). Verificado con el popup de Spotify; el antiguo de calendario, que no
        // tenía anchor, sí se registraba.
        //
        // El margen va ANTES que el anchor o queda ignorado. Verificado con hyprctl layers:
        // Hyprland ya descuenta la zona exclusiva de la barra (exclusivity: EXCLUSIVE) del área
        // disponible, así que marginTop ES directamente el gap visual entre el popup y la barra: no
        // hay que sumarle el alto de la barra ni su propio margin. Barra arriba → popup anclado
        // arriba, para que aparezca justo debajo.
        // marginRight es el valor por defecto de "top-right"; togglePopup lo recalcula en cada
        // apertura para centrar el popup bajo el módulo.
        self.marginTop = MARGIN_TOP
        if (anchor === "top-right") {
          self.marginRight = MARGIN_SIDE
          self.anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT
        } else {
          self.anchor = Astal.WindowAnchor.TOP
        }

        self.connect("notify::visible", () => { if (self.visible) onShow?.(); else onHide?.() })

        // Se cierra solo al perder el foco (clic afuera): así no queda interrumpiendo en pantalla.
        // wasActive evita cerrarlo apenas se abre (is-active empieza en false, de forma async, hasta
        // que el compositor le da foco): solo se cierra en la transición true → false.
        let wasActive = false
        self.connect("notify::is-active", () => {
          if (self.is_active) {
            wasActive = true
          } else if (wasActive) {
            wasActive = false
            self.visible = false
          }
        })

        const ctrl = new Gtk.EventControllerKey()
        ctrl.connect("key-pressed", (_c: Gtk.EventControllerKey, keyval: number) => {
          if (keyval === Gdk.KEY_Escape) self.visible = false
          return false
        })
        self.add_controller(ctrl)
      }}
    >
      <box class="popup-root" orientation={orientation} spacing={spacing}
        widthRequest={width ?? -1}
      >
        {children}
      </box>
    </window>
  )
}

// ── Apertura desde un módulo de la barra ──────────────────────────────────────────────────────
// Abre (o cierra, si ya está abierto) el popup `name` en el monitor de la barra donde se hizo clic
// y centrado bajo el módulo `anchor` (recortado al borde derecho). El monitor y el margen se fijan
// con la ventana oculta: una superficie layer-shell ya mapeada no cambia de salida.

export function togglePopup(name: string, anchor: Gtk.Widget) {
  const win = app.get_window(name) as Astal.Window | null
  if (!win) return
  if (win.visible) { win.visible = false; return }

  const bar = anchor.get_root() as unknown as Astal.Window | null
  const monitor = bar?.gdkmonitor
  if (bar && monitor) {
    const [ok, rect] = anchor.compute_bounds(bar)
    if (ok) {
      const center = rect.get_x() + rect.get_width() / 2
      const width  = widths.get(name) ?? 0
      win.marginRight = Math.max(MARGIN_SIDE, Math.round(monitor.get_geometry().width - center - width / 2))
    }
    win.gdkmonitor = monitor
  }
  win.visible = true
}
