import app from "ags/gtk4/app"
import style from "./style.scss"
import CalendarWindow from "./widget/Calendar"

app.start({
  css: style,
  main() {
    CalendarWindow()
  },
})
