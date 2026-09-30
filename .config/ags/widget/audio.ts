import { createBinding, createComputed, createExternal, createState, type Accessor } from "ags"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Wp   from "gi://AstalWp"

// ── AstalWp (WirePlumber) — estado compartido por la barra y el popup de audio ───────────────
// Singleton: se inicializa una vez y queda activo. Lo usan BottomBar.tsx (módulo de volumen:
// scroll y clic) y AudioPopup.tsx (mezclador).
//
// AstalWp inicializa async: en arranque en frío wp / wp.audio pueden ser null hasta que
// emite "ready". Optional chaining para que, si eso ocurre, solo se degrade el módulo de
// volumen en vez de tirar TODA la barra (que era la causa de que no apareciera al bootear).
// El arranque ya se retrasa en start-bar.sh, así que en la práctica acá ya está listo —
// esto es red de seguridad ante cualquier carrera residual.
const wp = Wp.get_default()
export const audio = wp?.audio ?? null

// Listas reactivas: notifican al añadir/quitar (audio.c hace g_object_notify sobre "speakers" y
// "streams"). Nacen vacías y se llenan al inicializar, así que siempre se consumen como Accessor.
const [noItems] = createState<never[]>([])
export const speakers: Accessor<Wp.Endpoint[]> = audio ? createBinding(audio, "speakers") : noItems
export const streams:  Accessor<Wp.Stream[]>   = audio ? createBinding(audio, "streams")  : noItems

// Nombre PipeWire del nodo ("alsa_output.pci-…", "bluez_output.…"): es el que usa WirePlumber para
// el default. `Endpoint.name` no sirve (vale null en la salida integrada).
export const nodeName = (node: Wp.Node): string => node.get_pw_property("node.name") ?? ""

// ── Salida por defecto ────────────────────────────────────────────────────────────────────────
// AstalWp NO se entera de los cambios de default en esta máquina (verificado el 2026-09-30): el
// metadata `default` que crea WirePlumber no reenvía sus actualizaciones a los clientes ya
// conectados. Ni `pw-metadata -m` las ve, aunque el metadata `settings` del servidor sí las
// entrega. WirePlumber SÍ cambia de salida y mueve los streams, pero `default_speaker` (el "proxy")
// y `Endpoint.is_default` quedan congelados en el default del arranque: el check no se movía y el
// slider general seguía controlando el sink anterior. Por eso el default real se consulta con
// `pw-metadata` (una consulta que termina, ~10 ms) al arrancar, al abrir el popup, tras elegir una
// salida y cuando aparece o desaparece un dispositivo (esas señales de AstalWp sí llegan).
const [defaultName, setDefaultName] = createState("")

let refreshing = false
let refreshAgain = false

export async function refreshDefault() {
  if (refreshing) { refreshAgain = true; return }   // una consulta a la vez; si llega otra, se repite al terminar
  refreshing = true
  do {
    refreshAgain = false
    try {
      const out  = await execAsync(["timeout", "3", "pw-metadata", "-n", "default", "0", "default.audio.sink"])
      const json = out.match(/key:'default\.audio\.sink' value:'(\{[^']*\})'/)?.[1]
      const name = json ? (JSON.parse(json).name ?? "") : ""
      if (name && name !== defaultName.peek()) setDefaultName(name)
    } catch { /* sin pw-metadata o sin PipeWire: se conserva el último valor */ }
  } while (refreshAgain)
  refreshing = false
}

// Refresca pasado un rato y otra vez más tarde: WirePlumber tarda unos cientos de ms en aplicar el cambio.
let refreshScheduled = false

export function refreshDefaultSoon() {
  if (refreshScheduled) return
  refreshScheduled = true
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => { refreshDefault(); return GLib.SOURCE_REMOVE })
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => { refreshDefault(); refreshScheduled = false; return GLib.SOURCE_REMOVE })
}

refreshDefault()
audio?.connect("speaker-added",   () => refreshDefaultSoon())
audio?.connect("speaker-removed", () => refreshDefaultSoon())

// Red de seguridad para los cambios hechos desde fuera del popup (pavucontrol, wpctl, otro programa): AstalWp
// no avisa de ellos y la barra mostraría el volumen de la salida anterior. La consulta termina sola
// (`timeout 3`), corre de a una y cuesta ~10 ms. Es un solo temporizador compartido por todos los monitores.
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => { refreshDefault(); return GLib.SOURCE_CONTINUE })

// Salida por defecto real: la de `defaultName` dentro de la lista de salidas. Mientras no hay respuesta
// de pw-metadata (o el nombre aún no está en la lista) se usa el proxy `default_speaker` de AstalWp, que
// es correcto en el arranque.
const startupDefault = audio?.get_default_speaker() ?? null

export const defaultEndpoint: Accessor<Wp.Endpoint | null> = createComputed(() => {
  const name = defaultName()
  return speakers().find(s => nodeName(s) === name) ?? startupDefault
})

// Elegir una salida: WirePlumber cambia el default y mueve los streams (~0.4 s). Se des-silencia si estaba
// silenciada: elegirla es querer oírla ahí, y WirePlumber restaura los parlantes del portátil silenciados y a
// -60 dB (default-routes). El volumen no se toca. La interfaz cambia de inmediato y luego se confirma con
// WirePlumber, así que si el cambio no ocurriera, vuelve a mostrar la salida real.
export function selectOutput(device: Wp.Endpoint) {
  device.is_default = true
  if (device.mute) device.mute = false
  setDefaultName(nodeName(device))
  refreshDefaultSoon()
}

// ── Volumen del default sink (píldora de la barra) ────────────────────────────────────────────

export function volumeIcon(pct: number, muted: boolean): string {
  if (muted) return "󰝟"
  if (pct === 0) return "󰕿"
  if (pct < 50)  return "󰖀"
  return "󰕾"
}

export type VolState = { pct: number; muted: boolean }

function computeVol(node: Wp.Endpoint | null): VolState {
  return {
    pct:   Math.round((node?.volume ?? 0) * 100),
    muted: node?.mute ?? false,
  }
}

// Sigue el volumen y el mute de la salida por defecto y se re-engancha cuando esta cambia.
export const volState = createExternal<VolState>(
  computeVol(defaultEndpoint.peek()),
  (set) => {
    let node: Wp.Endpoint | null = null
    let ids: number[] = []
    const refresh = () => set(computeVol(node))
    const unbind  = () => { ids.forEach(id => node?.disconnect(id)); ids = []; node = null }
    const bind    = () => {
      unbind()
      node = defaultEndpoint.peek()
      if (node) ids = [node.connect("notify::volume", refresh), node.connect("notify::mute", refresh)]
      refresh()
    }
    const dispose = defaultEndpoint.subscribe(bind)
    bind()
    return () => { dispose(); unbind() }
  }
)

// ── Ajuste con la rueda ───────────────────────────────────────────────────────────────────────

const VOLUME_STEP = 0.05   // un paso = 5 %
const MAX_VOLUME  = 1      // AstalWp permite hasta 150 %, pero sobre 100 % solo distorsiona

// AstalWp confirma cada escritura de forma asíncrona (ida y vuelta a PipeWire): `node.volume` tarda
// unos ms en reflejarla. Si llegan dos muescas de scroll seguidas se parte del último valor PEDIDO
// y no del último confirmado; si no, ambas parten del mismo volumen y se pierde un paso.
let lastReq: { node: Wp.Node; value: number; at: number } | null = null
const REQ_WINDOW_US = 250_000

// Fija el volumen de un nodo (fracción 0–1) desde un slider. Mover el volumen también des-silencia:
// WirePlumber restaura la salida integrada del portátil silenciada y a -60 dB (default-routes), y
// si el slider no des-silenciara, subir el volumen seguiría sin dar sonido.
export function setVolume(node: Wp.Node, value: number) {
  if (value > 0 && node.mute) node.mute = false
  node.volume = Math.max(0, Math.min(MAX_VOLUME, value))
}

// Sube/baja el volumen de un nodo en `delta` (fracción, no porcentaje). Subir también des-silencia,
// y en el tope no baja un volumen que otra herramienta haya dejado por encima de 100 %.
// AstalWp escribe con el mixer de WirePlumber dentro del proceso (sin subprocesos ni D-Bus).
export function nudgeVolume(node: Wp.Node, delta: number) {
  const now  = GLib.get_monotonic_time()
  const base = lastReq && lastReq.node === node && now - lastReq.at < REQ_WINDOW_US
    ? lastReq.value
    : node.volume
  if (delta > 0) {
    if (node.mute) node.mute = false
    if (base >= MAX_VOLUME) return
  }
  const next = Math.max(0, Math.min(MAX_VOLUME, base + delta))
  lastReq = { node, value: next, at: now }
  node.volume = next
}

// Cuántos pasos enteros de volumen corresponden a un evento de scroll: >0 sube, <0 baja.
// La rueda del mouse manda dy = ±1 por muesca (un paso por muesca); el touchpad y las ruedas de
// alta resolución mandan ráfagas de deltas fraccionarios, que se acumulan hasta completar un paso
// en vez de mover 5 % por evento. Una pausa larga o un cambio de dirección descartan el resto.
let scrollAcc  = 0
let scrollLast = 0   // µs monotónicos del último evento

export function scrollSteps(dy: number, nowUs: number = GLib.get_monotonic_time()): number {
  if (nowUs - scrollLast > 400_000) scrollAcc = 0
  scrollLast = nowUs
  if (scrollAcc !== 0 && Math.sign(scrollAcc) !== Math.sign(dy)) scrollAcc = 0
  scrollAcc += dy
  const whole = Math.trunc(scrollAcc)
  scrollAcc -= whole
  return -whole   // rueda hacia arriba (dy < 0) = subir el volumen
}

export function scrollVolume(dy: number) {
  const node = defaultEndpoint.peek()
  if (!node) return
  const steps = scrollSteps(dy)
  if (steps !== 0) nudgeVolume(node, steps * VOLUME_STEP)
}
