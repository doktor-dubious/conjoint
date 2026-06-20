import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api, type ScanResponse } from "@/lib/api";

export function ScanPage() {
  const [K, setK] = useState(10);
  const [nMin, setNMin] = useState(10);
  const [nMax, setNMax] = useState(16);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const out = await api.scan({ K, N_min: nMin, N_max: nMax });
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Variance scan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          For a fixed number of objects K, see how Var(α) shrinks as the number
          of comparisons N grows.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <NumberField label="K (objects)" value={K} onChange={setK} min={2} />
        <NumberField label="N min" value={nMin} onChange={setNMin} min={2} />
        <NumberField label="N max" value={nMax} onChange={setNMax} min={2} />
        <Button onClick={run} disabled={loading}>
          {loading ? "Running…" : "Run scan"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <Th>N</Th>
                <Th>res df</Th>
                <Th>min Var</Th>
                <Th>max Var</Th>
                <Th>mean Var</Th>
                <Th>ratio</Th>
                <Th>spanning trees</Th>
                <Th>note</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.N}
                  className={
                    r.feasible
                      ? "border-t"
                      : "border-t bg-muted/30 text-muted-foreground"
                  }
                >
                  <Td>{r.N}</Td>
                  <Td>{r.residual_df}</Td>
                  <Td>{fmt(r.min_var)}</Td>
                  <Td>{fmt(r.max_var)}</Td>
                  <Td>{fmt(r.mean_var)}</Td>
                  <Td>{fmt(r.ratio)}</Td>
                  <Td>{r.spanning_trees ?? "—"}</Td>
                  <Td>{r.note || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 tabular-nums">{children}</td>;
}

function fmt(v: number | null) {
  return v === null ? "—" : v.toFixed(4);
}
