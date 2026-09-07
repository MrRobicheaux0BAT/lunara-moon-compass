/**
 * NASA Dial-A-Moon hourly frame URLs (SVS).
 * Browser CORS blocks the JSON API, so we build the direct image URL.
 * Frames are 1-indexed hours since Jan 1 00:00 UTC of that year.
 *
 * Year → SVS visualization id (from svs.gsfc.nasa.gov Dial-A-Moon pages).
 */
const NASA_YEAR_IDS = {
  2020: 4768,
  2021: 4874,
  2022: 4954,
  2023: 5048,
  2024: 5187,
  2025: 5415,
  2026: 5587,
}

function pad6(n) {
  return String(n).padStart(6, '0')
}

/** Hourly UTC bucket for Dial-A-Moon (floors to the hour). */
export function nasaDialHour(date = new Date()) {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  return d
}

export function nasaDialAMoonUrl(date = new Date()) {
  const hour = nasaDialHour(date)
  const year = hour.getUTCFullYear()
  const id = NASA_YEAR_IDS[year]
  if (!id) return null

  const yearStart = Date.UTC(year, 0, 1, 0, 0, 0)
  const hours = Math.floor((hour.getTime() - yearStart) / 3_600_000)
  const frame = String(hours + 1).padStart(4, '0')

  const group = Math.floor(id / 100) * 100
  const idPad = pad6(id)
  const groupPad = pad6(group)

  return `https://svs.gsfc.nasa.gov/vis/a000000/a${groupPad}/a${idPad}/frames/730x730_1x1_30p/moon.${frame}.jpg`
}

export function nasaDialCaption(date = new Date()) {
  const hour = nasaDialHour(date)
  const stamp = hour.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    timeZoneName: 'short',
  })
  return `NASA Dial-A-Moon · ${stamp}`
}
