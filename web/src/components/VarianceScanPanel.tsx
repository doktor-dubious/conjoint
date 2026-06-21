import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Focus,
  Search,
  Star,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api, type ScanResponse, type ScanRow } from "@/lib/api";

const ITEMS_PER_PAGE = 10;

const INPUT_HINTS = {
  K: "Number of objects (K) on the preference scale. Held fixed while N is varied across the scan.",
  nMin: "Smallest number of pairwise comparisons (N) to evaluate. Must be ≥ K.",
  nMax: "Largest number of comparisons (N) to evaluate. The scan builds an optimal design for every N from N min to N max.",
} as const;

type SortField =
  | "N"
  | "resDf"
  | "minVar"
  | "maxVar"
  | "meanVar"
  | "ratio"
  | "spanningTrees"
  | "starred";

type Column = {
  field: SortField;
  label: string;
  hint: string;
  value: (r: ScanRow) => number | null;
  render: (r: ScanRow) => React.ReactNode;
};

const COLUMNS: Column[] = [
  {
    field: "N",
    label: "N",
    hint: "Number of pairwise comparisons in the design.",
    value: (r) => r.N,
    render: (r) => r.N,
  },
  {
    field: "resDf",
    label: "res df",
    hint: "Residual degrees of freedom (N − K): spare observations beyond the K parameters. These give the redundancy — the “indirect repetitions” — used to test model fit and separate model error from measurement noise.",
    value: (r) => r.residual_df,
    render: (r) => r.residual_df,
  },
  {
    field: "minVar",
    label: "min Var",
    hint: "Smallest variance among the estimated part-worths (α), scaled to σ² = 1. Lower means more precise estimates.",
    value: (r) => r.min_var,
    render: (r) => fmt(r.min_var),
  },
  {
    field: "maxVar",
    label: "max Var",
    hint: "Largest variance among the estimated part-worths (α). Lower means more precise estimates.",
    value: (r) => r.max_var,
    render: (r) => fmt(r.max_var),
  },
  {
    field: "meanVar",
    label: "mean Var",
    hint: "Average variance of the part-worth estimates; shrinks as N grows.",
    value: (r) => r.mean_var,
    render: (r) => fmt(r.mean_var),
  },
  {
    field: "ratio",
    label: "ratio",
    hint: "max Var ÷ min Var — how balanced precision is across objects. 1.0 means every object is estimated equally well.",
    value: (r) => r.ratio,
    render: (r) => fmt(r.ratio),
  },
  {
    field: "spanningTrees",
    label: "spanning trees",
    hint: "Number of spanning trees in the comparison graph (Matrix-Tree theorem: the determinant of the reduced Laplacian). More spanning trees ⇒ a better-connected, more D-optimal design.",
    value: (r) => r.spanning_trees,
    render: (r) => r.spanning_trees ?? "—",
  },
];

const NOTE_HINT =
  "Why a given N is infeasible: if no balanced design exists for that N (e.g. N = K + 1 requires K ≥ 3) the row is greyed out and the reason appears here; blank for feasible N.";

// Persisted state so inputs, results, stars and selection survive tab switches.
type Persisted = {
  K: number;
  nMin: number;
  nMax: number;
  data: ScanResponse | null;
  starred: number[];
  selected: number[];
};

function loadPersisted(key: string): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

export function VarianceScanPanel({
  defaultK = 10,
  defaultNMin = 10,
  defaultNMax = 16,
  storageKey = "default",
  onApply,
}: {
  defaultK?: number;
  defaultNMin?: number;
  defaultNMax?: number;
  storageKey?: string;
  // When provided, an "Apply" button per row pushes (K, N) to the caller.
  onApply?: (K: number, N: number) => void;
}) {
  const key = `conjoint:scan:${storageKey}`;
  const [initial] = useState(() => loadPersisted(key));

  const [K, setK] = useState(initial.K ?? defaultK);
  const [nMin, setNMin] = useState(initial.nMin ?? defaultNMin);
  const [nMax, setNMax] = useState(initial.nMax ?? defaultNMax);
  const [data, setData] = useState<ScanResponse | null>(initial.data ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Table state
  const [selectedNs, setSelectedNs] = useState<Set<number>>(
    () => new Set(initial.selected ?? []),
  );
  const [starredNs, setStarredNs] = useState<Set<number>>(
    () => new Set(initial.starred ?? []),
  );
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("N");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  // Persist inputs, results, stars and selection.
  useEffect(() => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          K,
          nMin,
          nMax,
          data,
          starred: Array.from(starredNs),
          selected: Array.from(selectedNs),
        }),
      );
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [key, K, nMin, nMax, data, starredNs, selectedNs]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const out = await api.scan({ K, N_min: nMin, N_max: nMax });
      setData(out);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const rows = data?.rows ?? [];
  const recommendedN = useMemo(() => computeRecommendedN(rows), [rows]);

  const filtered = useMemo(() => {
    let items = showOnlySelected
      ? rows.filter((r) => selectedNs.has(r.N))
      : rows;

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((r) => {
        const hay = [
          r.N,
          r.residual_df,
          r.min_var,
          r.max_var,
          r.mean_var,
          r.ratio,
          r.spanning_trees,
          r.note,
          r.feasible ? "" : "infeasible",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const col = COLUMNS.find((c) => c.field === sortField);
    return [...items].sort((a, b) => {
      let cmp: number;
      if (sortField === "starred") {
        cmp = (starredNs.has(a.N) ? 1 : 0) - (starredNs.has(b.N) ? 1 : 0);
      } else {
        const av = col!.value(a);
        const bv = col!.value(b);
        // nulls (infeasible) always sort last regardless of direction
        if (av === null && bv === null) cmp = 0;
        else if (av === null) return 1;
        else if (bv === null) return -1;
        else cmp = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortField, sortDir, showOnlySelected, selectedNs, starredNs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  const selectedRows = rows.filter((r) => selectedNs.has(r.N));

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function toggleStar(n: number) {
    setStarredNs((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  }

  function toggleSelect(n: number) {
    setSelectedNs((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  }

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((r) => selectedNs.has(r.N));
  const somePageSelected = pageItems.some((r) => selectedNs.has(r.N));

  function handleHeaderCheckbox() {
    setSelectedNs((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageItems.forEach((r) => next.delete(r.N));
      else pageItems.forEach((r) => next.add(r.N));
      return next;
    });
  }

  const SortButton = ({ field, label }: { field: SortField; label: string }) => {
    const active = sortField === field;
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="flex items-center gap-1 font-medium transition-colors hover:text-foreground"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          For a fixed number of objects K, see how Var(α) shrinks as the number
          of comparisons N grows.
        </p>

        {/* Inputs */}
        <div className="flex flex-wrap items-end gap-4">
          <NumberField
            label="K (objects)"
            hint={INPUT_HINTS.K}
            value={K}
            onChange={setK}
            min={2}
          />
          <NumberField
            label="N min"
            hint={INPUT_HINTS.nMin}
            value={nMin}
            onChange={setNMin}
            min={2}
          />
          <NumberField
            label="N max"
            hint={INPUT_HINTS.nMax}
            value={nMax}
            onChange={setNMax}
            min={2}
          />
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
          <div className="space-y-3">
            {/* Toolbar: result count + search */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {filtered.length} result{filtered.length === 1 ? "" : "s"}
                {showOnlySelected && " (selected only)"}
              </span>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 w-52 pl-8 text-xs"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-12 pl-4">
                      <div className="flex items-center gap-0.5">
                        <Checkbox
                          checked={
                            allPageSelected
                              ? true
                              : somePageSelected
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={handleHeaderCheckbox}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-5 w-4 items-center justify-center transition-colors hover:text-foreground"
                              aria-label="Selection options"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onClick={() =>
                                setSelectedNs(new Set(filtered.map((r) => r.N)))
                              }
                            >
                              Select all
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setSelectedNs(
                                  new Set(
                                    rows
                                      .filter((r) => starredNs.has(r.N))
                                      .map((r) => r.N),
                                  ),
                                )
                              }
                            >
                              Select starred
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSelectedNs(new Set())}
                            >
                              Clear selection
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableHead>

                    {COLUMNS.map((c) => (
                      <TableHead key={c.field}>
                        <div className="flex items-center gap-1">
                          <SortButton field={c.field} label={c.label} />
                          <InfoHint text={c.hint} />
                        </div>
                      </TableHead>
                    ))}

                    <TableHead>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">note</span>
                        <InfoHint text={NOTE_HINT} />
                      </div>
                    </TableHead>

                    {onApply && <TableHead className="w-16" />}

                    <TableHead className="w-10 text-center">
                      <button
                        type="button"
                        onClick={() => handleSort("starred")}
                        className="mx-auto flex items-center gap-1 transition-colors hover:text-foreground"
                        title="Sort by starred"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            sortField === "starred" ? "" : "opacity-40",
                          )}
                        />
                        {sortField === "starred" &&
                          (sortDir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          ))}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {pageItems.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={COLUMNS.length + 3 + (onApply ? 1 : 0)}
                        className="h-20 text-center text-sm text-muted-foreground"
                      >
                        No rows match “{search}”.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageItems.map((r) => (
                      <TableRow
                        key={r.N}
                        data-state={selectedNs.has(r.N) ? "selected" : undefined}
                        onClick={() => toggleSelect(r.N)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          toggleStar(r.N);
                        }}
                        className={cn(
                          "cursor-pointer",
                          !r.feasible && "text-muted-foreground",
                          r.N === recommendedN && "bg-primary/5",
                        )}
                      >
                        <TableCell
                          className="pl-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedNs.has(r.N)}
                            onCheckedChange={() => toggleSelect(r.N)}
                          />
                        </TableCell>
                        {COLUMNS.map((c) => (
                          <TableCell key={c.field} className="tabular-nums">
                            {c.render(r)}
                          </TableCell>
                        ))}
                        <TableCell className="text-xs text-muted-foreground">
                          {r.N === recommendedN ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                                Recommended
                              </span>
                              <InfoHint text={REC_HINT} />
                            </span>
                          ) : (
                            r.note || "—"
                          )}
                        </TableCell>
                        {onApply && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => onApply(data.K, r.N)}
                            >
                              Apply
                            </Button>
                          </TableCell>
                        )}
                        <TableCell
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => toggleStar(r.N)}
                            className="transition-colors hover:text-amber-400"
                            aria-label="Toggle star"
                          >
                            <Star
                              className={cn(
                                "h-4 w-4",
                                starredNs.has(r.N)
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground",
                              )}
                            />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of{" "}
                  {filtered.length}
                </span>
                {totalPages > 1 && (
                  <Pagination className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={safePage === 1}
                        />
                      </PaginationItem>
                      {buildPaginationPages(safePage, totalPages).map((p, i) =>
                        p === "ellipsis" ? (
                          <PaginationItem key={`e${i}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={p}>
                            <PaginationLink
                              isActive={safePage === p}
                              onClick={() => setPage(p)}
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                          }
                          disabled={safePage === totalPages}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            )}

            {/* Selection bar (controls only — row data is already in the table) */}
            {selectedRows.length > 0 && (
              <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {selectedRows.length} of {rows.length} selected
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowOnlySelected((v) => !v)}
                    title={showOnlySelected ? "Show all" : "Show only selected"}
                  >
                    <Focus
                      className={cn(
                        "h-4 w-4",
                        showOnlySelected && "text-primary",
                      )}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setSelectedNs(new Set());
                      setShowOnlySelected(false);
                    }}
                    title="Clear selection"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
}: {
  label: string;
  hint?: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{label}</span>
        {hint && <InfoHint text={hint} />}
      </Label>
      <Input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24"
      />
    </div>
  );
}

function buildPaginationPages(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (
    let p = Math.max(2, current - 1);
    p <= Math.min(total - 1, current + 1);
    p++
  )
    pages.push(p);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

// The recommended design: the smallest feasible, fully balanced (ratio = 1.0)
// row that still has residual df ≥ 1 — the fewest comparisons that are both
// balanced and let you test model fit. Falls back to the most balanced
// feasible row when no perfectly balanced one exists.
function computeRecommendedN(rows: ScanRow[]): number | null {
  const feasible = rows.filter(
    (r) => r.feasible && r.mean_var !== null && r.residual_df >= 1,
  );
  if (feasible.length === 0) return null;

  const balanced = feasible.filter(
    (r) => r.ratio !== null && r.ratio <= 1.0000001,
  );
  if (balanced.length > 0) {
    return balanced.reduce((best, r) => (r.N < best.N ? r : best)).N;
  }

  const sorted = [...feasible].sort(
    (a, b) =>
      (a.ratio ?? Infinity) - (b.ratio ?? Infinity) ||
      (a.mean_var ?? Infinity) - (b.mean_var ?? Infinity) ||
      a.N - b.N,
  );
  return sorted[0].N;
}

const REC_HINT =
  "Recommended: the smallest fully balanced design (ratio = 1.0) with res df ≥ 1 — the fewest comparisons that are balanced and still let you test model fit. Larger N lowers variance further at the cost of respondent effort.";

function fmt(v: number | null) {
  return v === null ? "—" : v.toFixed(4);
}
