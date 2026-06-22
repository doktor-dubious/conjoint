import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Shuffle } from "lucide-react";

import { VarianceScanPanel } from "@/components/VarianceScanPanel";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  api,
  type DesignResponse,
  type Objective,
  type StoredDesignOut,
  type Trial,
} from "@/lib/api";

const OBJECTIVE_OPTIONS: { value: Objective; label: string }[] = [
  { value: "d-optimal", label: "D-optimal" },
  { value: "min-max-var", label: "Min–max variance" },
];

const HINTS = {
  K: "Number of distinct objects (K) compared. The test plan is generic — objects are placeholders (O1…OK); a survey assigns the real objects later.",
  N: "Total pairwise comparisons (N) a respondent makes. More comparisons add redundancy (the “indirect repetitions”) and shrink the variance of the estimates. Must be ≥ K.",
  objective:
    "Criterion for allocating comparisons across pairs. D-optimal maximises det(X′X) — equivalently the spanning-tree count — for the most precise estimates overall. Min–max variance instead minimises the largest part-worth variance, balancing precision across objects.",
  seed: "Random seed for the design search. The same seed reproduces the same plan; change it (or click Randomize) to explore alternative optimal layouts.",
  maxIter:
    "Upper bound on local-search swap steps (0–5000). Higher values may find a slightly better design at the cost of time; the search stops early once no swap improves the objective.",
  scaleMin:
    "Left end of the bipolar preference slider shown to respondents (default −100 = strongest preference for the left object). It only sets the response scale and does not affect the generated design.",
  scaleMax:
    "Right end of the bipolar preference slider shown to respondents (default +100 = strongest preference for the right object); 0 is indifference. It only sets the response scale and does not affect the generated design.",
  randomize:
    "When on, each respondent sees the comparisons in a randomized order (the underlying design is unchanged). When off, every respondent sees the same fixed order.",
} as const;

const TAB_CLASS = "rounded-none py-2.5";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Generic, reusable object placeholders for a test plan.
function genericNames(K: number): string[] {
  return Array.from({ length: K }, (_, i) => `O${i + 1}`);
}

// 0-indexed object position from a generic "O<n>" label.
function positionOf(name: string): number {
  const m = /^O(\d+)$/.exec(name);
  return m ? Number(m[1]) - 1 : 0;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function downloadDesignCSV(design: StoredDesignOut, filename: string) {
  const header = "trial,left,right,left_id,right_id";
  const rows = design.trials.map(
    (t) =>
      `${t.trial_number},${t.left_name},${t.right_name},${t.left_id},${t.right_id}`,
  );
  const blob = new Blob([[header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function TestPlanNewPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"core" | "scan" | "comparisons">(
    "core",
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [K, setK] = useState(3);
  const [N, setN] = useState(6);
  const [scaleMin, setScaleMin] = useState(-100);
  const [scaleMax, setScaleMax] = useState(100);
  const [objective, setObjective] = useState<Objective>("d-optimal");
  const [seed, setSeed] = useState(0);
  const [maxIter, setMaxIter] = useState(500);
  const [randomizeOrder, setRandomizeOrder] = useState(false);
  // Forbid reverse pairs ({A,B} used as both A->B and B->A). Default on.
  const [forbidReverse, setForbidReverse] = useState(true);

  // Generated comparisons preview (stateless, not yet written to the DB).
  const [preview, setPreview] = useState<DesignResponse | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{
    seed: number;
    structSig: string;
  } | null>(null);
  // Editable presentation order (the user may reorder / shuffle before finalizing).
  const [orderedTrials, setOrderedTrials] = useState<Trial[]>([]);

  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Params that change the *structure* of the comparisons (everything but seed).
  const structSig = useMemo(
    () => JSON.stringify({ K, N, objective, maxIter }),
    [K, N, objective, maxIter],
  );

  const hasPreview = preview !== null;
  const structuralStale =
    hasPreview && previewMeta !== null && previewMeta.structSig !== structSig;
  const validPreview = hasPreview && !structuralStale;
  const seedChanged = previewMeta !== null && seed !== previewMeta.seed;

  // Animated underline that slides under the active tab.
  const tabsListRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const measure = () => {
      const list = tabsListRef.current;
      if (!list) return;
      const el = list.querySelector<HTMLElement>("[data-state='active']");
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeTab, hasPreview]);

  const csvName = useMemo(() => `${slugify(name) || "plan"}.csv`, [name]);

  // ── Create / Reseed: generate the comparisons preview (no DB write) ────────
  async function generatePreview() {
    if (!name.trim()) {
      setError("Name is required.");
      setActiveTab("core");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const out = await api.design({
        K,
        N,
        objective,
        seed,
        forbid_reverse: forbidReverse,
        object_names: genericNames(K),
      });
      setPreview(out);
      setOrderedTrials(out.trials);
      setPreviewMeta({ seed, structSig });
      setActiveTab("comparisons");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  // ── Finalize: write the survey + (manually ordered) design to the DB ───────
  async function finalize() {
    if (!validPreview) return;
    setError(null);
    setFinalizing(true);
    try {
      const survey = await api.createSurvey({
        name,
        description: description || undefined,
        K,
        N,
        scale_min: scaleMin,
        scale_max: scaleMax,
        randomize_order: randomizeOrder,
        object_names: genericNames(K),
      });
      const edges = orderedTrials.map(
        (t) => [positionOf(t.left), positionOf(t.right)] as [number, number],
      );
      const design = await api.storeManualDesign(survey.id, {
        objective,
        seed,
        max_iter: maxIter,
        edges,
      });
      downloadDesignCSV(design, csvName);
      navigate(`/surveys/${survey.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinalizing(false);
    }
  }

  function moveRow(i: number, dir: -1 | 1) {
    setOrderedTrials((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const generateLabel = generating
    ? validPreview
      ? "Reseeding…"
      : "Creating…"
    : validPreview
      ? "Reseed Testplan"
      : "Create test plan";
  const generateDisabled =
    generating || finalizing || (validPreview && !seedChanged);

  return (
    <TooltipProvider>
      <div className="max-w-5xl px-6 py-8">
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v as "core" | "scan" | "comparisons")
          }
          className="gap-0"
        >
          <div className="relative w-full">
            <TabsList
              ref={tabsListRef}
              className="flex h-auto w-full rounded-none border-b border-border bg-transparent p-0"
            >
              <TabsTrigger value="core" className={TAB_CLASS}>
                Test Plan Core
              </TabsTrigger>
              <TabsTrigger value="scan" className={TAB_CLASS}>
                Variance Scan
              </TabsTrigger>
              {hasPreview && (
                <TabsTrigger value="comparisons" className={TAB_CLASS}>
                  Comparisons
                </TabsTrigger>
              )}
            </TabsList>
            <div
              className="absolute bottom-0 h-0.5 bg-foreground transition-all duration-300 ease-in-out"
              style={{ left: indicator.left, width: indicator.width }}
            />
          </div>

          {/* ── Test Plan Core ──────────────────────────────────────────── */}
          <TabsContent value="core" className="mt-6">
            <div className="space-y-5">
              <Field label="Name" htmlFor="name">
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Three-object balanced plan"
                  required
                />
              </Field>

              <Field label="Description" htmlFor="description">
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional notes about this test plan"
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Number of Objects" htmlFor="K" hint={HINTS.K}>
                  <Input
                    id="K"
                    type="number"
                    min={2}
                    value={K}
                    onChange={(e) => setK(Number(e.target.value))}
                  />
                </Field>
                <Field
                  label="Number of Comparisons"
                  htmlFor="N"
                  hint={HINTS.N}
                >
                  <Input
                    id="N"
                    type="number"
                    min={2}
                    value={N}
                    onChange={(e) => setN(Number(e.target.value))}
                  />
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Minimum Scale"
                  htmlFor="scaleMin"
                  hint={HINTS.scaleMin}
                >
                  <Input
                    id="scaleMin"
                    type="number"
                    value={scaleMin}
                    onChange={(e) => setScaleMin(Number(e.target.value))}
                  />
                </Field>
                <Field
                  label="Maximum Scale"
                  htmlFor="scaleMax"
                  hint={HINTS.scaleMax}
                >
                  <Input
                    id="scaleMax"
                    type="number"
                    value={scaleMax}
                    onChange={(e) => setScaleMax(Number(e.target.value))}
                  />
                </Field>
              </div>

              <Field label="Objective" htmlFor="objective" hint={HINTS.objective}>
                <Select
                  value={objective}
                  onValueChange={(v) => setObjective(v as Objective)}
                >
                  <SelectTrigger id="objective">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBJECTIVE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Seed" htmlFor="seed" hint={HINTS.seed}>
                  <div className="relative">
                    <Input
                      id="seed"
                      type="number"
                      min={0}
                      value={seed}
                      onChange={(e) => setSeed(Number(e.target.value))}
                      className="pr-28"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="absolute right-1 top-1/2 h-7 -translate-y-1/2"
                      onClick={() =>
                        setSeed(Math.floor(Math.random() * 1_000_000_000))
                      }
                    >
                      Randomize
                    </Button>
                  </div>
                </Field>
                <Field
                  label="Max iterations"
                  htmlFor="maxIter"
                  hint={HINTS.maxIter}
                >
                  <Input
                    id="maxIter"
                    type="number"
                    min={0}
                    max={5000}
                    value={maxIter}
                    onChange={(e) => setMaxIter(Number(e.target.value))}
                  />
                </Field>
              </div>

              {/* Forbid reverse pairs switch */}
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2.5">
                <Label
                  htmlFor="forbid-reverse"
                  className="flex items-center gap-1.5 text-muted-foreground"
                >
                  <span>Forbid reverse pairs</span>
                  <InfoHint
                    text="Disallow using the same pair in both directions (e.g. O1→O2 and O2→O1). This keeps the comparison graph simple; some K×N combinations become impossible (e.g. 4×6)."
                  />
                </Label>
                <Switch
                  id="forbid-reverse"
                  checked={forbidReverse}
                  onCheckedChange={setForbidReverse}
                />
              </div>

              {/* Randomize order switch */}
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2.5">
                <Label
                  htmlFor="randomize"
                  className="flex items-center gap-1.5 text-muted-foreground"
                >
                  <span>Randomize order per respondent</span>
                  <InfoHint text={HINTS.randomize} />
                </Label>
                <Switch
                  id="randomize"
                  checked={randomizeOrder}
                  onCheckedChange={setRandomizeOrder}
                />
              </div>
            </div>
          </TabsContent>

          {/* ── Variance Scan ───────────────────────────────────────────── */}
          <TabsContent value="scan" className="mt-6">
            <VarianceScanPanel
              defaultK={K}
              defaultNMin={N}
              defaultNMax={N + 6}
              storageKey="new-survey"
              forbidReverse={forbidReverse}
              onApply={(scanK, scanN) => {
                setK(scanK);
                setN(scanN);
                setActiveTab("core");
              }}
            />
          </TabsContent>

          {/* ── Comparisons (preview) ───────────────────────────────────── */}
          {hasPreview && preview && (
            <TabsContent value="comparisons" className="mt-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <Meta label="Seed" value={previewMeta?.seed ?? seed} />
                    <Meta label="N" value={preview.summary.N} />
                    <Meta label="Objective" value={preview.summary.objective} />
                    <Meta
                      label="Spanning trees"
                      value={preview.summary.spanning_trees}
                    />
                    {randomizeOrder && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                        Order randomized per respondent
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOrderedTrials((prev) => shuffle(prev))}
                  >
                    <Shuffle className="h-4 w-4" />
                    Shuffle
                  </Button>
                </div>

                <p className="rounded-md border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                  The comparisons are generated as an <b>Eulerian circuit</b> —
                  each comparison shares an object with the next, so the sequence
                  flows smoothly. Reordering or shuffling the rows below breaks
                  the circuit, but it is <b>statistically harmless</b>: changing
                  the row order leaves the design (X′X), its D-optimality, and all
                  estimate variances exactly unchanged.
                </p>

                {structuralStale && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                    The core parameters changed since this preview was generated.
                    Click <b>Create test plan</b> to regenerate before finalizing.
                  </div>
                )}

                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Left</TableHead>
                        <TableHead>Right</TableHead>
                        <TableHead className="w-24">Pair</TableHead>
                        <TableHead className="w-20 text-right">Move</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderedTrials.map((t, i) => (
                        <TableRow key={`${t.pair}-${i}`}>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            <ObjLabel name={t.left} />
                          </TableCell>
                          <TableCell className="font-medium">
                            <ObjLabel name={t.right} />
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {t.pair}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveRow(i, -1)}
                                disabled={i === 0}
                                aria-label="Move up"
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:invisible"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveRow(i, 1)}
                                disabled={i === orderedTrials.length - 1}
                                aria-label="Move down"
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:invisible"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {error && (
          <div className="mt-5 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Action bar (Core tab only) ── */}
        {activeTab === "core" && (
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/test-plans")}
              disabled={generating || finalizing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={generatePreview}
              disabled={generateDisabled}
              title={
                validPreview && !seedChanged
                  ? "Change the seed to reseed the test plan"
                  : undefined
              }
            >
              {generateLabel}
            </Button>
            {hasPreview && (
              <Button
                type="button"
                onClick={finalize}
                disabled={!validPreview || finalizing || generating}
                title={
                  structuralStale
                    ? "Regenerate the preview before finalizing"
                    : undefined
                }
              >
                {finalizing ? "Finalizing…" : "Finalize Test Plan"}
              </Button>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// Renders a generic object label "O3" as O with a superscript number.
function ObjLabel({ name }: { name: string }) {
  const m = /^O(\d+)$/.exec(name);
  if (!m) return <>{name}</>;
  return (
    <span>
      O<sup className="text-[0.7em]">{m[1]}</sup>
    </span>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="text-muted-foreground">
      {label}: <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="flex items-center gap-1.5 text-muted-foreground"
      >
        <span>{label}</span>
        {hint && <InfoHint text={hint} />}
      </Label>
      {children}
    </div>
  );
}
