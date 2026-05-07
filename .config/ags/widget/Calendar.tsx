import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll } from "ags/time"
import GLib from "gi://GLib"

// ── Locale ────────────────────────────────────────────────────────────────

const WEEKDAYS  = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DAYS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"]
const HOME    = `${GLib.get_home_dir()}`

function pad(n: number) { return String(n).padStart(2, "0") }
function fmtLocale(y: number, m: number, d: number) { return `${pad(d)}/${pad(m+1)}/${y}` }

// ── Fetch event days via Python (reads ICS files directly) ─────────────────

function fetchEventDays(year: number, month: number): Promise<Set<number>> {
  return execAsync([
    "python3", `${HOME}/.config/hypr/scripts/cal-event-days.py`,
    String(year), String(month + 1),
  ])
    .then(out => new Set<number>(
      out.trim().split("\n").filter(l => /^\d+$/.test(l)).map(Number)
    ))
    .catch(() => new Set<number>())
}

// ── Fetch events for a specific date via khal ──────────────────────────────

function fetchEventsForDate(year: number, month: number, day: number): Promise<string> {
  const start = fmtLocale(year, month, day)
  const next  = new Date(year, month, day + 1)
  const end   = fmtLocale(next.getFullYear(), next.getMonth(), next.getDate())
  return execAsync(["bash", "-c",
    `khal list ${start} ${end} 2>/dev/null | sed 's/ :: .*//' | grep -v '^$'`])
    .then(out => out.trim() || "Sin eventos este día")
    .catch(() => "Sin eventos este día")
}

// ── Custom calendar grid ───────────────────────────────────────────────────

function makeCalendar(onDayClick: (y: number, m: number, d: number) => void) {
  const today = new Date()
  let viewYear  = today.getFullYear()
  let viewMonth = today.getMonth()

  const monthLabel = new Gtk.Label()
  monthLabel.set_css_classes(["month-label"])
  monthLabel.set_hexpand(true)
  monthLabel.set_halign(Gtk.Align.CENTER)

  const grid = new Gtk.Grid()
  grid.set_row_spacing(2)
  grid.set_column_spacing(4)
  grid.set_column_homogeneous(true)

  function rebuild(eventDays: Set<number>) {
    while (grid.get_first_child()) grid.remove(grid.get_first_child()!)

    // Weekday headers
    WEEKDAYS.forEach((wd, col) => {
      const l = new Gtk.Label({ label: wd })
      l.set_css_classes(["wd-header"])
      grid.attach(l, col, 0, 1, 1)
    })

    const isThisMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth
    let col = new Date(viewYear, viewMonth, 1).getDay() - 1
    if (col < 0) col = 6
    let row = 1
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    for (let d = 1; d <= daysInMonth; d++) {
      const btn = new Gtk.Button()
      const inner = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL, spacing: 0,
        halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER,
      })

      const numLbl = new Gtk.Label({ label: String(d) })
      inner.append(numLbl)

      if (eventDays.has(d)) {
        const dot = new Gtk.Label({ label: "•" })
        dot.set_css_classes(["event-dot"])
        inner.append(dot)
      }

      btn.set_child(inner)
      const classes = ["cal-day"]
      if (isThisMonth && d === today.getDate()) classes.push("today")
      btn.set_css_classes(classes)

      const daySnap = d
      btn.connect("clicked", () => onDayClick(viewYear, viewMonth, daySnap))

      grid.attach(btn, col, row, 1, 1)
      col++; if (col > 6) { col = 0; row++ }
    }

    monthLabel.set_label(`${MONTHS_ES[viewMonth]} ${viewYear}`)
  }

  function refresh() {
    fetchEventDays(viewYear, viewMonth).then(rebuild)
  }

  refresh()

  const prevBtn = new Gtk.Button({ label: "‹" })
  prevBtn.set_css_classes(["nav-btn"])
  prevBtn.connect("clicked", () => {
    viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear-- }; refresh()
  })

  const nextBtn = new Gtk.Button({ label: "›" })
  nextBtn.set_css_classes(["nav-btn"])
  nextBtn.connect("clicked", () => {
    viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++ }; refresh()
  })

  const nav = new Gtk.Box({ spacing: 4, halign: Gtk.Align.FILL })
  nav.set_css_classes(["cal-nav"])
  nav.append(prevBtn)
  nav.append(monthLabel)
  nav.append(nextBtn)

  const calBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
  calBox.set_css_classes(["cal-section"])
  calBox.append(nav)
  calBox.append(grid)

  return { widget: calBox, refresh }
}

// ── Header: day + time (left) · weather (right) ────────────────────────────

function Header() {
  const dayNum  = createPoll("--",    60000, async () => pad(new Date().getDate()))
  const dayName = createPoll("---",   60000, async () => DAYS_ES[new Date().getDay()])
  const clock   = createPoll("--:--", 1000,  async () => {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  // Two separate polls for two-line weather display
  const weatherTop = createPoll("🌤  --°C", 1800000, async () => {
    try {
      return (await execAsync([
        "curl", "-sf", "--max-time", "8",
        "https://wttr.in/Valdivia,Chile?format=%c+%t",
      ])).trim() || "🌤 Sin datos"
    } catch { return "🌤 Sin conexión" }
  })
  const weatherDesc = createPoll("Cargando...", 1800000, async () => {
    try {
      return (await execAsync([
        "curl", "-sf", "--max-time", "8",
        "https://wttr.in/Valdivia,Chile?format=%C",
      ])).trim() || ""
    } catch { return "" }
  })

  return (
    <box class="popup-header" halign={Gtk.Align.FILL}>
      {/* Left: big day number + day name + clock */}
      <box class="header-left" orientation={Gtk.Orientation.VERTICAL}
        spacing={2} valign={Gtk.Align.CENTER}>
        <label class="header-day-num"  label={dayNum}  halign={Gtk.Align.START} />
        <label class="header-day-name" label={dayName} halign={Gtk.Align.START} />
        <label class="header-time"     label={clock}   halign={Gtk.Align.START} />
      </box>

      <box hexpand={true} />

      {/* Right: weather two-line */}
      <box class="header-right" orientation={Gtk.Orientation.VERTICAL}
        valign={Gtk.Align.CENTER} halign={Gtk.Align.END} spacing={2}>
        <label class="weather-top"  label={weatherTop}  halign={Gtk.Align.END} />
        <label class="weather-desc" label={weatherDesc} halign={Gtk.Align.END} />
      </box>
    </box>
  )
}

// ── Events section (controlled by selected day) ────────────────────────────

function makeEvents() {
  const label = new Gtk.Label()
  label.set_css_classes(["events-body"])
  label.set_halign(Gtk.Align.START)
  label.set_valign(Gtk.Align.START)
  label.set_wrap(true)
  label.set_selectable(true)

  const titleLabel = new Gtk.Label()
  titleLabel.set_css_classes(["section-title"])
  titleLabel.set_halign(Gtk.Align.START)

  // Initial load: next 7 days
  function loadRange() {
    const today = new Date()
    titleLabel.set_label("Próximos 7 días")
    execAsync(["bash", "-c",
      "khal list today 8days 2>/dev/null | sed 's/ :: .*//' | grep -v '^$'"])
      .then(out => label.set_label(out.trim() || "Sin eventos próximos"))
      .catch(() => label.set_label("Sin eventos próximos"))
  }

  function loadDay(year: number, month: number, day: number) {
    titleLabel.set_label(`${day} de ${MONTHS_ES[month]}`)
    fetchEventsForDate(year, month, day)
      .then(out => label.set_label(out))
  }

  loadRange()

  const scroll = new Gtk.ScrolledWindow()
  scroll.set_css_classes(["events-scroll"])
  scroll.set_max_content_height(160)
  scroll.set_child(label)

  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  box.set_css_classes(["events-section"])
  box.append(titleLabel)
  box.append(scroll)

  return { widget: box, loadRange, loadDay }
}

// ── Main popup window ─────────────────────────────────────────────────────

export default function CalendarWindow() {
  const events = makeEvents()
  const { widget: calWidget, refresh } = makeCalendar(
    (y, m, d) => events.loadDay(y, m, d)
  )

  return (
    <window
      name="calendar"
      class="CalendarWindow"
      visible={false}
      application={app}
      keymode={Astal.Keymode.ON_DEMAND}
      $={(self) => {
        const ctrl = new Gtk.EventControllerKey()
        ctrl.connect("key-pressed", (_c: Gtk.EventControllerKey, keyval: number) => {
          if (keyval === Gdk.KEY_Escape) app.toggle_window("calendar")
          return false
        })
        self.add_controller(ctrl)

        self.connect("notify::visible", () => {
          if (self.visible) {
            refresh()
            events.loadRange()
          }
        })
      }}
    >
      <box class="popup-root" orientation={Gtk.Orientation.VERTICAL} spacing={0}>
        <Header />
        <Gtk.Separator class="popup-sep" orientation={Gtk.Orientation.HORIZONTAL} />
        {calWidget}
        <Gtk.Separator class="popup-sep" orientation={Gtk.Orientation.HORIZONTAL} />
        <box class="events-wrapper">
          {events.widget}
        </box>
      </box>
    </window>
  )
}
