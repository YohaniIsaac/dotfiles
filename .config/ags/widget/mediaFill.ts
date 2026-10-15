import Gtk from "gi://Gtk?version=4.0"
import Cairo from "cairo"
import { mediaFraction, mediaWave } from "./mpris"

// Dibujo del relleno de la píldora de música: borde de avance ondulado, estela más intensa hacia
// el frente y una línea brillante siguiendo la onda. Se pinta con Cairo en un <drawingarea>
// detrás del texto. El color (y su alfa) sale de la propiedad CSS `color` de `.media-fill`
// en _bar.scss, así que sigue el tema de Matugen.
// Medido: repintar la píldora cuesta ~1 ms; por eso la animación va a pocos fps (mpris.ts).
const WAVE_AMP = 2.5      // amplitud máxima de la onda, px (se multiplica por la amplitud 0–1 de mpris.ts)
const WAVE_LEN = 18       // período de la onda, px (a ~26 px de alto se ven 1–2 ondulaciones)
const HEAD_ALPHA = 0.9    // opacidad de la línea de cabeza

export function drawMediaFill(area: Gtk.DrawingArea, cr: Cairo.Context, w: number, h: number) {
  const frac = mediaFraction.peek()
  if (frac < 0) return                       // sin duración (podcast, archivo local) o sin Spotify
  const c = area.get_color()
  const x0 = frac * w
  const { phase, amp } = mediaWave.peek()    // amp = 0 en pausa: el borde queda recto
  const edge = (y: number) => x0 + WAVE_AMP * amp * Math.sin(phase + (y / WAVE_LEN) * 2 * Math.PI)

  const path = () => {
    cr.moveTo(edge(0), 0)
    for (let y = 1; y <= h; y++) cr.lineTo(edge(y), y)
  }

  // Relleno con estela: poco intenso a la izquierda, más fuerte en el frente
  path(); cr.lineTo(0, h); cr.lineTo(0, 0); cr.closePath()
  const g = new Cairo.LinearGradient(0, 0, Math.max(x0, 1), 0)
  g.addColorStopRGBA(0, c.red, c.green, c.blue, c.alpha * 0.35)
  g.addColorStopRGBA(1, c.red, c.green, c.blue, Math.min(1, c.alpha * 1.6))
  cr.setSource(g)
  cr.fill()

  // Línea de cabeza (no al principio de la canción, donde quedaría pegada al borde)
  if (x0 > WAVE_AMP + 2) {
    path()
    cr.setLineWidth(1.5)
    cr.setSourceRGBA(c.red, c.green, c.blue, HEAD_ALPHA)
    cr.stroke()
  }
}
