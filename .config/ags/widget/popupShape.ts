import Gdk from "gi://Gdk?version=4.0"
import Cairo from "cairo"

// Silueta de los popups de la barra, dibujada con Cairo: una tarjeta redondeada con un "cuello" que
// sube hasta la píldora de origen y se abre hacia la tarjeta con esquinas cóncavas, de modo que la
// píldora y el popup parecen una sola pieza (idea de boring.notch y de jimallen/quickshell).
//
// Coordenadas: (0, 0) = esquina superior izquierda del cuello. El cuello mide STEM_H de alto; su
// borde superior queda pegado al borde inferior de la píldora (la ventana del popup empieza ahí).
// El área de dibujo es la ventana entera: añade POPUP_PAD px transparentes a los lados y abajo para
// el brillo (glow) del borde, que en las píldoras es una sombra CSS y aquí se imita con trazos.
// Los colores no están en el código: salen del CSS (Matugen), ver _popup.scss.

export const POPUP_PAD = 5     // margen transparente a los lados y abajo, para el glow
export const STEM_H    = 12    // alto del cuello (de la píldora al borde superior de la tarjeta)
export const BORDER_W  = 2     // grosor del borde (igual que las píldoras)
const CARD_R  = 14             // radio de las esquinas convexas de la tarjeta
const FLARE_R = 10             // radio de las esquinas cóncavas entre el cuello y la tarjeta

// Cuello: posición horizontal (px) de sus bordes respecto a la tarjeta (sin el POPUP_PAD).
export type Stem = { left: number; right: number } | null

export type PopupColors = {
  card:   Gdk.RGBA   // relleno de la tarjeta (más sólido con el ratón encima)
  stem:   Gdk.RGBA   // relleno del cuello: igual que las píldoras, siempre
  border: Gdk.RGBA   // borde y glow
}

// Según el espacio que sobra a un lado del cuello: esquina cóncava normal, ninguna (el borde baja
// recto: la píldora está a ras del popup) o una más chica si no cabe la normal.
function side(space: number): { flare: number; corner: number } {
  if (space >= FLARE_R + CARD_R) return { flare: FLARE_R, corner: CARD_R }
  if (space <= 1)                return { flare: 0, corner: 0 }
  return { flare: space, corner: 0 }
}

// Silueta con cuello. `open` = sin el borde superior del cuello (para trazar el borde: ahí la
// píldora ya tiene el suyo y no debe haber una línea entre las dos). NO reinicia el trazado
// (cr.newPath()): quien la llama decide si añade la silueta a otra figura, como el recorte del glow.
function stemPath(cr: Cairo.Context, w: number, h: number, stem: { left: number; right: number }, open: boolean) {
  const sl = stem.left, sr = stem.right
  const L = side(sl), R = side(w - sr)
  if (open) cr.moveTo(sr, 0)
  else { cr.moveTo(sl, 0); cr.lineTo(sr, 0) }

  // lado derecho: cuello → esquina cóncava → borde superior de la tarjeta → esquina convexa → abajo
  if (R.flare === 0) cr.lineTo(sr, h - CARD_R)
  else {
    cr.lineTo(sr, STEM_H - R.flare)
    cr.arcNegative(sr + R.flare, STEM_H - R.flare, R.flare, Math.PI, Math.PI / 2)
    if (R.corner > 0) {
      cr.lineTo(w - CARD_R, STEM_H)
      cr.arc(w - CARD_R, STEM_H + CARD_R, CARD_R, -Math.PI / 2, 0)
    }
    cr.lineTo(w, h - CARD_R)
  }
  cr.arc(w - CARD_R, h - CARD_R, CARD_R, 0, Math.PI / 2)
  cr.lineTo(CARD_R, h)
  cr.arc(CARD_R, h - CARD_R, CARD_R, Math.PI / 2, Math.PI)

  // lado izquierdo: arriba por el borde, esquina convexa, borde superior, esquina cóncava, cuello
  if (L.flare === 0) cr.lineTo(sl, 0)
  else {
    if (L.corner > 0) {
      cr.lineTo(0, STEM_H + CARD_R)
      cr.arc(CARD_R, STEM_H + CARD_R, CARD_R, Math.PI, 1.5 * Math.PI)
      cr.lineTo(sl - L.flare, STEM_H)
    } else cr.lineTo(0, STEM_H)
    cr.arcNegative(sl - L.flare, STEM_H - L.flare, L.flare, Math.PI / 2, 0)
    cr.lineTo(sl, 0)
  }
  if (!open) cr.closePath()
}

// Sin cuello (el popup se abrió sin píldora de origen): tarjeta redondeada normal.
function flatPath(cr: Cairo.Context, w: number, h: number) {
  const y = STEM_H
  cr.moveTo(w - CARD_R, y)
  cr.arc(w - CARD_R, y + CARD_R, CARD_R, -Math.PI / 2, 0)
  cr.arc(w - CARD_R, h - CARD_R, CARD_R, 0, Math.PI / 2)
  cr.arc(CARD_R, h - CARD_R, CARD_R, Math.PI / 2, Math.PI)
  cr.arc(CARD_R, y + CARD_R, CARD_R, Math.PI, 1.5 * Math.PI)
  cr.closePath()
}

// Intensidad (alfa) de los tres trazos del glow y su grosor: juntos imitan el `0 0 4px primary` de
// las píldoras (se ve ~0,5 pegado al borde y se apaga a 4 px).
const GLOW: Array<[number, number]> = [[8, 0.12], [6, 0.18], [4, 0.30]]

export function drawPopupShape(cr: Cairo.Context, width: number, height: number, stem: Stem, c: PopupColors) {
  const w = width - 2 * POPUP_PAD
  const h = height - POPUP_PAD
  if (w <= 0 || h <= STEM_H) return
  cr.translate(POPUP_PAD, 0)

  const path = (open: boolean, append = false) => {
    if (!append) cr.newPath()
    if (stem) stemPath(cr, w, h, stem, open)
    else flatPath(cr, w, h)
  }

  // Glow: solo por fuera de la silueta (recorte par-impar), así no tiñe el interior translúcido.
  cr.save()
  cr.newPath()
  cr.rectangle(-20, -20, w + 40, h + 40)
  path(false, true)                       // se suma al rectángulo: recorte = todo menos la silueta
  cr.setFillRule(Cairo.FillRule.EVEN_ODD)
  cr.clip()
  for (const [lw, a] of GLOW) {
    path(false)
    cr.setLineWidth(lw)
    cr.setSourceRGBA(c.border.red, c.border.green, c.border.blue, a)
    cr.stroke()
  }
  cr.restore()

  // Relleno: el cuello (y las esquinas cóncavas) con el relleno de las píldoras; la tarjeta con el
  // suyo, que cambia al pasar el ratón. Se parten en la línea del borde superior de la tarjeta.
  cr.save()
  cr.rectangle(-2, 0, w + 4, STEM_H)
  cr.clip()
  path(false)
  cr.setSourceRGBA(c.stem.red, c.stem.green, c.stem.blue, c.stem.alpha)
  cr.fill()
  cr.restore()

  cr.save()
  cr.rectangle(-2, STEM_H, w + 4, h)
  cr.clip()
  path(false)
  cr.setSourceRGBA(c.card.red, c.card.green, c.card.blue, c.card.alpha)
  cr.fill()
  cr.restore()

  // Borde (sin el borde superior del cuello: cuelga de la píldora)
  path(true)
  cr.setLineWidth(BORDER_W)
  cr.setSourceRGBA(c.border.red, c.border.green, c.border.blue, c.border.alpha)
  cr.stroke()
}
