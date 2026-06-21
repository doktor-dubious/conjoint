import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaximizeToggle } from "@/components/ui/maximize-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  api,
  type StoredDesignOut,
  type StoredTrialOut,
  type SurveyOut,
} from "@/lib/api";

const TAB_CLASS = "rounded-none py-2.5";

type DetailTab = "details" | "core" | "comparisons" | "actions";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const PLAN_COLUMNS: DataTableColumn<SurveyOut>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    sortValue: (p) => p.name.toLowerCase(),
    render: (p) => <span className="font-medium">{p.name}</span>,
  },
  {
    key: "K",
    header: "Objects",
    sortable: true,
    sortValue: (p) => p.K,
    render: (p) => p.K,
    className: "tabular-nums",
    headClassName: "w-24",
  },
  {
    key: "N",
    header: "Comparisons",
    sortable: true,
    sortValue: (p) => p.N,
    render: (p) => p.N,
    className: "tabular-nums",
    headClassName: "w-28",
  },
  {
    key: "randomize",
    header: "Randomize",
    render: (p) => (
      <span className="text-muted-foreground">
        {p.randomize_order ? "Yes" : "No"}
      </span>
    ),
    headClassName: "w-24",
  },
  {
    key: "created",
    header: "Created",
    sortable: true,
    sortValue: (p) => p.created_at,
    render: (p) => (
      <span className="text-muted-foreground">
        {new Date(p.created_at).toLocaleDateString()}
      </span>
    ),
    headClassName: "w-32",
  },
];

export function TestPlansPage() {
  const [plans, setPlans] = useState<SurveyOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SurveyOut | null>(null);
  const [design, setDesign] = useState<StoredDesignOut | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [maximized, setMaximized] = useState(
    () => localStorage.getItem("testplans_detail_max") === "1",
  );
  useEffect(() => {
    localStorage.setItem("testplans_detail_max", maximized ? "1" : "0");
  }, [maximized]);

  // Dialogs
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  // Editable detail fields (Details tab), synced to the selected plan.
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  useEffect(() => {
    setEditName(selected?.name ?? "");
    setEditDesc(selected?.description ?? "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveField(patch: { name?: string; description?: string }) {
    if (!selected) return;
    try {
      const updated = await api.updateSurvey(selected.id, patch);
      setSelected(updated);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    api
      .listSurveys({ testPlan: true })
      .then(setPlans)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function selectPlan(plan: SurveyOut) {
    setSelected(plan);
    setDetailTab("details");
    setDesign(null);
    try {
      const designs = await api.listDesigns(plan.id);
      setDesign(designs[0] ?? null);
    } catch {
      setDesign(null);
    }
  }

  // Object position map → generic "O<n>" labels (uniform across all plans,
  // regardless of the names stored at creation time).
  const posById = useMemo(() => {
    const m = new Map<string, number>();
    selected?.objects.forEach((o) => m.set(o.id, o.position));
    return m;
  }, [selected]);
  const oLabel = (objId: string) => `O${(posById.get(objId) ?? 0) + 1}`;

  const comparisonColumns = useMemo<DataTableColumn<StoredTrialOut>[]>(() => {
    const label = (objId: string) => `O${(posById.get(objId) ?? 0) + 1}`;
    return [
      {
        key: "n",
        header: "#",
        sortable: true,
        sortValue: (t) => t.trial_number,
        render: (t) => (
          <span className="tabular-nums text-muted-foreground">
            {t.trial_number}
          </span>
        ),
        headClassName: "w-12",
      },
      {
        key: "left",
        header: "Left",
        sortable: true,
        sortValue: (t) => posById.get(t.left_id) ?? 0,
        render: (t) => (
          <span className="font-medium">
            <ObjLabel name={label(t.left_id)} />
          </span>
        ),
      },
      {
        key: "right",
        header: "Right",
        sortable: true,
        sortValue: (t) => posById.get(t.right_id) ?? 0,
        render: (t) => (
          <span className="font-medium">
            <ObjLabel name={label(t.right_id)} />
          </span>
        ),
      },
    ];
  }, [posById]);

  // Detail-tab sliding underline.
  const detailTabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const measure = () => {
      const list = detailTabsRef.current;
      if (!list) return;
      const el = list.querySelector<HTMLElement>("[data-state='active']");
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [detailTab, selected]);

  function openDelete() {
    setUnderstood(false);
    setConfirmText("");
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!selected) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteSurvey(selected.id);
      setPlans((prev) => prev.filter((p) => p.id !== selected.id));
      setSelected(null);
      setDesign(null);
      setDeleteOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteError(
        /409|respondent/i.test(msg)
          ? "This test plan has already been used (it has respondents) and cannot be deleted."
          : msg,
      );
    } finally {
      setDeleting(false);
    }
  }

  function openSave() {
    setSaveName(`${slugify(selected?.name ?? "") || "plan"}.csv`);
    setSaveOpen(true);
  }

  function doSave() {
    if (!design) return;
    const header = "trial,left,right,left_id,right_id";
    const rows = design.trials.map(
      (t) =>
        `${t.trial_number},${oLabel(t.left_id)},${oLabel(t.right_id)},${t.left_id},${t.right_id}`,
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = saveName.endsWith(".csv") ? saveName : `${saveName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setSaveOpen(false);
  }

  return (
    <div className="w-full px-6 py-8">
      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Master table ── */}
      <div className={cn(selected && maximized && "hidden")}>
        <DataTable
          rows={plans}
          columns={PLAN_COLUMNS}
          getRowId={(p) => p.id}
          getSearchText={(p) => p.name}
          activeId={selected?.id ?? null}
          onRowClick={selectPlan}
          loading={loading}
          emptyText="No test plans yet."
          hideCount
          initialSortKey="created"
          initialSortDir="desc"
        />
      </div>

      {/* ── Detail pane ── */}
      {selected && (
        <div className={cn(maximized ? "" : "mt-8 border-t pt-6")}>
          <Tabs
            value={detailTab}
            onValueChange={(v) => setDetailTab(v as DetailTab)}
            className="gap-0"
          >
            <div className="relative w-full">
              <TabsList
                ref={detailTabsRef}
                className="flex h-auto w-full rounded-none border-b border-border bg-transparent p-0"
              >
                <TabsTrigger value="details" className={TAB_CLASS}>
                  Details
                </TabsTrigger>
                <TabsTrigger value="core" className={TAB_CLASS}>
                  Core
                </TabsTrigger>
                <TabsTrigger value="comparisons" className={TAB_CLASS}>
                  Comparisons
                </TabsTrigger>
                <TabsTrigger value="actions" className={TAB_CLASS}>
                  Actions
                </TabsTrigger>
                <MaximizeToggle
                  maximized={maximized}
                  onToggle={() => setMaximized((v) => !v)}
                  className="ml-auto mb-1.5 pl-3 pr-2"
                />
              </TabsList>
              <div
                className="absolute bottom-0 h-0.5 bg-foreground transition-all duration-300 ease-in-out"
                style={{ left: indicator.left, width: indicator.width }}
              />
            </div>

            {/* Details */}
            <TabsContent value="details" className="mt-6 max-w-2xl space-y-4">
              <StatRow label="ID" value={<CopyId id={selected.id} />} />
              <div className="space-y-1.5">
                <Label htmlFor="d-name" className="text-muted-foreground">
                  Name
                </Label>
                <Input
                  id="d-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => {
                    const v = editName.trim();
                    if (v && v !== selected.name) saveField({ name: v });
                    else setEditName(selected.name);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-desc" className="text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  id="d-desc"
                  value={editDesc}
                  placeholder="Optional notes about this test plan"
                  onChange={(e) => setEditDesc(e.target.value)}
                  onBlur={() => {
                    if (editDesc !== (selected.description ?? ""))
                      saveField({ description: editDesc });
                  }}
                />
              </div>
            </TabsContent>

            {/* Core (read-only) */}
            <TabsContent value="core" className="mt-6 max-w-2xl">
              <StatRow label="Number of objects" value={selected.K} />
              <StatRow label="Number of comparisons" value={selected.N} />
              <StatRow label="Maximum Scale" value={selected.scale_max} />
              <StatRow label="Minimum Scale" value={selected.scale_min} />
              <StatRow
                label="Objective"
                value={design ? design.objective : "—"}
              />
              <StatRow label="Seed" value={design ? design.seed : "—"} />
              <StatRow
                label="Maximum Iterations"
                value={design ? design.max_iter : "—"}
              />
            </TabsContent>

            {/* Comparisons (read-only data table) */}
            <TabsContent value="comparisons" className="mt-6">
              {!design ? (
                <p className="text-sm text-muted-foreground">
                  No design found for this test plan.
                </p>
              ) : (
                <DataTable
                  rows={design.trials}
                  columns={comparisonColumns}
                  getRowId={(t) => t.id}
                  getSearchText={(t) =>
                    `${t.trial_number} ${oLabel(t.left_id)} ${oLabel(t.right_id)}`
                  }
                  emptyText="No comparisons."
                  initialSortKey="n"
                />
              )}
            </TabsContent>

            {/* Actions */}
            <TabsContent value="actions" className="mt-6 max-w-2xl space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    Delete Test Plan
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Permanently delete this test plan and its design. This action
                    cannot be undone. Only plans not yet used by a respondent can
                    be deleted.
                  </p>
                </div>
                <Button variant="destructive" onClick={openDelete}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-semibold">Save to File</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Download the comparisons as a CSV test plan.
                  </p>
                </div>
                <Button variant="outline" onClick={openSave} disabled={!design}>
                  <Download className="h-4 w-4" />
                  Save to File
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ── Delete dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Are you absolutely sure?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <b>{selected?.name}</b> and its design from the system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-destructive/30 p-3">
              <Checkbox
                checked={understood}
                onCheckedChange={(v) => setUnderstood(!!v)}
                className="mt-0.5 shrink-0"
              />
              <span className="text-sm">
                I understand that this will permanently delete this test plan and
                its design.
              </span>
            </label>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Type “delete” to confirm
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="delete"
              />
            </div>
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={
                !understood ||
                confirmText.trim().toLowerCase() !== "delete" ||
                deleting
              }
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Save-to-file dialog ── */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save to file</DialogTitle>
            <DialogDescription>
              Choose a filename for the CSV test plan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-2">
            <Label htmlFor="saveName" className="text-xs text-muted-foreground">
              Filename
            </Label>
            <Input
              id="saveName"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="plan.csv"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doSave} disabled={!saveName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground">{id}</span>
      <button
        type="button"
        aria-label="Copy ID"
        onClick={() => {
          navigator.clipboard?.writeText(String(id));
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary transition-transform duration-200" />
        ) : (
          <Copy className="h-3.5 w-3.5 transition-transform duration-200 hover:scale-110" />
        )}
      </button>
    </span>
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
