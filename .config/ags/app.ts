import app from "ags/gtk4/app"
import { Gdk } from "ags/gtk4"
import style from "./style.scss"

import MediaPlayer from "./widget/MediaPlayer"
import AudioPopup  from "./widget/AudioPopup"
import NetworkPopup from "./widget/NetworkPopup"
import BottomBar   from "./widget/bars/BottomBar"

app.start({
  css: style,
  main() {
    MediaPlayer()
    AudioPopup()
    NetworkPopup()

    const monitors = Gdk.Display.get_default()?.get_monitors()
    if (!monitors) return

    for (let i = 0; i < monitors.get_n_items(); i++) {
      const monitor = monitors.get_item(i) as Gdk.Monitor
      if (!monitor) continue
      BottomBar(monitor)
    }
  },
})
