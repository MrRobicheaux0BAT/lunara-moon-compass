# Lunara — Moon Compass

Mobile web app that points your phone at the Moon and tells you the live phase, illumination, and whether you can see it.

## Stack
- Vite + vanilla JS
- SunCalc (local moon math — no moon API)
- Device orientation + geolocation

## Develop
```bash
npm install
npm run dev
```
Open the HTTPS URL on your phone (same Wi‑Fi), tap **Start**, allow location + motion.

## Deploy
```bash
npm run build
```
Output is `dist/`. Vercel: import this repo (build `npm run build`, output `dist`).
