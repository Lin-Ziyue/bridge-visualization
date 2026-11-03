import colorMaps from './colorMaps.json'

export const palettes = Object.fromEntries(
  colorMaps.map((map) => [
    map.name,
    {
      label: map.label || map.name,
      stops: map.stops
        .slice()
        .sort((a, b) => a.value - b.value)
        .map((stop) => ({
          value: stop.value,
          r: stop.r / 255,
          g: stop.g / 255,
          b: stop.b / 255,
          color: `rgb(${stop.r}, ${stop.g}, ${stop.b})`,
        })),
    },
  ])
)

export function gradientCss(stops) {
  const list = stops
    .map((stop) => `${stop.color} ${(stop.value * 100).toFixed(2)}%`)
    .join(', ')
  return `linear-gradient(90deg, ${list})`
}

export function colorAt(stops, t) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0))
  let index = 0
  while (index < stops.length - 2 && clamped > stops[index + 1].value) {
    index++
  }
  const from = stops[index]
  const to = stops[Math.min(index + 1, stops.length - 1)]
  const span = to.value - from.value
  const local = span > 1e-9 ? (clamped - from.value) / span : 0
  return {
    r: from.r + (to.r - from.r) * local,
    g: from.g + (to.g - from.g) * local,
    b: from.b + (to.b - from.b) * local,
  }
}
