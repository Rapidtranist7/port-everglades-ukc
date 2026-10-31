import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend, AreaChart, Area, ComposedChart } from "recharts";
import type { SpecBin } from "@shared/ukc";
import type { VesselForm, SegmentForm, SettingsForm } from "@/lib/presets";
import { speedCurve, fmtTime, type TideData, evaluate } from "@/lib/compute";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"];
const tip = { contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }, labelStyle: { color: "hsl(var(--muted-foreground))" } };

export function ChartsTab(p: { vessel: VesselForm; segs: SegmentForm[]; st: SettingsForm; spec: SpecBin[]; tideFt: number; tides?: TideData; residual: number; etaMs: number; requiredTide: number | null; rows: ReturnType<typeof evaluate> }) {
  const curve = useMemo(() => speedCurve(p.vessel, p.segs, p.st, p.spec, p.tideFt), [p.vessel, p.segs, p.st, p.spec, p.tideFt]);
  const tideSeries = useMemo(() => {
    if (!p.tides) return [];
    const now = Date.now() - 2 * 3600e3;
    return p.tides.predictions
      .filter((x) => Date.parse(x.t) >= now && Date.parse(x.t) <= now + 34 * 3600e3)
      .filter((_, i) => i % 2 === 0)
      .map((x) => ({ t: Date.parse(x.t), pred: +x.v.toFixed(2), adj: +(x.v + p.residual).toFixed(2) }));
  }, [p.tides, p.residual]);
  const obs = useMemo(() => (p.tides?.observed ?? []).map((o) => ({ t: Date.parse(o.t), obs: o.v })), [p.tides]);
  const merged = useMemo(() => {
    const m = new Map<number, any>();
    tideSeries.forEach((r) => m.set(r.t, { ...r }));
    obs.forEach((o) => { if (o.t >= (tideSeries[0]?.t ?? 0)) m.set(o.t, { ...(m.get(o.t) ?? { t: o.t }), obs: o.obs }); });
    return Array.from(m.values()).sort((a, b) => a.t - b.t);
  }, [tideSeries, obs]);

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Net UKC vs speed</h2>
        <p className="text-xs text-muted-foreground mb-3">At the ETA tide ({p.tideFt.toFixed(1)} ft) with current waves. Dashed line = required margin.</p>
        <div className="h-72" data-testid="chart-speed">
          <ResponsiveContainer>
            <LineChart data={curve} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="kn" type="number" domain={[4, 14]} ticks={[4, 6, 8, 10, 12, 14]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit=" kn" />
              <YAxis domain={[-10, "auto"]} allowDataOverflow tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit=" ft" />
              <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(1)} ft`} labelFormatter={(l) => `${l} kn`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={p.st.marginFt} stroke="hsl(var(--caution))" strokeDasharray="5 4" />
              <ReferenceLine y={0} stroke="hsl(var(--nogo))" />
              {p.segs.map((s, i) => (
                <Line key={s.id} dataKey={s.id} name={s.short} stroke={COLORS[i]} dot={false} strokeWidth={2} isAnimationActive={false} />
              ))}
              {p.segs.map((s, i) => <ReferenceLine key={`v-${s.id}`} x={s.speedKn} stroke={COLORS[i]} strokeOpacity={0.35} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Tide · South Port Everglades 8722956</h2>
        <p className="text-xs text-muted-foreground mb-3">Predicted, observed, and forecast with observed offset. Dashed = tide needed at planned speeds{p.requiredTide != null ? ` (${p.requiredTide.toFixed(1)} ft)` : ""}.</p>
        <div className="h-72" data-testid="chart-tide">
          <ResponsiveContainer>
            <ComposedChart data={merged} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => fmtTime(t)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit=" ft" />
              <Tooltip {...tip} labelFormatter={(t) => new Date(t as number).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })} formatter={(v: number) => `${v.toFixed(2)} ft`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey="adj" name="Forecast + offset" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1)/0.15)" strokeWidth={2} isAnimationActive={false} connectNulls />
              <Line dataKey="pred" name="Predicted" stroke="hsl(var(--muted-foreground))" dot={false} strokeDasharray="2 3" isAnimationActive={false} connectNulls />
              <Line dataKey="obs" name="Observed" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
              {p.requiredTide != null && <ReferenceLine y={p.requiredTide} stroke="hsl(var(--caution))" strokeDasharray="5 4" />}
              <ReferenceLine x={p.etaMs} stroke="hsl(var(--foreground))" strokeOpacity={0.6} label={{ value: "ETA", fontSize: 10, fill: "hsl(var(--foreground))", position: "top" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 lg:col-span-2">
        <h2 className="text-sm font-semibold mb-3">Budget summary</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]" data-testid="table-budget">
            <thead className="text-xs text-muted-foreground"><tr className="border-b border-border">
              {["Point", "Depth + tide", "Draft", "Static UKC", "Squat", "Wave/roll", "Net UKC", "Max speed", "Tide needed"].map((h) => <th key={h} className="text-left font-medium py-2 pr-3">{h}</th>)}
            </tr></thead>
            <tbody className="font-mono">
              {p.rows.map((r) => {
                const f = (m: number) => (m / 0.3048).toFixed(1);
                return (
                  <tr key={r.sf.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-sans">{r.sf.short}</td>
                    <td className="py-2 pr-3">{f(r.budget.depth)}</td>
                    <td className="py-2 pr-3">{p.vessel.draftFt.toFixed(1)}</td>
                    <td className="py-2 pr-3">{f(r.budget.staticUkc)}</td>
                    <td className="py-2 pr-3">{f(r.budget.squat.controlling)}</td>
                    <td className="py-2 pr-3">{f(r.budget.motion)}</td>
                    <td className={`py-2 pr-3 font-semibold ${r.status === "nogo" ? "text-[hsl(var(--nogo))]" : r.status === "caution" ? "text-[hsl(var(--caution))]" : "text-[hsl(var(--go))]"}`}>{f(r.budget.netUkc)}</td>
                    <td className="py-2 pr-3">{r.maxSpeedKn == null ? "—" : r.maxSpeedKn.toFixed(1)}</td>
                    <td className="py-2 pr-3">{r.minTideFt == null ? ">6" : r.minTideFt.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">All values in feet unless noted. Max speed keeps net UKC ≥ the required margin; tide needed is at the planned speed.</p>
      </Card>
    </div>
  );
}
