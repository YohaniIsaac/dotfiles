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
//
// Para que el cuello y la píldora parezcan UN solo marco, el contorno que se dibuja es el FILO EXTERIOR
// y el borde, el glow y el relleno se comportan como en el CSS de las píldoras (_shared.scss, pill-look):
//   · el relleno llega hasta el filo;
//   · el borde es una franja de BORDER_W px por DENTRO del filo, pintada sobre el relleno (un trazo
//     centrado en el contorno dejaba su mitad exterior sobre el glow, más brillante, y el borde salía
//     más grueso y claro que el de la píldora);
//   · el glow va solo por fuera del filo, con la misma caída que el box-shadow de CSS.

export const POPUP_PAD = 5     // margen transparente a los lados y abajo, para el glow (≥ GLOW_BLUR)
export const STEM_H    = 12    // alto del cuello (de la píldora al borde superior de la tarjeta)
const BORDER_W = 2             // grosor del borde (igual que las píldoras)
const CARD_R  = 14             // radio de las esquinas convexas de la tarjeta
const FLARE_R = 10             // radio de las esquinas cóncavas entre el cuello y la tarjeta

// Cuello: posición horizontal (px) de sus bordes respecto a la tarjeta (sin el POPUP_PAD).
export type Stem = { left: number; right: number } | null

export type PopupColors = {
  card:   Gdk.RGBA   // relleno de la tarjeta (más sólido con el ratón encima)
  stem:   Gdk.RGBA   // relleno del cuello: igual que las píldoras, siempre
  border: Gdk.RGBA   // borde
  glow:   Gdk.RGBA   // glow: el color y, en su alfa, la intensidad ($glow-intensity)
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

// Glow: el `box-shadow: 0 0 4px primary` de las píldoras ($glow-size, $glow-intensity de _shared.scss).
// Va solo por fuera del filo y cae rápido: ALFA MEDIDO en el glow real de GTK (el del reloj en la
// barra: píxeles (47,71,89), (26,40,52) y (16,24,32) sobre un fondo (15,22,30), con primary
// (132,207,255)) por franja de 1 px hacia fuera. No es la gaussiana de sigma = B/2 que daría la
// cuenta (el popup quedaba con un halo el doble de ancho que el de las píldoras): GTK desenfoca con
// la mitad de eso. Se imita apilando un trazo por franja, centrado en el contorno y recortado a lo de
// fuera, del más ancho al más angosto: el trazo k llega hacia fuera hasta k px, así que a distancia d
// suman 1 − Π(1 − a_k) de los que llegan hasta d, y de esa fórmula salen los alfas a_k.
const GLOW_BANDS = [0.27, 0.10, 0.01]   // alfa a 0–1, 1–2 y 2–3 px del filo, con $glow-intensity = 1

// [grosor del trazo, alfa] del más ancho al más angosto, para la intensidad `intensity` (0–1)
function glowLayers(intensity: number): Array<[number, number]> {
  const want = (k: number) => Math.min(0.95, intensity * GLOW_BANDS[k - 1])   // franja k (1-based)
  const layers: Array<[number, number]> = []
  for (let k = GLOW_BANDS.length; k >= 1; k--) {
    const outer = k === GLOW_BANDS.length ? 0 : want(k + 1)   // lo que ya aportan los trazos más anchos
    layers.push([2 * k, 1 - (1 - want(k)) / (1 - outer)])
  }
  return layers
}

// Marco de la píldora de origen. Con el popup abierto la ventana del popup sube hasta el borde superior
// de la píldora y dibuja ELLA el marco de la píldora (borde y glow), mientras la píldora oculta el suyo
// (clase `framed`): así el marco completo —píldora, cuello y tarjeta— sale de este mismo código, con los
// mismos colores, el mismo grosor y la misma caída de glow, y no hay dos marcos que casar. Es el marco
// "nuevo, encima de ambos" que se pidió; la píldora solo conserva su relleno y su contenido.
//
// Coordenadas: (0, 0) = esquina superior izquierda del área, que mide (ancho de la píldora + 2·POPUP_PAD)
// × alto de la píldora; la píldora ocupa x ∈ [POPUP_PAD, POPUP_PAD + pillW]. Abajo no hay borde: el borde
// del cuello (drawPopupShape) empieza justo en la fila siguiente, a la misma x.
export const PILL_R = 12   // = $radius de _shared.scss: radio de las esquinas de la píldora

export function drawPillBand(cr: Cairo.Context, width: number, height: number, c: PopupColors) {
  const x0 = POPUP_PAD, x1 = width - POPUP_PAD, H = height, R = Math.min(PILL_R, H)
  if (x1 - x0 <= 2 * R || H <= 0) return

  // Silueta: esquinas redondas arriba y lados rectos hasta el borde inferior del área. `open` = sin el
  // borde inferior (el borde no lo lleva: sigue el del cuello). `append` = no reinicia el trazado: el
  // recorte del glow la suma al rectángulo (un newPath() aquí borraba el rectángulo y el glow se pintaba
  // por dentro de la píldora, no por fuera).
  const outline = (open: boolean, append = false) => {
    if (!append) cr.newPath()
    cr.moveTo(x0, H)
    cr.lineTo(x0, R)
    cr.arc(x0 + R, R, R, Math.PI, 1.5 * Math.PI)
    cr.lineTo(x1 - R, 0)
    cr.arc(x1 - R, R, R, -Math.PI / 2, 0)
    cr.lineTo(x1, H)
    if (!open) cr.closePath()
  }

  // Glow: por fuera de la silueta, a los lados y arriba (arriba el área no tiene píxeles: la barra
  // tampoco los tiene, la píldora está pegada al borde superior de su superficie).
  cr.save()
  cr.newPath()
  cr.rectangle(-20, -20, width + 40, H + 40)
  outline(false, true)                    // se suma al rectángulo: recorte = todo menos la silueta
  cr.setFillRule(Cairo.FillRule.EVEN_ODD)
  cr.clip()
  cr.setLineJoin(Cairo.LineJoin.ROUND)
  for (const [lw, a] of glowLayers(c.glow.alpha)) {
    outline(false)
    cr.setLineWidth(lw)
    cr.setSourceRGBA(c.glow.red, c.glow.green, c.glow.blue, a)
    cr.stroke()
  }
  cr.restore()

  // Borde: franja de BORDER_W px por dentro del filo (como el borde CSS de la píldora), sin el lado inferior.
  cr.save()
  outline(false)
  cr.clip()
  outline(true)
  cr.setLineWidth(2 * BORDER_W)
  cr.setSourceRGBA(c.border.red, c.border.green, c.border.blue, c.border.alpha)
  cr.stroke()
  cr.restore()
}

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
  cr.setLineJoin(Cairo.LineJoin.ROUND)
  for (const [lw, a] of glowLayers(c.glow.alpha)) {
    path(false)
    cr.setLineWidth(lw)
    cr.setSourceRGBA(c.glow.red, c.glow.green, c.glow.blue, a)
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

  // Borde: franja de BORDER_W px por dentro del filo, sin el borde superior del cuello (cuelga de la
  // píldora, que ya tiene el suyo). Se traza el contorno abierto con el doble de grosor y se recorta a
  // la silueta cerrada: queda justo la mitad interior.
  cr.save()
  path(false)
  cr.clip()
  path(true)
  cr.setLineWidth(2 * BORDER_W)
  cr.setSourceRGBA(c.border.red, c.border.green, c.border.blue, c.border.alpha)
  cr.stroke()
  cr.restore()
}
