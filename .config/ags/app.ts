import app from "ags/gtk4/app"
import { Gdk } from "ags/gtk4"
import style from "./style.scss"

import MediaPlayer from "./widget/MediaPlayer"
import AudioPopup  from "./widget/AudioPopup"
import NetworkPopup from "./widget/NetworkPopup"
import BottomBar   from "./widget/bars/BottomBar"
import PopupBackdrop from "./widget/PopupBackdrop"
import { openPopup } from "./widget/Popup"
import Hyprland from "gi://AstalHyprland"

app.start({
  css: style,
  // `ags request popup <media-popup|audio-popup|network-popup> [monitor]`: abre (o cierra) el popup
  // colgando de su píldora, como el clic. Sin monitor, el que tiene el foco.
  requestHandler(argv: string[], response: (r: string) => void) {
    if (argv[0] === "popup" && argv[1]) {
      const connector = argv[2] ?? Hyprland.get_default()?.focused_monitor?.name
      return response(openPopup(argv[1], connector))
    }
    response("uso: ags request popup <nombre> [monitor]")
  },
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
      PopupBackdrop(monitor)
    }
  },
})
