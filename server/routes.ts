import type { Express } from "express";
import type { Server } from "node:http";

const NDBC = "https://www.ndbc.noaa.gov/data/realtime2";
const COOPS = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const UA = { "User-Agent": "PortEvergladesUKC/1.0 (pilot decision-support prototype)" };

const cache = new Map<string, { t: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
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

async function buoy41122() {
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

async function pegf1() {
  const r = rows(await getText(`${NDBC}/PEGF1.txt`));
  const p = r.find((x) => num(x[6]) !== null) ?? r[0];
  return { station: "PEGF1", name: "Port Everglades, FL (NOS 8722956)", time: isoOf(p), wdir: num(p[5]), wspd: num(p[6]), gst: num(p[7]), pres: num(p[12]) };
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function tides() {
  const now = new Date();
  const begin = new Date(now.getTime() - 12 * 3600e3);
  const end = new Date(now.getTime() + 36 * 3600e3);
  const base = `station=8722956&datum=MLLW&units=english&time_zone=gmt&format=json&application=PortEvergladesUKC`;
  const [pred, hilo, obs] = await Promise.allSettled([
    getText(`${COOPS}?${base}&product=predictions&interval=6&begin_date=${ymd(begin)}&end_date=${ymd(end)}`),
    getText(`${COOPS}?${base}&product=predictions&interval=hilo&begin_date=${ymd(begin)}&end_date=${ymd(end)}`),
    getText(`${COOPS}?${base}&product=water_level&range=6`),
  ]);
  const toIso = (t: string) => t.replace(" ", "T") + ":00Z";
  const out: any = { station: "8722956", name: "South Port Everglades (NOAA CO-OPS)", datum: "MLLW", units: "ft", errors: [] as string[] };
  if (pred.status === "fulfilled") {
    const j = JSON.parse(pred.value);
    out.predictions = (j.predictions ?? []).map((x: any) => ({ t: toIso(x.t), v: Number(x.v) }));
  } else out.errors.push("predictions");
  if (hilo.status === "fulfilled") {
    const j = JSON.parse(hilo.value);
    out.hilo = (j.predictions ?? []).map((x: any) => ({ t: toIso(x.t), v: Number(x.v), type: x.type }));
  }
  if (obs.status === "fulfilled") {
    const j = JSON.parse(obs.value);
    const data = (j.data ?? []).filter((x: any) => x.v !== "");
    out.observed = data.map((x: any) => ({ t: toIso(x.t), v: Number(x.v) }));
  } else out.errors.push("observed");
  return out;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const wrap = (fn: () => Promise<unknown>) => async (_req: any, res: any) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json(await fn());
    } catch (e: any) {
      res.status(422).json({ error: String(e?.message ?? e) });
    }
  };
  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.get("/api/buoy", wrap(() => cached("buoy", 5 * 60e3, buoy41122)));
  app.get("/api/wind", wrap(() => cached("wind", 5 * 60e3, pegf1)));
  app.get("/api/tides", wrap(() => cached("tides", 10 * 60e3, tides)));
  return httpServer;
}
