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
import { Moon, Sun, SlidersHorizontal, RefreshCw, Waves, Wind, Clock, Ship, Calculator } from "lucide-react";
import { SegmentCard, Field, STATUS_META } from "@/components/SegmentCard";
import { ChartsTab } from "@/components/ChartsTab";
import { ConditionsTab } from "@/components/ConditionsTab";
import { MethodTab } from "@/components/MethodTab";
import { VESSEL_PRESETS, SEGMENT_DEFAULTS, SETTINGS_DEFAULT, CB_RANGES, type VesselForm, type SegmentForm, type SettingsForm } from "@/lib/presets";
import {
  evaluate, liveSpectrum, manualSpectrum, interp, tideResidual, tideWindows, ageMin, compass, fmtTime, fmtDayTime, M2FT,
  type BuoyData, type WindData, type TideData,
} from "@/lib/compute";
import { queryClient } from "@/lib/queryClient";

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
  const [manualTide, setManualTide] = useState(1.0);
  const [waveSrc, setWaveSrc] = useState<"live" | "manual">("live");
  const [manualWave, setManualWave] = useState({ hsFt: 4, tp: 9, dir: 90 });
  const [cbCalc, setCbCalc] = useState({ dispT: 60000 });

  const buoy = useQuery<BuoyData>({ queryKey: ["/api/buoy"], refetchInterval: 5 * 60e3 });
  const wind = useQuery<WindData>({ queryKey: ["/api/wind"], refetchInterval: 5 * 60e3 });
  const tides = useQuery<TideData>({ queryKey: ["/api/tides"], refetchInterval: 10 * 60e3 });

  const toggleDark = () => { setDark(!dark); document.documentElement.classList.toggle("dark", !dark); };

  const etaMs = useMemo(() => Date.now() + etaOffsetH * 3600e3, [etaOffsetH, tides.dataUpdatedAt]);
  const { residual } = tideResidual(tides.data);
  const predAtEta = tides.data ? interp(tides.data.predictions, etaMs) : null;
  const tideFt = tideMode === "manual" ? manualTide : (predAtEta ?? 0) + (st.applyResidual ? residual ?? 0 : 0);
  const liveSpec = useMemo(() => liveSpectrum(buoy.data), [buoy.data]);
  const spec = useMemo(() => (waveSrc === "live" ? liveSpec : manualSpectrum(manualWave.hsFt, manualWave.tp, manualWave.dir)), [waveSrc, liveSpec, manualWave]);
  const rows = useMemo(() => evaluate(vessel, segs, st, spec, tideFt), [vessel, segs, st, spec, tideFt]);

  const worst = rows.reduce((a, r) => (r.budget.netUkc < a.budget.netUkc ? r : a), rows[0]);
  const overall = rows.some((r) => r.status === "nogo") ? "nogo" : rows.some((r) => r.status === "caution") ? "caution" : "go";
  const requiredTide = rows.every((r) => r.minTideFt != null) ? Math.max(...rows.map((r) => r.minTideFt as number)) : null;
  const windows = useMemo(() => tideWindows(tides.data, requiredTide, st.applyResidual ? residual ?? 0 : 0, Date.now(), 30), [tides.data, requiredTide, residual, st.applyResidual]);
  const limitingSpeed = rows.map((r) => ({ name: r.sf.short, kn: r.maxSpeedKn, planned: r.sf.speedKn }));

  const buoyAge = ageMin(buoy.data?.std?.time);
  const stale = buoyAge > 120;
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
        {/* Decision banner */}
        <section className={`rounded-lg border p-4 md:p-5 ${STATUS_META[overall].cls}`} data-testid="banner-decision">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-3 h-3 rounded-full shrink-0 ${STATUS_META[overall].dot}`} />
              <div className="min-w-0">
                <h1 className={`text-lg md:text-xl font-semibold ${STATUS_META[overall].text}`} data-testid="text-decision">{banner.title}</h1>
                <p className="text-sm text-muted-foreground">{banner.body}</p>
              </div>
            </div>
            <div className="md:ml-auto grid grid-cols-3 gap-4 text-xs shrink-0">
              {limitingSpeed.map((l) => (
                <div key={l.name}><div className="text-muted-foreground">{l.name} max</div><div className="font-mono text-sm font-semibold">{l.kn == null ? "none" : l.kn >= 15.9 ? ">16 kn" : `${l.kn.toFixed(1)} kn`}</div></div>
              ))}
            </div>
          </div>
          {tideMode === "live" && requiredTide != null && (
            <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1" data-testid="text-windows">
              <span className="font-medium text-foreground">Tide windows (next 30 h, current waves held):</span>
              {windows.length === 0 ? <span>none — required {requiredTide.toFixed(1)} ft not reached</span> :
                windows.slice(0, 4).map((w) => <span key={w.start} className="font-mono">{fmtDayTime(w.start)}–{fmtTime(w.end)}</span>)}
            </div>
          )}
        </section>

        {/* Live conditions strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="strip-conditions">
          <Card className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Waves className="w-3.5 h-3.5" />Waves · 41122</span>{waveSrc === "live" && <span className={stale ? "text-[hsl(var(--caution))]" : ""}>{buoy.data?.std ? `${Math.round(buoyAge)} min ago` : buoy.isLoading ? "loading" : "no data"}</span>}</div>
            <div className="font-mono text-xl font-semibold mt-1" data-testid="text-hs">{hsFt == null ? "—" : (hsFt * M2FT).toFixed(1)} <span className="text-sm text-muted-foreground font-normal">ft Hs</span></div>
            <div className="text-xs text-muted-foreground mt-0.5">{waveSrc === "live" ? `Tp ${buoy.data?.std?.dpd ?? "—"} s · from ${compass(buoy.data?.std?.mwd)} · swell ${buoy.data?.parts?.swellH != null ? (buoy.data.parts.swellH * M2FT).toFixed(1) : "—"} ft @ ${buoy.data?.parts?.swellT ?? "—"} s` : `Manual · Tp ${manualWave.tp} s from ${manualWave.dir}°`}</div>
          </Card>
          <Card className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5" />Wind · PEGF1</span><span>{wind.data?.time ? `${Math.round(ageMin(wind.data.time))} min ago` : ""}</span></div>
            <div className="font-mono text-xl font-semibold mt-1" data-testid="text-wind">{wind.data?.wspd != null ? (wind.data.wspd * 1.94384).toFixed(0) : "—"} <span className="text-sm text-muted-foreground font-normal">kn</span></div>
            <div className="text-xs text-muted-foreground mt-0.5">from {compass(wind.data?.wdir)} ({wind.data?.wdir ?? "—"}°) · gust {wind.data?.gst != null ? (wind.data.gst * 1.94384).toFixed(0) : "—"} kn</div>
          </Card>
          <Card className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Tide at ETA · 8722956</span><span>{tideMode === "live" ? fmtTime(etaMs) : "manual"}</span></div>
            <div className="font-mono text-xl font-semibold mt-1" data-testid="text-tide">{tideFt >= 0 ? "+" : ""}{tideFt.toFixed(1)} <span className="text-sm text-muted-foreground font-normal">ft MLLW</span></div>
            <div className="text-xs text-muted-foreground mt-0.5">{tideMode === "live" ? `predicted ${predAtEta?.toFixed(2) ?? "—"} · offset ${residual != null ? (residual >= 0 ? "+" : "") + residual.toFixed(2) : "—"} ft` : "entered by pilot"}</div>
          </Card>
          <Card className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Ship className="w-3.5 h-3.5" />Vessel</span><span>{st.direction}</span></div>
            <div className="font-mono text-xl font-semibold mt-1">{vessel.draftFt.toFixed(1)} <span className="text-sm text-muted-foreground font-normal">ft draft</span></div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{vessel.lbpFt.toFixed(0)} × {vessel.beamFt.toFixed(1)} ft · Cb {vessel.cb.toFixed(2)}</div>
          </Card>
        </section>
        {waveSrc === "live" && stale && <p className="text-xs text-[hsl(var(--caution))]" data-testid="text-stale">Buoy report is more than 2 hours old — check the buoy or enter waves manually.</p>}

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
              <div className="grid md:grid-cols-3 gap-4 items-start order-2 lg:order-1">
                <Card className="p-4 space-y-3">
                  <h2 className="text-sm font-semibold flex items-center gap-2"><Ship className="w-4 h-4 text-[hsl(var(--chart-1))]" />Vessel</h2>
                  <Select value={vessel.preset} onValueChange={applyPreset}>
                    <SelectTrigger data-testid="select-vessel"><SelectValue /></SelectTrigger>
                    <SelectContent>{VESSEL_PRESETS.map((p) => <SelectItem key={p.preset} value={p.preset}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">{VESSEL_PRESETS.find((p) => p.preset === vessel.preset)?.note} Verify against ship's particulars.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Deepest draft" suffix="ft" v={vessel.draftFt} step={0.1} onChange={(x) => setVessel({ ...vessel, draftFt: x })} id="draft" />
                    <Field label="Block coeff. Cb" v={vessel.cb} step={0.01} onChange={(x) => setVessel({ ...vessel, cb: x })} id="cb" />
                    <Field label="Length BP" suffix="ft" v={vessel.lbpFt} step={1} onChange={(x) => setVessel({ ...vessel, lbpFt: x })} id="lbp" />
                    <Field label="Beam" suffix="ft" v={vessel.beamFt} step={0.1} onChange={(x) => setVessel({ ...vessel, beamFt: x })} id="beam" />
                  </div>
                  <details className="group text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" />Cb from displacement</summary>
                    <div className="mt-2 space-y-2">
                      <Field label="Displacement at this draft" suffix="t" v={cbCalc.dispT} step={500} onChange={(x) => setCbCalc({ dispT: x })} id="disp" />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-mono">Δ / (1.025·L·B·T) = <span className="text-foreground font-semibold">{isFinite(cbFromDisp) ? cbFromDisp.toFixed(3) : "—"}</span></span>
                        <Button size="sm" variant="outline" disabled={!isFinite(cbFromDisp) || cbFromDisp > 1 || cbFromDisp < 0.4} onClick={() => setVessel({ ...vessel, cb: +cbFromDisp.toFixed(3) })} data-testid="button-apply-cb">Use</Button>
                      </div>
                      <table className="w-full text-[11px] text-muted-foreground">
                        <tbody>{CB_RANGES.map((c) => <tr key={c.type}><td className="py-0.5">{c.type}</td><td className="text-right font-mono">{c.range}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </details>
                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs">Direction</Label>
                    <Select value={st.direction} onValueChange={(x) => setSt({ ...st, direction: x as SettingsForm["direction"] })}>
                      <SelectTrigger className="w-36 h-8" data-testid="select-direction"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="inbound">Inbound (270°)</SelectItem><SelectItem value="outbound">Outbound (090°)</SelectItem></SelectContent>
                    </Select>
                  </div>
                </Card>

                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-[hsl(var(--chart-1))]" />Tide</h2>
                    <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Manual</span><Switch checked={tideMode === "manual"} onCheckedChange={(x) => setTideMode(x ? "manual" : "live")} data-testid="switch-tide-manual" /></div>
                  </div>
                  {tideMode === "live" ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">ETA at sea buoy</span><span className="font-mono" data-testid="text-eta">{etaOffsetH === 0 ? "Now" : `+${etaOffsetH.toFixed(2).replace(/\.?0+$/, "")} h`} · {fmtDayTime(etaMs)}</span></div>
                      <Slider value={[etaOffsetH]} min={0} max={30} step={0.25} onValueChange={(x) => setEtaOffsetH(x[0])} data-testid="slider-eta" />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(tides.data?.hilo ?? []).filter((h) => Date.parse(h.t) > Date.now() && Date.parse(h.t) < Date.now() + 30 * 3600e3).slice(0, 4).map((h) => (
                          <button key={h.t} onClick={() => setEtaOffsetH(Math.round(((Date.parse(h.t) - Date.now()) / 3600e3) * 4) / 4)} className="text-[11px] font-mono px-2 py-1 rounded ring-1 ring-border hover:bg-muted" data-testid={`button-hilo-${h.t}`}>
                            {h.type === "H" ? "High" : "Low"} {fmtTime(h.t)} · {h.v.toFixed(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Field label="Tide height above MLLW" suffix="ft" v={manualTide} step={0.1} onChange={setManualTide} id="tide-manual" />
                  )}
                </Card>

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
