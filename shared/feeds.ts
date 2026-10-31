// Data feeds: NDBC buoy 41122, PEGF1 wind, CO-OPS tides. Framework-agnostic so it runs in Express and Netlify Functions.

const NDBC = "https://www.ndbc.noaa.gov/data/realtime2";
const COOPS = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const UA = { "User-Agent": "PortEvergladesUKC/1.0 (pilot decision-support prototype)" };

const cache = new Map<string, { t: number; v: unknown }>();
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v as T;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

async function getText(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

const num = (s: string | undefined) => (s === undefined || s === "MM" || s === "" ? null : Number(s));
const isoOf = (p: string[]) => `${p[0]}-${p[1]}-${p[2]}T${p[3]}:${p[4]}:00Z`;
const COMPASS: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

function rows(txt: string) {
  return txt.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.trim().split(/\s+/));
}

// "spec_1 (freq_1) spec_2 (freq_2)" style files
function parsePairs(line: string[]) {
  const vals: { v: number; f: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    const m = line[i + 1]?.match(/^\(([\d.]+)\)$/);
    if (m) { vals.push({ v: Number(line[i]), f: Number(m[1]) }); i++; }
  }
  return vals;
}

export async function buoy41122() {
  const [std, spec, dspec, dir1, r1, adcp] = await Promise.allSettled([
    getText(`${NDBC}/41122.txt`),
    getText(`${NDBC}/41122.spec`),
    getText(`${NDBC}/41122.data_spec`),
    getText(`${NDBC}/41122.swdir`),
    getText(`${NDBC}/41122.swr1`),
    getText(`${NDBC}/41122.adcp`),
  ]);
  const out: any = { station: "41122", name: "Hollywood Beach, FL (CDIP 265)", lat: 26.001, lon: -80.096, depthM: 15.6, errors: [] as string[] };

  if (std.status === "fulfilled") {
    const r = rows(std.value);
    const latest = r.find((p) => num(p[8]) !== null) ?? r[0];
    out.std = { time: isoOf(latest), hs: num(latest[8]), dpd: num(latest[9]), apd: num(latest[10]), mwd: num(latest[11]), wtmp: num(latest[14]) };
    out.history = r.slice(0, 96).filter((p) => num(p[8]) !== null).map((p) => ({ time: isoOf(p), hs: num(p[8]), dpd: num(p[9]), mwd: num(p[11]) })).reverse();
  } else out.errors.push("standard met");

  if (spec.status === "fulfilled") {
    const p = rows(spec.value)[0];
    if (p) out.parts = {
      time: isoOf(p), hs: num(p[5]), swellH: num(p[6]), swellT: num(p[7]), windH: num(p[8]), windT: num(p[9]),
      swellDir: COMPASS[p[10]] ?? null, windDir: COMPASS[p[11]] ?? null, swellDirTxt: p[10], windDirTxt: p[11], steepness: p[12], apd: num(p[13]), mwd: num(p[14]),
    };
  } else out.errors.push("wave summary");

  if (dspec.status === "fulfilled" && dir1.status === "fulfilled") {
    const sRows = rows(dspec.value);
    const dRows = rows(dir1.value);
    const rRows = r1.status === "fulfilled" ? rows(r1.value) : [];
    const s = sRows[0];
    if (s) {
      const key = s.slice(0, 5).join(" ");
      const d = dRows.find((x) => x.slice(0, 5).join(" ") === key);
      const rr = rRows.find((x) => x.slice(0, 5).join(" ") === key);
      const sp = parsePairs(s.slice(6));
      const dp = d ? parsePairs(d.slice(5)) : [];
      const rp = rr ? parsePairs(rr.slice(5)) : [];
      const bins = sp.map((b, i) => {
        const prev = sp[i - 1]?.f, next = sp[i + 1]?.f;
        const df = prev !== undefined && next !== undefined ? (next - prev) / 2 : next !== undefined ? next - b.f : b.f - (prev ?? b.f - 0.005);
        return { f: b.f, df, S: b.v, dir: dp[i]?.v ?? null, r1: rp[i]?.v ?? null };
      });
      out.spectrum = { time: isoOf(s), bins };
    }
  } else out.errors.push("directional spectrum");

  if (adcp.status === "fulfilled") {
    const p = rows(adcp.value)[0];
    if (p) out.current = { time: isoOf(p), depthM: num(p[5]), dir: num(p[6]), speedCms: num(p[7]) };
  }
  return out;
}

export async function pegf1() {
  const r = rows(await getText(`${NDBC}/PEGF1.txt`));
  const p = r.find((x) => num(x[6]) !== null) ?? r[0];
  return { station: "PEGF1", name: "Port Everglades, FL (NOS 8722956)", time: isoOf(p), wdir: num(p[5]), wspd: num(p[6]), gst: num(p[7]), pres: num(p[12]) };
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export interface TideStation { id: string; name: string; short: string; kind: "reference" | "subordinate"; observed: boolean; lat: number; lon: number }

/** NOAA CO-OPS tide stations around the Port Everglades entrance. Only 8722956 has a live gauge. */
export const TIDE_STATIONS: TideStation[] = [
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

/** Cosine interpolation between successive highs and lows (standard for subordinate stations), 6-minute steps. */
function curveFromHilo(hilo: { t: string; v: number }[], stepMin = 6) {
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

export async function tides(stationId: string = DEFAULT_TIDE_STATION) {
  const stn = TIDE_STATIONS.find((s) => s.id === stationId) ?? TIDE_STATIONS[0];
  const now = new Date();
  const begin = new Date(now.getTime() - 30 * 3600e3);
  const end = new Date(now.getTime() + 48 * 3600e3);
  const base = (id: string) => `station=${id}&datum=MLLW&units=english&time_zone=gmt&format=json&application=PortEvergladesUKC`;
  const window = `begin_date=${ymd(begin)}&end_date=${ymd(end)}`;
  const toIso = (t: string) => t.replace(" ", "T") + ":00Z";
  const out: any = { station: stn.id, name: stn.name, kind: stn.kind, datum: "MLLW", units: "ft", stations: TIDE_STATIONS, observedStation: OBSERVED_STATION, errors: [] as string[] };

  const [hilo, pred, obs, obsPred] = await Promise.allSettled([
    getText(`${COOPS}?${base(stn.id)}&product=predictions&interval=hilo&${window}`),
    stn.kind === "reference" ? getText(`${COOPS}?${base(stn.id)}&product=predictions&interval=6&${window}`) : Promise.reject(new Error("subordinate")),
    getText(`${COOPS}?${base(OBSERVED_STATION)}&product=water_level&range=6`),
    getText(`${COOPS}?${base(OBSERVED_STATION)}&product=predictions&interval=6&${window}`),
  ]);
  if (hilo.status === "fulfilled") {
    const j = JSON.parse(hilo.value);
    out.hilo = (j.predictions ?? []).map((x: any) => ({ t: toIso(x.t), v: Number(x.v), type: x.type }));
  } else out.errors.push("hilo");
  if (pred.status === "fulfilled") {
    const j = JSON.parse(pred.value);
    out.predictions = (j.predictions ?? []).map((x: any) => ({ t: toIso(x.t), v: Number(x.v) }));
    out.curve = "noaa-6min";
  } else if (out.hilo?.length) {
    out.predictions = curveFromHilo(out.hilo);
    out.curve = "interpolated-from-hilo";
  } else out.errors.push("predictions");
  // Observed water level and the matching prediction at the live gauge → residual (weather setup) applicable port-wide.
  if (obs.status === "fulfilled") {
    const j = JSON.parse(obs.value);
    out.observed = (j.data ?? []).filter((x: any) => x.v !== "").map((x: any) => ({ t: toIso(x.t), v: Number(x.v) }));
  } else out.errors.push("observed");
  if (obsPred.status === "fulfilled") {
    const j = JSON.parse(obsPred.value);
    out.observedPredictions = (j.predictions ?? []).map((x: any) => ({ t: toIso(x.t), v: Number(x.v) }));
  }
  return out;
}

export async function handleApi(pathname: string, query: URLSearchParams = new URLSearchParams()): Promise<{ status: number; body: unknown }> {
  const route = pathname.replace(/^.*\/api\//, "").replace(/\/$/, "");
  try {
    if (route === "health") return { status: 200, body: { ok: true, time: new Date().toISOString() } };
    if (route === "buoy") return { status: 200, body: await cached("buoy", 5 * 60e3, buoy41122) };
    if (route === "wind") return { status: 200, body: await cached("wind", 5 * 60e3, pegf1) };
    if (route === "tides") {
      const id = (query.get("station") ?? DEFAULT_TIDE_STATION).replace(/\D/g, "").slice(0, 7);
      if (!TIDE_STATIONS.some((s) => s.id === id)) return { status: 400, body: { error: "unknown station", stations: TIDE_STATIONS } };
      return { status: 200, body: await cached(`tides:${id}`, 10 * 60e3, () => tides(id)) };
    }
    return { status: 404, body: { error: `unknown route ${route}` } };
  } catch (e: any) {
    return { status: 422, body: { error: String(e?.message ?? e) } };
  }
}
