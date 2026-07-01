import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll } from "ags/time"

// ── Volume ────────────────────────────────────────────────────────────────────

function volumeIcon(pct: number, muted: boolean): string {
  if (muted) return "󰝟"
  if (pct === 0) return "󰕿"
  if (pct < 50)  return "󰖀"
  return "󰕾"
}

function Volume() {
  const vol = createPoll({ pct: 40, muted: false }, 1000, async () => {
    const out   = await execAsync("wpctl get-volume @DEFAULT_AUDIO_SINK@").catch(() => "Volume: 0.00")
    const muted = out.includes("[MUTED]")
    const match = out.match(/[\d.]+/)
    const pct   = match ? Math.round(parseFloat(match[0]) * 100) : 0
    return { pct, muted }
  })

  return (
    <box class="sys-module" spacing={5} valign={Gtk.Align.CENTER}>
      <label class="sys-icon" label={vol.as(v => volumeIcon(v.pct, v.muted))} />
      <label class="sys-text" label={vol.as(v => v.muted ? "mut" : `${v.pct}%`)} />
    </box>
  )
}

// ── Network ───────────────────────────────────────────────────────────────────

function Network() {
  const net = createPoll("--", 5000, async () => {
    const out  = await execAsync("nmcli -t -f NAME,DEVICE connection show --active").catch(() => "")
    const line = out.split("\n").find(l => !l.includes(":lo") && l.trim())
    if (!line) return "󰤭  sin red"
    const name  = line.split(":")[0]
    const isWifi = !line.includes(":eth")
    return `${isWifi ? "󰤨" : "󰈀"}  ${name}`
  })

  return (
    <box class="sys-module" valign={Gtk.Align.CENTER}>
      <label class="sys-text" label={net} />
    </box>
  )
}

// ── Battery ───────────────────────────────────────────────────────────────────

function batteryIcon(pct: number, charging: boolean): string {
  if (charging) return "󰂄"
  if (pct >= 90) return "󰁹"
  if (pct >= 70) return "󰂀"
  if (pct >= 50) return "󰁾"
  if (pct >= 30) return "󰁼"
  if (pct >= 15) return "󰁺"
  return "󰂃"
}

function Battery() {
  const bat = createPoll({ pct: 100, charging: false, present: false }, 10000, async () => {
    try {
      const pctRaw    = await execAsync("cat /sys/class/power_supply/BAT0/capacity")
      const statusRaw = await execAsync("cat /sys/class/power_supply/BAT0/status")
      return { pct: parseInt(pctRaw.trim()), charging: statusRaw.trim() === "Charging", present: true }
    } catch {
      return { pct: 0, charging: false, present: false }
    }
  })

  return (
    <box
      class="sys-module"
      spacing={5}
      valign={Gtk.Align.CENTER}
      visible={bat.as(b => b.present)}
    >
      <label class="sys-icon" label={bat.as(b => batteryIcon(b.pct, b.charging))} />
      <label class="sys-text" label={bat.as(b => `${b.pct}%`)} />
    </box>
  )
}

// ── Separator ─────────────────────────────────────────────────────────────────

function Sep() {
  return <label class="sys-sep" label="│" />
}

// ── Main window ───────────────────────────────────────────────────────────────

export default function SystemBar(gdkmonitor: Gdk.Monitor) {
  const { BOTTOM, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible
      name={`system-${gdkmonitor.get_connector()}`}
      class="SystemBar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={BOTTOM | RIGHT}
      application={app}
      marginBottom={8}
      marginRight={8}
    >
      <box class="sys-inner" spacing={4} valign={Gtk.Align.CENTER}>
        <Volume />
        <Sep />
        <Network />
        <Sep />
        <Battery />
      </box>
    </window>
  )
}
