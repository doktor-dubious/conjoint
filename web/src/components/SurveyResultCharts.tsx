import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Customized,
  ErrorBar,
  Pie,
  PieChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  objectStats,
  TIE_EPS,
  type Tallies,
} from "@/lib/results";
import type { AnalyzeResponse, SurveyDataRow } from "@/lib/api";

const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];
const TIE_COLOR = "hsl(var(--muted-foreground))";

function histogram(
  values: number[],
  lo: number,
  hi: number,
  nbins: number,
): { label: string; count: number }[] {
  const w = (hi - lo) / nbins || 1;
  const bins = Array.from({ length: nbins }, (_, i) => ({
    label: (lo + i * w).toFixed(w < 1 ? 1 : 0),
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - lo) / w);
    if (idx < 0) idx = 0;
    if (idx >= nbins) idx = nbins - 1;
    bins[idx].count += 1;
  }
  return bins;
}

const CHART_H = "aspect-auto h-[240px] w-full";

export function SurveyResultCharts({
  analysis,
  surveyData,
  tallies,
  scaleMax,
}: {
  analysis: AnalyzeResponse;
  surveyData: SurveyDataRow[];
  tallies: Tallies;
  scaleMax: number;
}) {
  const data = useMemo(() => {
    const stats = objectStats(analysis);
    const colorByName: Record<string, string> = {};
    stats.forEach((s, i) => (colorByName[s.name] = PALETTE[i % PALETTE.length]));
    const colorFor = (name: string) =>
      name === "Tie" ? TIE_COLOR : (colorByName[name] ?? PALETTE[0]);

    // 1) mean ± SD per object
    const meanSd = [...stats]
      .sort((a, b) => b.mean - a.mean)
      .map((s) => ({ name: s.name, mean: s.mean, sd: s.sd }));

    // 3) box-plot stats (already in `stats`)
    const dmin = Math.floor(Math.min(...stats.map((s) => s.min)));
    const dmax = Math.ceil(Math.max(...stats.map((s) => s.max)));
    const boxDomain: [number, number] = [dmin - 1, dmax + 1];

    // 4) respondent segment scatter (first two objects)
    const o0 = stats[0];
    const o1 = stats[1];
    const scatterGroups: Record<string, { x: number; y: number; id: string }[]> =
      {};
    if (o0 && o1) {
      for (const r of analysis.per_respondent) {
        const av = stats.map(
          (o) => r.alphas.find((a) => a.object_id === o.object_id)?.alpha ?? 0,
        );
        const maxv = Math.max(...av);
        const tops = av.filter((v) => Math.abs(v - maxv) < TIE_EPS);
        const winner =
          tops.length > 1 ? "Tie" : stats[av.indexOf(maxv)].name;
        (scatterGroups[winner] ??= []).push({
          x: av[0],
          y: av[1],
          id: r.external_id ?? "",
        });
      }
    }

    // 5) τ histogram
    const taus = analysis.per_respondent.map((r) => r.tau);
    const tlo = Math.floor(Math.min(...taus, 0));
    const thi = Math.ceil(Math.max(...taus, 0));
    const tauHist = histogram(taus, tlo, thi, 13);

    // 6) top-choice share (fractional)
    const share = [
      ...tallies.winners.map((w) => ({ name: w.name, value: w.fractional })),
      ...(tallies.winnerTie > 0
        ? [{ name: "Tie", value: tallies.winnerTie }]
        : []),
    ].filter((d) => d.value > 0);

    // 7) response intensity |y|
    const absY = surveyData.map((r) => Math.abs(r.y));
    const intensity = histogram(absY, 0, Math.max(scaleMax, ...absY, 1), 12);

    // ranking bars (fractional)
    const ranking = tallies.rankings.map((r) => ({
      key: r.key,
      value: r.fractional,
    }));

    return {
      stats,
      colorFor,
      meanSd,
      boxDomain,
      o0,
      o1,
      scatterGroups,
      tauHist,
      share,
      intensity,
      ranking,
    };
  }, [analysis, surveyData, tallies, scaleMax]);

  // Box-and-whisker layer drawn over a category/number axis pair.
  const BoxLayer = (props: {
    xAxisMap?: Record<string, { scale: (v: string) => number | undefined }>;
    yAxisMap?: Record<string, { scale: (v: number) => number }>;
  }) => {
    const xMap = props.xAxisMap;
    const yMap = props.yAxisMap;
    if (!xMap || !yMap) return null;
    const xAxis = Object.values(xMap)[0] as {
      scale: ((v: string) => number | undefined) & { bandwidth?: () => number };
    };
    const yAxis = Object.values(yMap)[0];
    const xScale = xAxis.scale;
    const yScale = yAxis.scale;
    const band =
      typeof xScale.bandwidth === "function" ? xScale.bandwidth() : 28;
    return (
      <g>
        {data.stats.map((s) => {
          const left = xScale(s.name);
          if (left == null) return null;
          const cx = left + band / 2;
          const w = Math.min(band * 0.5, 36);
          const yMin = yScale(s.min);
          const yMax = yScale(s.max);
          const yQ1 = yScale(s.q1);
          const yQ3 = yScale(s.q3);
          const yMed = yScale(s.median);
          const c = data.colorFor(s.name);
          return (
            <g key={s.object_id} stroke={c}>
              <line x1={cx} x2={cx} y1={yMin} y2={yMax} strokeWidth={1.5} />
              <rect
                x={cx - w / 2}
                y={yQ3}
                width={w}
                height={Math.max(1, yQ1 - yQ3)}
                fill={c}
                fillOpacity={0.22}
                strokeWidth={1.5}
              />
              <line
                x1={cx - w / 2}
                x2={cx + w / 2}
                y1={yMed}
                y2={yMed}
                strokeWidth={2.5}
              />
              <line
                x1={cx - w / 3}
                x2={cx + w / 3}
                y1={yMin}
                y2={yMin}
                strokeWidth={1.5}
              />
              <line
                x1={cx - w / 3}
                x2={cx + w / 3}
                y1={yMax}
                y2={yMax}
                strokeWidth={1.5}
              />
            </g>
          );
        })}
      </g>
    );
  };

  const emptyConfig = {} satisfies ChartConfig;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* 1. Part-worths bar (mean ± SD) */}
      <ChartCard
        title="Part-worths (mean ± SD)"
        description="Mean utility per object with ±1 SD across respondents. The spread dwarfs the differences."
      >
        <ChartContainer config={emptyConfig} className={CHART_H}>
          <BarChart data={data.meanSd} margin={{ left: -8, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={36} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="mean" radius={4}>
              {data.meanSd.map((d) => (
                <Cell key={d.name} fill={data.colorFor(d.name)} />
              ))}
              <ErrorBar
                dataKey="sd"
                width={5}
                strokeWidth={1.5}
                stroke="hsl(var(--foreground))"
                direction="y"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 2. Top-choice share (donut) */}
      <ChartCard
        title="Top-choice share"
        description="Share of respondents whose most-preferred object is each one (ties split fractionally)."
      >
        <ChartContainer config={emptyConfig} className={CHART_H}>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={data.share}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              strokeWidth={2}
            >
              {data.share.map((d) => (
                <Cell key={d.name} fill={data.colorFor(d.name)} />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="name" />} />
          </PieChart>
        </ChartContainer>
      </ChartCard>

      {/* 3. Part-worth distributions (box plot) */}
      <ChartCard
        className="lg:col-span-2"
        title="Part-worth distributions"
        description="Box (IQR + median) and whiskers (min–max) of each object's part-worth across respondents. Heavy overlap = inhomogeneous respondents."
      >
        <ChartContainer config={emptyConfig} className={CHART_H}>
          <ComposedChart data={data.stats} margin={{ left: -8, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis
              type="number"
              domain={data.boxDomain}
              tickFormatter={(v) => String(Math.round(v))}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="median" fill="transparent" isAnimationActive={false} />
            <Customized component={BoxLayer} />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      {/* 4. Ranking distribution */}
      <ChartCard
        title="Ranking distribution"
        description="Respondents per full preference order (fractional split of ties). A near-even split signals heterogeneity."
      >
        <ChartContainer config={emptyConfig} className={CHART_H}>
          <BarChart data={data.ranking} margin={{ left: -8, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="key" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={36} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="value" radius={4} fill="hsl(var(--chart-2))" />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 5. Order-effect τ histogram */}
      <ChartCard
        title="Order effect (τ) distribution"
        description="Per-respondent left–right bias. Centred near 0 means little systematic position effect."
      >
        <ChartContainer config={emptyConfig} className={CHART_H}>
          <BarChart data={data.tauHist} margin={{ left: -8, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={36} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="count" radius={4} fill="hsl(var(--chart-4))" />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 6. Respondent segment scatter */}
      {data.o0 && data.o1 && (
        <ChartCard
          className="lg:col-span-2"
          title="Respondent segments"
          description={`Each point is a respondent's part-worths (${data.o0.name} vs ${data.o1.name}), coloured by their top choice. Clusters reveal preference segments.`}
        >
          <ChartContainer config={emptyConfig} className="aspect-auto h-[320px] w-full">
            <ScatterChart margin={{ left: -4, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name={data.o0.name}
                tickLine={false}
                axisLine={false}
                label={{
                  value: data.o0.name,
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={data.o1.name}
                tickLine={false}
                axisLine={false}
                width={36}
                label={{
                  value: data.o1.name,
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 11,
                }}
              />
              <ZAxis range={[40, 40]} />
              <ReferenceLine x={0} stroke="hsl(var(--border))" />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <ChartTooltip
                content={<ChartTooltipContent hideLabel />}
                cursor={{ strokeDasharray: "3 3" }}
              />
              {Object.entries(data.scatterGroups).map(([winner, pts]) => (
                <Scatter
                  key={winner}
                  name={winner}
                  data={pts}
                  fill={data.colorFor(winner)}
                  fillOpacity={0.7}
                />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </ScatterChart>
          </ChartContainer>
        </ChartCard>
      )}

      {/* 7. Response intensity */}
      <ChartCard
        title="Response intensity"
        description="How decisive responses were: distribution of |y| (0 = indifferent, far = strong preference)."
      >
        <ChartContainer config={emptyConfig} className={CHART_H}>
          <BarChart data={data.intensity} margin={{ left: -8, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={36} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="count" radius={4} fill="hsl(var(--chart-1))" />
          </BarChart>
        </ChartContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border p-4 ${className ?? ""}`}>
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && (
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
