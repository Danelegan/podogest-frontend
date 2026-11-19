// The podogram is stored at the end of `observaciones`:
//   legacy: "text|||DRAWING:<data URL>"     (strokes over /modelo_pie.avif, 400×600)
//   v2:     "text|||DRAWING:v2:<data URL>"  (strokes over /mapa_pies.svg, 800×560)
// The PNG holds only the strokes, so each drawing must be shown over the map it
// was drawn on. The backend strips everything after the mark for the Excel.
export const DRAWING_MARK = '|||DRAWING:'
const V2_PREFIX = 'v2:'

export const PODOGRAM_MAPS = {
  legacy: {
    width: 400,
    height: 600,
    src: '/modelo_pie.avif',
    alt: 'Modelo anatómico del pie',
    lineWidth: 2,
    minStrokePx: 0,
  },
  v2: {
    width: 800,
    height: 560,
    src: '/mapa_pies.svg',
    alt: 'Mapa de ambos pies: vista plantar y vista dorsal, con pie izquierdo y derecho',
    lineWidth: 3,
    // Strokes never get thinner than this on screen when the map is shrunk.
    minStrokePx: 2.5,
  },
}

// Records without a drawing open on the current map.
export const parseObservations = (raw) => {
  const text = raw ?? ''
  const markIndex = text.indexOf(DRAWING_MARK)
  if (markIndex === -1) return { observations: text, drawing: '', version: 'v2' }

  const stored = text.slice(markIndex + DRAWING_MARK.length)
  const isV2 = stored.startsWith(V2_PREFIX)
  return {
    observations: text.slice(0, markIndex),
    drawing: isV2 ? stored.slice(V2_PREFIX.length) : stored,
    version: isV2 ? 'v2' : 'legacy',
  }
}

export const buildObservations = (observations, drawing, version) => {
  if (!drawing) return observations
  return `${observations}${DRAWING_MARK}${version === 'v2' ? V2_PREFIX : ''}${drawing}`
}
