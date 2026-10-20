import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import Cairo from "cairo"
import { closeAllPopups, registerBackdrop, barStrip } from "./Popup"

// Ventana transparente a pantalla completa (una por monitor) que recoge los clics hechos fuera de un popup
// mientras hay alguno abierto: cualquier clic en ella (cualquier botón) cierra todos los popups. Popup.tsx la
// muestra al abrirse el primer popup y la oculta al cerrarse el último (oculta no tiene superficie: no gasta
// memoria ni composición).
//
// Capa TOP: por encima de las ventanas normales (así recoge también los clics en la terminal, el IDE o el
// navegador) y por debajo de los popups, que van en OVERLAY, sea cual sea el orden en que se mapeen. Se
// probó antes en BOTTOM (debajo de las ventanas, para no gastar el clic en ellas) y no basta: con
// `input:mouse_refocus = false` —el ajuste de este escritorio— un clic en la ventana que ya estaba activa no
// le quita el foco al popup, y el popup no tiene forma de enterarse. El precio: el clic que cierra se
// consume, como en cualquier menú modal; no llega a la ventana de debajo.
//
// La franja de la barra se deja fuera de la región de entrada de la superficie: ahí los clics y el hover son de
// la barra (píldoras, su propio gesto de cierre en `watchOutsideClicks`) y no de esta ventana.
//
// Trampa (medida en el compositor anidado): una ventana sin nada que dibujar —fondo transparente y sin hijos
// visibles— no llega a mapearse bien: GTK no genera ningún nodo de dibujo y no envía el búfer, Hyprland deja
// la capa con alfa 0 (`hyprctl layers`: "alpha": 0) y no le entrega el puntero (ni `enter` ni clics). Un punto
// de 1 px con alfa 1/255 en una esquina (`.popup-backdrop-dot`) basta para que se dibuje y funcione, sin
// oscurecer el fondo de pantalla (un fondo con alfa 1/255 en toda la ventana también funcionaba pero tiñe).

export default function PopupBackdrop(gdkmonitor: Gdk.Monitor) {
  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor
  const connector = gdkmonitor.get_connector() ?? ""

  return (
    <window
      visible={false}
      name={`popup-backdrop-${connector}`}
      namespace="ags-popup-backdrop"
      class="PopupBackdrop"
      gdkmonitor={gdkmonitor}
      application={app}
      layer={Astal.Layer.TOP}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.NONE}
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      $={(self) => {
        registerBackdrop(self)

        // Región de entrada: todo menos la franja que ocupa la barra (lo de encima, los 8 px del margen, sí
        // cuenta como fuera). Enorme hacia abajo y a la derecha a propósito: el compositor la recorta a la
        // superficie, como en Popup.tsx.
        self.connect("map", () => {
          const surface = self.get_surface()
          if (!surface) return
          const { top, bottom } = barStrip(connector)
          const region = new Cairo.Region()
          if (top > 0) region.unionRectangle({ x: 0, y: 0, width: 100000, height: top })
          region.unionRectangle({ x: 0, y: bottom, width: 100000, height: 100000 })
          surface.set_input_region(region)
        })

        const click = new Gtk.GestureClick()
        click.set_button(0)                         // cualquier botón
        click.connect("pressed", () => closeAllPopups())
        self.add_controller(click)
      }}
    >
      <box class="popup-backdrop-dot" halign={Gtk.Align.START} valign={Gtk.Align.START} canTarget={false} />
    </window>
  )
}
