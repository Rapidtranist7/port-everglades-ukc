// Squat + dynamic under-keel clearance engine.
// All internal math in SI (m, m/s, rad). UI converts to/from ft and knots.
// Educational decision-support model. Not a certified DUKC system.

export const G = 9.81;
export const FT = 0.3048;
export const KN = 0.514444;

export type ChannelType = "open" | "trench" | "canal";

export interface Vessel {
  lpp: number; // m, length between perpendiculars
  beam: number; // m
  draft: number; // m, deepest static draft (controlling)
  cb: number; // block coefficient
  cwp?: number; // waterplane coefficient (estimated if missing)
}

export interface Waterway {
  depth: number; // m, total water depth (chart + tide)
  type: ChannelType;
  width?: number; // m, channel bottom width (trench/canal)
  trenchHeight?: number; // m, height of dredged cut above overbank (trench)
  bankSlope?: number; // n (horizontal:vertical), 0 = vertical sides
}

export type MethodId =
  | "barrass2"
  | "barrass3"
  | "icorels"
  | "huuska"
  | "eryuzlu"
  | "romisch"
  | "yoshimura";

export interface MethodInfo {
  id: MethodId;
  name: string;
  short: string;
  ref: string;
}

export const METHODS: MethodInfo[] = [
  { id: "barrass3", name: "Barrass III (K·Cb·V²/100)", short: "Barrass III", ref: "Barrass 2004; Munsch 2014 slides" },
  { id: "barrass2", name: "Barrass II (blockage)", short: "Barrass II", ref: "Barrass 1979/1981" },
  { id: "icorels", name: "ICORELS", short: "ICORELS", ref: "PIANC 1980/1997" },
  { id: "huuska", name: "Huuska / Guliev", short: "Huuska", ref: "Huuska 1976" },
  { id: "eryuzlu", name: "Eryuzlu et al.", short: "Eryuzlu", ref: "Eryuzlu et al. 1994" },
  { id: "romisch", name: "Römisch", short: "Römisch", ref: "Römisch 1989" },
  { id: "yoshimura", name: "Yoshimura / Ohtsu", short: "Yoshimura", ref: "Yoshimura 1986; MLIT 2007" },
];

export interface SquatResult {
  id: MethodId;
  value: number; // m, maximum (bow or stern) squat
  bow?: number;
  stern?: number;
  inRange: boolean;
  notes: string[];
  applicable: boolean;
}

export function estCwp(cb: number) {
  // Common preliminary-design approximation (Schneekluth & Bertram): Cwp ≈ (1 + 2Cb)/3
  return (1 + 2 * cb) / 3;
}

function shipArea(v: Vessel) {
  return 0.98 * v.beam * v.draft; // midship section, 0.98 bilge-radius factor (PIANC/ERDC)
}

function canalArea(w: Waterway) {
  const W = w.width ?? 152.4;
  const n = w.bankSlope ?? 0;
  return W * w.depth + n * w.depth * w.depth;
}

/** squat for a fully open (unrestricted shallow) or fully canal/confined case */
function squatCase(id: MethodId, v: Vessel, h: number, V: number, mode: "open" | "canal", w: Waterway): SquatResult {
  const { lpp: L, beam: B, draft: T, cb: Cb } = v;
  const cwp = v.cwp ?? estCwp(Cb);
  const Vk = V / KN;
  const Fnh = V / Math.sqrt(G * h);
  const vol = Cb * L * B * T;
  const As = shipArea(v);
  const hT = h / T;
  const notes: string[] = [];
  let inRange = true;
  let value = 0;
  let bow: number | undefined;
  let stern: number | undefined;
  let applicable = true;

  const Acanal = canalArea({ ...w, depth: h });
  const Wcanal = w.width ?? 152.4;

  switch (id) {
    case "barrass2": {
      const Weff = (7.7 + 45 * (1 - cwp) ** 2) * B;
      const Ac = mode === "open" ? Weff * h : Acanal;
      const S = As / Ac;
      const S2 = S / (1 - S); // velocity return factor
      value = (Cb / 30) * Math.pow(S2, 2 / 3) * Math.pow(Vk, 2.08);
      if (hT < 1.1 || hT > 1.5) { inRange = false; notes.push("h/T outside 1.1–1.5"); }
      if (Cb < 0.5 || Cb > 0.9) { inRange = false; notes.push("Cb outside 0.5–0.9"); }
      break;
    }
    case "barrass3": {
      const FB = (7.04 / Math.pow(Cb, 0.85)) * B;
      const Ac = mode === "open" ? FB * h : Acanal;
      const S = As / Ac;
      let K = 5.74 * Math.pow(S, 0.76);
      K = Math.min(2, Math.max(1, K));
      value = (K * Cb * Vk * Vk) / 100;
      if (hT < 1.1 || hT > 1.4) { inRange = false; notes.push("h/T outside 1.1–1.4"); }
      if (Cb < 0.5 || Cb > 0.85) { inRange = false; notes.push("Cb outside 0.5–0.85"); }
      break;
    }
    case "icorels": {
      if (mode === "canal") { applicable = false; notes.push("Open-water formula only"); }
      value = (2.4 * vol) / (L * L) * (Fnh * Fnh) / Math.sqrt(1 - Fnh * Fnh);
      if (Cb < 0.6 || Cb > 0.8) { inRange = false; notes.push("Cb outside 0.6–0.8"); }
      if (hT < 1.1 || hT > 2.0) { inRange = false; notes.push("h/T outside 1.1–2.0"); }
      break;
    }
    case "huuska": {
      let Ks = 1;
      if (mode === "canal") {
        const S = As / Acanal;
        const s1 = S; // K1 = 1 for h_T/h = 1 (canal)
        Ks = s1 > 0.03 ? 7.45 * s1 + 0.76 : 1;
      }
      value = (2.4 * vol) / (L * L) * (Fnh * Fnh) / Math.sqrt(1 - Fnh * Fnh) * Ks;
      if (Cb < 0.6 || Cb > 0.8) { inRange = false; notes.push("Cb outside 0.6–0.8"); }
      if (hT < 1.1 || hT > 2.0) { inRange = false; notes.push("h/T outside 1.1–2.0"); }
      break;
    }
    case "eryuzlu": {
      const Weff = (7.7 + 45 * (1 - cwp) ** 2) * B;
      const W = mode === "open" ? Weff : Wcanal;
      const Kb = W / B < 9.61 ? 3.1 / Math.sqrt(W / B) : 1;
      value = 0.298 * (h * h / T) * Math.pow(V / Math.sqrt(G * T), 2.289) * Math.pow(hT, -2.972) * Kb;
      if (Cb < 0.8) { inRange = false; notes.push("Derived for Cb ≥ 0.8"); }
      if (hT < 1.1 || hT > 2.5) { inRange = false; notes.push("h/T outside 1.1–2.5"); }
      break;
    }
    case "romisch": {
      let Vcr: number;
      if (mode === "open") {
        const KU = 0.58 * Math.pow(hT * (L / B), 0.125);
        Vcr = Math.sqrt(G * h) * KU;
      } else {
        const S = As / Acanal;
        const Wtop = Wcanal + 2 * (w.bankSlope ?? 0) * h;
        const hm = Acanal / Wtop;
        const KC = Math.pow(2 * Math.sin(Math.asin(1 - S) / 3), 1.5);
        Vcr = Math.sqrt(G * hm) * KC;
      }
      const r = V / Vcr;
      const CV = 8 * r * r * (Math.pow(r - 0.5, 4) + 0.0625);
      const CF = Math.pow((10 * Cb * B) / L, 2);
      const KdT = 0.155 * Math.sqrt(hT);
      bow = CV * CF * KdT * T;
      stern = CV * KdT * T;
      value = Math.max(bow, stern);
      if (r >= 1) { inRange = false; notes.push("At/above Römisch critical speed"); }
      if (hT < 1.19 || hT > 2.25) { inRange = false; notes.push("h/T outside 1.19–2.25"); }
      break;
    }
    case "yoshimura": {
      let Ve = V;
      if (mode === "canal") { const S = As / Acanal; Ve = V / (1 - S); }
      const c = (Cb * B) / L;
      value = ((0.7 + 1.5 / hT) * c + (15 / hT) * c * c * c) * (Ve * Ve) / G;
      if (Cb < 0.55 || Cb > 0.8) { inRange = false; notes.push("Cb outside 0.55–0.8"); }
      if (hT < 1.2) { inRange = false; notes.push("h/T below 1.2"); }
      break;
    }
  }
  if (Fnh >= 0.7) { inRange = false; notes.push(`Depth Froude ${Fnh.toFixed(2)} ≥ 0.7`); }
  if (!isFinite(value) || value < 0) { value = NaN; applicable = false; }
  return { id, value, bow, stern, inRange, notes, applicable };
}

export function squat(id: MethodId, v: Vessel, w: Waterway, V: number): SquatResult {
  const h = w.depth;
  if (w.type === "open") return squatCase(id, v, h, V, "open", w);
  if (w.type === "canal") return squatCase(id, v, h, V, "canal", w);
  // Trench: USACE EM 1110-2-1613 first approximation — weight open-water and
  // canal-type squat by the trench height ratio hT/h.
  const ratio = Math.min(1, Math.max(0, (w.trenchHeight ?? 0) / h));
  const o = squatCase(id, v, h, V, "open", w);
  const c = squatCase(id, v, h, V, "canal", w);
  if (id === "icorels") {
    return { ...o, applicable: ratio < 0.05, notes: [...o.notes, "Open-water formula; shown for reference"] };
  }
  const mix = (a?: number, b?: number) => (a === undefined || b === undefined ? undefined : a + ratio * (b - a));
  return {
    id,
    value: o.value + ratio * (c.value - o.value),
    bow: mix(o.bow, c.bow),
    stern: mix(o.stern, c.stern),
    inRange: o.inRange && c.inRange,
    notes: Array.from(new Set([...o.notes, ...c.notes])),
    applicable: o.applicable && c.applicable,
  };
}

export type SquatPolicy = "max" | "mean" | "usace" | MethodId;

export function squatEnsemble(v: Vessel, w: Waterway, V: number, policy: SquatPolicy) {
  const results = METHODS.map((m) => squat(m.id, v, w, V));
  const usable = results.filter((r) => r.applicable && isFinite(r.value));
  let controlling = 0;
  let label = "";
  if (policy === "max") {
    controlling = Math.max(...usable.map((r) => r.value));
    label = "Highest of all methods";
  } else if (policy === "mean") {
    controlling = usable.reduce((a, r) => a + r.value, 0) / usable.length;
    label = "Mean of all methods";
  } else if (policy === "usace") {
    const set = usable.filter((r) => ["eryuzlu", "huuska", "romisch"].includes(r.id));
    controlling = set.reduce((a, r) => a + r.value, 0) / Math.max(1, set.length);
    label = "USACE Port Everglades average (Eryuzlu, Huuska, Römisch)";
  } else {
    const r = results.find((x) => x.id === policy);
    controlling = r && isFinite(r.value) ? r.value : NaN;
    label = METHODS.find((m) => m.id === policy)?.name ?? policy;
  }
  const Fnh = V / Math.sqrt(G * w.depth);
  return { results, controlling, label, Fnh };
}

// ---------------- Wave-induced vertical motion ----------------
// Jensen, Mansour & Olsen (2004) closed-form heave/pitch transfer functions
// (homogeneously loaded box with breadth Cb·B). Deep-water dispersion.

export function jensenRAO(omega: number, betaRad: number, U: number, v: Vessel) {
  const L = v.lpp;
  const T = v.draft;
  const Bb = v.cb * v.beam;
  const cosb = Math.cos(betaRad);
  const k = (omega * omega) / G;
  let alpha = 1 - (U * omega * cosb) / G; // Doppler term (beta = 180° head sea)
  if (Math.abs(alpha) < 0.05) alpha = 0.05 * Math.sign(alpha || 1);
  const a = Math.abs(alpha);
  const A = 2 * Math.sin((k * Bb * a * a) / 2) * Math.exp(-k * T * a * a);
  const ke = Math.abs(k * cosb);
  const kappa = Math.exp(-ke * T);
  const f = Math.sqrt((1 - k * T) ** 2 + (A * A / (k * Bb * a * a * a)) ** 2);
  const x = (ke * L) / 2;
  let F: number, Gp: number;
  if (x < 1e-3) {
    F = kappa * f;
    Gp = kappa * f * (2 * x) / L; // → k·cosβ·κf for long waves
  } else {
    F = (kappa * f * Math.sin(x)) / x;
    Gp = kappa * f * (Math.sin(x) / (x * x) - Math.cos(x) / x) * (6 / L);
  }
  const eta = 1 / Math.sqrt((1 - 2 * k * T * a * a) ** 2 + (A * A / (k * Bb * a * a)) ** 2);
  const heave = Math.abs(F * eta); // m per m wave amplitude
  const pitch = Math.abs(Gp * eta); // rad per m wave amplitude
  const omegaE = Math.abs(alpha * omega);
  return { heave, pitch, omegaE };
}

export interface SpecBin {
  f: number; // Hz
  df: number; // Hz
  S: number; // m^2/Hz
  dir: number; // deg true, direction waves come FROM
  r1?: number; // first directional moment (0..1)
}

export interface MotionResult {
  sigmaEnd: number; // m, std dev of vertical motion at bow/stern (x = L/2)
  sigmaHeave: number; // m
  sigmaPitchDeg: number;
  tzE: number; // s, mean encounter zero-crossing period of end motion
  encounters: number;
  sigFactor: number; // expected-max multiplier sqrt(2 ln N)
  endMax: number; // m, expected max downward excursion at bow/stern over transit
  heaveMax: number; // m
  endSig: number; // m, significant single amplitude (2σ)
  hsInput: number; // m, Hs implied by the spectrum used
}

/** Wrapped-normal directional spreading from r1 (Kuik et al. 1988: σθ = sqrt(2(1−r1))). */
function spreadWeights(r1: number | undefined) {
  const sig = Math.min(1.2, Math.max(0.12, Math.sqrt(2 * (1 - (r1 ?? 0.85)))));
  const out: { d: number; w: number }[] = [];
  let sum = 0;
  for (let d = -90; d <= 90; d += 7.5) {
    const r = (d * Math.PI) / 180;
    const w = Math.exp(-(r * r) / (2 * sig * sig));
    out.push({ d, w });
    sum += w;
  }
  return out.map((o) => ({ d: o.d, w: o.w / sum }));
}

export function waveMotion(v: Vessel, U: number, headingDeg: number, spec: SpecBin[], transitSec: number): MotionResult {
  let m0End = 0, m2End = 0, m0H = 0, m0P = 0, m0in = 0;
  const xEnd = v.lpp / 2;
  for (const b of spec) {
    if (b.S <= 0 || b.f <= 0) continue;
    const omega = 2 * Math.PI * b.f;
    const E = b.S * b.df; // m^2 (variance in this bin)
    m0in += E;
    for (const s of spreadWeights(b.r1)) {
      const rel = ((b.dir + s.d - headingDeg) * Math.PI) / 180; // wave-from direction relative to bow
      const beta = Math.PI - rel; // Jensen convention: β = 180° head sea
      const r = jensenRAO(omega, beta, U, v);
      const vert2 = r.heave * r.heave + (xEnd * r.pitch) ** 2;
      const e = E * s.w;
      m0End += vert2 * e;
      m2End += vert2 * e * r.omegaE * r.omegaE;
      m0H += r.heave * r.heave * e;
      m0P += r.pitch * r.pitch * e;
    }
  }
  const sigmaEnd = Math.sqrt(m0End);
  const tzE = m2End > 0 ? 2 * Math.PI * Math.sqrt(m0End / m2End) : 10;
  const encounters = Math.max(2, transitSec / Math.max(1, tzE));
  const sigFactor = Math.sqrt(2 * Math.log(encounters));
  return {
    sigmaEnd,
    sigmaHeave: Math.sqrt(m0H),
    sigmaPitchDeg: (Math.sqrt(m0P) * 180) / Math.PI,
    tzE,
    encounters,
    sigFactor,
    endMax: sigmaEnd * sigFactor,
    heaveMax: Math.sqrt(m0H) * sigFactor,
    endSig: 2 * sigmaEnd,
    hsInput: 4 * Math.sqrt(m0in),
  };
}

/** JONSWAP spectrum on standard NDBC-like frequency grid for manual entry. */
export function jonswapBins(hs: number, tp: number, dirFrom: number, gamma = 3.3, r1 = 0.85): SpecBin[] {
  if (!(hs > 0) || !(tp > 0)) return [];
  const fp = 1 / tp;
  const bins: SpecBin[] = [];
  const raw: number[] = [];
  const fs: number[] = [];
  for (let f = 0.03; f <= 0.4; f += 0.005) fs.push(f);
  for (const f of fs) {
    const sig = f <= fp ? 0.07 : 0.09;
    const r = Math.exp(-((f - fp) ** 2) / (2 * sig * sig * fp * fp));
    raw.push(Math.pow(f, -5) * Math.exp(-1.25 * Math.pow(fp / f, 4)) * Math.pow(gamma, r));
  }
  const m0 = raw.reduce((a, s) => a + s * 0.005, 0);
  const scale = (hs * hs) / 16 / m0;
  fs.forEach((f, i) => bins.push({ f, df: 0.005, S: raw[i] * scale, dir: dirFrom, r1 }));
  return bins;
}

// ---------------- UKC budget ----------------

export interface SegmentInput {
  chartDepth: number; // m (MLLW)
  tide: number; // m above MLLW
  type: ChannelType;
  width?: number;
  trenchHeight?: number;
  speed: number; // m/s through water
  heading: number; // deg true
  exposure: number; // 0..1 wave exposure factor
  lengthM: number; // segment length for encounter count
  rollDeg: number; // expected roll single amplitude
  heelDeg: number; // steady heel (turn / wind)
  extraAllowance: number; // m, survey / bottom uncertainty
}

export interface Settings {
  squatPolicy: SquatPolicy;
  waveMode: "buoy" | "rule" | "greater";
  rulePct: number; // e.g. 0.10 of draft
  motionStat: "max" | "sig";
}

export function ukcBudget(v: Vessel, seg: SegmentInput, spec: SpecBin[], st: Settings) {
  const depth = seg.chartDepth + seg.tide;
  const w: Waterway = { depth, type: seg.type, width: seg.width, trenchHeight: seg.trenchHeight };
  const sq = squatEnsemble(v, w, seg.speed, st.squatPolicy);
  const transit = seg.lengthM / Math.max(0.5, seg.speed) + v.lpp / Math.max(0.5, seg.speed);
  const mo = spec.length ? waveMotion(v, seg.speed, seg.heading, spec, transit) : null;
  const buoyEnd = mo ? (st.motionStat === "max" ? mo.endMax : mo.endSig) : 0;
  const buoyHeave = mo ? (st.motionStat === "max" ? mo.heaveMax : 2 * mo.sigmaHeave) : 0;
  const ruleWave = st.rulePct * v.draft;
  const bilge = (v.beam / 2) * Math.sin((Math.abs(seg.rollDeg) + Math.abs(seg.heelDeg)) * Math.PI / 180);

  let endWave: number;
  let midWave: number;
  if (st.waveMode === "rule") { endWave = ruleWave; midWave = ruleWave; }
  else if (st.waveMode === "greater") { endWave = Math.max(ruleWave, buoyEnd); midWave = Math.max(ruleWave, buoyHeave); }
  else { endWave = buoyEnd; midWave = buoyHeave; }
  endWave *= seg.exposure;
  midWave *= seg.exposure;

  // Lowest hull point: bow/stern (squat + heave/pitch) vs bilge (squat + heave + roll/heel)
  const endCase = endWave;
  const bilgeCase = midWave + bilge;
  const motion = Math.max(endCase, bilgeCase);
  const controllingPoint = bilgeCase > endCase ? "bilge" : (v.cb >= 0.7 ? "bow" : "stern");

  const staticUkc = depth - v.draft;
  const netUkc = staticUkc - sq.controlling - motion - seg.extraAllowance;
  return {
    depth,
    staticUkc,
    squat: sq,
    motion,
    endWave,
    midWave,
    bilge,
    motionDetail: mo,
    ruleWave,
    buoyEnd,
    controllingPoint,
    netUkc,
    hT: depth / v.draft,
    transit,
  };
}

/** Max speed (m/s) keeping net UKC ≥ margin. Returns null if even 3 kn fails. */
export function maxSpeedFor(v: Vessel, seg: SegmentInput, spec: SpecBin[], st: Settings, margin: number) {
  const f = (V: number) => ukcBudget(v, { ...seg, speed: V }, spec, st).netUkc - margin;
  let lo = 3 * KN, hi = 16 * KN;
  if (f(lo) < 0) return null;
  if (f(hi) >= 0) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) lo = mid; else hi = mid;
  }
  return lo;
}

/** Minimum tide (m above MLLW) needed at the planned speed to keep net UKC ≥ margin. */
export function minTideFor(v: Vessel, seg: SegmentInput, spec: SpecBin[], st: Settings, margin: number) {
  const f = (tide: number) => ukcBudget(v, { ...seg, tide }, spec, st).netUkc - margin;
  let lo = -3, hi = 6;
  if (f(hi) < 0) return null;
  if (f(lo) >= 0) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid; else lo = mid;
  }
  return hi;
}
