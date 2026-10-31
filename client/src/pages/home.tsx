import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Moon, Sun, SlidersHorizontal, RefreshCw, Waves, Wind, Clock, Ship, Calculator, ArrowUpRight, ArrowDownRight, MoveRight } from "lucide-react";
import { SegmentCard, Field, STATUS_META } from "@/components/SegmentCard";
import { ChartsTab } from "@/components/ChartsTab";
import { ConditionsTab } from "@/components/ConditionsTab";
import { MethodTab } from "@/components/MethodTab";
import { VESSEL_PRESETS, SEGMENT_DEFAULTS, SETTINGS_DEFAULT, CB_RANGES, type VesselForm, type SegmentForm, type SettingsForm } from "@/lib/presets";
import {
  evaluate, liveSpectrum, manualSpectrum, interp, tideResidual, tideWindows, tideState, highestTide, ageMin, compass, fmtTime, fmtDayTime, M2FT,
  type BuoyData, type WindData, type TideData,
} from "@/lib/compute";
import { loadBuoy, loadWind, loadTides } from "@/lib/feeds-client";
import { queryClient } from "@/lib/queryClient";

function TrendIcon({ trend, className = "w-3.5 h-3.5" }: { trend?: "rising" | "falling" | "slack"; className?: string }) {
  if (trend === "rising") return <ArrowUpRight className={`${className} text-[hsl(var(--go))]`} />;
  if (trend === "falling") return <ArrowDownRight className={`${className} text-[hsl(var(--chart-1))]`} />;
  return <MoveRight className={`${className} text-muted-foreground`} />;
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8 shrink-0" aria-label="Port Everglades UKC">
      <rect width="32" height="32" rx="7" className="fill-[hsl(var(--chart-1)/0.15)]" />
      <path d="M6 12h20l-3 6.5H9z" className="fill-[hsl(var(--chart-1))]" />
      <path d="M4 23.5c3 0 3-2 6-2s3 2 6 2 3-2 6-2 3 2 6 2" className="stroke-[hsl(var(--chart-1))]" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M16 18.5v8" className="stroke-foreground/70" strokeWidth="1.5" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

export default function Home() {
  const [dark, setDark] = useState(true);
  const [vessel, setVessel] = useState<VesselForm>({ ...VESSEL_PRESETS[0] });
  const [segs, setSegs] = useState<SegmentForm[]>(SEGMENT_DEFAULTS.map((s) => ({ ...s })));
  const [st, setSt] = useState<SettingsForm>({ ...SETTINGS_DEFAULT });
  const [etaOffsetH, setEtaOffsetH] = useState(0);
  const [tideMode, setTideMode] = useState<"live" | "manual">("live");
  const [planMode, setPlanMode] = useState<"eta" | "hw">("eta");
  const [tideStation, setTideStation] = useState("8722951");
  const [manualTide, setManualTide] = useState(1.0);
  const [waveSrc, setWaveSrc] = useState<"live" | "manual">("live");
  const [manualWave, setManualWave] = useState({ hsFt: 4, tp: 9, dir: 90 });
  const [cbCalc, setCbCalc] = useState({ dispT: 60000 });

  const buoy = useQuery<BuoyData>({ queryKey: ["buoy"], queryFn: loadBuoy, refetchInterval: 5 * 60e3, retry: 1 });
  const wind = useQuery<WindData>({ queryKey: ["wind"], queryFn: loadWind, refetchInterval: 5 * 60e3, retry: 1 });
  const tides = useQuery<TideData>({ queryKey: ["tides", tideStation], queryFn: () => loadTides(tideStation), refetchInterval: 10 * 60e3, retry: 1 });

  const toggleDark = () => { setDark(!dark); document.documentElement.classList.toggle("dark", !dark); };

  const { residual } = tideResidual(tides.data);
  const offsetFt = st.applyResidual ? residual ?? 0 : 0;
  // Highest high water in the next 24 h (higher high water) — the planning basis when the HW toggle is on.
  const hw = useMemo(() => highestTide(tides.data, Date.now(), 24), [tides.data, tides.dataUpdatedAt]);
  const useHw = tideMode === "live" && planMode === "hw" && hw != null;
  const etaMs = useMemo(() => (useHw ? Date.parse(hw!.t) : Date.now() + etaOffsetH * 3600e3), [etaOffsetH, tides.dataUpdatedAt, useHw, hw]);
  const predAtEta = useHw ? hw!.v : tides.data ? interp(tides.data.predictions, etaMs) : null;
  const tideFt = tideMode === "manual" ? manualTide : (predAtEta ?? 0) + offsetFt;
  // State of tide right now and at the planning time (predicted; the weather offset shifts the height, not the trend).
  const stateNow = useMemo(() => tideState(tides.data, Date.now()), [tides.data, tides.dataUpdatedAt]);
  const stateEta = useMemo(() => tideState(tides.data, etaMs), [tides.data, etaMs]);
  const fmtDur = (min: number | null) => (min == null ? "—" : min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`);
  const liveSpec = useMemo(() => liveSpectrum(buoy.data), [buoy.data]);
  const spec = useMemo(() => (waveSrc === "live" ? liveSpec : manualSpectrum(manualWave.hsFt, manualWave.tp, manualWave.dir)), [waveSrc, liveSpec, manualWave]);
  const rows = useMemo(() => evaluate(vessel, segs, st, spec, tideFt), [vessel, segs, st, spec, tideFt]);

  const worst = rows.reduce((a, r) => (r.budget.netUkc < a.budget.netUkc ? r : a), rows[0]);
  const overall = rows.some((r) => r.status === "nogo") ? "nogo" : rows.some((r) => r.status === "caution") ? "caution" : "go";
  const requiredTide = rows.every((r) => r.minTideFt != null) ? Math.max(...rows.map((r) => r.minTideFt as number)) : null;
  const windows = useMemo(() => tideWindows(tides.data, requiredTide, st.applyResidual ? residual ?? 0 : 0, Date.now(), 30), [tides.data, requiredTide, residual, st.applyResidual]);
  const limitingSpeed = rows.map((r) => ({ name: r.sf.short, kn: r.maxSpeedKn, planned: r.sf.speedKn }));

  const buoyAge = ageMin(buoy.data?.std?.time);
  const stale = !!buoy.data?.std && buoyAge > 120;
  const hsFt = waveSrc === "live" ? (buoy.data?.std?.hs ?? null) : manualWave.hsFt / M2FT;

  const setSeg = (i: number) => (s: SegmentForm) => setSegs(segs.map((x, j) => (j === i ? s : x)));
  const applyPreset = (id: string) => { const p = VESSEL_PRESETS.find((x) => x.preset === id); if (p) setVessel({ ...p }); };
  const cbFromDisp = (vessel.lbpFt > 0 && vessel.beamFt > 0 && vessel.draftFt > 0)
    ? cbCalc.dispT / 1.025 / ((vessel.lbpFt / M2FT) * (vessel.beamFt / M2FT) * (vessel.draftFt / M2FT)) : NaN;

  const refresh = () => queryClient.invalidateQueries();

  const banner = {
    go: { title: "Within criteria at all three points", body: `Lowest net UKC ${(worst.budget.netUkc * M2FT).toFixed(1)} ft at ${worst.sf.short}, above the ${st.marginFt.toFixed(1)} ft margin.` },
    caution: { title: "Marginal — adjust speed or tide", body: `${worst.sf.short}: net UKC ${(worst.budget.netUkc * M2FT).toFixed(1)} ft is under the ${st.marginFt.toFixed(1)} ft margin${worst.maxSpeedKn ? `. Slow to ${worst.maxSpeedKn.toFixed(1)} kn or` : ". Consider"} wait for ${worst.minTideFt != null ? `≥ ${worst.minTideFt.toFixed(1)} ft tide` : "better conditions"}.` },
    nogo: { title: "Not within criteria — consider delay or cancel", body: `Keel contact predicted at ${worst.sf.short} (net ${(worst.budget.netUkc * M2FT).toFixed(1)} ft). ${requiredTide != null ? `Needs ≥ ${requiredTide.toFixed(1)} ft tide at the planned speeds.` : "No tide in range clears it at the planned speeds."}` },
  }[overall];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Logo />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Port Everglades UKC</div>
            <div className="text-[11px] text-muted-foreground leading-tight truncate">Squat · swell · tide — decision support</div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={refresh} aria-label="Refresh data" data-testid="button-refresh"><RefreshCw className={`w-4 h-4 ${buoy.isFetching || tides.isFetching ? "animate-spin" : ""}`} /></Button>
            <Sheet>
              <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Settings" data-testid="button-settings"><SlidersHorizontal className="w-4 h-4" /></Button></SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader><SheetTitle>Calculation settings</SheetTitle><SheetDescription>Policy choices that change the budget. Defaults are conservative.</SheetDescription></SheetHeader>
                <div className="mt-5 space-y-5">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Squat value used</Label>
                    <Select value={st.squatPolicy} onValueChange={(x) => setSt({ ...st, squatPolicy: x as SettingsForm["squatPolicy"] })}>
                      <SelectTrigger data-testid="select-squat-policy"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="max">Highest of 7 methods (conservative)</SelectItem>
                        <SelectItem value="mean">Mean of 7 methods</SelectItem>
                        <SelectItem value="usace">USACE study average (Eryuzlu, Huuska, Römisch)</SelectItem>
                        <SelectItem value="barrass3">Barrass III only</SelectItem>
                        <SelectItem value="barrass2">Barrass II only</SelectItem>
                        <SelectItem value="icorels">ICORELS only</SelectItem>
                        <SelectItem value="huuska">Huuska only</SelectItem>
                        <SelectItem value="eryuzlu">Eryuzlu only</SelectItem>
                        <SelectItem value="romisch">Römisch only</SelectItem>
                        <SelectItem value="yoshimura">Yoshimura only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Wave allowance</Label>
                    <Select value={st.waveMode} onValueChange={(x) => setSt({ ...st, waveMode: x as SettingsForm["waveMode"] })}>
                      <SelectTrigger data-testid="select-wave-mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buoy">Ship response to measured buoy spectrum</SelectItem>
                        <SelectItem value="rule">Rule of thumb (% of draft)</SelectItem>
                        <SelectItem value="greater">Greater of the two</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Wave statistic</Label>
                    <Select value={st.motionStat} onValueChange={(x) => setSt({ ...st, motionStat: x as SettingsForm["motionStat"] })}>
                      <SelectTrigger data-testid="select-motion-stat"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="max">Expected maximum during transit</SelectItem>
                        <SelectItem value="sig">Significant (2σ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Required net margin" suffix="ft" v={st.marginFt} step={0.5} onChange={(x) => setSt({ ...st, marginFt: x })} id="margin" />
                    <Field label="Rule wave allowance" suffix="%" v={st.rulePct} step={1} onChange={(x) => setSt({ ...st, rulePct: x })} id="rulepct" />
                    <Field label="Roll amplitude" suffix="°" v={st.rollDeg} step={0.5} onChange={(x) => setSt({ ...st, rollDeg: x })} id="roll" />
                    <Field label="Steady heel" suffix="°" v={st.heelDeg} step={0.5} onChange={(x) => setSt({ ...st, heelDeg: x })} id="heel" />
                    <Field label="Survey / bottom allowance" suffix="ft" v={st.extraFt} step={0.5} onChange={(x) => setSt({ ...st, extraFt: x })} id="extra" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div><Label className="text-sm">Apply observed tide offset</Label><p className="text-xs text-muted-foreground">Adds observed − predicted water level (weather setup) to the forecast.</p></div>
                    <Switch checked={st.applyResidual} onCheckedChange={(x) => setSt({ ...st, applyResidual: x })} data-testid="switch-residual" />
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => { setSt({ ...SETTINGS_DEFAULT }); setSegs(SEGMENT_DEFAULTS.map((s) => ({ ...s }))); }} data-testid="button-reset">Reset to defaults</Button>
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="Toggle theme" data-testid="button-theme">{dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-5">
        {/* Vessel — top */}
        <Card className="p-4" data-testid="card-vessel">
          <div className="grid lg:grid-cols-[1.4fr_2fr_auto] gap-4 items-start">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Ship className="w-4 h-4 text-[hsl(var(--chart-1))]" />Vessel</h2>
              <Select value={vessel.preset} onValueChange={applyPreset}>
                <SelectTrigger data-testid="select-vessel"><SelectValue /></SelectTrigger>
                <SelectContent>{VESSEL_PRESETS.map((p) => <SelectItem key={p.preset} value={p.preset}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{VESSEL_PRESETS.find((p) => p.preset === vessel.preset)?.note}. Verify against ship's particulars.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Deepest draft" suffix="ft" v={vessel.draftFt} step={0.1} onChange={(x) => setVessel({ ...vessel, draftFt: x })} id="draft" />
              <Field label="Block coeff. Cb" v={vessel.cb} step={0.01} onChange={(x) => setVessel({ ...vessel, cb: x })} id="cb" />
              <Field label="Length BP" suffix="ft" v={vessel.lbpFt} step={1} onChange={(x) => setVessel({ ...vessel, lbpFt: x })} id="lbp" />
              <Field label="Beam" suffix="ft" v={vessel.beamFt} step={0.1} onChange={(x) => setVessel({ ...vessel, beamFt: x })} id="beam" />
            </div>
            <div className="space-y-2 min-w-[11rem]">
              <Label className="text-xs">Direction</Label>
              <Select value={st.direction} onValueChange={(x) => setSt({ ...st, direction: x as SettingsForm["direction"] })}>
                <SelectTrigger className="h-9" data-testid="select-direction"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="inbound">Inbound (270°)</SelectItem><SelectItem value="outbound">Outbound (090°)</SelectItem></SelectContent>
              </Select>
              <details className="group text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" />Cb from displacement</summary>
                <div className="mt-2 space-y-2">
                  <Field label="Displacement at this draft" suffix="t" v={cbCalc.dispT} step={500} onChange={(x) => setCbCalc({ dispT: x })} id="disp" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground font-mono">Cb = <span className="text-foreground font-semibold">{isFinite(cbFromDisp) ? cbFromDisp.toFixed(3) : "—"}</span></span>
                    <Button size="sm" variant="outline" disabled={!isFinite(cbFromDisp) || cbFromDisp > 1 || cbFromDisp < 0.4} onClick={() => setVessel({ ...vessel, cb: +cbFromDisp.toFixed(3) })} data-testid="button-apply-cb">Use</Button>
                  </div>
                  <table className="w-full text-[11px] text-muted-foreground">
                    <tbody>{CB_RANGES.map((c) => <tr key={c.type}><td className="py-0.5">{c.type}</td><td className="text-right font-mono">{c.range}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            </div>
          </div>
        </Card>

        {/* Tide — state of tide and planning basis */}
        <Card className="p-4 space-y-3" data-testid="card-tide">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-[hsl(var(--chart-1))]" />Tide</h2>
            <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Manual</span><Switch checked={tideMode === "manual"} onCheckedChange={(x) => setTideMode(x ? "manual" : "live")} data-testid="switch-tide-manual" /></div>
          </div>
          {tideMode === "live" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono text-2xl font-semibold leading-none" data-testid="text-tide">
                {tideFt >= 0 ? "+" : ""}{tideFt.toFixed(1)} <span className="text-sm text-muted-foreground font-normal">ft MLLW</span>
                <span className="block sm:inline text-xs text-muted-foreground font-normal font-sans sm:ml-2 mt-1 sm:mt-0">{useHw ? `at high water ${fmtDayTime(etaMs)}` : `at ETA ${fmtTime(etaMs)}`} · predicted {predAtEta?.toFixed(2) ?? "—"} · offset {residual != null ? (residual >= 0 ? "+" : "") + residual.toFixed(2) : "—"} ft</span>
              </div>
              <div className="inline-flex rounded-md ring-1 ring-border overflow-hidden text-[11px] font-medium shrink-0" role="group" aria-label="Tide planning basis">
                <button onClick={() => setPlanMode("eta")} className={`px-3 py-1 ${planMode === "eta" ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`} data-testid="button-plan-eta">At ETA</button>
                <button onClick={() => setPlanMode("hw")} disabled={!hw} className={`px-3 py-1 disabled:opacity-40 ${planMode === "hw" ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`} data-testid="button-plan-hw">At high water</button>
              </div>
            </div>
          )}
          {tideMode === "live" ? (
            <div className="grid lg:grid-cols-2 gap-x-6 gap-y-2 items-start">
            <div className="space-y-2">
              <Select value={tideStation} onValueChange={setTideStation}>
                <SelectTrigger className="h-9" data-testid="select-tide-station"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(tides.data?.stations ?? [{ id: "8722951", name: "Port Everglades, Turning Basin", short: "Turning Basin", kind: "subordinate", observed: false }]).map((x) => (
                    <SelectItem key={x.id} value={x.id}>{x.name} · {x.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {tides.data?.curve === "interpolated-from-hilo" ? "NOAA publishes highs/lows only for this station; the curve between them is interpolated. " : tides.data?.curve === "noaa-6min" ? "NOAA 6-minute predictions. " : ""}
                Weather offset comes from the live gauge at South Port Everglades (8722956).
              </p>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">{useHw ? "Planning time (high water)" : "ETA at sea buoy"}</span><span className="font-mono" data-testid="text-eta">{useHw ? "HW" : etaOffsetH === 0 ? "Now" : `+${etaOffsetH.toFixed(2).replace(/\.?0+$/, "")} h`} · {fmtDayTime(etaMs)}</span></div>
              <Slider value={[useHw ? Math.max(0, Math.min(30, (etaMs - Date.now()) / 3600e3)) : etaOffsetH]} min={0} max={30} step={0.25} disabled={useHw} onValueChange={(x) => setEtaOffsetH(x[0])} data-testid="slider-eta" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(tides.data?.hilo ?? []).filter((h) => Date.parse(h.t) > Date.now() && Date.parse(h.t) < Date.now() + 30 * 3600e3).slice(0, 4).map((h) => (
                  <button key={h.t} onClick={() => { setPlanMode("eta"); setEtaOffsetH(Math.round(((Date.parse(h.t) - Date.now()) / 3600e3) * 4) / 4); }} className="text-[11px] font-mono px-2 py-1 rounded ring-1 ring-border hover:bg-muted" data-testid={`button-hilo-${h.t}`}>
                    {h.type === "H" ? "High" : "Low"} {fmtTime(h.t)} · {h.v.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {/* State of tide now */}
              <div className="rounded-md bg-muted/40 ring-1 ring-border/60 px-3 py-2 space-y-1" data-testid="tide-state">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>State of tide now · {fmtTime(Date.now())}</span>
                  <span className="shrink-0">{stateNow?.next ? `${stateNow.next.type === "H" ? "High" : "Low"} water in ${fmtDur(stateNow.minToNext)}` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendIcon trend={stateNow?.trend} className="w-5 h-5 shrink-0" />
                  <span className="text-base font-semibold">
                    {stateNow ? <><span className="capitalize">{stateNow.trend}</span> <span className="font-mono">· {(stateNow.heightFt + offsetFt) >= 0 ? "+" : ""}{(stateNow.heightFt + offsetFt).toFixed(1)} ft</span></> : tides.isLoading ? "loading…" : "unavailable"}
                  </span>
                </div>
                {stateNow && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {stateNow.trend !== "slack" ? `${Math.abs(stateNow.rateFtPerHr).toFixed(1)} ft/h` : "near slack"}
                    {stateNow.prev ? ` · ${stateNow.prev.type === "H" ? "high" : "low"} ${fmtTime(stateNow.prev.t)} (${stateNow.prev.v.toFixed(1)})` : ""}
                    {stateNow.next ? ` → ${stateNow.next.type === "H" ? "high" : "low"} ${fmtTime(stateNow.next.t)} (${stateNow.next.v.toFixed(1)})` : ""}
                  </div>
                )}
                {stateNow?.progress != null && (
                  <div className="h-1 rounded bg-border/70 overflow-hidden mt-1"><div className={`h-full ${stateNow.trend === "falling" ? "bg-[hsl(var(--chart-1))]" : "bg-[hsl(var(--go))]"}`} style={{ width: `${Math.round(Math.max(0, Math.min(1, stateNow.progress)) * 100)}%` }} /></div>
                )}
              </div>

              {/* Highest tide toggle */}
              <div className="flex items-center justify-between gap-3 rounded-md ring-1 ring-border/60 px-3 py-2" data-testid="row-highest-tide">
                <div className="min-w-0">
                  <Label className="text-sm">Calculate at highest tide</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {hw ? <>Higher high water, next 24 h: <span className="font-mono text-foreground">{fmtDayTime(hw.t)}</span> · <span className="font-mono text-foreground">{hw.v.toFixed(2)} ft</span> predicted{residual != null && st.applyResidual ? <> (<span className="font-mono">{(hw.v + offsetFt).toFixed(2)}</span> ft with offset)</> : null}</> : tides.isLoading ? "Loading high/low predictions…" : "No high water in the next 24 h of predictions."}
                  </p>
                </div>
                <Switch checked={planMode === "hw"} disabled={!hw} onCheckedChange={(x) => setPlanMode(x ? "hw" : "eta")} data-testid="switch-highest-tide" />
              </div>

            </div>
            </div>
          ) : (
            <Field label="Tide height above MLLW" suffix="ft" v={manualTide} step={0.1} onChange={setManualTide} id="tide-manual" />
          )}
        </Card>

        {/* Segment summary */}
        <section className={`rounded-lg border ${STATUS_META[overall].cls}`} data-testid="summary-segments">
          <div className="px-4 pt-4 pb-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4" data-testid="banner-decision">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-3 h-3 rounded-full shrink-0 ${STATUS_META[overall].dot}`} />
              <div className="min-w-0">
                <h1 className={`text-lg md:text-xl font-semibold ${STATUS_META[overall].text}`} data-testid="text-decision">{banner.title}</h1>
                <p className="text-sm text-muted-foreground">{banner.body}</p>
              </div>
            </div>
            {tideMode === "live" && requiredTide != null && (
              <div className="md:ml-auto text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 md:justify-end" data-testid="text-windows">
                <span className="font-medium text-foreground">Tide windows, next 30 h:</span>
                {windows.length === 0 ? <span>none — needs {requiredTide.toFixed(1)} ft</span> :
                  windows.slice(0, 3).map((w) => <span key={w.start} className="font-mono">{fmtDayTime(w.start)}–{fmtTime(w.end)}</span>)}
              </div>
            )}
          </div>
          <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60 border-t border-border/60">
            {rows.map((r) => {
              const m = STATUS_META[r.status];
              const net = r.budget.netUkc * M2FT;
              const typeLabel = r.sf.type === "open" ? "Open water" : r.sf.type === "trench" ? "Dredged trench" : "Confined channel";
              return (
                <div key={r.sf.id} className="px-4 py-3 flex items-center gap-4" data-testid={`summary-${r.sf.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{typeLabel}</div>
                    <div className="text-sm font-semibold truncate">{r.sf.short}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.sf.speedKn.toFixed(0)} kn · max <span className="font-mono">{r.maxSpeedKn == null ? "none" : r.maxSpeedKn >= 15.9 ? ">16" : r.maxSpeedKn.toFixed(1)}</span> kn · tide ≥ <span className="font-mono">{r.minTideFt == null ? ">6" : r.minTideFt <= -2.9 ? "any" : r.minTideFt.toFixed(1)}</span> ft</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-mono text-3xl leading-none font-semibold tabular-nums ${m.text}`}>{net < 0 ? "−" : ""}{Math.abs(net).toFixed(1)}<span className="text-sm text-muted-foreground font-normal ml-1">ft</span></div>
                    <div className={`text-[11px] mt-1 inline-flex items-center gap-1 ${m.text}`}><span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Live conditions strip */}
        <section className="grid grid-cols-2 lg:grid-cols-3 gap-3" data-testid="strip-conditions">
          <Card className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Waves className="w-3.5 h-3.5" />Waves · 41122</span>{waveSrc === "live" && <span className={stale ? "text-[hsl(var(--caution))]" : ""}>{buoy.data?.std ? `${Math.round(buoyAge)} min ago${buoy.data.source === "cdip" ? " · CDIP" : ""}` : buoy.isLoading ? "loading" : buoy.isError ? "feed error" : "no data"}</span>}</div>
            <div className="font-mono text-xl font-semibold mt-1" data-testid="text-hs">{hsFt == null ? "—" : (hsFt * M2FT).toFixed(1)} <span className="text-sm text-muted-foreground font-normal">ft Hs</span></div>
            <div className="text-xs text-muted-foreground mt-0.5">{waveSrc === "live" ? `Tp ${buoy.data?.std?.dpd ?? "—"} s · from ${compass(buoy.data?.std?.mwd)} · swell ${buoy.data?.parts?.swellH != null ? (buoy.data.parts.swellH * M2FT).toFixed(1) : "—"} ft @ ${buoy.data?.parts?.swellT ?? "—"} s` : `Manual · Tp ${manualWave.tp} s from ${manualWave.dir}°`}</div>
          </Card>
          <Card className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5" />Wind · PEGF1</span><span>{wind.data?.time ? `${Math.round(ageMin(wind.data.time))} min ago` : wind.isLoading ? "loading" : wind.isError ? "feed error" : "no data"}</span></div>
            <div className="font-mono text-xl font-semibold mt-1" data-testid="text-wind">{wind.data?.wspd != null ? (wind.data.wspd * 1.94384).toFixed(0) : "—"} <span className="text-sm text-muted-foreground font-normal">kn</span></div>
            <div className="text-xs text-muted-foreground mt-0.5">from {compass(wind.data?.wdir)} ({wind.data?.wdir ?? "—"}°) · gust {wind.data?.gst != null ? (wind.data.gst * 1.94384).toFixed(0) : "—"} kn</div>
          </Card>
          <Card className="p-3.5 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Ship className="w-3.5 h-3.5" />Vessel</span><span>{st.direction}</span></div>
            <div className="font-mono text-xl font-semibold mt-1">{vessel.draftFt.toFixed(1)} <span className="text-sm text-muted-foreground font-normal">ft draft</span></div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{vessel.lbpFt.toFixed(0)} × {vessel.beamFt.toFixed(1)} ft · Cb {vessel.cb.toFixed(2)}</div>
          </Card>
        </section>
        {waveSrc === "live" && stale && <p className="text-xs text-[hsl(var(--caution))]" data-testid="text-stale">Buoy report is more than 2 hours old — check the buoy or enter waves manually.</p>}
        {waveSrc === "live" && buoy.isError && <p className="text-xs text-[hsl(var(--caution))]" data-testid="text-buoy-error">Wave buoy feed could not be reached (NDBC/CDIP). Refresh, or enter waves manually — the wave allowance is zero until then.</p>}
        {tideMode === "live" && tides.isError && <p className="text-xs text-[hsl(var(--caution))]" data-testid="text-tide-error">NOAA tide predictions could not be reached. Refresh, or switch the tide to manual — tide is treated as 0.0 ft until then.</p>}

        <Tabs defaultValue="transit">
          <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex" data-testid="tabs-main">
            <TabsTrigger value="transit" data-testid="tab-transit">Transit</TabsTrigger>
            <TabsTrigger value="charts" data-testid="tab-charts"><span className="sm:hidden">Charts</span><span className="hidden sm:inline">Speed & tide</span></TabsTrigger>
            <TabsTrigger value="conditions" data-testid="tab-conditions"><span className="sm:hidden">Sea</span><span className="hidden sm:inline">Conditions</span></TabsTrigger>
            <TabsTrigger value="method" data-testid="tab-method">Method</TabsTrigger>
          </TabsList>

          <TabsContent value="transit" className="mt-4">
            <div className="flex flex-col gap-5">
              {/* Inputs */}
              <div className="grid gap-4 items-start order-2 lg:order-1">
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2"><Waves className="w-4 h-4 text-[hsl(var(--chart-1))]" />Waves</h2>
                    <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Manual</span><Switch checked={waveSrc === "manual"} onCheckedChange={(x) => setWaveSrc(x ? "manual" : "live")} data-testid="switch-wave-manual" /></div>
                  </div>
                  {waveSrc === "live" ? (
                    <p className="text-xs text-muted-foreground">Using the full measured directional spectrum from Hollywood Beach buoy 41122 ({liveSpec.length} frequency bands{buoy.data?.spectrum?.time ? `, ${fmtTime(buoy.data.spectrum.time)}` : ""}). Buoy sits ~5.5 nm south of the sea buoy in 15.6 m — treat as representative, not exact.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Hs" suffix="ft" v={manualWave.hsFt} step={0.5} onChange={(x) => setManualWave({ ...manualWave, hsFt: x })} id="hs-manual" />
                      <Field label="Period" suffix="s" v={manualWave.tp} step={0.5} onChange={(x) => setManualWave({ ...manualWave, tp: x })} id="tp-manual" />
                      <Field label="From" suffix="°" v={manualWave.dir} step={5} onChange={(x) => setManualWave({ ...manualWave, dir: x })} id="dir-manual" />
                    </div>
                  )}
                </Card>
              </div>

              {/* Segment results */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 items-start order-1 lg:order-2">
                {rows.map((r, i) => <SegmentCard key={r.sf.id} r={r} draftFt={vessel.draftFt} tideFt={tideFt} marginFt={st.marginFt} onChange={setSeg(i)} />)}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="charts" className="mt-4">
            <ChartsTab vessel={vessel} segs={segs} st={st} spec={spec} tideFt={tideFt} tides={tides.data} residual={st.applyResidual ? residual ?? 0 : 0} etaMs={etaMs} requiredTide={requiredTide} rows={rows} />
          </TabsContent>
          <TabsContent value="conditions" className="mt-4">
            <ConditionsTab buoy={buoy.data} wind={wind.data} tides={tides.data} residual={residual} />
          </TabsContent>
          <TabsContent value="method" className="mt-4">
            <MethodTab />
          </TabsContent>
        </Tabs>

        <footer className="pt-4 pb-8 text-[11px] text-muted-foreground border-t border-border">
          Decision support only — not a certified dynamic UKC system. Pilot judgment, PEPA rules and the latest USACE hydrographic survey govern. Prototype by NAVARC Technologies.
        </footer>
      </main>
    </div>
  );
}
