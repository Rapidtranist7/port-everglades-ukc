import { useEffect, useState } from "react";
import { METHODS } from "@shared/ukc";
import { fmtFt, M2FT, type Status } from "@/lib/compute";
import type { SegmentForm } from "@/lib/presets";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ChevronDown, ChevronUp, AlertTriangle, Settings2 } from "lucide-react";

type Row = ReturnType<typeof import("@/lib/compute").evaluate>[number];

export const STATUS_META: Record<Status, { label: string; cls: string; dot: string; text: string }> = {
  go: { label: "Meets margin", cls: "border-[hsl(var(--go)/0.45)] bg-[hsl(var(--go)/0.10)]", dot: "bg-[hsl(var(--go))]", text: "text-[hsl(var(--go))]" },
  caution: { label: "Below margin", cls: "border-[hsl(var(--caution)/0.5)] bg-[hsl(var(--caution)/0.10)]", dot: "bg-[hsl(var(--caution))]", text: "text-[hsl(var(--caution))]" },
  nogo: { label: "Keel contact predicted", cls: "border-[hsl(var(--nogo)/0.55)] bg-[hsl(var(--nogo)/0.12)]", dot: "bg-[hsl(var(--nogo))]", text: "text-[hsl(var(--nogo))]" },
};

function Budget({ r, draftFt }: { r: Row; draftFt: number }) {
  const b = r.budget;
  const depth = b.depth * M2FT;
  const squat = b.squat.controlling * M2FT;
  const wave = b.motion * M2FT;
  const extra = r.seg.extraAllowance * M2FT;
  const net = b.netUkc * M2FT;
  // Visualise the bottom 25% of the water column so the margins are readable.
  const top = Math.max(0, Math.min(draftFt - 6, depth - 14));
  const span = Math.max(depth, draftFt + squat + wave + extra) - top;
  const pct = (x: number) => `${Math.max(0, (x / span) * 100)}%`;
  const seg = [
    { k: "Static draft", v: draftFt - top, c: "bg-muted-foreground/35" },
    { k: "Squat", v: squat, c: "bg-[hsl(var(--chart-2))]" },
    { k: "Wave & roll", v: wave, c: "bg-[hsl(var(--chart-3))]" },
    ...(extra > 0 ? [{ k: "Allowance", v: extra, c: "bg-muted-foreground/60" }] : []),
  ];
  return (
    <div className="space-y-2" data-testid={`budget-${r.sf.id}`}>
      <div className="relative h-7 w-full rounded-md overflow-hidden bg-[hsl(var(--chart-1)/0.12)] ring-1 ring-border">
        <div className="absolute inset-0 flex">
          {seg.map((s) => (
            <div key={s.k} className={`${s.c} h-full`} style={{ width: pct(s.v) }} title={`${s.k}: ${s.v.toFixed(1)} ft`} />
          ))}
        </div>
        {/* seabed line at chart depth + tide */}
        <div className="absolute inset-y-0 w-[3px] bg-foreground" style={{ left: pct(depth - top) }} title="Seabed (chart depth + tide)" />
        {net > 0 && (
          <div className="absolute inset-y-0 flex items-center justify-center text-[10px] font-mono font-semibold text-[hsl(var(--chart-1))]"
            style={{ left: pct(depth - top - net), width: pct(net) }}>
            {net >= 1.5 ? `${net.toFixed(1)}` : ""}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {seg.slice(1).map((s) => (
          <span key={s.k} className="inline-flex items-center gap-1"><span className={`inline-block w-2.5 h-2.5 rounded-sm ${s.c}`} />{s.k} {s.v.toFixed(1)} ft</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="inline-block w-[3px] h-3 bg-foreground" />Seabed</span>
      </div>
    </div>
  );
}

export function SegmentCard({ r, draftFt, tideFt, marginFt, onChange }: { r: Row; draftFt: number; tideFt: number; marginFt: number; onChange: (s: SegmentForm) => void }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const meta = STATUS_META[r.status];
  const b = r.budget;
  const sf = r.sf;
  const net = b.netUkc * M2FT;
  const set = (patch: Partial<SegmentForm>) => onChange({ ...sf, ...patch });

  return (
    <Card className={`p-4 md:p-5 border ${meta.cls} flex flex-col gap-4`} data-testid={`card-segment-${sf.id}`}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">{sf.type === "open" ? "Open water" : sf.type === "trench" ? "Dredged trench" : "Confined channel"}{sf.widthFt && sf.type !== "open" ? ` · ${sf.widthFt} ft` : ""}</div>
          <div className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.text} bg-background/40 ring-1 ring-current/30`} data-testid={`status-${sf.id}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
          </div>
        </div>
        <h3 className="text-base font-semibold leading-tight">{sf.short}</h3>
        <p className="text-xs text-muted-foreground leading-snug">{sf.description}</p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Net under-keel clearance</div>
          <div className={`font-mono text-[2.5rem] leading-none font-semibold tabular-nums ${meta.text}`} data-testid={`net-${sf.id}`}>
            {net >= 0 ? "" : "−"}{Math.abs(net).toFixed(1)}<span className="text-lg ml-1 text-muted-foreground font-normal">ft</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-mono">{(b.netUkc).toFixed(2)} m · margin {marginFt.toFixed(1)} ft</div>
        </div>
        <div className="text-right text-xs space-y-1">
          <div><span className="text-muted-foreground">Speed </span><span className="font-mono font-semibold">{sf.speedKn.toFixed(1)} kn</span></div>
          <div><span className="text-muted-foreground">Depth </span><span className="font-mono">{sf.chartDepthFt.toFixed(1)} + {tideFt.toFixed(1)} ft</span></div>
          <div><span className="text-muted-foreground">h/T </span><span className={`font-mono ${b.hT < 1.1 ? "text-[hsl(var(--nogo))]" : b.hT < 1.3 ? "text-[hsl(var(--caution))]" : ""}`}>{b.hT.toFixed(2)}</span></div>
        </div>
      </div>

      <Budget r={r} draftFt={draftFt} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Static UKC</dt><dd className="font-mono">{fmtFt(b.staticUkc)} ft <span className={`text-xs ${r.staticOk ? "text-muted-foreground" : "text-[hsl(var(--caution))]"}`}>(≥{r.staticMinFt.toFixed(1)})</span></dd></div>
        <div><dt className="text-xs text-muted-foreground">Squat ({b.controllingPoint === "bilge" ? "bilge" : b.controllingPoint})</dt><dd className="font-mono">{fmtFt(b.squat.controlling)} ft</dd></div>
        <div><dt className="text-xs text-muted-foreground">Wave + roll motion</dt><dd className="font-mono">{fmtFt(b.motion)} ft</dd></div>
        <div><dt className="text-xs text-muted-foreground">Depth Froude no.</dt><dd className="font-mono">{b.squat.Fnh.toFixed(2)}</dd></div>
        <div>
          <dt className="text-xs text-muted-foreground">Max speed for margin</dt>
          <dd className="font-mono font-semibold" data-testid={`maxspeed-${sf.id}`}>{r.maxSpeedKn == null ? "None ≥ 3 kn" : r.maxSpeedKn >= 15.9 ? "> 16 kn" : `${r.maxSpeedKn.toFixed(1)} kn`}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tide needed at {sf.speedKn} kn</dt>
          <dd className="font-mono font-semibold" data-testid={`mintide-${sf.id}`}>{r.minTideFt == null ? "> 6 ft" : r.minTideFt <= -2.9 ? "Any" : `${r.minTideFt.toFixed(1)} ft`}</dd>
        </div>
      </dl>

      {r.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-xs text-[hsl(var(--caution))]"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{w}</li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground flex justify-between"><span>Planned speed</span><span className="font-mono">{sf.speedKn.toFixed(1)} kn</span></label>
        <Slider value={[sf.speedKn]} min={4} max={14} step={0.5} onValueChange={(x) => set({ speedKn: x[0] })} data-testid={`slider-speed-${sf.id}`} />
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1 justify-between" onClick={() => setOpen(!open)} data-testid={`button-methods-${sf.id}`}>
          All squat methods {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEdit(!edit)} data-testid={`button-edit-${sf.id}`}><Settings2 className="w-4 h-4 mr-1" />Edit</Button>
      </div>

      {open && (
        <div className="rounded-md ring-1 ring-border overflow-hidden" data-testid={`table-methods-${sf.id}`}>
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground"><tr><th className="text-left px-3 py-1.5 font-medium">Method</th><th className="text-right px-3 py-1.5 font-medium">Squat ft</th><th className="text-right px-3 py-1.5 font-medium">Range</th></tr></thead>
            <tbody>
              {b.squat.results.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-3 py-1.5">{METHODS.find((x) => x.id === m.id)?.short}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{m.applicable && isFinite(m.value) ? (m.value * M2FT).toFixed(2) : "n/a"}</td>
                  <td className={`px-3 py-1.5 text-right ${m.inRange ? "text-muted-foreground" : "text-[hsl(var(--caution))]"}`}>{!m.applicable ? "—" : m.inRange ? "in range" : "outside"}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/30"><td className="px-3 py-1.5 font-medium" colSpan={1}>Used: {b.squat.label}</td><td className="px-3 py-1.5 text-right font-mono font-semibold">{fmtFt(b.squat.controlling, 2)}</td><td /></tr>
            </tbody>
          </table>
          {b.motionDetail && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border font-mono">
              Wave: end σ {fmtFt(b.motionDetail.sigmaEnd, 2)} ft · heave σ {fmtFt(b.motionDetail.sigmaHeave, 2)} ft · pitch σ {b.motionDetail.sigmaPitchDeg.toFixed(2)}° · Tz {b.motionDetail.tzE.toFixed(1)} s · ~{Math.round(b.motionDetail.encounters)} encounters · ×{b.motionDetail.sigFactor.toFixed(2)} · rule {fmtFt(b.ruleWave)} ft · bilge {fmtFt(b.bilge)} ft · exposure {sf.exposure}
            </div>
          )}
        </div>
      )}

      {edit && (
        <div className="grid grid-cols-2 gap-3 rounded-md ring-1 ring-border p-3" data-testid={`form-segment-${sf.id}`}>
                    <Field label="Chart depth (ft MLLW)" v={sf.chartDepthFt} step={0.1} onChange={(x) => set({ chartDepthFt: x })} id={`depth-${sf.id}`} />
          <div className="space-y-1">
            <Label className="text-xs">Channel type</Label>
            <Select value={sf.type} onValueChange={(t) => set({ type: t as SegmentForm["type"], widthFt: t === "open" ? undefined : sf.widthFt ?? 500, overbankFt: sf.overbankFt ?? 10 })}>
              <SelectTrigger className="h-9" data-testid={`select-type-${sf.id}`}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="open">Open water</SelectItem><SelectItem value="trench">Trench (partial cut)</SelectItem><SelectItem value="canal">Confined (full cut)</SelectItem></SelectContent>
            </Select>
          </div>
          {sf.type !== "open" && <Field label="Bottom width (ft)" v={sf.widthFt ?? 500} step={10} onChange={(x) => set({ widthFt: x })} id={`width-${sf.id}`} />}
          {sf.type === "trench" && <Field label="Depth outside cut (ft MLLW)" v={sf.overbankFt ?? 10} step={1} onChange={(x) => set({ overbankFt: x })} id={`overbank-${sf.id}`} />}
          <Field label="Inbound course (°T)" v={sf.headingDeg} step={1} onChange={(x) => set({ headingDeg: x })} id={`heading-${sf.id}`} />
          <Field label="Wave exposure (0–1)" v={sf.exposure} step={0.1} onChange={(x) => set({ exposure: Math.max(0, Math.min(1, x)) })} id={`exposure-${sf.id}`} />
          <Field label="Segment length (ft)" v={sf.lengthFt} step={100} onChange={(x) => set({ lengthFt: x })} id={`length-${sf.id}`} />
          <Field label="Static rule (% of draft)" v={sf.staticRulePct} step={1} onChange={(x) => set({ staticRulePct: x })} id={`rule-${sf.id}`} />
        </div>
      )}
    </Card>
  );
}

export function Field({ label, v, onChange, step = 1, id, suffix }: { label: string; v: number; onChange: (x: number) => void; step?: number; id: string; suffix?: string }) {
  const [txt, setTxt] = useState(String(v));
  useEffect(() => { if (parseFloat(txt) !== v) setTxt(String(v)); }, [v]);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="relative">
        <Input id={id} type="number" inputMode="decimal" step={step} value={txt} className="h-9 font-mono pr-9"
          onChange={(e) => { setTxt(e.target.value); const x = parseFloat(e.target.value); if (Number.isFinite(x)) onChange(x); }} data-testid={`input-${id}`} />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}
