import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gsk from "gi://Gsk?version=4.0"
import Graphene from "gi://Graphene"
import Cairo from "cairo"
import { POPUP_PAD, STEM_H, drawPopupShape, drawPillBand, type Stem } from "./popupShape"

// ── Popups de la barra — ventana layer-shell fundida con su píldora de origen ────────────────
// Lo comparten MediaPlayer.tsx, AudioPopup.tsx y NetworkPopup.tsx: la ventana (cierre con Esc o al
// perder el foco), su forma y cómo aparece. Cada popup solo aporta su contenido.
//
// El popup cuelga de la píldora desde la que se abrió como una sola silueta (idea de boring.notch):
// un cuello del ancho de la píldora que se abre con esquinas cóncavas hacia la tarjeta. Para eso:
//   · La silueta la dibuja Cairo (widget/popupShape.ts) detrás del contenido; los colores, el glow
//     y el "más sólido al pasar el ratón" salen del CSS (_popup.scss), así que siguen a Matugen.
//   · UN SOLO MARCO. La ventana empieza en el borde SUPERIOR de la píldora (exclusivity IGNORE: se coloca
//     desde el borde del monitor, no desde la zona reservada de la barra), por encima de la barra
//     (OVERLAY), y dibuja ella el marco de la píldora (borde y glow, `drawPillBand`) además del del
//     cuello y la tarjeta; la píldora oculta el suyo (clases `fused` y `framed`, _shared.scss). Así el
//     borde y el glow de las tres partes salen del mismo código y no hay dos marcos que casar: dibujar
//     cada superficie con su propio motor (CSS en la barra, Cairo aquí) dejaba un borde distinto, un
//     glow que se cortaba en la unión y 2 filas sin borde. Caelestia (Quickshell) lo resuelve con una
//     única ventana a pantalla completa; esto es lo mismo a la medida de cada popup.
//   · La parte de la ventana que cubre la píldora NO recibe entradas (región de entrada de la
//     superficie): el clic, el hover y el tooltip siguen siendo de la píldora, que está debajo.
//   · Apertura: el popup se desliza hacia abajo desde la píldora (un recorte lo oculta por encima de
//     su borde inferior, como un cajón que sale de la barra). Cierre: lo hace el compositor con un
//     fundido (layersOut + fadeLayersOut en animation.conf), sin código aquí.
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
  // Coloca el popup colgando de `pill` (de la barra `bar`) y lo deja listo para abrirse. Sin píldora (o si no
  // se puede medir) lo deja suelto, sin cuello. Devuelve si quedó colgando de la píldora.
  place: (pill: Gtk.Widget | null, bar: Astal.Window | null) => boolean
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
  let glowColor!: Gtk.Widget
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
        // del borde superior de la ventana (place() la fija al borde superior de la píldora) y
        // marginLeft su posición horizontal. OVERLAY = por encima de la barra.
        self.exclusivity = Astal.Exclusivity.IGNORE
        self.layer = Astal.Layer.OVERLAY
        self.marginTop = 0
        self.marginLeft = 0
        self.anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT

        // Estructura de la ventana (todo en un Gtk.Fixed para colocar y deslizar sin cambiar el tamaño de
        // la ventana, que sería una reconfiguración por fotograma):
        //   · `band`: el marco de la píldora, arriba (alto = el de la píldora).
        //   · `clip`: debajo de la píldora; recorta el deslizamiento y contiene el grupo (silueta + contenido).
        // El JSX deja el grupo como hijo de la ventana y aquí se reubica.
        const group = self.get_child() as Gtk.Overlay
        const outer = new Gtk.Fixed()
        self.set_child(outer)
        const clip = new Gtk.Fixed()
        clip.set_overflow(Gtk.Overflow.HIDDEN)
        clip.put(group, 0, 0)
        outer.put(clip, 0, 0)
        group.set_measure_overlay(content, true)

        // GtkFixed mide a sus hijos teniendo en cuenta su transformación: con el grupo desplazado hacia arriba
        // por el deslizamiento, la ventana medía menos y crecía fotograma a fotograma durante la apertura
        // (medido: 34 → 80 → 119 → 151 … → 255 px), una reconfiguración de la superficie por fotograma, y con
        // las animaciones de capa del compositor el contenido asomaba por encima del recorte. Se fija un tamaño
        // mínimo igual al natural del grupo: la ventana mide lo mismo desde el primer fotograma. Hay que
        // refrescarlo cuando el contenido cambia de tamaño (la lista de redes que se llena): lo hace startTrack.
        let pinned = ""
        const pinSize = () => {
          const gw = group.measure(Gtk.Orientation.HORIZONTAL, -1)[1]
          const gh = group.measure(Gtk.Orientation.VERTICAL, gw)[1]
          const key = `${gw}x${gh}`
          if (key === pinned) return
          pinned = key
          clip.set_size_request(gw, gh)
        }

        const colors = () => ({
          card:   shape.get_color(),
          stem:   stemColor.get_color(),
          border: borderColor.get_color(),
          glow:   glowColor.get_color(),
        })

        shape.set_draw_func((_area, cr, w, h) => drawPopupShape(cr, w, h, stem, colors()))

        // Marco de la píldora: se dibuja solo cuando la píldora ya está fundida (bandOn), sin deslizarse.
        const band = new Gtk.DrawingArea()
        band.set_can_target(false)
        outer.put(band, 0, 0)
        let bandOn = false
        let bandH = 0                   // alto de la píldora = alto del área = y donde empieza el cuello
        band.set_draw_func((_area, cr, w, h) => { if (bandOn) drawPillBand(cr, w, h, colors()) })

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

        // ── Región de entrada: la ventana cubre la píldora, pero no le quita el ratón ─────────────────
        // Lo de arriba (el alto de la píldora) pasa a la superficie de debajo, la barra. La región es
        // enorme hacia abajo y a la derecha a propósito: se recorta sola a la superficie y no hay que
        // actualizarla cuando la ventana cambia de tamaño.
        const applyInputRegion = () => {
          const surface = self.get_surface()
          if (!surface) return
          const region = new Cairo.Region()
          region.unionRectangle({ x: 0, y: bandH, width: 100000, height: 100000 })
          surface.set_input_region(region)
        }
        self.connect("map", applyInputRegion)

        // ── Colocación bajo la píldora ──────────────────────────────────────────────────────────────
        let pill: Gtk.Widget | null = null
        let bar: Astal.Window | null = null
        let geom = ""                    // geometría con la que se colocó (para detectar cambios con el popup abierto)

        const layout = () => {
          pinSize()
          outer.move(clip, 0, bandH)
          if (stem && bandH > 0) {
            outer.move(band, stem.left, 0)
            band.set_size_request(stem.right - stem.left + 2 * POPUP_PAD, bandH)
            band.set_visible(true)
          } else {
            band.set_visible(false)
          }
          shape.queue_draw()
          band.queue_draw()
          applyInputRegion()
        }

        const place = (p: Gtk.Widget | null, b: Astal.Window | null): boolean => {
          pill = p; bar = b
          const monitor = b?.gdkmonitor
          const [ok, rect] = p && b && monitor ? p.compute_bounds(b) : [false, null]
          if (!p || !b || !monitor || !ok || !rect) {
            stem = null; bandH = 0; geom = ""; pill = null; bar = null
            content.set_size_request(width ?? -1, -1)
            layout()
            return false
          }
          const monW  = monitor.get_geometry().width
          // La tarjeta nunca más angosta que la píldora: si no, el cuello se sale de ella (la píldora del
          // sistema con CPU y temperatura desplegados mide más que el popup de audio).
          content.set_size_request(Math.max(width ?? -1, Math.ceil(rect.get_width()) - 2 * POPUP_PAD), -1)
          const cardW = group.measure(Gtk.Orientation.HORIZONTAL, -1)[1] - 2 * POPUP_PAD
          const pillL = rect.get_x()
          const pillR = pillL + rect.get_width()
          const left  = Math.max(MARGIN_SIDE, Math.min(Math.round((pillL + pillR) / 2 - cardW / 2), monW - MARGIN_SIDE - cardW))
          // Los bordes del cuello son el filo exterior de la píldora (el borde del popup se pinta por dentro
          // del filo, como el CSS de la píldora): su borde lateral queda sobre el del cuello, píxel a píxel.
          stem  = { left: pillL - left, right: pillR - left }
          bandH = Math.round(rect.get_height())
          self.marginTop  = Math.round(b.marginTop + rect.get_y())      // borde SUPERIOR de la píldora
          self.marginLeft = left - POPUP_PAD
          geom = `${pillL}|${pillR}|${rect.get_y()}|${rect.get_height()}|${cardW}`
          layout()
          return true
        }

        // Con el popup abierto la píldora puede cambiar de tamaño (otra canción con un título más largo, los
        // módulos de CPU y temperatura que se despliegan al pasar el ratón): se vuelve a colocar el popup
        // para que el cuello y el marco la sigan, en vez de quedar trazados con el ancho de cuando se abrió.
        let trackId = 0
        const stopTrack = () => { if (trackId) { self.remove_tick_callback(trackId); trackId = 0 } }
        const startTrack = () => {
          stopTrack()
          trackId = self.add_tick_callback(() => {
            pinSize()
            if (pill && bar) {
              const [ok, r] = pill.compute_bounds(bar)
              if (ok) {
                const cardW = group.measure(Gtk.Orientation.HORIZONTAL, -1)[1] - 2 * POPUP_PAD
                const now = `${r.get_x()}|${r.get_x() + r.get_width()}|${r.get_y()}|${r.get_height()}|${cardW}`
                if (now !== geom) place(pill, bar)
              }
            }
            return GLib.SOURCE_CONTINUE
          })
        }

        // ── Deslizamiento de apertura ────────────────────────────────────────────────────
        const setOffset = (y: number) =>
          clip.set_child_transform(group, new Gsk.Transform().translate(new Graphene.Point({ x: 0, y })))
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
            if (p >= FUSE_AT) applyFuse()
            if (p >= 1) { tick = 0; return GLib.SOURCE_REMOVE }
            return GLib.SOURCE_CONTINUE
          })
        }

        // ── Píldora de origen: se funde con el popup mientras está abierto ───────────────────────
        // `fused` = sin esquinas ni borde inferiores (el popup cuelga de ella); `framed` = su marco lo
        // dibuja el popup (band), así que oculta el suyo. Las dos entran juntas, para que el marco no
        // desaparezca ni se duplique.
        let unfuseTimer = 0
        const applyFuse = () => {
          if (!pill) return
          fusedBy.set(pill, name)
          pill.add_css_class("fused")
          pill.add_css_class("framed")
          if (!bandOn) { bandOn = true; band.queue_draw() }
        }
        controls.set(name, { win: self as Astal.Window, place })

        self.connect("notify::visible", () => {
          if (self.visible) {
            if (unfuseTimer) { GLib.source_remove(unfuseTimer); unfuseTimer = 0 }
            // `popup-open` desde el clic (no desde la fusión, al 85 % del deslizamiento): la píldora de música
            // desvanece su relleno de progreso a la vez que baja el popup, para que no se vea el escalón de
            // color con el cuello. Y la píldora pasa a ser de este popup desde ya: el temporizador de cierre
            // de otro popup que acabe de cerrarse sobre la misma píldora no le quita las clases al nuevo.
            if (pill) { fusedBy.set(pill, name); pill.add_css_class("popup-open") }
            bandOn = false
            band.queue_draw()
            startSlide()
            startTrack()
            onShow?.()
          } else {
            stopSlide()
            stopTrack()
            const p = pill
            if (p) {
              // El marco vuelve a la píldora en cuanto empieza el cierre: el del popup se desvanece
              // encima con el fundido del compositor (sin hueco ni parpadeo). Las esquinas y el borde
              // inferiores los recupera tras el fundido, como antes.
              if (fusedBy.get(p) === name) p.remove_css_class("framed")
              unfuseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNFUSE_MS, () => {
                unfuseTimer = 0
                if (fusedBy.get(p) === name) { fusedBy.delete(p); p.remove_css_class("fused"); p.remove_css_class("popup-open") }
                return GLib.SOURCE_REMOVE
              })
            }
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
        <box $type="overlay" class="popup-glow-color" canTarget={false}
          halign={Gtk.Align.START} valign={Gtk.Align.START}
          $={(self: Gtk.Widget) => { glowColor = self }}
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
// colgando de la píldora que contiene `anchor`: la ventana empieza en el borde superior de la
// píldora (para dibujar su marco) y se centra bajo ella (sin salirse del monitor); el cuello de la
// silueta ocupa justo el ancho de la píldora. El monitor y los márgenes se fijan con la ventana
// oculta: una superficie layer-shell ya mapeada no cambia de salida.

export function togglePopup(name: string, anchor: Gtk.Widget) {
  const c = controls.get(name)
  if (!c) return
  const win = c.win
  if (win.visible) { win.visible = false; return }

  const bar = anchor.get_root() as unknown as Astal.Window | null
  const pill = findPill(anchor)
  if (bar?.gdkmonitor && pill && c.place(pill, bar)) win.gdkmonitor = bar.gdkmonitor
  else c.place(null, null)
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
