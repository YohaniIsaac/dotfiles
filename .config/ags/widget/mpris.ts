import { createExternal, createComputed } from "ags"
import GLib from "gi://GLib"
import AstalMpris from "gi://AstalMpris"

// Instancia dedicada a un bus name fijo — no es el manager Mpris.get_default() (que
// trackea TODOS los reproductores). Sólo escucha org.mpris.MediaPlayer2.spotify,
// se queda con available=false si Spotify no está corriendo, y available=true
// cuando aparece — sin filtrar listas ni interferir con otros reproductores (navegador, etc).
// Compartido entre BottomBar (píldora) y MediaPlayer (popup grande).
export const spotify = AstalMpris.Player.new("spotify")

export type MediaState = {
  available: boolean
  title: string
  artist: string
  cover: string
  playing: boolean
  volume: number
  shuffle: boolean
  length: number   // duración del track en segundos — position se trackea aparte (poll) en MediaPlayer.tsx
}

function computeMedia(): MediaState {
  return {
    available: spotify.available && spotify.title !== "",
    title:     spotify.title  ?? "",
    artist:    spotify.artist ?? "",
    cover:     spotify.cover_art ?? "",
    playing:   spotify.playback_status === AstalMpris.PlaybackStatus.PLAYING,
    volume:    spotify.volume ?? 0,
    shuffle:   spotify.shuffle_status === AstalMpris.Shuffle.ON,
    length:    spotify.length ?? 0,
  }
}

export const mediaState = createExternal<MediaState>(
  computeMedia(),
  (set) => {
    const refresh = () => set(computeMedia())
    const ids = [
      spotify.connect("notify::available",       refresh),
      spotify.connect("notify::title",           refresh),
      spotify.connect("notify::artist",          refresh),
      spotify.connect("notify::cover-art",       refresh),
      spotify.connect("notify::playback-status", refresh),
      spotify.connect("notify::volume",          refresh),
      spotify.connect("notify::shuffle-status",  refresh),
      spotify.connect("notify::length",          refresh),
    ]
    return () => ids.forEach(id => spotify.disconnect(id))
  }
)

// ── Posición de la canción (compartida por la píldora y el popup) ────────────
// Astal refresca `spotify.position` UNA vez por segundo (un Properties.Get real a Spotify, medido:
// leerla más seguido solo devuelve el valor en caché) y avisa con notify::position. Así que no
// hace falta ningún poll D-Bus: se escucha ese aviso y, entre avisos, se interpola en local con
// el reloj (sin D-Bus) para que la píldora avance cada POSITION_TICK_MS y no a saltos de 1 s.
//   · UNO solo a nivel de módulo: la barra instancia una píldora por monitor y el popup también
//     la usa. createExternal solo corre mientras haya alguien suscrito.
//   · En pausa el timer despierta pero no emite (el valor no cambia → nada se repinta).
const POSITION_TICK_MS = 500

let positionHeld = false   // el popup lo activa mientras arrastras el seek
let syncPosition: ((sec: number) => void) | null = null   // lo fija el productor de `position`

// El popup lo llama al empezar a arrastrar el seek: mientras tanto `position` no se mueve.
export function holdPosition(hold: boolean) { positionHeld = hold }

// Salto de posición (al soltar el seek del popup). Escribe a Spotify UNA vez (D-Bus real) y
// adelanta el valor local, para que la píldora no vuelva a mostrar la posición vieja hasta el
// siguiente aviso de Astal (hasta 1 s después).
export function seekTo(sec: number) {
  positionHeld = false
  syncPosition?.(sec)
  spotify.position = sec
}

export const position = createExternal<number>(0, (set) => {
  let base = 0                             // última posición conocida (segundos)
  let baseAt = GLib.get_monotonic_time()   // y cuándo (µs, reloj monótono)

  const sync = (sec: number) => {
    base = sec
    baseAt = GLib.get_monotonic_time()
    set(sec)
  }
  const fromAstal = () => {
    if (!positionHeld && spotify.available) sync(spotify.position ?? 0)
  }
  const tick = () => {
    // base < 0: Spotify no soporta posición para esta pista. Tope de 1,5 s por si Astal se
    // atrasa o deja de avisar: la interpolación no se va por su cuenta.
    if (!positionHeld && spotify.available && base >= 0
        && spotify.playback_status === AstalMpris.PlaybackStatus.PLAYING) {
      set(base + Math.min((GLib.get_monotonic_time() - baseAt) / 1e6, 1.5))
    }
    return GLib.SOURCE_CONTINUE
  }

  syncPosition = sync
  fromAstal()
  const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POSITION_TICK_MS, tick)
  const ids = [
    spotify.connect("notify::position",        fromAstal),
    // Re-base al pausar/reanudar: si no, la interpolación contaría el tiempo en pausa.
    spotify.connect("notify::playback-status", fromAstal),
    // Canción nueva: empieza en 0. El valor en caché de Astal sigue siendo el de la anterior
    // hasta su siguiente aviso (≤1 s); sin esto, la píldora mostraría ese tiempo viejo.
    spotify.connect("notify::title",           () => { if (!positionHeld) sync(0) }),
  ]
  return () => {
    GLib.source_remove(timer)
    ids.forEach(id => spotify.disconnect(id))
    syncPosition = null
  }
})

// ── Progreso para la píldora de la barra ─────────────────────────────────────

// Fracción (0–1) de la canción ya sonada, o -1 si no hay duración (podcasts, archivos locales)
// o Spotify no está. La píldora la dibuja en widget/mediaFill.ts.
export const mediaFraction = createComputed(() => {
  const m = mediaState()
  const pos = position()
  if (!m.available || m.length <= 0 || pos < 0) return -1
  return Math.min(1, pos / m.length)
})

// Onda del borde de avance (la dibuja widget/mediaFill.ts): fase y amplitud. Un solo timer para
// todas las barras, a pocos fps a propósito (medido: repintar una píldora cuesta ~1–2 ms; la barra
// real gasta ~17 % de un núcleo a 15 fps con las 3 pantallas animadas).
//   · Solo hay onda mientras suena: la amplitud sube de 0 a 1 al reproducir y baja a 0 al pausar
//     (como la barra "squiggly" de Android: 800 ms al subir, 550 ms al bajar), así que en pausa
//     el borde queda recto.
//   · El timer solo corre mientras hay algo que animar: en pausa (y con la onda ya plana) se
//     detiene del todo, sin despertares ni repintados.
const WAVE_TICK_MS = 1000 / 15     // 15 fps
const WAVE_CYCLES_PER_SEC = 0.33   // un ciclo cada ~3 s
const WAVE_RISE_SECS = 0.8         // amplitud 0 → 1 al reproducir
const WAVE_FALL_SECS = 0.55        // amplitud 1 → 0 al pausar

export type WaveState = { phase: number; amp: number }

export const mediaWave = createExternal<WaveState>({ phase: 0, amp: 0 }, (set) => {
  const dt = WAVE_TICK_MS / 1000
  const phaseStep = dt * WAVE_CYCLES_PER_SEC * 2 * Math.PI
  let phase = 0
  let amp = 0
  let timer = 0

  const playing = () =>
    spotify.available && spotify.playback_status === AstalMpris.PlaybackStatus.PLAYING

  const tick = () => {
    const target = playing() ? 1 : 0
    amp = target > amp
      ? Math.min(target, amp + dt / WAVE_RISE_SECS)
      : Math.max(target, amp - dt / WAVE_FALL_SECS)
    phase = (phase + phaseStep) % (2 * Math.PI)
    set({ phase, amp })
    if (target === 0 && amp === 0) { timer = 0; return GLib.SOURCE_REMOVE }   // plana y en pausa: parar
    return GLib.SOURCE_CONTINUE
  }
  const ensureTimer = () => {
    if (!timer) timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WAVE_TICK_MS, tick)
  }

  ensureTimer()
  const ids = [
    spotify.connect("notify::playback-status", ensureTimer),
    spotify.connect("notify::available",       ensureTimer),
  ]
  return () => {
    if (timer) GLib.source_remove(timer)
    timer = 0
    ids.forEach(id => spotify.disconnect(id))
  }
})

// ── Tiempos para la píldora con el popup abierto ─────────────────────────────

// m:ss, como el seek del popup (los minutos no pasan a horas: 62:03).
export function formatTime(totalSeconds: number): string {
  const s   = Math.max(0, Math.floor(totalSeconds))
  const m   = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

// Transcurrido y restante de la canción. El restante se calcula con los segundos enteros que se muestran
// (duración − transcurrido), para que siempre sumen la duración que enseña el popup: 241,57 s con la
// posición en 147,96 → 2:27 + 1:34 = 4:01. (Redondeando el restante hacia arriba, en la posición 0 de una
// canción de 176,4 s salía 0:00 y −2:57 con un popup que dice 2:56.) Sin duración (podcast, archivo local)
// no hay restante; sin posición, "--:--".
export const mediaTimes = createComputed(() => {
  const m = mediaState()
  const pos = position()
  if (!m.available || pos < 0) return { elapsed: "--:--", remaining: "" }
  return {
    elapsed:   formatTime(pos),
    remaining: m.length > 0 ? `-${formatTime(Math.floor(m.length) - Math.floor(pos))}` : "",
  }
})

// ── Título para la píldora ───────────────────────────────────────────────────
// La píldora es angosta: quita lo que no aporta del título (sufijos de remasterizaciones, "Official
// Video", "(feat. …)" porque el artista ya sale aparte…). El título completo queda en el tooltip y
// el popup no lo toca. Conservador a propósito: NO toca "(Remix)", "(Live …)", "(Acoustic)" ni nada
// que identifique la versión. Los grupos entre paréntesis/corchetes se quitan solo si TODO su
// contenido es ruido; el sufijo tras guion, solo si es ruido y va al final.
const TITLE_NOISE = String.raw`(?:(?:\d{4}\s+)?re-?master(?:ed)?(?:\s+\d{4})?|official(?:\s+(?:music|lyric|hd))?\s*(?:video|audio|visuali[sz]er)|lyrics?(?:\s+video)?|visuali[sz]er|explicit|clean|bonus\s+track|(?:single|album|mono|stereo|radio)\s+(?:version|edit)|deluxe(?:\s+edition)?|hd|hq|4k)`
const TITLE_FEAT  = String.raw`(?:feat\.?|ft\.?|featuring)\s[^)\]]*`
const TITLE_GROUP = new RegExp(String.raw`\s*[(\[]\s*(?:${TITLE_NOISE}|${TITLE_FEAT})\s*[)\]]`, "gi")
const TITLE_DASH  = new RegExp(String.raw`\s+[-–—]\s+${TITLE_NOISE}\s*$`, "i")

export function cleanTitle(title: string): string {
  let t = title
  for (let i = 0; i < 3; i++) {   // por si hay varios grupos seguidos
    const next = t.replace(TITLE_GROUP, "").replace(TITLE_DASH, "").trim()
    if (next === t) break
    t = next
  }
  return t || title
}
