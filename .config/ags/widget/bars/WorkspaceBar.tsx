import app from "ags/gtk4/app"
import { Astal, Gdk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll } from "ags/time"

function wsRangeFor(connector: string): number[] {
  if (connector === "HDMI-A-1")
    return Array.from({ length: 10 }, (_, i) => i + 11)
  return Array.from({ length: 10 }, (_, i) => i + 1)
}

export default function WorkspaceBar(gdkmonitor: Gdk.Monitor) {
  const { BOTTOM } = Astal.WindowAnchor
  const connector  = gdkmonitor.get_connector() ?? ""
  const wsRange    = wsRangeFor(connector)

  const wsState = createPoll(
    { active: wsRange[0], occupied: new Set<number>() },
    400,
    async () => {
      try {
        const [monsOut, wsOut] = await Promise.all([
          execAsync("hyprctl monitors -j"),
          execAsync("hyprctl workspaces -j"),
        ])
        const mons = JSON.parse(monsOut) as Array<{ name: string; activeWorkspace: { id: number } }>
        const wss  = JSON.parse(wsOut)  as Array<{ id: number }>
        const mon  = mons.find(m => m.name === connector)
        return {
          active:   mon?.activeWorkspace?.id ?? wsRange[0],
          occupied: new Set<number>(wss.map(w => w.id)),
        }
      } catch {
        return { active: wsRange[0], occupied: new Set<number>() }
      }
    }
  )

  return (
    <window
      visible
      name={`workspaces-${connector}`}
      class="WorkspaceBar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={BOTTOM}
      application={app}
      marginBottom={8}
    >
      <box class="ws-inner" spacing={4}>
        {wsRange.map(id => (
          <button
            class={wsState.as(s => {
              if (s.active === id)    return "ws-btn active"
              if (s.occupied.has(id)) return "ws-btn occupied"
              return "ws-btn"
            })}
            onClicked={() => execAsync(`hyprctl dispatch workspace ${id}`).catch(() => {})}
          >
            <label label={String(id <= 10 ? id : id - 10)} />
          </button>
        ))}
      </box>
    </window>
  )
}
