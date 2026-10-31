import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts";
import { ageMin, compass, fmtDayTime, M2FT, type BuoyData, type WindData, type TideData } from "@/lib/compute";

const tip = { contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }, labelStyle: { color: "hsl(var(--muted-foreground))" } };

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-mono text-base font-semibold">{v}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Age({ iso }: { iso?: string }) {
  const a = ageMin(iso);
  if (!iso) return <span className="text-muted-foreground">no data</span>;
  return <span className={a > 120 ? "text-[hsl(var(--caution))]" : "text-muted-foreground"}>{fmtDayTime(iso)} · {Math.round(a)} min old</span>;
}

export function ConditionsTab({ buoy, wind, tides, residual }: { buoy?: BuoyData; wind?: WindData; tides?: TideData; residual: number | null }) {
  const spec = useMemo(() => (buoy?.spectrum?.bins ?? []).filter((b) => b.f >= 0.04 && b.f <= 0.35).map((b) => ({ T: +(1 / b.f).toFixed(1), S: +(b.S * M2FT * M2FT).toFixed(2), dir: b.dir })), [buoy]);
  const hist = useMemo(() => (buoy?.history ?? []).filter((h) => h.hs != null).map((h) => ({ t: Date.parse(h.time), hs: +(h.hs! * M2FT).toFixed(1), tp: h.dpd })).sort((a, b) => a.t - b.t), [buoy]);
  const p = buoy?.parts;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card className="p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Hollywood Beach buoy 41122 (CDIP 265)</h2>
          <p className="text-xs"><Age iso={buoy?.std?.time} /></p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Stat k="Sig. wave height" v={`${buoy?.std?.hs != null ? (buoy.std.hs * M2FT).toFixed(1) : "—"} ft`} sub={`${buoy?.std?.hs ?? "—"} m`} />
          <Stat k="Peak period" v={`${buoy?.std?.dpd ?? "—"} s`} sub={`mean ${buoy?.std?.apd ?? "—"} s`} />
          <Stat k="Mean direction" v={`${compass(buoy?.std?.mwd)}`} sub={`${buoy?.std?.mwd ?? "—"}° from`} />
          <Stat k="Swell" v={`${p?.swellH != null ? (p.swellH * M2FT).toFixed(1) : "—"} ft`} sub={`${p?.swellT ?? "—"} s from ${p?.swellDirTxt ?? "—"}`} />
          <Stat k="Wind sea" v={`${p?.windH != null ? (p.windH * M2FT).toFixed(1) : "—"} ft`} sub={`${p?.windT ?? "—"} s from ${p?.windDirTxt ?? "—"}`} />
          <Stat k="Surface current" v={`${buoy?.current?.speedCms != null ? (buoy.current.speedCms * 0.0194384).toFixed(2) : "—"} kn`} sub={`toward ${compass(buoy?.current?.dir)} (${buoy?.current?.dir ?? "—"}°)`} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-2">Energy by wave period (ft²/Hz). Long periods (&gt; 10 s) drive large-ship pitch and heave.</div>
          <div className="h-52" data-testid="chart-spectrum">
            <ResponsiveContainer>
              <BarChart data={spec} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="T" reversed tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={6} unit="s" />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tip} formatter={(v: number, _n, it: any) => [`${v} ft²/Hz · from ${it?.payload?.dir ?? "—"}°`, "Energy"]} labelFormatter={(l) => `${l} s`} />
                <Bar dataKey="S" fill="hsl(var(--chart-1))" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Wave height, last 48 h</h2>
          <div className="h-44 mt-2" data-testid="chart-history">
            <ResponsiveContainer>
              <LineChart data={hist} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => fmtDayTime(t)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={50} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit=" ft" />
                <Tooltip {...tip} labelFormatter={(t) => fmtDayTime(t as number)} formatter={(v: number) => `${v} ft`} />
                <Line dataKey="hs" name="Hs" stroke="hsl(var(--chart-1))" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Wind · Port Everglades PEGF1</h2>
            <p className="text-xs"><Age iso={wind?.time} /></p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Stat k="Wind" v={`${wind?.wspd != null ? (wind.wspd * 1.94384).toFixed(0) : "—"} kn`} sub={`from ${compass(wind?.wdir)} (${wind?.wdir ?? "—"}°)`} />
            <Stat k="Gust" v={`${wind?.gst != null ? (wind.gst * 1.94384).toFixed(0) : "—"} kn`} />
            <Stat k="Pressure" v={`${wind?.pres ?? "—"} hPa`} />
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Water level · South Port Everglades 8722956</h2>
            <p className="text-xs"><Age iso={tides?.observed?.[tides.observed.length - 1]?.t} /></p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Stat k="Last observed" v={`${tides?.observed?.length ? tides.observed[tides.observed.length - 1].v.toFixed(2) : "—"} ft`} sub="MLLW" />
            <Stat k="Observed − predicted" v={`${residual != null ? (residual >= 0 ? "+" : "") + residual.toFixed(2) : "—"} ft`} sub="weather setup" />
            <Stat k="Next" v={(() => { const n = tides?.hilo?.find((h) => Date.parse(h.t) > Date.now()); return n ? `${n.type === "H" ? "High" : "Low"} ${n.v.toFixed(1)}` : "—"; })()} sub={(() => { const n = tides?.hilo?.find((h) => Date.parse(h.t) > Date.now()); return n ? fmtDayTime(n.t) : ""; })()} />
          </div>
        </Card>
      </div>
    </div>
  );
}
