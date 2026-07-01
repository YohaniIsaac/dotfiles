import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll } from "ags/time"
import { createExternal } from "ags"
import GLib from "gi://GLib"
import Hyprland from "gi://AstalHyprland"
import Wp       from "gi://AstalWp"
import Network  from "gi://AstalNetwork"
import Battery  from "gi://AstalBattery"
import Pango    from "gi://Pango"
import { spotify, mediaState } from "../mpris"

const HOME = GLib.get_home_dir()
const WS_NAV = `${HOME}/.config/hypr/scripts/workspace-nav.sh`

// ── Servicios Astal ───────────────────────────────────────────────────────────
// Estas instancias son singletons — se inicializan una vez y quedan activas.

const hypr    = Hyprland.get_default()!
const wp      = Wp.get_default()!
const speaker = wp.audio.get_default_speaker()
const network = Network.get_default()
const bat     = Battery.get_default()   // null en equipos sin batería

// ── Clock ─────────────────────────────────────────────────────────────────────

const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const pad    = (n: number) => String(n).padStart(2, "0")

function ClockPill() {
  const clock = createPoll("--:--", 1000, async () => {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const date = createPoll("", 60000, async () => {
    const d = new Date()
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  })

  // Contraído: solo la hora. Al pasar el mouse, el Revealer despliega la fecha (día en inglés).
  let revealer: Gtk.Revealer | null = null

  return (
    <box class="clock-inner" spacing={0} valign={Gtk.Align.CENTER}
      $={(self) => {
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => revealer?.set_reveal_child(true))
        motion.connect("leave", () => revealer?.set_reveal_child(false))
        self.add_controller(motion)
      }}
    >
      <label class="clock-time" label={clock} />
      <revealer revealChild={false}
        transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
        transitionDuration={200}
        $={(self) => { revealer = self }}
      >
        <label class="clock-date" label={date} />
      </revealer>
    </box>
  )
}

// ── Workspaces — reactivo via AstalHyprland ───────────────────────────────────

function wsRangeFor(connector: string): number[] {
  if (connector === "HDMI-A-1") return Array.from({ length: 10 }, (_, i) => i + 11)
  if (connector === "eDP-1")    return Array.from({ length: 10 }, (_, i) => i + 21)
  return Array.from({ length: 10 }, (_, i) => i + 1)
}

type WsState = { active: Record<string, number>; occupied: Set<number> }

function computeWsState(): WsState {
  const active: Record<string, number> = {}
  for (const mon of hypr.monitors)
    active[mon.name] = mon.active_workspace?.id ?? -1
  return { active, occupied: new Set(hypr.workspaces.map(w => w.id)) }
}

// Se actualiza instantáneamente via señales GObject — sin polling ni sockets manuales.
const wsState = createExternal<WsState>(
  computeWsState(),
  (set) => {
    const refresh = () => set(computeWsState())
    const ids = [
      hypr.connect("notify::workspaces",       refresh),
      hypr.connect("notify::monitors",          refresh),
      hypr.connect("notify::focused-workspace", refresh),
      hypr.connect("client-added",              refresh),
      hypr.connect("client-removed",            refresh),
      hypr.connect("client-moved",              refresh),
    ]
    return () => ids.forEach(id => hypr.disconnect(id))
  }
)

function WorkspacesPill({ connector }: { connector: string }) {
  const wsRange = wsRangeFor(connector)

  return (
    <box class="ws-inner" spacing={4} valign={Gtk.Align.CENTER}
      $={(self) => {
        const scroll = new Gtk.EventControllerScroll()
        scroll.set_flags(Gtk.EventControllerScrollFlags.VERTICAL)
        scroll.connect("scroll", (_c: Gtk.EventControllerScroll, _dx: number, dy: number) => {
          execAsync(`bash ${WS_NAV} ${dy > 0 ? "next" : "prev"}`).catch(() => {})
          return true
        })
        self.add_controller(scroll)
      }}
    >
      {wsRange.map(id => (
        <button
          class={wsState.as(s => {
            if (s.active[connector] === id) return "ws-btn active"
            if (s.occupied.has(id))         return "ws-btn occupied"
            return "ws-btn"
          })}
          onClicked={() => execAsync(`hyprctl dispatch workspace ${id}`).catch(() => {})}
        >
          <label label={String(((id - 1) % 10) + 1)} />
        </button>
      ))}
    </box>
  )
}

// ── Volumen — reactivo via AstalWp (WirePlumber) ──────────────────────────────

function volumeIcon(pct: number, muted: boolean): string {
  if (muted) return "󰝟"
  if (pct === 0) return "󰕿"
  if (pct < 50)  return "󰖀"
  return "󰕾"
}

type VolState = { pct: number; muted: boolean }

function computeVol(): VolState {
  return {
    pct:   Math.round((speaker?.volume ?? 0) * 100),
    muted: speaker?.mute ?? false,
  }
}

const volState = createExternal<VolState>(
  computeVol(),
  (set) => {
    if (!speaker) return () => {}
    const refresh = () => set(computeVol())
    const ids = [
      speaker.connect("notify::volume", refresh),
      speaker.connect("notify::mute",   refresh),
    ]
    return () => ids.forEach(id => speaker!.disconnect(id))
  }
)

function Volume() {
  return (
    <box class="sys-module" spacing={5} valign={Gtk.Align.CENTER}>
      <label class="sys-icon" label={volState.as(v => volumeIcon(v.pct, v.muted))} />
      <label class="sys-text" label={volState.as(v => v.muted ? "mut" : `${v.pct}%`)} />
    </box>
  )
}

// ── Red — reactivo via AstalNetwork (NetworkManager) ─────────────────────────

function computeNetIcon(): string {
  switch (network.primary) {
    case Network.Primary.WIRED: return "󰈀"
    case Network.Primary.WIFI:  return "󰤨"
    default:                    return "󰤭"
  }
}

const netIcon = createExternal<string>(
  computeNetIcon(),
  (set) => {
    const refresh = () => set(computeNetIcon())
    const ids = [
      network.connect("notify::primary", refresh),
      network.connect("notify::wifi",    refresh),
      network.connect("notify::wired",   refresh),
    ]
    return () => ids.forEach(id => network.disconnect(id))
  }
)

function NetworkWidget() {
  return (
    <box class="sys-module" valign={Gtk.Align.CENTER}>
      <label class="sys-icon" label={netIcon} />
    </box>
  )
}

// ── Batería — reactivo via AstalBattery (UPower) ──────────────────────────────

function batteryIcon(pct: number, charging: boolean): string {
  if (charging) return "󰂄"
  if (pct >= 90) return "󰁹"
  if (pct >= 70) return "󰂀"
  if (pct >= 50) return "󰁾"
  if (pct >= 30) return "󰁼"
  if (pct >= 15) return "󰁺"
  return "󰂃"
}

type BatState = { pct: number; charging: boolean; present: boolean }

function computeBat(): BatState {
  if (!bat) return { pct: 0, charging: false, present: false }
  return {
    pct:      Math.round(bat.percentage * 100),
    charging: bat.charging,
    present:  bat.is_present,
  }
}

const batState = createExternal<BatState>(
  computeBat(),
  (set) => {
    if (!bat) return () => {}
    const refresh = () => set(computeBat())
    const ids = [
      bat.connect("notify::percentage", refresh),
      bat.connect("notify::charging",   refresh),
      bat.connect("notify::is-present", refresh),
    ]
    return () => ids.forEach(id => bat!.disconnect(id))
  }
)

function BatteryWidget() {
  let pctLabel: Gtk.Label | null = null

  return (
    <box class="sys-module" spacing={5} valign={Gtk.Align.CENTER}
      visible={batState.as(b => b.present)}
      $={(self) => {
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => pctLabel?.set_visible(true))
        motion.connect("leave", () => pctLabel?.set_visible(false))
        self.add_controller(motion)
      }}
    >
      <label class="sys-icon" label={batState.as(b => batteryIcon(b.pct, b.charging))} />
      <label class="sys-text" label={batState.as(b => `${b.pct}%`)}
        visible={false}
        $={(self) => { pctLabel = self }}
      />
    </box>
  )
}

// ── Spotify — píldora (estado reactivo compartido en widget/mpris.ts) ────────

function MediaPill() {
  return (
    <box class={mediaState.as(m => m.playing ? "media-inner" : "media-inner paused")}
      spacing={6} valign={Gtk.Align.CENTER}
      visible={mediaState.as(m => m.available)}
      $={(self) => {
        // Clic en cualquier parte de la píldora abre el popup (widget/MediaPlayer.tsx)
        const click = new Gtk.GestureClick()
        click.connect("pressed", () => app.toggle_window("media-popup"))
        self.add_controller(click)

        // Scroll = ajusta el volumen propio de Spotify (independiente del volumen del sistema).
        // Cada asignación a spotify.volume es una llamada D-Bus real a Spotify (verificado con
        // busctl monitor) — un scroll rápido dispara muchos "tick" de scroll seguidos, así que
        // acá se debounca: acumula el cambio localmente y recién escribe una vez que el scroll
        // se detiene ~120ms, en vez de una escritura por cada tick.
        const scroll = new Gtk.EventControllerScroll()
        scroll.set_flags(Gtk.EventControllerScrollFlags.VERTICAL)
        let volDebounce: number | null = null
        let pendingVol = 0
        scroll.connect("scroll", (_c: Gtk.EventControllerScroll, _dx: number, dy: number) => {
          if (volDebounce === null) pendingVol = spotify.volume ?? 0
          const step = 0.05
          pendingVol = Math.max(0, Math.min(1, pendingVol + (dy > 0 ? -step : step)))
          if (volDebounce !== null) GLib.source_remove(volDebounce)
          volDebounce = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            spotify.volume = pendingVol
            volDebounce = null
            return GLib.SOURCE_REMOVE
          })
          return true
        })
        self.add_controller(scroll)
      }}
    >
      <box class="media-cover" valign={Gtk.Align.CENTER}
        css={mediaState.as(m => m.cover ? `background-image: url("file://${m.cover}");` : "")}
      >
        <label class="media-cover-fallback" label=""
          visible={mediaState.as(m => !m.cover)} />
      </box>

      <label class="media-title" label={mediaState.as(m => m.title)}
        maxWidthChars={18} ellipsize={Pango.EllipsizeMode.END} />
      <label class="media-artist" label={mediaState.as(m => m.artist)}
        maxWidthChars={14} ellipsize={Pango.EllipsizeMode.END} />
    </box>
  )
}

// ── Hardware stats — CPU, RAM, temp (createPoll, sin librería Astal) ──────────

let prevCpu = { total: 0, idle: 0 }

function HardwareStats() {
  const cpu = createPoll(0, 2000, async () => {
    const line  = (await execAsync("cat /proc/stat")).split("\n")[0]
    const parts = line.split(/\s+/).slice(1).map(Number)
    const idle  = parts[3] + parts[4]
    const total = parts.reduce((a, b) => a + b, 0)
    const pct   = prevCpu.total === 0 ? 0
      : Math.round((1 - (idle - prevCpu.idle) / (total - prevCpu.total)) * 100)
    prevCpu = { total, idle }
    return Math.max(0, Math.min(100, pct))
  })

  const ram = createPoll(0, 5000, async () => {
    const out   = await execAsync("cat /proc/meminfo")
    const get   = (k: string) => parseInt(out.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1] ?? "0")
    const total = get("MemTotal"), avail = get("MemAvailable")
    return Math.round((total - avail) / total * 100)
  })

  // hwmon4 = coretemp (paquete CPU) — valores en miligrados Celsius
  const temp = createPoll(0, 5000, async () => {
    const raw = await execAsync("cat /sys/class/hwmon/hwmon4/temp1_input").catch(() => "0")
    return Math.round(parseInt(raw.trim()) / 1000)
  })

  let cpuRevealer:  Gtk.Revealer | null = null
  let tempRevealer: Gtk.Revealer | null = null

  return (
    <box class="sys-module hw-stats" spacing={0} valign={Gtk.Align.CENTER}
      $={(self) => {
        const motion = new Gtk.EventControllerMotion()
        motion.connect("enter", () => {
          cpuRevealer?.set_reveal_child(true)
          tempRevealer?.set_reveal_child(true)
        })
        motion.connect("leave", () => {
          cpuRevealer?.set_reveal_child(false)
          tempRevealer?.set_reveal_child(false)
        })
        self.add_controller(motion)

        const click = new Gtk.GestureClick()
        click.connect("pressed", () => execAsync("kitty -e btop").catch(() => {}))
        self.add_controller(click)
      }}
    >
      <revealer revealChild={false}
        transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
        transitionDuration={200}
        $={(self) => { cpuRevealer = self }}
      >
        <box class="hw-extra" spacing={4} valign={Gtk.Align.CENTER}>
          <label class="hw-icon" label="󰍛" />
          <label class="hw-val"  label={cpu.as(v => `${v}%`)} />
          <label class="hw-sep" label="·" />
        </box>
      </revealer>

      <box spacing={4} valign={Gtk.Align.CENTER}>
        <label class="hw-icon" label="󰾆" />
        <label class="hw-val"  label={ram.as(v => `${v}%`)} />
      </box>

      <revealer revealChild={false}
        transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
        transitionDuration={200}
        $={(self) => { tempRevealer = self }}
      >
        <box class="hw-extra" spacing={4} valign={Gtk.Align.CENTER}>
          <label class="hw-sep" label="·" />
          <label class="hw-icon" label="󰔐" />
          <label class="hw-val"  label={temp.as(v => `${v}°`)} />
        </box>
      </revealer>
    </box>
  )
}

// ── Notificaciones (swaync) ───────────────────────────────────────────────────

const NOTIF_ICONS: Record<string, string> = {
  "notification":     "",
  "none":             "",
  "dnd-notification": "",
  "dnd-none":         "",
}

function Notifications() {
  const state = createPoll({ icon: "", dnd: false }, 2000, async () => {
    try {
      const out  = await execAsync("swaync-client -swb")
      const data = JSON.parse(out) as { alt: string }
      return { icon: NOTIF_ICONS[data.alt] ?? "", dnd: data.alt.includes("dnd") }
    } catch {
      return { icon: "", dnd: false }
    }
  })

  return (
    <button
      class={state.as(s => s.dnd ? "sys-btn dnd" : "sys-btn")}
      onClicked={() => execAsync("swaync-client -t -sw").catch(() => {})}
      $={(self) => {
        const rc = new Gtk.GestureClick()
        rc.set_button(3)
        rc.connect("pressed", () => execAsync("swaync-client -d -sw").catch(() => {}))
        self.add_controller(rc)
      }}
    >
      <label class="sys-icon" label={state.as(s => s.icon)} />
    </button>
  )
}

// ── Power ─────────────────────────────────────────────────────────────────────

function PowerButton() {
  return (
    <button
      class="sys-btn"
      onClicked={() => execAsync(`bash ${HOME}/.config/waybar/scripts/wlogout.sh`).catch(() => {})}
      $={(self) => {
        const rc = new Gtk.GestureClick()
        rc.set_button(3)
        rc.connect("pressed", () => execAsync("hyprlock").catch(() => {}))
        self.add_controller(rc)
      }}
    >
      <label class="sys-icon power-icon" label="⏻" />
    </button>
  )
}

function Sep() {
  return <label class="sys-sep" label="│" />
}

function SystemPill() {
  return (
    <box class="sys-inner" spacing={4} valign={Gtk.Align.CENTER}>
      <HardwareStats />
      <Sep />
      <Volume />
      <Sep />
      <NetworkWidget />
      <Sep />
      <BatteryWidget />
      <Sep />
      <Notifications />
      <Sep />
      <PowerButton />
    </box>
  )
}

// ── Barra unificada ───────────────────────────────────────────────────────────

export default function BottomBar(gdkmonitor: Gdk.Monitor) {
  const { BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor
  const connector = gdkmonitor.get_connector() ?? ""

  return (
    <window
      visible
      name={`bar-${connector}`}
      class="BottomBar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={BOTTOM | LEFT | RIGHT}
      application={app}
      marginBottom={8}
    >
      <centerbox>
        <box $type="start" halign={Gtk.Align.START} marginStart={8}>
          <WorkspacesPill connector={connector} />
        </box>
        <box $type="center" halign={Gtk.Align.CENTER} spacing={8}>
          <ClockPill />
          <MediaPill />
        </box>
        <box $type="end" halign={Gtk.Align.END} marginEnd={8}>
          <SystemPill />
        </box>
      </centerbox>
    </window>
  )
}
