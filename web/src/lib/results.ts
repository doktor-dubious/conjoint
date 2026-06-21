// Analysis-derived tallies and distribution stats shared by the Survey
// Results tab and its charts.
import type { AnalyzeResponse } from "@/lib/api";

// Part-worths can tie (coarse data, saturated N=K model), so tallies are
// reported under two conventions: strict (ties bucketed) and fractional
// (a tie split equally across the tied outcomes).
export const TIE_EPS = 1e-4;

export const fmtCount = (v: number) =>
  Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);

export function indexPermutations(n: number): number[][] {
  const out: number[][] = [];
  const go = (cur: number[], rest: number[]) => {
    if (!rest.length) {
      out.push(cur);
      return;
    }
    rest.forEach((v, i) =>
      go([...cur, v], [...rest.slice(0, i), ...rest.slice(i + 1)]),
    );
  };
  go([], Array.from({ length: n }, (_, i) => i));
  return out;
}

export function shortCodes(names: string[]): string[] {
  const first = names.map((n) => (n.trim()[0] || "?").toUpperCase());
  return new Set(first).size === names.length
    ? first
    : names.map((_, i) => String(i + 1));
}

export type Tallies = {
  codes: { name: string; code: string }[];
  winners: { name: string; strict: number; fractional: number }[];
  winnerTie: number;
  rankings: { key: string; strict: number; fractional: number }[];
  rankingTie: number;
  rankingTooBig: boolean;
};

export function computeTallies(analysis: AnalyzeResponse): Tallies {
  const objs = (
    analysis.aggregate ??
    analysis.per_respondent[0]?.alphas ??
    []
  ).map((o) => ({ object_id: o.object_id, name: o.name }));
  const K = objs.length;
  const codes = shortCodes(objs.map((o) => o.name));
  const rankingTooBig = K > 4 || K < 1;
  const perms = rankingTooBig ? [] : indexPermutations(K);

  const strictWins: Record<string, number> = {};
  const fracWins: Record<string, number> = {};
  objs.forEach((o) => {
    strictWins[o.name] = 0;
    fracWins[o.name] = 0;
  });
  let winnerTie = 0;
  const strictRank: Record<string, number> = {};
  const fracRank: Record<string, number> = {};
  let rankingTie = 0;

  for (const r of analysis.per_respondent) {
    const a = objs.map(
      (o) => r.alphas.find((x) => x.object_id === o.object_id)?.alpha ?? 0,
    );
    const maxv = Math.max(...a);
    const top = a
      .map((v, i) => ({ v, i }))
      .filter((x) => Math.abs(x.v - maxv) < TIE_EPS)
      .map((x) => x.i);
    if (top.length === 1) strictWins[objs[top[0]].name] += 1;
    else winnerTie += 1;
    top.forEach((i) => (fracWins[objs[i].name] += 1 / top.length));

    if (!rankingTooBig) {
      const distinct = new Set(a.map((v) => v.toFixed(4))).size === K;
      if (distinct) {
        const key = objs
          .map((_, i) => i)
          .sort((x, y) => a[y] - a[x])
          .map((i) => codes[i])
          .join("");
        strictRank[key] = (strictRank[key] || 0) + 1;
      } else {
        rankingTie += 1;
      }
      const consistent = perms.filter((p) => {
        for (let k = 0; k + 1 < p.length; k++)
          if (a[p[k]] < a[p[k + 1]] - TIE_EPS) return false;
        return true;
      });
      consistent.forEach((p) => {
        const key = p.map((i) => codes[i]).join("");
        fracRank[key] = (fracRank[key] || 0) + 1 / consistent.length;
      });
    }
  }

  const winners = objs
    .map((o) => ({
      name: o.name,
      strict: strictWins[o.name],
      fractional: fracWins[o.name],
    }))
    .sort((x, y) => y.fractional - x.fractional);

  const keys = new Set([...Object.keys(strictRank), ...Object.keys(fracRank)]);
  const rankings = [...keys]
    .map((key) => ({
      key,
      strict: strictRank[key] || 0,
      fractional: fracRank[key] || 0,
    }))
    .sort((x, y) => y.fractional - x.fractional || y.strict - x.strict);

  return {
    codes: objs.map((o, i) => ({ name: o.name, code: codes[i] })),
    winners,
    winnerTie,
    rankings,
    rankingTie,
    rankingTooBig,
  };
}

// ── Per-object distribution stats (across respondents) ──────────────────────

export type ObjectStat = {
  object_id: string;
  name: string;
  values: number[];
  mean: number;
  sd: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
};

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function objectStats(analysis: AnalyzeResponse): ObjectStat[] {
  const objs = analysis.aggregate ?? analysis.per_respondent[0]?.alphas ?? [];
  return objs.map((o) => {
    const values = analysis.per_respondent.map(
      (r) => r.alphas.find((a) => a.object_id === o.object_id)?.alpha ?? 0,
    );
    const n = values.length || 1;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1);
    const sorted = [...values].sort((a, b) => a - b);
    return {
      object_id: o.object_id,
      name: o.name,
      values,
      mean,
      sd: Math.sqrt(variance),
      min: sorted[0] ?? 0,
      q1: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5),
      q3: quantile(sorted, 0.75),
      max: sorted[sorted.length - 1] ?? 0,
    };
  });
}
