import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createPoll } from "ags/time"

const DAYS   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"]
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
const pad    = (n: number) => String(n).padStart(2, "0")

export default function ClockBar(gdkmonitor: Gdk.Monitor) {
  const { BOTTOM, LEFT } = Astal.WindowAnchor

  const clock = createPoll("--:--", 1000, async () => {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  const date = createPoll("", 60000, async () => {
    const d = new Date()
    return `${DAYS[d.getDay()]}  ${d.getDate()} ${MONTHS[d.getMonth()]}`
  })

  return (
    <window
      visible
      name={`clock-${gdkmonitor.get_connector()}`}
      class="ClockBar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={BOTTOM | LEFT}
      application={app}
      marginBottom={8}
      marginLeft={8}
    >
      <box class="clock-inner" spacing={10} valign={Gtk.Align.CENTER}>
        <label class="clock-time" label={clock} />
        <label class="clock-date" label={date} />
      </box>
    </window>
  )
}
