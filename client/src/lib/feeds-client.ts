// Browser-side data feeds. The app first tries the same-origin /api proxy (Express locally, Netlify
// Function when deployed there). If that is missing or failing, it reads the public sources directly:
//   • waves  — CDIP THREDDS/OPeNDAP for CDIP 265 (= NDBC 41122), which sends CORS headers
//   • wind   — NOAA CO-OPS station 8722956 (the same sensor NDBC republishes as PEGF1)
//   • tides  — NOAA CO-OPS predictions / water levels
// NDBC's own text files have no CORS headers, so they cannot be read from a browser.
import type { BuoyData, WindData, TideData, TideStationInfo } from "./compute";

const COOPS = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const CDIP = "https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/realtime/265p1_rt.nc";
const API_TIMEOUT = 9000;

export type FeedSource = "api" | "direct";
export interface Sourced<T> { data: T; source: FeedSource }

async function fetchText(url: string, timeoutMs = 20000, init?: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

async function tryApi<T>(path: string): Promise<T | null> {
  try {
    const txt = await fetchText(path, API_TIMEOUT, { headers: { Accept: "application/json" } });
    const j = JSON.parse(txt);
    if (j && typeof j === "object" && !("error" in j)) return j as T;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- waves (CDIP 265)

/** Parse the OPeNDAP ASCII response into named numeric arrays (2-D grids are flattened per row). */
export function parseDods(txt: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const body = txt.split(/^-{20,}\s*$/m)[1] ?? txt;
  const lines = body.split(/\r?\n/);
  let cur: string | null = null;
  for (const raw of lines) {
    const ln = raw.trim();
    if (!ln) continue;
    const head = ln.match(/^([A-Za-z_][\w.]*)\[/);
    if (head && !ln.includes(",")) { cur = head[1].split(".").pop()!; out[cur] = out[cur] ?? []; continue; }
    if (!cur) continue;
    const vals = ln.replace(/^\[\d+\],\s*/, "").split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    out[cur].push(...vals);
  }
  return out;
}

async function cdipLength(): Promise<number> {
  const dds = await fetchText(`${CDIP}.dds`);
  const m = dds.match(/waveTime\[waveTime = (\d+)\]/);
  if (!m) throw new Error("CDIP: no waveTime dimension");
  return Number(m[1]);
}

function partition(bins: { f: number; df: number; S: number; dir: number | null }[], sepHz = 0.125) {
  // Simple fixed-frequency split (10 s): swell below, wind sea above. NDBC uses a steepness-based split.
  const m0 = (sel: (b: { f: number }) => boolean) => bins.filter(sel).reduce((a, b) => a + b.S * b.df, 0);
  const peak = (sel: (b: { f: number }) => boolean) => bins.filter(sel).reduce((a, b) => (b.S > a.S ? b : a), { f: NaN, S: -1, dir: null as number | null, df: 0 });
  const ms = m0((b) => b.f < sepHz), mw = m0((b) => b.f >= sepHz);
  const ps = peak((b) => b.f < sepHz), pw = peak((b) => b.f >= sepHz);
  return {
    swellH: ms > 0 ? +(4 * Math.sqrt(ms)).toFixed(2) : 0, swellT: ps.S > 0 ? +(1 / ps.f).toFixed(1) : null, swellDir: ps.dir,
    windH: mw > 0 ? +(4 * Math.sqrt(mw)).toFixed(2) : 0, windT: pw.S > 0 ? +(1 / pw.f).toFixed(1) : null, windDir: pw.dir,
  };
}

const COMPASS16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const txtDir = (d: number | null) => (d == null ? undefined : COMPASS16[Math.round(((d % 360) / 22.5)) % 16]);

export async function buoyDirect(): Promise<BuoyData> {
  const n = await cdipLength();
  const last = n - 1;
  const first = Math.max(0, n - 96); // 48 h at 30-min records
  const q = (name: string, r: string) => `${name}${r}`;
  const grid = (name: string) => `${name}.${name}%5B${last}:1:${last}%5D%5B0:1:99%5D`;
  const range = `%5B${first}:1:${last}%5D`;
  const url = `${CDIP}.ascii?` + [
    q("waveTime", range), q("waveHs", range), q("waveTp", range), q("waveTa", range), q("waveDp", range), q("waveFlagPrimary", range),
    "waveFrequency%5B0:1:99%5D", "waveBandwidth%5B0:1:99%5D",
    grid("waveEnergyDensity"), grid("waveMeanDirection"), grid("waveA1Value"), grid("waveB1Value"),
  ].join(",");
  const d = parseDods(await fetchText(url, 25000));
  const T = d.waveTime ?? [];
  if (!T.length) throw new Error("CDIP: empty response");
  const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 16) + ":00Z";
  const good = (i: number) => (d.waveFlagPrimary?.[i] ?? 1) === 1 && d.waveHs?.[i] != null && d.waveHs[i] < 90;
  const idx = T.map((_, i) => i);
  const li = [...idx].reverse().find(good) ?? T.length - 1;
  const out: BuoyData = {
    station: "41122", name: "Hollywood Beach, FL (CDIP 265)", lat: 26.001, lon: -80.096, depthM: 15.6, errors: [], source: "cdip",
    std: { time: iso(T[li]), hs: d.waveHs[li], dpd: +d.waveTp[li].toFixed(1), apd: +d.waveTa[li].toFixed(1), mwd: Math.round(d.waveDp[li]), wtmp: null },
    history: idx.filter(good).map((i) => ({ time: iso(T[i]), hs: d.waveHs[i], dpd: +d.waveTp[i].toFixed(1), mwd: Math.round(d.waveDp[i]) })),
  };
  const F = d.waveFrequency ?? [], BW = d.waveBandwidth ?? [], S = d.waveEnergyDensity ?? [], MD = d.waveMeanDirection ?? [], A1 = d.waveA1Value ?? [], B1 = d.waveB1Value ?? [];
  if (F.length && S.length === F.length) {
    const bins = F.map((f, i) => {
      const a1 = A1[i], b1 = B1[i];
      const r1 = a1 != null && b1 != null && Math.abs(a1) < 2 && Math.abs(b1) < 2 ? Math.min(1, Math.hypot(a1, b1)) : null;
      const dir = MD[i] != null && MD[i] >= 0 && MD[i] <= 360 ? MD[i] : null;
      return { f, df: BW[i] ?? 0.01, S: S[i] >= 0 && S[i] < 1e3 ? S[i] : 0, dir, r1 };
    });
    out.spectrum = { time: iso(T[T.length - 1]), bins };
    const p = partition(bins);
    out.parts = {
      time: iso(T[T.length - 1]), hs: out.std!.hs, swellH: p.swellH, swellT: p.swellT, windH: p.windH, windT: p.windT,
      swellDir: p.swellDir, windDir: p.windDir, swellDirTxt: txtDir(p.swellDir), windDirTxt: txtDir(p.windDir), apd: out.std!.apd, mwd: out.std!.mwd,
    };
  } else out.errors.push("directional spectrum");
  return out;
}

// ---------------------------------------------------------------- wind (CO-OPS 8722956 = PEGF1)

export async function windDirect(): Promise<WindData> {
  const base = `station=8722956&date=latest&units=metric&time_zone=gmt&format=json&application=PortEvergladesUKC`;
  const [w, p] = await Promise.allSettled([
    fetchText(`${COOPS}?${base}&product=wind`),
    fetchText(`${COOPS}?${base}&product=air_pressure`),
  ]);
  if (w.status !== "fulfilled") throw new Error("CO-OPS wind unavailable");
  const wj = JSON.parse(w.value);
  const row = wj.data?.[0];
  if (!row) throw new Error("CO-OPS wind: no data");
  const toIso = (t: string) => t.replace(" ", "T") + ":00Z";
  const n = (s: string | undefined) => (s === undefined || s === "" ? null : Number(s));
  let pres: number | null = null;
  if (p.status === "fulfilled") { const pj = JSON.parse(p.value); pres = n(pj.data?.[0]?.v); }
  return { station: "PEGF1", name: "Port Everglades, FL (NOS 8722956)", time: toIso(row.t), wdir: n(row.d), wspd: n(row.s), gst: n(row.g), pres, source: "coops" };
}

// ---------------------------------------------------------------- tides (CO-OPS)

export const TIDE_STATIONS: (TideStationInfo & { lat: number; lon: number })[] = [
  { id: "8722951", name: "Port Everglades, Turning Basin", short: "Turning Basin", kind: "subordinate", observed: false, lat: 26.0917, lon: -80.1233 },
  { id: "8722956", name: "South Port Everglades, ICWW (live gauge)", short: "S. Port Everglades", kind: "reference", observed: true, lat: 26.0817, lon: -80.1167 },
  { id: "8722899", name: "Lauderdale-by-the-Sea, Anglin Fishing Pier", short: "Anglin Pier", kind: "reference", observed: false, lat: 26.1883, lon: -80.0933 },
  { id: "8722939", name: "Bahia Mar Yacht Club", short: "Bahia Mar", kind: "subordinate", observed: false, lat: 26.1133, lon: -80.1083 },
  { id: "8722937", name: "Fort Lauderdale, Andrews Ave. Bridge", short: "Andrews Ave", kind: "reference", observed: false, lat: 26.1183, lon: -80.145 },
  { id: "8722957", name: "Whiskey Creek, north end", short: "Whiskey Creek N", kind: "subordinate", observed: false, lat: 26.08, lon: -80.1117 },
  { id: "8722968", name: "Port Laudania, Dania Cut-off Canal", short: "Port Laudania", kind: "subordinate", observed: false, lat: 26.06, lon: -80.13 },
  { id: "8722979", name: "Hollywood Beach", short: "Hollywood Beach", kind: "subordinate", observed: false, lat: 26.04, lon: -80.115 },
];
export const DEFAULT_TIDE_STATION = "8722951";
const OBSERVED_STATION = "8722956";

const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

/** Cosine interpolation between successive highs and lows (standard for subordinate stations), 6-minute steps. */
export function curveFromHilo(hilo: { t: string; v: number }[], stepMin = 6) {
  const out: { t: string; v: number }[] = [];
  for (let i = 0; i < hilo.length - 1; i++) {
    const a = hilo[i], b = hilo[i + 1];
    const ta = Date.parse(a.t), tb = Date.parse(b.t);
    for (let t = ta; t < tb; t += stepMin * 60e3) {
      const f = (t - ta) / (tb - ta);
      const v = a.v + (b.v - a.v) * (1 - Math.cos(Math.PI * f)) / 2;
      out.push({ t: new Date(t).toISOString().slice(0, 16) + ":00Z", v: +v.toFixed(3) });
    }
  }
  if (hilo.length) out.push({ t: hilo[hilo.length - 1].t, v: hilo[hilo.length - 1].v });
  return out;
}

export async function tidesDirect(stationId: string = DEFAULT_TIDE_STATION): Promise<TideData> {
  const stn = TIDE_STATIONS.find((s) => s.id === stationId) ?? TIDE_STATIONS[0];
  const now = new Date();
  const begin = new Date(now.getTime() - 30 * 3600e3);
  const end = new Date(now.getTime() + 48 * 3600e3);
  const base = (id: string) => `station=${id}&datum=MLLW&units=english&time_zone=gmt&format=json&application=PortEvergladesUKC`;
  const window = `begin_date=${ymd(begin)}&end_date=${ymd(end)}`;
  const toIso = (t: string) => t.replace(" ", "T") + ":00Z";
  const out: TideData = {
    station: stn.id, name: stn.name, kind: stn.kind, datum: "MLLW", units: "ft", errors: [], source: "coops",
    predictions: [], hilo: [], observed: [], stations: TIDE_STATIONS.map(({ id, name, short, kind, observed }) => ({ id, name, short, kind, observed })), observedStation: OBSERVED_STATION,
  };
  const [hilo, pred, obs, obsPred] = await Promise.allSettled([
    fetchText(`${COOPS}?${base(stn.id)}&product=predictions&interval=hilo&${window}`),
    stn.kind === "reference" ? fetchText(`${COOPS}?${base(stn.id)}&product=predictions&interval=6&${window}`) : Promise.reject(new Error("subordinate")),
    fetchText(`${COOPS}?${base(OBSERVED_STATION)}&product=water_level&range=6`),
    fetchText(`${COOPS}?${base(OBSERVED_STATION)}&product=predictions&interval=6&${window}`),
  ]);
  if (hilo.status === "fulfilled") {
    const j = JSON.parse(hilo.value);
    out.hilo = (j.predictions ?? []).map((x: any) => ({ t: toIso(x.t), v: Number(x.v), type: x.type }));
  } else out.errors.push("hilo");
  if (pred.status === "fulfilled") {
    const j = JSON.parse(pred.value);
    out.predictions = (j.predictions ?? []).map((x: any) => ({ t: toIso(x.t), v: Number(x.v) }));
    out.curve = "noaa-6min";
  } else if (out.hilo.length) {
    out.predictions = curveFromHilo(out.hilo);
    out.curve = "interpolated-from-hilo";
  } else out.errors.push("predictions");
  if (obs.status === "fulfilled") {
    const j = JSON.parse(obs.value);
    out.observed = (j.data ?? []).filter((x: any) => x.v !== "").map((x: any) => ({ t: toIso(x.t), v: Number(x.v) }));
  } else out.errors.push("observed");
  if (obsPred.status === "fulfilled") {
    const j = JSON.parse(obsPred.value);
    out.observedPredictions = (j.predictions ?? []).map((x: any) => ({ t: toIso(x.t), v: Number(x.v) }));
  }
  if (!out.predictions.length) throw new Error("CO-OPS: no tide predictions");
  return out;
}

// ---------------------------------------------------------------- combined loaders (API first, then direct)

export async function loadBuoy(): Promise<BuoyData> {
  const api = await tryApi<BuoyData>("/api/buoy");
  if (api?.std) return { ...api, source: api.source ?? "ndbc" };
  return buoyDirect();
}
export async function loadWind(): Promise<WindData> {
  const api = await tryApi<WindData>("/api/wind");
  if (api?.time) return { ...api, source: api.source ?? "ndbc" };
  return windDirect();
}
export async function loadTides(station: string): Promise<TideData> {
  const api = await tryApi<TideData>(`/api/tides?station=${encodeURIComponent(station)}`);
  if (api?.predictions?.length) return { ...api, source: api.source ?? "coops" };
  return tidesDirect(station);
}
