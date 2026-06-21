import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ListChecks, Trash2, Upload } from "lucide-react";

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
  ObjLabel,
  TestPlanObjectsPanel,
  type ObjectValues,
} from "@/components/TestPlanObjectsPanel";
import {
  api,
  type StoredDesignOut,
  type StoredTrialOut,
  type SurveyDataRow,
  type SurveyOut,
} from "@/lib/api";

const TAB_CLASS = "rounded-none py-2.5";

type DetailTab =
  | "details"
  | "core"
  | "objects"
  | "comparisons"
  | "data"
  | "actions";

const SURVEY_DATA_COLUMNS: DataTableColumn<SurveyDataRow>[] = [
  {
    key: "id",
    header: "Id",
    sortable: true,
    sortValue: (r) => r.external_id ?? "",
    render: (r) => (
      <span className="font-mono text-xs">{r.external_id ?? "—"}</span>
    ),
  },
  {
    key: "trial",
    header: "#",
    sortable: true,
    sortValue: (r) => r.trial_number,
    render: (r) => (
      <span className="tabular-nums text-muted-foreground">
        {r.trial_number}
      </span>
    ),
    headClassName: "w-12",
  },
  {
    key: "left",
    header: "Left",
    sortable: true,
    sortValue: (r) => r.left_name.toLowerCase(),
    render: (r) => (
      <span className="font-medium">
        <ObjLabel name={r.left_name} />
      </span>
    ),
  },
  {
    key: "right",
    header: "Right",
    sortable: true,
    sortValue: (r) => r.right_name.toLowerCase(),
    render: (r) => (
      <span className="font-medium">
        <ObjLabel name={r.right_name} />
      </span>
    ),
  },
  {
    key: "value",
    header: "Value",
    sortable: true,
    sortValue: (r) => r.raw_value,
    render: (r) => (
      <span className="tabular-nums">{r.raw_value.toFixed(2)}</span>
    ),
    headClassName: "w-24",
  },
];

const SURVEY_COLUMNS: DataTableColumn<SurveyOut>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    sortValue: (s) => s.name.toLowerCase(),
    render: (s) => <span className="font-medium">{s.name}</span>,
  },
  {
    key: "K",
    header: "Objects",
    sortable: true,
    sortValue: (s) => s.K,
    render: (s) => s.K,
    className: "tabular-nums",
    headClassName: "w-24",
  },
  {
    key: "N",
    header: "Comparisons",
    sortable: true,
    sortValue: (s) => s.N,
    render: (s) => s.N,
    className: "tabular-nums",
    headClassName: "w-28",
  },
  {
    key: "randomize",
    header: "Randomize",
    render: (s) => (
      <span className="text-muted-foreground">
        {s.randomize_order ? "Yes" : "No"}
      </span>
    ),
    headClassName: "w-24",
  },
  {
    key: "created",
    header: "Created",
    sortable: true,
    sortValue: (s) => s.created_at,
    render: (s) => (
      <span className="text-muted-foreground">
        {new Date(s.created_at).toLocaleDateString()}
      </span>
    ),
    headClassName: "w-32",
  },
];

const COMPARISON_COLUMNS: DataTableColumn<StoredTrialOut>[] = [
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
    sortValue: (t) => t.left_name.toLowerCase(),
    render: (t) => (
      <span className="font-medium">
        <ObjLabel name={t.left_name} />
      </span>
    ),
  },
  {
    key: "right",
    header: "Right",
    sortable: true,
    sortValue: (t) => t.right_name.toLowerCase(),
    render: (t) => (
      <span className="font-medium">
        <ObjLabel name={t.right_name} />
      </span>
    ),
  },
];

export function SurveyListPage() {
  const [surveys, setSurveys] = useState<SurveyOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SurveyOut | null>(null);
  const [design, setDesign] = useState<StoredDesignOut | null>(null);
  const [surveyData, setSurveyData] = useState<SurveyDataRow[]>([]);
  const [sourcePlanName, setSourcePlanName] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [maximized, setMaximized] = useState(
    () => localStorage.getItem("surveys_detail_max") === "1",
  );
  useEffect(() => {
    localStorage.setItem("surveys_detail_max", maximized ? "1" : "0");
  }, [maximized]);

  // Read-only object definitions for the shared panel (from stored objects).
  const objectValues = useMemo<Record<string, ObjectValues>>(() => {
    const m: Record<string, ObjectValues> = {};
    selected?.objects.forEach((o) => {
      m[o.id] = {
        name: o.name,
        text: o.text,
        description: o.description,
        image: o.image,
      };
    });
    return m;
  }, [selected]);

  // Dialogs
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [importNote, setImportNote] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected) return;
    setImporting(true);
    setImportNote(`Importing “${file.name}”…`);
    try {
      const r = await api.importResponses(selected.id, file);
      const head =
        `Imported “${file.name}”: ${r.responses_added} response(s) added ` +
        `(${r.respondents_added} new respondent(s); ${r.total_responses} total).` +
        (r.skipped ? ` ${r.skipped} row(s) skipped.` : "");
      const tail = r.errors.length ? ` — ${r.errors[0]}` : "";
      setImportNote(head + tail);
    } catch (err) {
      setImportNote(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setImporting(false);
    }
  }

  // Editable detail fields (Details tab).
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
      setSurveys((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    api
      .listSurveys({ testPlan: false })
      .then(setSurveys)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function selectSurvey(survey: SurveyOut) {
    setSelected(survey);
    setDetailTab("details");
    setDesign(null);
    setSurveyData([]);
    setSourcePlanName(null);
    try {
      const designs = await api.listDesigns(survey.id);
      setDesign(designs[0] ?? null);
    } catch {
      setDesign(null);
    }
    try {
      setSurveyData(await api.listResponses(survey.id));
    } catch {
      setSurveyData([]);
    }
    if (survey.source_test_plan_id) {
      try {
        const plan = await api.getSurvey(survey.source_test_plan_id);
        setSourcePlanName(plan.name);
      } catch {
        setSourcePlanName(null);
      }
    }
  }

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
      setSurveys((prev) => prev.filter((s) => s.id !== selected.id));
      setSelected(null);
      setDesign(null);
      setDeleteOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteError(
        /409|respondent/i.test(msg)
          ? "This survey has responses collected and cannot be deleted."
          : msg,
      );
    } finally {
      setDeleting(false);
    }
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
          rows={surveys}
          columns={SURVEY_COLUMNS}
          getRowId={(s) => s.id}
          getSearchText={(s) => s.name}
          activeId={selected?.id ?? null}
          onRowClick={selectSurvey}
          loading={loading}
          emptyText="No saved surveys yet."
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
                  Test Plan
                </TabsTrigger>
                <TabsTrigger value="objects" className={TAB_CLASS}>
                  Test Plan Objects
                </TabsTrigger>
                <TabsTrigger value="comparisons" className={TAB_CLASS}>
                  Comparisons
                </TabsTrigger>
                <TabsTrigger value="data" className={TAB_CLASS}>
                  Survey Data
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
                  placeholder="Optional notes about this survey"
                  onChange={(e) => setEditDesc(e.target.value)}
                  onBlur={() => {
                    if (editDesc !== (selected.description ?? ""))
                      saveField({ description: editDesc });
                  }}
                />
              </div>
            </TabsContent>

            {/* Test Plan (read-only) */}
            <TabsContent value="core" className="mt-6 max-w-2xl">
              <StatRow
                label="Test plan"
                value={
                  sourcePlanName ??
                  (selected.source_test_plan_id ? "…" : "—")
                }
              />
              <StatRow label="Number of objects" value={selected.K} />
              <StatRow label="Number of comparisons" value={selected.N} />
              <StatRow label="Maximum Scale" value={selected.scale_max} />
              <StatRow label="Minimum Scale" value={selected.scale_min} />
              <StatRow
                label="Randomize order"
                value={selected.randomize_order ? "Yes" : "No"}
              />
              <StatRow
                label="Source test plan ID"
                value={
                  selected.source_test_plan_id ? (
                    <CopyId id={selected.source_test_plan_id} />
                  ) : (
                    "—"
                  )
                }
              />
              <StatRow
                label="Objective"
                value={design ? design.objective : "—"}
              />
              <StatRow label="Seed" value={design ? design.seed : "—"} />
            </TabsContent>

            {/* Test Plan Objects (concrete definitions, read-only) */}
            <TabsContent value="objects" className="mt-6">
              <TestPlanObjectsPanel
                objects={selected.objects}
                valuesById={objectValues}
              />
            </TabsContent>

            {/* Comparisons (read-only data table) */}
            <TabsContent value="comparisons" className="mt-6">
              {!design ? (
                <p className="text-sm text-muted-foreground">
                  No design found for this survey.
                </p>
              ) : (
                <DataTable
                  rows={design.trials}
                  columns={COMPARISON_COLUMNS}
                  getRowId={(t) => t.id}
                  getSearchText={(t) =>
                    `${t.trial_number} ${t.left_name} ${t.right_name}`
                  }
                  emptyText="No comparisons."
                  initialSortKey="n"
                />
              )}
            </TabsContent>

            {/* Survey Data (all collected/imported responses) */}
            <TabsContent value="data" className="mt-6">
              <DataTable
                rows={surveyData}
                columns={SURVEY_DATA_COLUMNS}
                getRowId={(r) => r.id}
                getSearchText={(r) =>
                  `${r.external_id ?? ""} ${r.trial_number} ${r.left_name} ${r.right_name} ${r.raw_value}`
                }
                emptyText="No response data yet. Import data from the Actions tab."
                initialSortKey="id"
              />
            </TabsContent>

            {/* Actions */}
            <TabsContent value="actions" className="mt-6 max-w-2xl space-y-4">
              {/* Delete (first) */}
              <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    Delete Survey
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Permanently delete this survey and its design. This action
                    cannot be undone. Surveys with collected responses cannot be
                    deleted.
                  </p>
                </div>
                <Button variant="destructive" onClick={openDelete}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>

              {/* Import survey data */}
              <div className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-semibold">Import Survey data</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Upload collected responses for this survey from a file.
                  </p>
                  {importNote && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {importNote}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                >
                  <Upload className="h-4 w-4" />
                  {importing ? "Importing…" : "Import data"}
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,.xlsx,.json"
                  className="hidden"
                  onChange={onImportFile}
                />
              </div>

              {/* Collect responses (bottom) */}
              <div className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div>
                  <p className="text-sm font-semibold">Collect Responses</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Open the participant view or review the analysis.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline">
                    <Link to={`/surveys/${selected.id}/participate`}>
                      <ListChecks className="h-4 w-4" />
                      Participate
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/surveys/${selected.id}/results`}>Results</Link>
                  </Button>
                </div>
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
                I understand that this will permanently delete this survey and
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
