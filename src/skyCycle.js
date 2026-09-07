/**
 * Day/night sky cycle — which body to track, and which chapter of the day.
 * Sun from sunrise → sunset; moon for the night arc.
 */
import { getTimes, getPosition as getSunPosition } from 'suncalc'

/** Approximate solar disc altitude (with refraction) used for rise/set. */
const SUN_HORIZON = -0.833

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

/**
 * @returns {{
 *   body: 'sun' | 'moon',
 *   chapter: string,
 *   label: string,
 *   sunAltitude: number,
 *   times: object,
 * }}
 */
export function resolveSkyCycle(date, lat, lng) {
  const now = date instanceof Date ? date : new Date(date)
  const sun = getSunPosition(now, lat, lng)
  const times = getTimes(now, lat, lng)
  const alt = sun.altitude

  // Polar edge cases — no sunrise/sunset for this calendar day
  if (!isValidDate(times.sunrise) && !isValidDate(times.sunset)) {
    if (alt >= SUN_HORIZON) {
      return {
        body: 'sun',
        chapter: 'polar-day',
        label: 'Midnight sun',
        sunAltitude: alt,
        times,
      }
    }
    return {
      body: 'moon',
      chapter: 'polar-night',
      label: 'Polar night',
      sunAltitude: alt,
      times,
    }
  }

  const afterSunrise = isValidDate(times.sunrise) ? now >= times.sunrise : alt >= SUN_HORIZON
  const beforeSunset = isValidDate(times.sunset) ? now < times.sunset : alt >= SUN_HORIZON

  const sunIsUp = afterSunrise && beforeSunset && alt >= SUN_HORIZON - 0.5

  if (!sunIsUp) {
    // Night / twilight — track the moon
    let chapter = 'night'
    let label = 'Night · moon'
    if (alt > -6 && alt < SUN_HORIZON) {
      if (isValidDate(times.sunrise) && now < times.sunrise) {
        chapter = 'dawn'
        label = 'Dawn · moon'
      } else {
        chapter = 'dusk'
        label = 'Dusk · moon'
      }
    }
    return { body: 'moon', chapter, label, sunAltitude: alt, times }
  }

  // Day — track the sun; chapter follows the arc
  const noon = times.solarNoon
  const beforeNoon = isValidDate(noon) ? now < noon : true

  if (isValidDate(times.sunriseEnd) && now < times.sunriseEnd) {
    return { body: 'sun', chapter: 'sunrise', label: 'Sunrise', sunAltitude: alt, times }
  }
  if (isValidDate(times.goldenHourEnd) && now < times.goldenHourEnd) {
    return { body: 'sun', chapter: 'morning', label: 'Morning sun', sunAltitude: alt, times }
  }
  if (isValidDate(times.sunsetStart) && now >= times.sunsetStart) {
    return { body: 'sun', chapter: 'sunset', label: 'Sunset', sunAltitude: alt, times }
  }
  if (isValidDate(times.goldenHour) && now >= times.goldenHour) {
    return { body: 'sun', chapter: 'golden', label: 'Golden hour', sunAltitude: alt, times }
  }
  if (beforeNoon) {
    return { body: 'sun', chapter: 'day', label: 'Daytime sun', sunAltitude: alt, times }
  }
  return { body: 'sun', chapter: 'afternoon', label: 'Afternoon sun', sunAltitude: alt, times }
}

export function describeSunVisibility(altitude) {
  if (altitude < SUN_HORIZON) {
    return { summary: 'Sun is below the horizon right now.', canSee: false }
  }
  if (altitude < 5) {
    return { summary: 'Very low on the horizon — look near the skyline.', canSee: true }
  }
  if (altitude < 20) {
    return { summary: 'Low in the sky — easy to spot if clear.', canSee: true }
  }
  return { summary: 'High and bright — don’t stare directly at it.', canSee: true }
}

export function formatSunCaption(date = new Date()) {
  const stamp = date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `Solar disc · ${stamp}`
}
