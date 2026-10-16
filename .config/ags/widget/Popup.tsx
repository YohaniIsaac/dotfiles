import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gsk from "gi://Gsk?version=4.0"
import Graphene from "gi://Graphene"
import { BORDER_W, POPUP_PAD, STEM_H, drawPopupShape, type Stem } from "./popupShape"

// ── Popups de la barra — ventana layer-shell fundida con su píldora de origen ────────────────
// Lo comparten MediaPlayer.tsx, AudioPopup.tsx y NetworkPopup.tsx: la ventana (cierre con Esc o al
// perder el foco), su forma y cómo aparece. Cada popup solo aporta su contenido.
//
// El popup cuelga de la píldora desde la que se abrió como una sola silueta (idea de boring.notch):
// un cuello del ancho de la píldora que se abre con esquinas cóncavas hacia la tarjeta. Para eso:
//   · La silueta la dibuja Cairo (widget/popupShape.ts) detrás del contenido; los colores, el glow
//     y el "más sólido al pasar el ratón" salen del CSS (_popup.scss), así que siguen a Matugen.
//   · La ventana empieza justo en el borde inferior de la píldora (exclusivity IGNORE: se coloca
//     desde el borde del monitor, no desde la zona reservada de la barra) y la píldora recibe la
//     clase `fused`: pierde sus esquinas y borde inferiores mientras el popup está abierto.
//   · Apertura: el popup se desliza hacia abajo desde la píldora (la ventana recorta lo que queda
//     por encima de su borde superior, como un cajón que sale de la barra). Cierre: lo hace el
//     compositor con un fundido (layersOut + fadeLayersOut en animation.conf), sin código aquí.
//
// Uso:  <Popup name="audio-popup" class="AudioPopup" width={340}> …contenido… </Popup>
//       onClicked={(self) => togglePopup("audio-popup", self)}   // en el módulo de la barra
// La clase CSS de la ventana es la que usan los estilos (window.AudioPopup …) y dentro va un
// `.popup-root` con el contenido (mixin popup-content en _shared.scss).

const MARGIN_SIDE = 8        // distancia mínima al borde del monitor
const SLIDE_MS    = 350      // duración del deslizamiento de apertura
const FUSE_AT     = 0.85     // la píldora se "funde" cuando el deslizamiento llega a este punto (el cuello es lo último en entrar)
const UNFUSE_MS   = 150      // al cerrar, la píldora recupera su forma tras el fundido del compositor (~0,14 s)
const HOVER_FADE_MS = 260    // la transición de color del relleno al pasar el ratón dura 200 ms

const easeOutQuint = (x: number) => 1 - Math.pow(1 - x, 5)

type PopupControl = {
  win: Astal.Window
  cardWidth: () => number               // ancho de la tarjeta (sin el margen del glow)
  setStem: (stem: Stem) => void
  fuse: (pill: Gtk.Widget | null) => void   // píldora de origen de esta apertura
}
const controls = new Map<string, PopupControl>()
// Qué popup tiene "fundida" a cada píldora: si se pasa de uno a otro sobre la misma píldora (audio →
// red), el temporizador de cierre del primero no debe quitarle la clase al segundo.
const fusedBy = new Map<Gtk.Widget, string>()

// Píldora de la que cuelga el popup, a partir del widget donde se hizo clic (un módulo del
// sistema, o la propia píldora de música).
const PILL_CLASSES = ["media-inner", "sys-inner"]
function findPill(w: Gtk.Widget | null): Gtk.Widget | null {
  for (let x = w; x; x = x.get_parent()) {
    if (PILL_CLASSES.some(c => x!.has_css_class(c))) return x
  }
  return null
}

type PopupProps = {
  name: string                          // nombre de la ventana (app.get_window, `ags toggle`)
  class: string                         // clase CSS de la ventana
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
  name, class: cssClass, width, onShow, onHide, children,
  resizable = true, orientation = Gtk.Orientation.VERTICAL, spacing = 8,
}: PopupProps) {
  let content!: Gtk.Widget         // el `.popup-root`: el overlay mide por él
  let stemColor!: Gtk.Widget       // portadores de color (cajas de 0×0 con una clase CSS: solo se lee su `color`)
  let borderColor!: Gtk.Widget
  let shape!: Gtk.DrawingArea
  let stem: Stem = null

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
        // El margen va ANTES que el anchor o queda ignorado. IGNORE = la ventana se coloca desde el
        // borde del monitor, ignorando la zona exclusiva de la barra: marginTop es la altura absoluta
        // del borde superior del popup (togglePopup la fija al borde inferior de la píldora) y
        // marginLeft su posición horizontal. OVERLAY = por encima de la barra.
        self.exclusivity = Astal.Exclusivity.IGNORE
        self.layer = Astal.Layer.OVERLAY
        self.marginTop = 0
        self.marginLeft = 0
        self.anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT

        // La silueta se desliza con una transformación de un Gtk.Fixed (no cambia el tamaño de la
        // ventana, que sería una reconfiguración por fotograma): el JSX deja el grupo como hijo de la
        // ventana y aquí se mete en el Fixed.
        const group = self.get_child() as Gtk.Overlay
        const fixed = new Gtk.Fixed()
        self.set_child(fixed)
        fixed.put(group, 0, 0)
        group.set_measure_overlay(content, true)

        shape.set_draw_func((area, cr, w, h) => {
          drawPopupShape(cr, w, h, stem, {
            card:   area.get_color(),
            stem:   stemColor.get_color(),
            border: borderColor.get_color(),
          })
        })

        // El relleno de la tarjeta cambia de color al pasar el ratón (CSS con transición, que no avisa):
        // se repinta cada fotograma mientras dura.
        const burst = () => {
          const t0 = GLib.get_monotonic_time()
          shape.add_tick_callback(() => {
            shape.queue_draw()
            return (GLib.get_monotonic_time() - t0) / 1000 < HOVER_FADE_MS ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE
          })
        }
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", burst)
        motion.connect("leave", burst)
        group.add_controller(motion)

        // ── Deslizamiento de apertura ────────────────────────────────────────────────────
        const setOffset = (y: number) =>
          fixed.set_child_transform(group, new Gsk.Transform().translate(new Graphene.Point({ x: 0, y })))
        let tick = 0
        const stopSlide = () => { if (tick) { self.remove_tick_callback(tick); tick = 0 } }
        const startSlide = () => {
          stopSlide()
          const h = group.get_height() || group.measure(Gtk.Orientation.VERTICAL, -1)[1]
          const from = -(h + 2)
          setOffset(from)                       // antes del primer fotograma: sin destello en su sitio final
          const t0 = GLib.get_monotonic_time()
          tick = self.add_tick_callback(() => {
            const p = Math.min(1, (GLib.get_monotonic_time() - t0) / 1000 / SLIDE_MS)
            setOffset(from * (1 - easeOutQuint(p)))
            if (p >= FUSE_AT) control.applyFuse()
            if (p >= 1) { tick = 0; return GLib.SOURCE_REMOVE }
            return GLib.SOURCE_CONTINUE
          })
        }

        // ── Píldora de origen: se funde con el popup mientras está abierto ───────────────────────
        let pill: Gtk.Widget | null = null
        let unfuseTimer = 0
        const control: PopupControl & { applyFuse: () => void } = {
          win: self as Astal.Window,
          cardWidth: () => group.measure(Gtk.Orientation.HORIZONTAL, -1)[1] - 2 * POPUP_PAD,
          setStem: (s) => { stem = s; shape.queue_draw() },
          fuse: (p) => { pill = p },
          applyFuse: () => { if (pill) { fusedBy.set(pill, name); pill.add_css_class("fused") } },
        }
        controls.set(name, control)

        self.connect("notify::visible", () => {
          if (self.visible) {
            if (unfuseTimer) { GLib.source_remove(unfuseTimer); unfuseTimer = 0 }
            startSlide()
            onShow?.()
          } else {
            stopSlide()
            const p = pill
            if (p) unfuseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNFUSE_MS, () => {
              unfuseTimer = 0
              if (fusedBy.get(p) === name) { fusedBy.delete(p); p.remove_css_class("fused") }
              return GLib.SOURCE_REMOVE
            })
            onHide?.()
          }
        })

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
      <overlay class="popup-group">
        <drawingarea class="popup-shape" hexpand vexpand canTarget={false}
          $={(self: Gtk.DrawingArea) => { shape = self }}
        />
        <box $type="overlay" class="popup-stem-color" canTarget={false}
          halign={Gtk.Align.START} valign={Gtk.Align.START}
          $={(self: Gtk.Widget) => { stemColor = self }}
        />
        <box $type="overlay" class="popup-border-color" canTarget={false}
          halign={Gtk.Align.START} valign={Gtk.Align.START}
          $={(self: Gtk.Widget) => { borderColor = self }}
        />
        <box $type="overlay" class="popup-root" orientation={orientation} spacing={spacing}
          widthRequest={width ?? -1}
          marginTop={STEM_H} marginStart={POPUP_PAD} marginEnd={POPUP_PAD} marginBottom={POPUP_PAD}
          $={(self: Gtk.Widget) => { content = self }}
        >
          {children}
        </box>
      </overlay>
    </window>
  )
}

// ── Apertura desde un módulo de la barra ──────────────────────────────────────────────────────
// Abre (o cierra, si ya está abierto) el popup `name` en el monitor de la barra donde se hizo clic,
// colgando de la píldora que contiene `anchor`: la ventana empieza en el borde inferior de la
// píldora y se centra bajo ella (sin salirse del monitor); el cuello de la silueta ocupa justo el
// ancho de la píldora. El monitor y los márgenes se fijan con la ventana oculta: una superficie
// layer-shell ya mapeada no cambia de salida.

export function togglePopup(name: string, anchor: Gtk.Widget) {
  const c = controls.get(name)
  if (!c) return
  const win = c.win
  if (win.visible) { win.visible = false; return }

  const bar = anchor.get_root() as unknown as Astal.Window | null
  const monitor = bar?.gdkmonitor
  const pill = findPill(anchor)
  if (bar && monitor && pill) {
    const [ok, rect] = pill.compute_bounds(bar)
    if (ok) {
      const monW  = monitor.get_geometry().width
      const cardW = c.cardWidth()
      const pillL = rect.get_x()
      const pillR = pillL + rect.get_width()
      const left  = Math.max(MARGIN_SIDE, Math.min(Math.round((pillL + pillR) / 2 - cardW / 2), monW - MARGIN_SIDE - cardW))
      // Los bordes del cuello van a media anchura del borde (el trazo es centrado) para quedar
      // sobre el borde lateral de la píldora.
      c.setStem({ left: pillL - left + BORDER_W / 2, right: pillR - left - BORDER_W / 2 })
      win.marginTop  = Math.round(bar.marginTop + rect.get_y() + rect.get_height())
      win.marginLeft = left - POPUP_PAD
      c.fuse(pill)
    }
    win.gdkmonitor = monitor
  } else {
    c.setStem(null)
    c.fuse(null)
  }
  win.visible = true
}

// ── Apertura por comando (`ags request popup <nombre> [monitor]`) ────────────────────────────────
// Los módulos de la barra registran su widget como origen del popup; así un comando (o un atajo de
// teclado) abre el popup colgando de la misma píldora que con el clic, en el monitor indicado.

const origins = new Map<string, Gtk.Widget[]>()

export function registerPopupOrigin(name: string, widget: Gtk.Widget) {
  const list = origins.get(name) ?? []
  list.push(widget)
  origins.set(name, list)
}

export function openPopup(name: string, connector?: string): string {
  const list = origins.get(name)
  if (!list?.length) return `popup desconocido: ${name}`
  const onMonitor = (w: Gtk.Widget) =>
    (w.get_root() as unknown as Astal.Window | null)?.gdkmonitor?.get_connector() === connector
  const target = connector ? list.find(onMonitor) : list[0]
  if (!target) return `${name} no tiene píldora de origen en ${connector}`
  togglePopup(name, target)
  return "ok"
}
