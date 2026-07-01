import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"
import Pango from "gi://Pango"
import { spotify, mediaState } from "./mpris"

// ── Ventana popup — carátula grande + controles completos ────────────────────
// Se abre/cierra con clic en la píldora central (BottomBar.tsx), Esc, o clic afuera
// (se cierra solo al perder el foco — ver notify::is-active más abajo).
//
// IMPORTANTE sobre seek/volumen: cada asignación a spotify.position / spotify.volume
// es una llamada D-Bus real y separada a Spotify (lo verifiqué con busctl monitor).
// Gtk.Range dispara "value-changed" en CADA tick mientras arrastrás el slider — si
// escribiéramos ahí directamente, arrastrar el seek manda decenas de comandos de salto
// de posición por segundo a Spotify (pesado, causa cortes reales de audio). Por eso acá
// solo se actualiza un valor local durante el arrastre, y se escribe UNA vez al soltar.

function volIcon(vol: number): string {
  if (vol <= 0)   return "󰝟"
  if (vol < 0.5)  return "󰖀"
  return "󰕾"
}

function formatTime(totalSeconds: number): string {
  const s   = Math.max(0, Math.floor(totalSeconds))
  const m   = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

export default function MediaPlayer() {
  // MPRIS no notifica la posición mientras suena (solo en saltos explícitos) — hace
  // falta un poll liviano. "seeking" evita que el poll pise el valor mientras arrastrás.
  let seeking = false
  let pendingSeek = 0
  let lastPosition = 0
  const position = createPoll(0, 1000, async () => {
    if (seeking) return lastPosition
    lastPosition = spotify.position ?? 0
    return lastPosition
  })

  // Volumen del popup: mismo motivo — solo se escribe a Spotify al soltar el drag.
  let pendingVolume = 0

  return (
    <window
      name="media-popup"
      class="MediaPlayer"
      visible={false}
      application={app}
      keymode={Astal.Keymode.ON_DEMAND}
      $={(self) => {
        // anchor/marginBottom se fijan acá, no como prop del constructor: pasar anchor en las
        // props iniciales del <window> hacía que Gtk.Application nunca registrara la ventana
        // (app.toggle_window fallaba con "no window registered"). Verificado — Calendar, que no
        // tiene anchor, sí se registraba bien.
        //
        // Orden importa: margin ANTES que anchor (si no, el margen queda ignorado). Verificado
        // con hyprctl layers: Hyprland ya descuenta la zona exclusiva de la barra (exclusivity:
        // EXCLUSIVE) del área disponible, así que este valor ES directamente el gap visual entre
        // el popup y la barra — no hay que sumarle el alto de la barra ni su propio marginBottom.
        self.marginBottom = 5   // gap visual real entre el popup y la barra
        self.anchor = Astal.WindowAnchor.BOTTOM

        // Se cierra solo al perder el foco (clic afuera) — así no queda interrumpiendo en pantalla.
        // El guard wasActive evita cerrarlo apenas se abre (is-active empieza en false de forma
        // async antes de que el compositor le dé foco; solo cerramos en la transición true → false).
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
      <box class="popup-ring">
      <box class="popup-root" spacing={16}>
        <box class="media-popup-cover" vexpand
          css={mediaState.as(m => m.cover ? `background-image: url("file://${m.cover}");` : "")}
        >
          <label class="media-popup-cover-fallback" label=""
            halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER} hexpand vexpand
            visible={mediaState.as(m => !m.cover)} />
        </box>

        <box class="media-popup-info" orientation={Gtk.Orientation.VERTICAL} spacing={8}
          valign={Gtk.Align.CENTER} vexpand hexpand
        >
          <label class="media-popup-title" label={mediaState.as(m => m.title)}
            halign={Gtk.Align.START} maxWidthChars={22} ellipsize={Pango.EllipsizeMode.END} />
          <label class="media-popup-artist" label={mediaState.as(m => m.artist)}
            halign={Gtk.Align.START} maxWidthChars={22} ellipsize={Pango.EllipsizeMode.END} />

          <box class="media-popup-controls" spacing={10} halign={Gtk.Align.CENTER} hexpand>
            <button
              class={mediaState.as(m => m.shuffle ? "media-popup-btn active" : "media-popup-btn")}
              onClicked={() => spotify.shuffle()}
            >
              <label label="" />
            </button>
            <button class="media-popup-btn" onClicked={() => spotify.previous()}>
              <label label="󰙤" />
            </button>
            <button class="media-popup-btn media-popup-btn-play"
              onClicked={() => spotify.play_pause()}
            >
              <label label={mediaState.as(m => m.playing ? "" : "")} />
            </button>
            <button class="media-popup-btn" onClicked={() => spotify.next()}>
              <label label="󰙢" />
            </button>
          </box>

          <box class="media-popup-volume-row" spacing={8} valign={Gtk.Align.CENTER}>
            <label class="media-popup-vol-icon" label={mediaState.as(m => volIcon(m.volume))}
              valign={Gtk.Align.CENTER} />
            <slider class="media-popup-volume" hexpand valign={Gtk.Align.CENTER}
              min={0} max={1}
              value={mediaState.as(m => m.volume)}
              onValueChanged={(self: Astal.Slider) => { pendingVolume = self.value }}
              $={(self: Astal.Slider) => {
                const click = new Gtk.GestureClick()
                click.connect("released", () => {
                  spotify.volume = pendingVolume   // una sola escritura real, al soltar
                })
                self.add_controller(click)
              }}
            />
          </box>

          <box class="media-popup-seek-row" spacing={6} valign={Gtk.Align.CENTER}>
            <label class="media-popup-time" label={position.as(formatTime)}
              valign={Gtk.Align.CENTER} />
            <slider class="media-popup-seek" hexpand valign={Gtk.Align.CENTER}
              min={0}
              max={mediaState.as(m => Math.max(m.length, 1))}
              value={position}
              onValueChanged={(self: Astal.Slider) => { pendingSeek = self.value }}
              $={(self: Astal.Slider) => {
                const click = new Gtk.GestureClick()
                click.connect("pressed", () => { seeking = true })
                click.connect("released", () => {
                  seeking = false
                  spotify.position = pendingSeek   // recién ahora se manda el Seek real, una sola vez
                })
                self.add_controller(click)
              }}
            />
            <label class="media-popup-time" label={mediaState.as(m => formatTime(m.length))}
              valign={Gtk.Align.CENTER} />
          </box>
        </box>
      </box>
      </box>
    </window>
  )
}
