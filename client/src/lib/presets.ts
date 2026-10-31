import type { ChannelType } from "@shared/ukc";

// Vessel inputs are in feet (UI units). Dimensions are typical class values — verify against the ship's particulars.
export interface VesselForm {
  preset: string;
  name: string;
  lbpFt: number;
  beamFt: number;
  draftFt: number;
  cb: number;
}

export const VESSEL_PRESETS: (VesselForm & { note: string })[] = [
  { preset: "panamax-tanker", name: "Panamax product tanker", lbpFt: 718.5, beamFt: 105.6, draftFt: 42, cb: 0.82, note: "LBP 219 m, B 32.2 m — typical LR1 / Panamax tanker" },
  { preset: "aframax", name: "Aframax tanker", lbpFt: 784, beamFt: 138, draftFt: 42, cb: 0.83, note: "LBP ~239 m, B ~42 m — typical class values" },
  { preset: "post-panamax-container", name: "Post-Panamax container (Susan Maersk class)", lbpFt: 1083, beamFt: 140.4, draftFt: 42, cb: 0.65, note: "USACE design vessel: 1,138 ft LOA, 140.4 ft beam; LBP and Cb estimated" },
  { preset: "neopanamax-container", name: "Neo-Panamax container (~10,000 TEU)", lbpFt: 1093, beamFt: 158, draftFt: 42, cb: 0.66, note: "LBP ~333 m, B ~48 m — typical class values" },
  { preset: "cruise", name: "Large cruise ship (Oasis class)", lbpFt: 1090, beamFt: 154, draftFt: 30.2, cb: 0.68, note: "LOA 1,188 ft, B 154 ft (waterline), draft ~9.2 m; Cb estimated" },
  { preset: "bulk", name: "Panamax bulk carrier", lbpFt: 722, beamFt: 105.8, draftFt: 40, cb: 0.85, note: "LBP ~220 m, B 32.25 m — typical class values" },
  { preset: "custom", name: "Custom vessel", lbpFt: 700, beamFt: 105, draftFt: 38, cb: 0.75, note: "Enter the ship's particulars" },
];

// Fallback Cb ranges by vessel type (from the NAVARC Cb guide). Preliminary assumptions only.
export const CB_RANGES = [
  { type: "Container ship", range: "0.60–0.75" },
  { type: "Cruise ship", range: "0.60–0.75" },
  { type: "General cargo", range: "0.65–0.80" },
  { type: "Bulk carrier", range: "0.80–0.88" },
  { type: "Oil tanker", range: "0.80–0.85" },
  { type: "Box-shaped barge", range: "0.90–0.98" },
];

export interface SegmentForm {
  id: string;
  name: string;
  short: string;
  chartDepthFt: number; // MLLW, shallowest depth in the segment — clearance
  avgDepthFt: number; // MLLW, average depth over the area — squat
  type: ChannelType;
  widthFt?: number;
  overbankFt?: number; // MLLW depth outside the dredged cut (trench channels)
  speedKn: number;
  headingDeg: number; // inbound course, true
  exposure: number; // 0..1 wave exposure
  lengthFt: number;
  staticRulePct: number; // minimum static UKC as % of draft
  description: string;
}

export const SEGMENT_DEFAULTS: SegmentForm[] = [
  {
    id: "shoal",
    name: "Sea buoy shoal",
    short: "Sea buoy",
    chartDepthFt: 45.7,
    avgDepthFt: 48,
    type: "open",
    speedKn: 12,
    headingDeg: 270,
    exposure: 1,
    lengthFt: 3000,
    staticRulePct: 10,
    description: "45.7 ft spot just north of the sea buoy on the channel line; surrounding water assumed ~48 ft. Open water, full swell exposure.",
  },
  {
    id: "oec",
    name: "Buoys 2 & 3 — outer entrance channel",
    short: "Buoys 2 & 3",
    chartDepthFt: 45,
    avgDepthFt: 46,
    type: "trench",
    widthFt: 500,
    overbankFt: 10,
    speedKn: 10,
    headingDeg: 270,
    exposure: 1,
    lengthFt: 5100,
    staticRulePct: 10,
    description: "Outer entrance channel, 500 ft wide, −45 ft MLLW project depth (average assumed 46 ft with overdepth). USACE treated it as a trench with ~10 ft outside the cut.",
  },
  {
    id: "jetties",
    name: "Inside jetties & ICW",
    short: "Jetties / ICW",
    chartDepthFt: 45,
    avgDepthFt: 46,
    type: "canal",
    widthFt: 450,
    speedKn: 8,
    headingDeg: 270,
    exposure: 0.5,
    lengthFt: 2300,
    staticRulePct: 10,
    description: "Inner entrance channel between the jetties to the ICW crossing, 450 ft wide. Authorized −42 ft; port notice gives 45.0 ft — enter the latest survey. Half wave exposure (assumption).",
  },
];

export interface SettingsForm {
  squatPolicy: "max" | "mean" | "usace" | "barrass3" | "barrass2" | "icorels" | "huuska" | "eryuzlu" | "romisch" | "yoshimura";
  waveMode: "buoy" | "rule" | "greater";
  rulePct: number; // %
  motionStat: "max" | "sig";
  marginFt: number;
  rollDeg: number;
  heelDeg: number;
  extraFt: number;
  applyResidual: boolean;
  direction: "inbound" | "outbound";
}

export const SETTINGS_DEFAULT: SettingsForm = {
  squatPolicy: "max",
  waveMode: "buoy",
  rulePct: 10,
  motionStat: "max",
  marginFt: 3,
  rollDeg: 1,
  heelDeg: 0,
  extraFt: 0,
  applyResidual: true,
  direction: "inbound",
};
