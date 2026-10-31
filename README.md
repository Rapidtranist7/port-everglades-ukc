# Port Everglades Squat & UKC

Decision-support calculator for harbor pilots: ship squat (seven published formulas), wave-induced motion from the Hollywood Beach buoy (NDBC 41122) directional spectrum, PEGF1 wind, NOAA CO-OPS tide (Turning Basin 8722951 default, nearby stations selectable) and net under-keel clearance at the sea buoy shoal, Buoys 2 & 3 (outer entrance channel) and inside the jetties / ICW.

Not a certified dynamic UKC system. Pilot judgment, PEPA rules and the latest USACE survey govern.

## Live data

The browser first tries the same-origin `/api/*` proxy (Express locally, Netlify Function when deployed there). If that route is missing or fails — for example on a static host — it reads the public sources directly (`client/src/lib/feeds-client.ts`):

- waves: CDIP THREDDS/OPeNDAP for CDIP 265 (the same buoy NDBC publishes as 41122); NDBC's own text files block cross-origin browser requests
- wind: NOAA CO-OPS station 8722956 (the sensor NDBC republishes as PEGF1)
- tides: NOAA CO-OPS predictions, highs/lows and the live water level at 8722956

The Tide card shows the state of tide (rising/falling, rate, last and next turn) and a "Calculate at highest tide" toggle that moves the planning time to the higher high water in the next 24 h and recomputes every segment at that height.

## Deploy on Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/Rapidtranist7/port-everglades-ukc)

Netlify reads `netlify.toml`:

- build: `npx vite build` → publish `dist/public`
- functions: `netlify/functions/api.mts` serves `/api/health`, `/api/buoy`, `/api/wind`, `/api/tides` (proxies NDBC, which has no CORS, and CO-OPS)

Connect this repo in Netlify (Add new project → Import from GitHub) — no extra settings or environment variables are needed.

## Local

```
npm install
npm run dev        # Express + Vite on :5000
npm run build && npm start
```

Engine: `shared/ukc.ts`. Feeds: `shared/feeds.ts`. UI: `client/src`.
