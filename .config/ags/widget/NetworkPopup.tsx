import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import { For, createComputed, onCleanup } from "ags"
import GLib  from "gi://GLib"
import Pango from "gi://Pango"
import { Popup } from "./Popup"
import {
  ethGlyph, formatSpeed, netStore, wifiGlyph,
  type EthView, type NetStore,
} from "./network"

// ── Popup de red — interruptor de Wi-Fi, redes cercanas y estado de Ethernet ─────────────────
// Se abre con clic en el módulo de red de la barra (togglePopup("network-popup"), desde
// BottomBar.tsx). Esc o clic afuera lo cierra. La ventana y su colocación son de Popup.tsx.
//
// Todo el estado y la lógica de conexión viven en widget/network.ts (libnm por señales: sin polling
// ni subprocesos). Este archivo solo dibuja un NetStore; por defecto el real, pero se puede pasar
// otro con datos de prueba (Wi-Fi apagado, conectando, error…) para verlo sin tocar la red.

const POPUP_WIDTH = 340       // ancho fijo del popup (también centra el popup bajo el módulo: ver Popup.tsx)

// Alto de la lista de redes. Una fila mide 27 px más 2 de separación (medido: 8 filas = 230 px).
// Mínimo: 4 filas, para que la lista no abra enana mientras llegan las redes del escaneo y se vean
// al menos 4 sin desplazarse. Máximo: 7 filas y media, para que la octava asome cortada y se note que
// hay más; pasado eso se desplaza.
const ROW_PITCH       = 29
const LIST_MIN_HEIGHT = 4 * ROW_PITCH - 2             // 114
const LIST_MAX_HEIGHT = Math.round(7.5 * ROW_PITCH)   // 218

const G = {
  refresh: "\u{F0450}",   // 󰑐
  cog:     "\u{F0493}",   // 󰒓
  check:   "\u{F012C}",   // 󰄬
}

function ethText(e: EthView): string {
  switch (e.status) {
    case "connected":    return e.speed > 0 ? `Conectado · ${formatSpeed(e.speed)}` : "Conectado"
    case "connecting":   return "Conectando…"
    case "disconnected": return "Sin conexión"
    default:             return "Sin cable"
  }
}

// ── Fila de una red ───────────────────────────────────────────────────────────────────────────
// La lista se identifica por SSID (strings estables): <For> solo crea o quita filas cuando una red
// aparece o desaparece, y los datos de cada fila se leen del mapa `nets`, que se actualiza en sitio.
// Así el campo de contraseña no se destruye cuando llega una actualización.

function NetRow({ ssid, store }: { ssid: string; store: NetStore }) {
  const net        = store.nets.as(m => m.get(ssid))
  const att        = store.attempt.as(a => (a && a.ssid === ssid ? a : null))
  const connecting = att.as(a => a?.phase === "connecting")
  const error      = att.as(a => (a?.phase === "failed" ? a.message : ""))
  const isOpen     = store.passwordFor.as(p => p === ssid)
  const active     = net.as(n => !!n?.active)

  let entry: Gtk.PasswordEntry | null = null

  const submit = () => {
    const pw = entry?.text ?? ""
    if (!pw) return
    store.connect(ssid, pw)
    entry?.set_text("")   // la clave no se queda en el campo
  }

  // Al abrirse el campo recibe el foco; al cerrarse se descarta lo escrito.
  const stop = isOpen.subscribe(() => {
    if (isOpen.peek()) GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { entry?.grab_focus(); return GLib.SOURCE_REMOVE })
    else entry?.set_text("")
  })
  onCleanup(stop)

  return (
    <box class="net-item" orientation={Gtk.Orientation.VERTICAL}>
      <box spacing={4}>
        <button class={active.as(a => a ? "net-row active" : "net-row")} hexpand
          onClicked={() => store.select(ssid)}
        >
          <box spacing={8} valign={Gtk.Align.CENTER}>
            <label class="net-icon"
              label={net.as(n => n ? wifiGlyph(n.strength, n.security !== "open") : "")} />
            <label class="net-name" hexpand halign={Gtk.Align.START} label={ssid}
              maxWidthChars={26} ellipsize={Pango.EllipsizeMode.END} />
            <label class="net-tag" label="Conectando…" visible={connecting} />
            <label class="net-tag" label="Guardada"
              visible={createComputed(() => !!net()?.saved && !active() && !connecting())} />
            <label class="net-check" label={G.check} visible={active} />
          </box>
        </button>
        <button class="net-disconnect" visible={active} onClicked={() => store.disconnect()}>
          <label label="Desconectar" />
        </button>
      </box>

      <revealer revealChild={isOpen} transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
        transitionDuration={150}
      >
        <box class="net-auth" spacing={6}>
          <Gtk.PasswordEntry class="net-password" hexpand placeholderText="Contraseña" showPeekIcon
            onActivate={submit}
            $={(self: Gtk.PasswordEntry) => {
              entry = self
              // Esc dentro del campo solo lo cierra; el popup se cierra con el siguiente Esc.
              const ctrl = new Gtk.EventControllerKey()
              ctrl.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
              ctrl.connect("key-pressed", (_c: Gtk.EventControllerKey, keyval: number) => {
                if (keyval !== Gdk.KEY_Escape) return false
                store.cancelPassword()
                return true
              })
              self.add_controller(ctrl)
            }}
          />
          <button class="net-connect" onClicked={submit}>
            <label label="Conectar" />
          </button>
        </box>
      </revealer>

      <label class="net-error" halign={Gtk.Align.START} xalign={0} wrap
        label={error} visible={error.as(e => e !== "")} />
    </box>
  )
}

// ── Ventana ───────────────────────────────────────────────────────────────────────────────────

export default function NetworkPopup({ store = netStore, name = "network-popup" }: { store?: NetStore; name?: string } = {}) {
  // none: sin adaptador Wi-Fi · hw: apagado por hardware · off: apagado · list: encendido
  const mode = createComputed(() =>
    !store.hasWifi() ? "none" : !store.wifiHw() ? "hw" : !store.wifiEnabled() ? "off" : "list")
  const emptyList = createComputed(() => mode() === "list" && store.order().length === 0)
  const showList  = createComputed(() => mode() === "list" && store.order().length > 0)
  // El radio está realmente encendido solo si lo está por software Y por hardware.
  const radioOn   = createComputed(() => store.wifiEnabled() && store.wifiHw())

  return (
    // resizable={false}: la ventana sigue a la lista cuando llegan las redes tras abrir (ver Popup.tsx).
    <Popup name={name} class="NetworkPopup" width={POPUP_WIDTH} resizable={false}
      onShow={store.onShow} onHide={store.onHide}
    >
      <box class={store.eth.as(e => e.status === "connected" ? "net-eth connected" : "net-eth")}
        spacing={8} valign={Gtk.Align.CENTER} visible={store.eth.as(e => e.present)}
      >
        <label class="net-eth-icon" label={store.eth.as(e => ethGlyph(e.status))} />
        <label class="net-eth-name" label="Ethernet" hexpand halign={Gtk.Align.START} />
        <label class="net-eth-status" label={store.eth.as(ethText)} />
      </box>

      <box orientation={Gtk.Orientation.VERTICAL} spacing={4} visible={store.hasWifi}>
        <box class="net-head" spacing={8} valign={Gtk.Align.CENTER}>
          <label class="net-title" label="Wi-Fi" hexpand halign={Gtk.Align.START} />
          <Gtk.Spinner class="net-spinner" spinning visible={store.scanning} />
          <button class="net-refresh" visible={store.scanning.as(s => !s)}
            sensitive={radioOn} onClicked={() => store.scan()}
          >
            <label class="net-refresh-icon" label={G.refresh} />
          </button>
          <switch class="net-switch" valign={Gtk.Align.CENTER}
            active={radioOn} sensitive={store.wifiHw}
            onNotifyActive={(self: Gtk.Switch) => {
              // Con el hardware apagado el interruptor se ve apagado y no se toca lo que hay por software.
              if (!store.wifiHw.peek()) return
              if (self.active !== store.wifiEnabled.peek()) store.setWifiEnabled(self.active)
            }}
          />
        </box>

        <label class="net-hint" halign={Gtk.Align.START} xalign={0} wrap maxWidthChars={38}
          visible={mode.as(m => m === "hw" || m === "off")}
          label={mode.as(m => m === "hw" ? "Wi-Fi apagado por hardware (tecla de modo avión o interruptor)" : "Wi-Fi apagado")} />
        <label class="net-hint" halign={Gtk.Align.START} visible={emptyList}
          label={store.scanning.as(s => s ? "Buscando redes…" : "No se encontraron redes")} />

        <scrolledwindow class="net-scroll" visible={showList}
          hscrollbarPolicy={Gtk.PolicyType.NEVER} propagateNaturalHeight
          minContentHeight={LIST_MIN_HEIGHT} maxContentHeight={LIST_MAX_HEIGHT}
        >
          <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
            <For each={store.order}>
              {(ssid: string) => <NetRow ssid={ssid} store={store} />}
            </For>
          </box>
        </scrolledwindow>
      </box>

      <label class="net-hint" halign={Gtk.Align.START} label="Sin dispositivos de red"
        visible={createComputed(() => !store.hasWifi() && !store.eth().present)} />

      <box class="net-sep" />
      <button class="net-advanced"
        onClicked={() => {
          store.openAdvanced()
          const win = app.get_window(name)
          if (win) win.visible = false
        }}
      >
        <box spacing={8} valign={Gtk.Align.CENTER}>
          <label class="net-advanced-icon" label={G.cog} />
          <label class="net-advanced-text" label="Configuración avanzada…" hexpand halign={Gtk.Align.START} />
        </box>
      </button>
    </Popup>
  )
}
