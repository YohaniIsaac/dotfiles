import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { For, With, createBinding, createComputed } from "ags"
import Pango from "gi://Pango"
import Wp    from "gi://AstalWp"
import {
  defaultEndpoint, nodeName, refreshDefault, selectOutput, setVolume,
  speakers, streams, volumeIcon,
} from "./audio"

// ── Popup de audio — selector de salida, volumen general y un slider por aplicación ──────────
// Se abre con clic en el módulo de volumen de la barra (toggleAudioPopup, llamada desde
// BottomBar.tsx). Esc o clic afuera lo cierra. Mismo patrón que MediaPlayer.tsx.
//
// Todo el estado viene de AstalWp por señales (widget/audio.ts): sin polling ni subprocesos.
// Los sliders escriben en vivo: AstalWp usa el mixer de WirePlumber dentro del proceso, no hay
// llamadas D-Bus que espaciar (a diferencia del volumen de Spotify en MediaPlayer.tsx). Se usa
// "change-value" (solo se emite por acción del usuario) para no crear un bucle con el binding.

const POPUP_WIDTH = 340   // ancho fijo del popup — también centra el popup bajo el módulo (toggleAudioPopup)

// Iconos Nerd Font (Material Design), como el resto de la barra. El tema de iconos (Adwaita) no
// trae los iconos de las apps (brave, spotify…), así que cada app se resuelve a un glifo por nombre.
const G = {
  headphones: "\u{F02CB}",   // 󰋋
  bluetooth:  "\u{F00B0}",   // 󰂰
  speaker:    "\u{F04C3}",   // 󰓃
  check:      "\u{F012C}",   // 󰄬
  muted:      "\u{F075F}",   // 󰝟
  web:        "\u{F059F}",   // 󰖟
  spotify:    "\u{F04C7}",   // 󰓇
  discord:    "\u{F066F}",   // 󰙯
  video:      "\u{F0567}",   // 󰕧
  music:      "\u{F075A}",   // 󰝚
}

function deviceGlyph(d: Wp.Endpoint): string {
  const s = `${d.icon ?? ""} ${d.description ?? ""}`.toLowerCase()
  if (/headset|headphone|auricular/.test(s)) return G.headphones
  if (/bluetooth|bluez/.test(s))             return G.bluetooth
  return G.speaker
}

function appGlyph(s: Wp.Stream): string {
  const id = [s.description, s.get_pw_property("application.process.binary"),
              s.get_pw_property("application.name")].join(" ").toLowerCase()
  if (/spotify/.test(id))                                              return G.spotify
  if (/discord/.test(id))                                              return G.discord
  if (/brave|chrom|firefox|zen|librewolf|vivaldi|opera|edge|epiphany/.test(id)) return G.web
  if (/mpv|vlc|celluloid|totem|kodi|obs/.test(id))                     return G.video
  return G.music
}

// ── Apertura desde la barra ───────────────────────────────────────────────────────────────────
// Se abre en el monitor de la barra donde se hizo clic y centrado bajo el módulo (recortado al
// borde derecho). El monitor y el margen se fijan con la ventana oculta: una superficie
// layer-shell ya mapeada no cambia de salida.

export function toggleAudioPopup(anchor: Gtk.Widget) {
  const win = app.get_window("audio-popup") as Astal.Window | null
  if (!win) return
  if (win.visible) { win.visible = false; return }

  const bar = anchor.get_root() as unknown as Astal.Window | null
  const monitor = bar?.gdkmonitor
  if (bar && monitor) {
    const [ok, rect] = anchor.compute_bounds(bar)
    if (ok) {
      const center = rect.get_x() + rect.get_width() / 2
      win.marginRight = Math.max(8, Math.round(monitor.get_geometry().width - center - POPUP_WIDTH / 2))
    }
    win.gdkmonitor = monitor
  }
  win.visible = true
}

// ── Filas ─────────────────────────────────────────────────────────────────────────────────────

// Silenciar + slider + porcentaje. Sirve para el volumen general (proxy del default sink) y para
// cada stream: ambos son Wp.Node con volume / mute.
function VolumeControl({ node }: { node: Wp.Node }) {
  const volume = createBinding(node, "volume")
  const muted  = createBinding(node, "mute")

  return (
    <box class="audio-control" spacing={8} valign={Gtk.Align.CENTER}>
      <button class="audio-mute" onClicked={() => { node.mute = !node.mute }}>
        <label class="audio-mute-icon"
          label={createComputed(() => volumeIcon(Math.round(volume() * 100), muted()))} />
      </button>
      <slider class="audio-slider" hexpand valign={Gtk.Align.CENTER} min={0} max={1}
        value={volume}
        onChangeValue={(_s: Astal.Slider, _t: Gtk.ScrollType, value: number) => {
          setVolume(node, value)
          return false
        }}
      />
      <label class="audio-pct" xalign={1}
        label={createComputed(() => muted() ? "mut" : `${Math.round(volume() * 100)}%`)} />
    </box>
  )
}

function DeviceRow({ device }: { device: Wp.Endpoint }) {
  // OJO: no usar Endpoint.is_default: AstalWp no se entera de los cambios de default en esta máquina
  // (ver widget/audio.ts). El check sale del default real, el mismo que controla el volumen general.
  const isDefault = defaultEndpoint.as(ep => !!ep && nodeName(ep) === nodeName(device))

  return (
    <button class={isDefault.as(d => d ? "audio-device active" : "audio-device")}
      onClicked={() => selectOutput(device)}
    >
      <box spacing={8} valign={Gtk.Align.CENTER}>
        <label class="audio-device-icon" label={deviceGlyph(device)} />
        <label class="audio-device-name" hexpand halign={Gtk.Align.START}
          label={createBinding(device, "description").as(d => d || device.name || "?")}
          maxWidthChars={30} ellipsize={Pango.EllipsizeMode.END} />
        <label class="audio-device-muted" label={G.muted} visible={createBinding(device, "mute")} />
        <label class="audio-device-check" label={G.check} visible={isDefault} />
      </box>
    </button>
  )
}

function StreamRow({ stream }: { stream: Wp.Stream }) {
  // `name` de un stream es "Playback" (inútil) y `description` sale a veces del node.name en minúscula
  // ("spotify"): se prefiere application.name, que no cambia mientras vive el stream.
  const appName = stream.get_pw_property("application.name")

  return (
    <box class={createBinding(stream, "mute").as(m => m ? "audio-stream muted" : "audio-stream")}
      orientation={Gtk.Orientation.VERTICAL} spacing={4}
    >
      <box spacing={8} valign={Gtk.Align.CENTER}>
        <label class="audio-app-icon" label={appGlyph(stream)} />
        <label class="audio-app-name" hexpand halign={Gtk.Align.START}
          label={createBinding(stream, "description").as(d => appName || d || stream.name || "?")}
          maxWidthChars={30} ellipsize={Pango.EllipsizeMode.END} />
      </box>
      <VolumeControl node={stream} />
    </box>
  )
}

// ── Ventana ───────────────────────────────────────────────────────────────────────────────────

export default function AudioPopup() {
  return (
    <window
      name="audio-popup"
      class="AudioPopup"
      visible={false}
      application={app}
      keymode={Astal.Keymode.ON_DEMAND}
      $={(self) => {
        // Igual que MediaPlayer: anchor y márgenes se fijan acá y no como props iniciales (con
        // anchor en las props, Gtk.Application no registra la ventana y get_window falla), y el
        // margen va ANTES que el anchor o queda ignorado. marginRight es el valor por defecto;
        // toggleAudioPopup lo recalcula en cada apertura para centrar el popup bajo el módulo.
        self.marginTop = 5
        self.marginRight = 8
        self.anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT

        // Cada vez que se abre (clic o `ags toggle`) se confirma cuál es la salida por defecto real:
        // AstalWp no avisa de los cambios hechos desde fuera del popup.
        self.connect("notify::visible", () => { if (self.visible) refreshDefault() })

        // Se cierra al perder el foco (clic afuera). wasActive evita cerrarlo apenas se abre
        // (is-active empieza en false hasta que el compositor le da foco): solo true → false.
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
      <box class="popup-root" orientation={Gtk.Orientation.VERTICAL} spacing={8}
        widthRequest={POPUP_WIDTH}
      >
        <label class="audio-title" label="Salida" halign={Gtk.Align.START} />
        <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
          <For each={speakers}>
            {(device: Wp.Endpoint) => <DeviceRow device={device} />}
          </For>
        </box>
        <box orientation={Gtk.Orientation.VERTICAL}>
          <With value={defaultEndpoint}>
            {(ep: Wp.Endpoint | null) => ep
              ? <VolumeControl node={ep} />
              : <label class="audio-empty" label="Audio no disponible" halign={Gtk.Align.START} />}
          </With>
        </box>

        <label class="audio-title audio-title-apps" label="Aplicaciones" halign={Gtk.Align.START} />
        <box orientation={Gtk.Orientation.VERTICAL} spacing={10}>
          <For each={streams}>
            {(stream: Wp.Stream) => <StreamRow stream={stream} />}
          </For>
        </box>
        <label class="audio-empty" label="Nada reproduciendo" halign={Gtk.Align.START}
          visible={streams.as(l => l.length === 0)} />
      </box>
    </window>
  )
}
