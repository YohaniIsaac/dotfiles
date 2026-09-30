import { createBinding, createExternal, createState, type Accessor } from "ags"
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

// `default_speaker` es un endpoint "proxy": AstalWp lo crea una sola vez y él mismo se re-apunta
// al nuevo default cuando cambia la salida (lib/wireplumber/src/endpoint.c), re-emitiendo
// notify::volume y notify::mute. Por eso alcanza con capturarlo una vez: sigue a los audífonos
// Bluetooth al conectarlos, sin escuchar cambios de default. Los elementos de `speakers`, en
// cambio, son endpoints reales (esos sí emiten notify::is-default).
export const speaker = audio?.get_default_speaker() ?? null

// Listas reactivas: notifican al añadir/quitar (audio.c hace g_object_notify sobre "speakers" y
// "streams"). Nacen vacías y se llenan al inicializar, así que siempre se consumen como Accessor.
const [noItems] = createState<never[]>([])
export const speakers: Accessor<Wp.Endpoint[]> = audio ? createBinding(audio, "speakers") : noItems
export const streams:  Accessor<Wp.Stream[]>   = audio ? createBinding(audio, "streams")  : noItems

// ── Volumen del default sink (píldora de la barra) ────────────────────────────────────────────

export function volumeIcon(pct: number, muted: boolean): string {
  if (muted) return "󰝟"
  if (pct === 0) return "󰕿"
  if (pct < 50)  return "󰖀"
  return "󰕾"
}

export type VolState = { pct: number; muted: boolean }

function computeVol(): VolState {
  return {
    pct:   Math.round((speaker?.volume ?? 0) * 100),
    muted: speaker?.mute ?? false,
  }
}

export const volState = createExternal<VolState>(
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

// ── Ajuste con la rueda ───────────────────────────────────────────────────────────────────────

const VOLUME_STEP = 0.05   // un paso = 5 %
const MAX_VOLUME  = 1      // AstalWp permite hasta 150 %, pero sobre 100 % solo distorsiona

// AstalWp confirma cada escritura de forma asíncrona (ida y vuelta a PipeWire): `node.volume` tarda
// unos ms en reflejarla. Si llegan dos muescas de scroll seguidas se parte del último valor PEDIDO
// y no del último confirmado; si no, ambas parten del mismo volumen y se pierde un paso.
let lastReq: { node: Wp.Node; value: number; at: number } | null = null
const REQ_WINDOW_US = 250_000

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
  if (!speaker) return
  const steps = scrollSteps(dy)
  if (steps !== 0) nudgeVolume(speaker, steps * VOLUME_STEP)
}
