import {
  FT, KN, ukcBudget, maxSpeedFor, minTideFor, jonswapBins,
  type Vessel, type SegmentInput, type Settings, type SpecBin,
} from "@shared/ukc";
import type { VesselForm, SegmentForm, SettingsForm } from "./presets";

export interface BuoyData {
  station: string; name: string; lat: number; lon: number; depthM: number; errors: string[];
  std?: { time: string; hs: number | null; dpd: number | null; apd: number | null; mwd: number | null; wtmp: number | null };
  history?: { time: string; hs: number | null; dpd: number | null; mwd: number | null }[];
  parts?: { time: string; hs: number | null; swellH: number | null; swellT: number | null; windH: number | null; windT: number | null; swellDir: number | null; windDir: number | null; swellDirTxt?: string; windDirTxt?: string; steepness?: string; apd?: number | null; mwd?: number | null };
  spectrum?: { time: string; bins: { f: number; df: number; S: number; dir: number | null; r1: number | null }[] };
  current?: { time: string; depthM: number | null; dir: number | null; speedCms: number | null };
}
export interface WindData { station: string; name: string; time: string; wdir: number | null; wspd: number | null; gst: number | null; pres: number | null }
export interface TideData { station: string; name: string; datum: string; units: string; errors: string[]; predictions: { t: string; v: number }[]; hilo: { t: string; v: number; type: string }[]; observed: { t: string; v: number }[] }

export const M2FT = 1 / FT;
export const fmtFt = (m: number | null | undefined, d = 1) => (m == null || !isFinite(m) ? "—" : (m * M2FT).toFixed(d));

export function toVessel(v: VesselForm): Vessel {
  return { lpp: v.lbpFt * FT, beam: v.beamFt * FT, draft: v.draftFt * FT, cb: v.cb };
}

export function toSegment(s: SegmentForm, tideFt: number, st: SettingsForm): SegmentInput {
  const heading = st.direction === "inbound" ? s.headingDeg : (s.headingDeg + 180) % 360;
  return {
    chartDepth: s.chartDepthFt * FT,
    tide: tideFt * FT,
    type: s.type,
    width: s.widthFt ? s.widthFt * FT : undefined,
    trenchHeight: s.type === "trench" ? Math.max(0, s.chartDepthFt - (s.overbankFt ?? 10)) * FT : undefined,
    speed: s.speedKn * KN,
    heading,
    exposure: s.exposure,
    lengthM: s.lengthFt * FT,
    rollDeg: st.rollDeg,
    heelDeg: st.heelDeg,
    extraAllowance: st.extraFt * FT,
  };
}

export function toSettings(st: SettingsForm): Settings {
  return { squatPolicy: st.squatPolicy, waveMode: st.waveMode, rulePct: st.rulePct / 100, motionStat: st.motionStat };
}

export function liveSpectrum(b?: BuoyData): SpecBin[] {
  const bins = b?.spectrum?.bins ?? [];
  const mwd = b?.std?.mwd ?? b?.parts?.mwd ?? 90;
  return bins
    .filter((x) => x.S > 0 && x.f > 0)
    .map((x) => ({ f: x.f, df: x.df, S: x.S, dir: x.dir ?? mwd, r1: x.r1 ?? 0.7 }));
}

export function manualSpectrum(hsFt: number, tp: number, dir: number): SpecBin[] {
  return jonswapBins(hsFt * FT, tp, dir);
}

// ---------- tide helpers (ft MLLW) ----------
export function interp(series: { t: string; v: number }[], t: number): number | null {
  if (!series.length) return null;
  let lo = 0, hi = series.length - 1;
  const tt = (i: number) => Date.parse(series[i].t);
  if (t <= tt(0)) return series[0].v;
  if (t >= tt(hi)) return series[hi].v;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tt(mid) <= t) lo = mid; else hi = mid;
  }
  const a = tt(lo), b = tt(hi);
  return series[lo].v + ((series[hi].v - series[lo].v) * (t - a)) / (b - a);
}

/** Observed − predicted, averaged over the last 30 min of observations. */
export function tideResidual(td?: TideData): { residual: number | null; lastObs?: { t: string; v: number } } {
  if (!td?.observed?.length || !td.predictions?.length) return { residual: null };
  const obs = td.observed.slice(-6);
  const diffs = obs.map((o) => {
    const p = interp(td.predictions, Date.parse(o.t));
    return p == null ? null : o.v - p;
  }).filter((x): x is number => x != null);
  if (!diffs.length) return { residual: null };
  return { residual: diffs.reduce((a, b) => a + b, 0) / diffs.length, lastObs: td.observed[td.observed.length - 1] };
}

export type Status = "go" | "caution" | "nogo";

export function evaluate(vf: VesselForm, segs: SegmentForm[], st: SettingsForm, spec: SpecBin[], tideFt: number) {
  const v = toVessel(vf);
  const s = toSettings(st);
  const margin = st.marginFt * FT;
  return segs.map((sf) => {
    const seg = toSegment(sf, tideFt, st);
    const b = ukcBudget(v, seg, spec, s);
    const maxV = maxSpeedFor(v, seg, spec, s, margin);
    const minTide = minTideFor(v, seg, spec, s, margin);
    const staticMin = (sf.staticRulePct / 100) * v.draft;
    const staticOk = b.staticUkc >= staticMin;
    const status: Status = b.netUkc < 0 ? "nogo" : b.netUkc < margin || !staticOk ? "caution" : "go";
    const warnings: string[] = [];
    if (b.hT < 1.1) warnings.push(`Depth/draft ${b.hT.toFixed(2)} is below 1.10 — outside most squat formula ranges and below the PIANC minimum for still water.`);
    else if (b.hT < 1.3 && b.motionDetail && b.motionDetail.hsInput > 0.3) warnings.push(`Depth/draft ${b.hT.toFixed(2)}: PIANC guidance suggests ≥ 1.3 with waves up to 1 m Hs, ≥ 1.5 above that.`);
    if (b.squat.Fnh > 0.6) warnings.push(`Depth Froude number ${b.squat.Fnh.toFixed(2)} > 0.6 — squat rises steeply; formulas lose reliability.`);
    if (!staticOk) warnings.push(`Static UKC ${fmtFt(b.staticUkc)} ft is below the ${sf.staticRulePct}% of draft rule (${fmtFt(staticMin)} ft).`);
    const outOfRange = b.squat.results.filter((r) => r.applicable && !r.inRange).map((r) => r.id);
    return { sf, seg, budget: b, maxSpeedKn: maxV == null ? null : maxV / KN, minTideFt: minTide == null ? null : minTide * M2FT, staticMinFt: staticMin * M2FT, staticOk, status, warnings, outOfRange };
  });
}

export function speedCurve(vf: VesselForm, segs: SegmentForm[], st: SettingsForm, spec: SpecBin[], tideFt: number) {
  const v = toVessel(vf);
  const s = toSettings(st);
  const rows: Record<string, number>[] = [];
  for (let kn = 4; kn <= 14.001; kn += 0.5) {
    const row: Record<string, number> = { kn };
    segs.forEach((sf) => {
      const seg = { ...toSegment(sf, tideFt, st), speed: kn * KN };
      row[sf.id] = +(ukcBudget(v, seg, spec, s).netUkc * M2FT).toFixed(2);
    });
    rows.push(row);
  }
  return rows;
}

/** Tide windows over the prediction horizon where predicted (+ residual) tide ≥ required. */
export function tideWindows(td: TideData | undefined, requiredFt: number | null, residual: number, fromMs: number, hours = 30) {
  if (!td?.predictions?.length || requiredFt == null) return [];
  const out: { start: number; end: number }[] = [];
  let cur: { start: number; end: number } | null = null;
  for (let t = fromMs; t <= fromMs + hours * 3600e3; t += 6 * 60e3) {
    const p = interp(td.predictions, t);
    if (p == null) continue;
    const ok = p + residual >= requiredFt;
    if (ok && !cur) cur = { start: t, end: t };
    else if (ok && cur) cur.end = t;
    else if (!ok && cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

export const ageMin = (iso?: string) => (iso ? (Date.now() - Date.parse(iso)) / 60e3 : Infinity);
export const compass = (d: number | null | undefined) => {
  if (d == null) return "—";
  const n = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return n[Math.round(((d % 360) / 22.5)) % 16];
};
export const fmtTime = (ms: number | string) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
export const fmtDayTime = (ms: number | string) =>
  new Date(ms).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
