import './style.css'
import {
  getMoonPosition,
  getMoonIllumination,
  getMoonTimes,
  getPosition as getSunPosition,
} from 'suncalc'
import { nasaDialAMoonUrl, nasaDialCaption, nasaDialHour } from './nasaMoon.js'
import {
  resolveSkyCycle,
  describeSunVisibility,
  formatSunCaption,
} from './skyCycle.js'

const app = document.querySelector('#app')

const state = {
  lat: null,
  lng: null,
  rawHeading: null,
  smoothHeading: null,
  /** @type {'sun' | 'moon'} */
  body: 'moon',
  targetAzimuth: null,
  targetAltitude: null,
  locationReady: false,
  orientationReady: false,
  watchId: null,
  preferAbsolute: false,
}

app.innerHTML = `
  <div class="sky" aria-hidden="true" id="sky"></div>
  <main class="stage">
    <header class="brand">
      <h1>Lunara</h1>
      <p id="brandTag">Sun &amp; moon compass</p>
    </header>

    <section class="compass-wrap" id="compassWrap" aria-label="Sky compass">
      <div class="facing" aria-hidden="true"></div>
      <div class="compass" id="compass">
        <div class="ring"></div>
        <div id="ticks"></div>
        <div class="label n" style="--a: 0deg"><span>N</span></div>
        <div class="label" style="--a: 90deg"><span>E</span></div>
        <div class="label" style="--a: 180deg"><span>S</span></div>
        <div class="label" style="--a: 270deg"><span>W</span></div>
        <div class="body-orbit" id="bodyOrbit">
          <div class="body-marker" id="bodyMarker">
            <div class="disc" id="bodyDisc"></div>
          </div>
        </div>
        <div class="hub"></div>
      </div>
    </section>

    <section class="readout" aria-live="polite">
      <figure class="sky-portrait" id="skyPortrait">
        <div class="portrait-frame" id="portraitFrame">
          <div class="moon-disc" id="moonPortrait" hidden aria-hidden="true"></div>
          <img
            id="nasaMoonImg"
            alt=""
            width="730"
            height="730"
            decoding="async"
            referrerpolicy="no-referrer"
            hidden
          />
          <div class="sun-disc" id="sunPortrait" hidden aria-hidden="true"></div>
        </div>
        <figcaption id="portraitCap">Waiting for sky…</figcaption>
      </figure>
      <div class="readout-copy">
        <p class="altitude" id="altitude">Finding the sky…</p>
        <p class="meta" id="meta">Tap Start to begin</p>
        <p class="turn" id="turnLine">Hold phone flat for turn hints</p>
        <div class="briefing" id="briefing">
          <p class="phase-line" id="phaseLine">—</p>
          <p class="visibility-line" id="visibilityLine">Enable sensors to track the sky</p>
          <p class="timing-line" id="timingLine">—</p>
        </div>
      </div>
    </section>

    <footer class="dock">
      <p class="status" id="status"></p>
      <div class="actions">
        <button class="primary" id="enableBtn" type="button">Enable sensors</button>
        <button class="ghost" id="recalibrateBtn" type="button" hidden>Recalibrate compass</button>
      </div>
    </footer>
  </main>

  <div class="overlay" id="overlay">
    <div class="sheet">
      <h2>Point your phone</h2>
      <p id="overlayCopy">
        Needs location and compass. Tracks the sun by day and the moon by night.
      </p>
      <button class="primary" id="overlayBtn" type="button">Start</button>
    </div>
  </div>
`

const sky = document.getElementById('sky')
const ticksEl = document.getElementById('ticks')
const compass = document.getElementById('compass')
const compassWrap = document.getElementById('compassWrap')
const bodyOrbit = document.getElementById('bodyOrbit')
const bodyDisc = document.getElementById('bodyDisc')
const brandTag = document.getElementById('brandTag')
const altitudeEl = document.getElementById('altitude')
const metaEl = document.getElementById('meta')
const turnLine = document.getElementById('turnLine')
const briefingEl = document.getElementById('briefing')
const skyPortrait = document.getElementById('skyPortrait')
const nasaMoonImg = document.getElementById('nasaMoonImg')
const moonPortrait = document.getElementById('moonPortrait')
const sunPortrait = document.getElementById('sunPortrait')
const portraitCap = document.getElementById('portraitCap')
const phaseLine = document.getElementById('phaseLine')
const visibilityLine = document.getElementById('visibilityLine')
const timingLine = document.getElementById('timingLine')
const statusEl = document.getElementById('status')
const enableBtn = document.getElementById('enableBtn')
const recalibrateBtn = document.getElementById('recalibrateBtn')
const overlay = document.getElementById('overlay')
const overlayBtn = document.getElementById('overlayBtn')
const overlayCopy = document.getElementById('overlayCopy')

let lastNasaHourKey = null
let lastBodyMode = null

function seedStars() {
  const frag = document.createDocumentFragment()
  for (let i = 0; i < 24; i += 1) {
    const star = document.createElement('span')
    star.className = 'star'
    star.style.left = `${Math.random() * 100}%`
    star.style.top = `${Math.random() * 100}%`
    star.style.setProperty('--dur', `${3 + Math.random() * 3}s`)
    star.style.setProperty('--delay', `${Math.random() * 4}s`)
    frag.appendChild(star)
  }
  sky.appendChild(frag)
}

function seedTicks() {
  const frag = document.createDocumentFragment()
  for (let i = 0; i < 72; i += 1) {
    const tick = document.createElement('div')
    tick.className = `tick${i % 6 === 0 ? ' major' : ''}`
    tick.style.setProperty('--a', `${i * 5}deg`)
    frag.appendChild(tick)
  }
  ticksEl.appendChild(frag)
}

function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360
}

function shortestDelta(from, to) {
  return ((to - from + 540) % 360) - 180
}

function formatBearing(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(normalizeAngle(deg) / 45) % 8
  return `${dirs[idx]} · ${Math.round(normalizeAngle(deg))}°`
}

function formatTurn(delta) {
  const d = shortestDelta(0, normalizeAngle(delta))
  const abs = Math.abs(d)
  if (abs < 8) return 'straight ahead'
  return d > 0 ? `${Math.round(abs)}° right` : `${Math.round(abs)}° left`
}

function formatClock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** phase: 0 new → 0.25 first quarter → 0.5 full → 0.75 last quarter → 1 new */
function describePhase(phase, fraction) {
  const lit = Math.round(fraction * 100)
  const p = ((phase % 1) + 1) % 1

  let name
  if (p < 0.03 || p >= 0.97) name = 'New Moon'
  else if (p < 0.22) name = 'Waxing Crescent'
  else if (p < 0.28) name = 'First Quarter'
  else if (p < 0.47) name = 'Waxing Gibbous'
  else if (p < 0.53) name = 'Full Moon'
  else if (p < 0.72) name = 'Waning Gibbous'
  else if (p < 0.78) name = 'Last Quarter'
  else name = 'Waning Crescent'

  return {
    name,
    lit,
    ageDays: p * 29.530588,
    waxing: p < 0.5,
  }
}

function describeMoonVisibility({ altitude, lit, sunAltitude, name }) {
  if (altitude < -1) {
    return {
      summary: 'Not visible right now — below the horizon from here.',
      canSee: false,
    }
  }

  if (lit < 2 || name === 'New Moon') {
    return {
      summary: 'New moon / nearly invisible — don’t expect to see it.',
      canSee: false,
    }
  }

  if (altitude < 5) {
    return {
      summary:
        lit < 25
          ? 'Very low and thin — hard to catch near the skyline.'
          : 'Very low on the horizon — look near the skyline.',
      canSee: lit >= 15,
    }
  }

  const daytime = sunAltitude > 0
  if (daytime) {
    if (lit >= 60) {
      return {
        summary: 'Up in daylight — pale, but findable if you know where to look.',
        canSee: true,
      }
    }
    if (lit >= 20) {
      return {
        summary: 'Up now, but washed out by daylight — tough without clear skies.',
        canSee: false,
      }
    }
    return {
      summary: 'Technically up, but daylight + thin phase = practically invisible.',
      canSee: false,
    }
  }

  if (lit >= 90) return { summary: 'Full / nearly full — bright and easy to see.', canSee: true }
  if (lit >= 45) return { summary: 'Bright and clearly visible right now.', canSee: true }
  if (lit >= 15) return { summary: 'Visible as a crescent if the sky is clear.', canSee: true }
  return {
    summary: 'A faint sliver — only under dark, clear skies.',
    canSee: lit >= 8,
  }
}

let statusClearTimer = null

function setStatus(message, ok = false) {
  if (statusClearTimer) {
    clearTimeout(statusClearTimer)
    statusClearTimer = null
  }
  statusEl.textContent = message || ''
  statusEl.classList.toggle('ok', ok)
  if (ok && message) {
    statusClearTimer = setTimeout(() => {
      statusEl.textContent = ''
      statusEl.classList.remove('ok')
      statusClearTimer = null
    }, 3200)
  }
}

function hideOverlay() {
  overlay.hidden = true
  overlay.setAttribute('aria-hidden', 'true')
}

function showOverlay(message) {
  if (message) overlayCopy.textContent = message
  overlay.hidden = false
  overlay.removeAttribute('aria-hidden')
  overlayBtn.disabled = false
  enableBtn.disabled = false
  enableBtn.hidden = false
}

function paintMeta() {
  const base = metaEl.dataset.base
  if (base) metaEl.innerHTML = base
  if (state.smoothHeading == null || state.targetAzimuth == null) {
    turnLine.innerHTML = 'Hold phone flat for turn hints'
    return
  }
  turnLine.innerHTML = `Turn <strong>${formatTurn(state.targetAzimuth - state.smoothHeading)}</strong> to face it`
}

function paintPhaseDisc(phase, fraction) {
  const p = ((phase % 1) + 1) % 1
  const waxing = p < 0.5
  const lit = Math.max(0, Math.min(1, fraction))
  const shade = 1 - lit
  const side = waxing ? 1 : -1
  const phaseX = `${side * (15 + shade * 70)}%`
  const phaseShade = String(0.2 + shade * 0.75)
  const litStr = String(lit)

  bodyDisc.style.setProperty('--phase-x', phaseX)
  bodyDisc.style.setProperty('--phase-shade', phaseShade)
  bodyDisc.style.setProperty('--lit', litStr)

  moonPortrait.style.setProperty('--phase-x', phaseX)
  moonPortrait.style.setProperty('--phase-shade', phaseShade)
  moonPortrait.style.setProperty('--lit', litStr)
}

function applyTheme(body, chapter) {
  const skyMode = body === 'sun' ? 'day' : 'night'
  document.documentElement.dataset.sky = skyMode
  document.documentElement.dataset.chapter = chapter
  document.body.dataset.sky = skyMode
  compassWrap.dataset.body = body
  bodyDisc.classList.toggle('sun', body === 'sun')
  bodyDisc.classList.toggle('moon', body === 'moon')
  brandTag.textContent = 'Sun & moon compass'

  const theme = document.querySelector('meta[name="theme-color"]')
  if (theme) theme.setAttribute('content', skyMode === 'day' ? '#120c05' : '#03140f')

  if (body !== lastBodyMode) {
    lastBodyMode = body
    if (state.locationReady) {
      setStatus(body === 'sun' ? 'Day cycle · tracking the sun' : 'Night cycle · tracking the moon', true)
    }
  }
}

function showMoonFallbackPortrait(caption) {
  sunPortrait.hidden = true
  nasaMoonImg.hidden = true
  moonPortrait.hidden = false
  moonPortrait.setAttribute('aria-hidden', 'false')
  portraitCap.textContent = caption || 'Moon phase'
}

function paintNasaMoon(date = new Date()) {
  const hour = nasaDialHour(date)
  const key = hour.toISOString()
  const url = nasaDialAMoonUrl(hour)
  const fallbackCap = `Moon · ${hour.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
  })}`

  // Always show local phase disc first — Safari/content blockers often block NASA SVS
  showMoonFallbackPortrait(fallbackCap)

  if (!url) return
  if (key === lastNasaHourKey && !nasaMoonImg.hidden) return

  lastNasaHourKey = key

  const onOk = () => {
    nasaMoonImg.hidden = false
    moonPortrait.hidden = true
    bodyDisc.classList.add('nasa')
    bodyDisc.style.setProperty('--nasa-url', `url("${url}")`)
    portraitCap.textContent = nasaDialCaption(hour)
  }

  const onFail = () => {
    nasaMoonImg.hidden = true
    nasaMoonImg.removeAttribute('src')
    bodyDisc.classList.remove('nasa')
    bodyDisc.style.removeProperty('--nasa-url')
    showMoonFallbackPortrait(fallbackCap)
    lastNasaHourKey = null
  }

  nasaMoonImg.onload = onOk
  nasaMoonImg.onerror = onFail
  nasaMoonImg.referrerPolicy = 'no-referrer'
  nasaMoonImg.alt = 'NASA Dial-A-Moon for the current UTC hour'
  nasaMoonImg.src = url
}

function paintSunPortrait(date = new Date()) {
  nasaMoonImg.hidden = true
  nasaMoonImg.removeAttribute('src')
  moonPortrait.hidden = true
  sunPortrait.hidden = false
  bodyDisc.classList.remove('nasa')
  bodyDisc.style.removeProperty('--nasa-url')
  portraitCap.textContent = formatSunCaption(date)
}

function paintMoonPortrait(date = new Date()) {
  paintNasaMoon(date)
}

function updateSky() {
  if (state.lat == null || state.lng == null) return

  const now = new Date()
  const cycle = resolveSkyCycle(now, state.lat, state.lng)
  const sun = getSunPosition(now, state.lat, state.lng)

  applyTheme(cycle.body, cycle.chapter)
  state.body = cycle.body

  if (cycle.body === 'sun') {
    state.targetAzimuth = normalizeAngle(sun.azimuth)
    state.targetAltitude = sun.altitude

    paintSunPortrait(now)
    // Full “lit” sun disc on the compass marker
    bodyDisc.style.setProperty('--phase-x', '120%')
    bodyDisc.style.setProperty('--phase-shade', '0')
    bodyDisc.style.setProperty('--lit', '1')

    const below = state.targetAltitude < 0
    compassWrap.classList.toggle('below-horizon', below)

    altitudeEl.textContent = below
      ? `Below horizon · ${Math.abs(state.targetAltitude).toFixed(0)}°`
      : `Look up ${state.targetAltitude.toFixed(0)}°`

    metaEl.dataset.base = `Sun bearing <strong>${formatBearing(state.targetAzimuth)}</strong>`
    paintMeta()

    const visibility = describeSunVisibility(state.targetAltitude)
    phaseLine.innerHTML = `<strong>${cycle.label}</strong>`
    visibilityLine.textContent = visibility.summary

    const rise = cycle.times.sunrise ? formatClock(cycle.times.sunrise) : '—'
    const set = cycle.times.sunset ? formatClock(cycle.times.sunset) : '—'
    const noon = cycle.times.solarNoon ? formatClock(cycle.times.solarNoon) : '—'
    timingLine.textContent = `Sunrise ${rise} · Noon ${noon} · Sunset ${set}`

    briefingEl.dataset.canSee = visibility.canSee ? 'yes' : 'no'
    return
  }

  // Night — moon
  const pos = getMoonPosition(now, state.lat, state.lng)
  const illum = getMoonIllumination(now)
  const moonTimes = getMoonTimes(now, state.lat, state.lng)

  state.targetAzimuth = normalizeAngle(pos.azimuth)
  state.targetAltitude = pos.altitude

  const phaseInfo = describePhase(illum.phase, illum.fraction)
  const visibility = describeMoonVisibility({
    altitude: state.targetAltitude,
    lit: phaseInfo.lit,
    sunAltitude: sun.altitude,
    name: phaseInfo.name,
  })

  paintPhaseDisc(illum.phase, illum.fraction)
  paintMoonPortrait(now)

  const below = state.targetAltitude < 0
  compassWrap.classList.toggle('below-horizon', below)

  altitudeEl.textContent = below
    ? `Below horizon · ${Math.abs(state.targetAltitude).toFixed(0)}°`
    : `Look up ${state.targetAltitude.toFixed(0)}°`

  metaEl.dataset.base = `Moon bearing <strong>${formatBearing(state.targetAzimuth)}</strong>`
  paintMeta()

  phaseLine.innerHTML = `<strong>${phaseInfo.name}</strong> · ${phaseInfo.lit}% illuminated`
  visibilityLine.textContent = visibility.summary

  const rise = moonTimes.rise
    ? formatClock(moonTimes.rise)
    : moonTimes.alwaysUp
      ? 'always up'
      : 'none today'
  const set = moonTimes.set
    ? formatClock(moonTimes.set)
    : moonTimes.alwaysDown
      ? 'always down'
      : 'none today'
  const sunRise = cycle.times.sunrise ? formatClock(cycle.times.sunrise) : '—'
  const sunSet = cycle.times.sunset ? formatClock(cycle.times.sunset) : '—'
  timingLine.textContent = `Moonrise ${rise} · Moonset ${set} · Sun ${sunRise}–${sunSet}`

  briefingEl.dataset.canSee = visibility.canSee ? 'yes' : 'no'
}

function applyLocation(pos) {
  state.lat = pos.coords.latitude
  state.lng = pos.coords.longitude
  state.locationReady = true
  updateSky()
}

/** Must run from a tap before other permission dialogs (iOS). */
async function requestOrientationPermission() {
  if (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  ) {
    const result = await DeviceOrientationEvent.requestPermission()
    if (result !== 'granted') {
      throw new Error('Motion permission denied. Allow motion & orientation, then retry.')
    }
  }
}

function parseHeading(event) {
  if (typeof event.webkitCompassHeading === 'number' && !Number.isNaN(event.webkitCompassHeading)) {
    return normalizeAngle(event.webkitCompassHeading)
  }

  if (typeof event.alpha !== 'number' || Number.isNaN(event.alpha)) return null

  if (event.type === 'deviceorientation' && state.preferAbsolute && event.absolute === false) {
    return null
  }

  let heading = normalizeAngle(360 - event.alpha)
  const orientation = screen.orientation?.angle ?? window.orientation ?? 0
  if (typeof orientation === 'number') {
    heading = normalizeAngle(heading + orientation)
  }
  return heading
}

function onOrientation(event) {
  const heading = parseHeading(event)
  if (heading == null) return

  state.rawHeading = heading
  state.orientationReady = true

  if (!enableBtn.hidden) {
    enableBtn.hidden = true
    recalibrateBtn.hidden = false
  }
}

function startOrientationListeners() {
  window.removeEventListener('deviceorientationabsolute', onOrientation, true)
  window.removeEventListener('deviceorientation', onOrientation, true)

  state.preferAbsolute = 'ondeviceorientationabsolute' in window
  if (state.preferAbsolute) {
    window.addEventListener('deviceorientationabsolute', onOrientation, true)
  }
  window.addEventListener('deviceorientation', onOrientation, true)
}

function startLocation() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Geolocation is not supported in this browser'))
  }

  if (state.watchId != null) {
    navigator.geolocation.clearWatch(state.watchId)
  }

  const quick = new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    })
  })

  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      applyLocation(pos)
      setStatus(
        state.orientationReady ? 'Live · hold phone flat' : 'Location locked · waiting on compass…',
        true,
      )
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  )

  return quick
    .then((pos) => {
      applyLocation(pos)
    })
    .catch(
      () =>
        new Promise((resolve, reject) => {
          const started = Date.now()
          const timer = setInterval(() => {
            if (state.locationReady) {
              clearInterval(timer)
              resolve()
            } else if (Date.now() - started > 12000) {
              clearInterval(timer)
              reject(new Error('Could not get location. Check GPS / browser permission.'))
            }
          }, 200)
        }),
    )
}

async function enableSensors() {
  enableBtn.disabled = true
  overlayBtn.disabled = true
  setStatus('Asking for sensors…')
  hideOverlay()

  try {
    await requestOrientationPermission()
    startOrientationListeners()
    setStatus('Compass ready · getting location…')

    await startLocation()
    updateSky()

    enableBtn.hidden = true
    recalibrateBtn.hidden = false
    setStatus(
      state.orientationReady ? 'Live · hold phone flat' : 'Move the phone a little to wake the compass',
      true,
    )
  } catch (err) {
    console.error(err)
    const message =
      err?.code === 1
        ? 'Location permission denied. Enable it in browser settings, then retry.'
        : err?.message || 'Could not enable sensors'
    setStatus(message)
    showOverlay(message)
  }
}

let lastMetaPaint = 0
function renderLoop(now) {
  if (state.rawHeading != null) {
    if (state.smoothHeading == null) {
      state.smoothHeading = state.rawHeading
    } else {
      const delta = shortestDelta(state.smoothHeading, state.rawHeading)
      state.smoothHeading = normalizeAngle(state.smoothHeading + delta * 0.28)
    }
    compass.style.transform = `rotate(${-state.smoothHeading}deg)`
  }

  if (state.targetAzimuth != null && bodyOrbit) {
    bodyOrbit.style.setProperty('--body-a', `${state.targetAzimuth}deg`)
  }

  if (now - lastMetaPaint > 120) {
    paintMeta()
    lastMetaPaint = now
  }

  requestAnimationFrame(renderLoop)
}

seedStars()
seedTicks()
requestAnimationFrame(renderLoop)

enableBtn.addEventListener('click', enableSensors)
overlayBtn.addEventListener('click', enableSensors)
recalibrateBtn.addEventListener('click', () => {
  state.smoothHeading = state.rawHeading
  setStatus('Wave phone in a figure-8, then hold flat', true)
  startOrientationListeners()
})

setInterval(updateSky, 5_000)

if (!window.isSecureContext) {
  setStatus('Needs HTTPS for sensors.')
  overlayCopy.textContent = 'Open this app over HTTPS, then tap Start.'
}
