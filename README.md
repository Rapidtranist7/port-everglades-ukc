# Port Everglades Squat & UKC

Decision-support calculator for harbor pilots: ship squat (seven published formulas), wave-induced motion from the Hollywood Beach buoy (NDBC 41122) directional spectrum, PEGF1 wind, NOAA CO-OPS tide (8722956) and net under-keel clearance at the sea buoy shoal, Buoys 2 & 3 (outer entrance channel) and inside the jetties / ICW.

Not a certified dynamic UKC system. Pilot judgment, PEPA rules and the latest USACE survey govern.

## Deploy on Netlify

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
