export const palettes = {
  ocean: {
    label: '深海蓝',
    stops: ['#1747ff', '#20d6ff', '#ffb547'],
  },
  viridis: {
    label: 'Viridis',
    stops: ['#440154', '#31688e', '#35b779', '#fde725'],
  },
  turbo: {
    label: 'Turbo',
    stops: ['#30123b', '#1ae4b6', '#fbbe2a', '#e34a33'],
  },
  coolwarm: {
    label: '冷暖',
    stops: ['#3b4cc0', '#dddddd', '#b40426'],
  },
}

export function gradientCss(stops) {
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  }
}

export function colorAt(stops, t) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0))
  const scaled = clamped * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(scaled))
  const local = scaled - index
  const from = hexToRgb(stops[index])
  const to = hexToRgb(stops[index + 1])
  return {
    r: from.r + (to.r - from.r) * local,
    g: from.g + (to.g - from.g) * local,
    b: from.b + (to.b - from.b) * local,
  }
}
