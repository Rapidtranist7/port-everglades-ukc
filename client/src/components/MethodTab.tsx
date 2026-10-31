import { Card } from "@/components/ui/card";

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--chart-1))] underline underline-offset-2 hover:opacity-80">{children}</a>
);
const F = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono text-[12.5px] bg-muted/50 rounded px-3 py-2 my-2 overflow-x-auto whitespace-pre">{children}</div>
);

export function MethodTab() {
  return (
    <div className="grid lg:grid-cols-2 gap-5 text-sm leading-relaxed">
      <Card className="p-5 space-y-3">
        <h2 className="text-base font-semibold">Clearance budget</h2>
        <F>{`Net UKC = (chart depth + tide) − draft − squat − wave/roll motion − allowance`}</F>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li><b className="text-foreground">Tide</b>: NOAA prediction at ETA for the selected station (default Port Everglades Turning Basin 8722951; seven nearby stations selectable). Subordinate stations publish highs and lows only, so the curve between them is cosine-interpolated. The observed − predicted offset from the last 30 min at the live gauge (South Port Everglades 8722956) is added as a port-wide weather correction (optional).</li>
          <li><b className="text-foreground">Two depths per segment</b>: the shallowest depth sets the clearance; the average depth over the area drives squat, because the pressure field that causes squat spans roughly a ship length and a single short shoal does not fully develop it. If the shallow area is a ship length or longer, the card warns and shows squat at the shoal depth too.</li>
          <li><b className="text-foreground">Squat</b>: seven published formulas run together; by default the highest is used. USACE's Port Everglades study used the average of Eryuzlu, Huuska and Römisch (selectable).</li>
          <li><b className="text-foreground">Wave motion</b>: the buoy's measured directional spectrum is passed through closed-form heave and pitch response functions for the ship (Jensen, Mansour &amp; Olsen 2004). Bow/stern motion = heave combined with pitch × L/2. Expected maximum over the transit = σ·√(2 ln N).</li>
          <li><b className="text-foreground">Roll/heel</b>: bilge drop = B/2 · sin(roll + heel), added to heave. The larger of the bow/stern case and the bilge case controls; maxima are not blindly summed (Gourlay 2007).</li>
          <li><b className="text-foreground">Status</b>: green ≥ required margin (default 3 ft — USACE's safety clearance for rock/clay bottom); amber between 0 and margin, or static UKC below the % of draft rule; red below 0.</li>
        </ul>
      </Card>

      <Card className="p-5 space-y-2">
        <h2 className="text-base font-semibold">Squat formulas (SI units)</h2>
        <F>{`Barrass III    Smax = K·Cb·Vk²/100,  K = 5.74·S^0.76 (1 ≤ K ≤ 2)
               open water: Weff = (7.04/Cb^0.85)·B
Barrass II     Smax = Cb/30 · [S/(1−S)]^(2/3) · Vk^2.08
ICORELS        Sb = 2.4·∇/L² · Fnh²/√(1−Fnh²)
Huuska/Guliev  ICORELS × Ks (channel-width correction)
Eryuzlu        Sb = 0.298·h²/T·(V/√gT)^2.289·(h/T)^−2.972·Kb
Römisch        Sb = Cv·Cf·KΔT·T  (critical-speed method)
Yoshimura      Sb = [(0.7+1.5T/h)(CbB/L) + 15(T/h)(CbB/L)³]·Ve²/g
Trench         S = Sopen + (hT/h)(Scanal − Sopen)   (EM 1110-2-1613)`}</F>
        <p className="text-muted-foreground">Fnh = V/√(gh). Validity ranges are checked per formula and flagged in each card. The open-water engine reproduces the worked bulk-carrier example in the <A href="https://johndfenton.com/Documents/Donau/Briggs06.pdf">ERDC squat technical note (Briggs 2006)</A> to within rounding.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-base font-semibold">Review of the attached documents</h2>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li><b className="text-foreground">Munsch squat slides and the concept sheet — one correction.</b> The blockage term is written s = S/(1+S). Barrass's velocity-return factor is S/(1−S) = As/(Ac − As), as in the <A href="http://deslab.mit.edu/DesignLab/squat/home.html">MIT Design Lab squat notes</A>. S/(1+S) understates confined-channel squat. The app uses S/(1−S).</li>
          <li><b className="text-foreground">Effective width typo.</b> The slide reads "7.7=45(1−Cw)²"; the formula is Weff = [7.7 + 45(1−Cw)²]·B.</li>
          <li><b className="text-foreground">Cb·V²/100 and 2·Cb·V²/100</b> are confirmed as Barrass's quick rules (open / confined). They give the maximum squat at bow or stern, not mean sinkage. Cb &gt; 0.7 squats by the head, &lt; 0.7 by the stern (<A href="https://data.ntsb.gov/Docket/Document/docBLOB?ID=40454183&FileExtension=.PDF&FileName=3%20-%20Engineering%20-%20Comparison%20Between%20Formulas%20of%20Maximum%20Ship%20Squat%20-%20RNASB%20-%202016-Master.PDF">NTSB docket, RNASB 2016 formula comparison</A>). Barrass is known to over-predict; useful as an upper bound.</li>
          <li><b className="text-foreground">Cb guide</b> — formula Δ/(ρ·L·B·T) and the 0.617 worked example check out. Cb rises with draft, so use the value at the arrival draft.</li>
          <li><b className="text-foreground">NAVARC motions report</b> — the pitch (x·sin θ) and roll (y·sin φ) geometry is correct. Ship-specific response functions (RAOs) are the right long-term path; this app uses a closed-form approximation until a ship's RAOs are available.</li>
        </ul>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-base font-semibold">Port Everglades facts used</h2>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>Outer entrance channel 500 ft wide, −45 ft MLLW, ~5,100 ft from the sea buoy to the jetties; inner entrance channel 450 ft, −42 ft (<A href="https://www.saj.usace.army.mil/About/Congressional-Fact-Sheets-2025/Port-Everglades-Harbor-O-M/">USACE O&amp;M fact sheet</A>; <A href="https://www.saj.usace.army.mil/Portals/44/docs/Planning/EnvironmentalBranch/EnvironmentalDocs/PortEvergladesFinalRPT_AppendA.pdf">USACE feasibility Appendix A</A>).</li>
          <li>USACE design: wave allowance 10% of draft in the outer channel (Bahamas shelter), none inside the jetties; 3 ft safety clearance for rock/clay; squat at 10 kn as a trench channel with 10 ft depth outside the cut; pilots slow from 12 kn at the outer marker to 8 kn at the jetties (same source).</li>
          <li>Port notice: harbor-entrance maximum depth 45.0 ft; bar-cut UKC 10% of deep draft (<A href="https://www.moranshipping.com/news/bulletins/port-update-port-everglades-fl-2026-10-22">Moran port update, Oct 2026</A>). Confirm with PEPA rules.</li>
          <li>Deepening project: outer channel to be deepened 45 → 48 ft authorized, widened 500 → 800 ft and extended 2,200 ft seaward (<A href="https://www.fisheries.noaa.gov/s3/2025-09/USACEPortEverglades-2026LOA-NOR-App-OPR.pdf">USACE letter of authorization, 2025</A>). Update segment depths when surveys change.</li>
          <li>Wave data: <A href="https://www.ndbc.noaa.gov/station_page.php?station=41122">NDBC 41122 Hollywood Beach</A> (26.001 N, 80.096 W, 15.6 m depth) — about 5.5 nm south of the sea buoy, in shallower water. Wind: PEGF1. Tide: NOAA CO-OPS 8722956.</li>
        </ul>
      </Card>

      <Card className="p-5 space-y-3 lg:col-span-2">
        <h2 className="text-base font-semibold">Limits and what this does not do</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>At 42 ft draft over the 45.7 ft shoal, depth/draft is ~1.09 at low water — below the 1.1 lower bound of most squat formulas and well below PIANC's 1.3 (Hs ≤ 1 m) / 1.5 (Hs &gt; 1 m) guidance (<A href="https://filelist.tudelft.nl/TBM/Over%20faculteit/Afdelingen/Values,%20Technology%20and%20Innovation/People/Full%20Professors/Pieter%20van%20Gelder/paper179.pdf">TU Delft paper citing PIANC</A>). Results there are extrapolations; treat with extra margin.</li>
          <li>The closed-form motion model assumes deep water and a box-like hull. It tends to under-predict heave for waves longer than the ship and over-predict pitch near λ ≈ L (<A href="https://www.sarc.nl/images/manuals/pias/htmlEN/motions.html">SARC PIAS notes</A>). Shallow water usually reduces motions (<A href="https://cmst.curtin.edu.au/wp-content/uploads/sites/4/2016/05/gourlay-2007-ship_underkeel_clearance_in_waves.pdf">Gourlay 2007</A>).</li>
          <li>Long low swell can ground a ship with apparently ample static UKC — see the Capella Voyager case (<A href="https://www.perthhydro.com/pdf/Gourlay2013UkcNaval.pdf">Gourlay 2013</A>). EM 1110-2-1613 notes periods &gt; 10 s matter most and ships respond weakly below 6 s (<A href="https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1613.pdf">USACE EM 1110-2-1613</A>).</li>
          <li>Not modeled: squat from passing ships, bank suction, wind heel from a specific ship's windage, current-induced speed-through-water changes (enter STW, not SOG), and dynamic trim from loading. Uses the latest chart/survey depth you enter.</li>
          <li>Decision support only. Not a certified dynamic UKC system; pilot judgment governs.</li>
        </ul>
      </Card>
    </div>
  );
}
