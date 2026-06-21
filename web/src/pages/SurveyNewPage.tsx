import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, type ObjectOut, type SurveyOut } from "@/lib/api";

const TAB_CLASS = "rounded-none py-2.5";

type TabKey = "core" | "plan" | "objects" | "respondent";

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

const OBJECT_COLUMNS: DataTableColumn<ObjectOut>[] = [
  {
    key: "pos",
    header: "#",
    sortable: true,
    sortValue: (o) => o.position,
    render: (o) => o.position + 1,
    className: "tabular-nums text-muted-foreground",
    headClassName: "w-16",
  },
  {
    key: "name",
    header: "Name",
    sortable: true,
    sortValue: (o) => o.name.toLowerCase(),
    render: (o) => <span className="font-medium">{o.name}</span>,
  },
];

export function SurveyNewPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabKey>("core");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [plans, setPlans] = useState<SurveyOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SurveyOut | null>(null);

  useEffect(() => {
    api
      .listSurveys()
      .then(setPlans)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

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
  }, [activeTab]);

  return (
    <div className="w-full px-6 py-8">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabKey)}
        className="gap-0"
      >
        <div className="relative w-full">
          <TabsList
            ref={tabsListRef}
            className="flex h-auto w-full rounded-none border-b border-border bg-transparent p-0"
          >
            <TabsTrigger value="core" className={TAB_CLASS}>
              Core
            </TabsTrigger>
            <TabsTrigger value="plan" className={TAB_CLASS}>
              Test Plan
            </TabsTrigger>
            <TabsTrigger value="objects" className={TAB_CLASS}>
              Test Plan Objects
            </TabsTrigger>
            <TabsTrigger value="respondent" className={TAB_CLASS}>
              Respondent Information
            </TabsTrigger>
          </TabsList>
          <div
            className="absolute bottom-0 h-0.5 bg-foreground transition-all duration-300 ease-in-out"
            style={{ left: indicator.left, width: indicator.width }}
          />
        </div>

        {/* ── Core ──────────────────────────────────────────────────────── */}
        <TabsContent value="core" className="mt-6">
          <div className="max-w-2xl space-y-5">
            <Field label="Name" htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kommunevalg Rune"
                required
              />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this survey"
              />
            </Field>

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Action bar — Core tab only */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/surveys")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!name.trim() || !selected}
                onClick={() =>
                  setError(
                    "Creating a survey from a test plan is not wired to the backend yet (survey ↔ test-plan separation is pending).",
                  )
                }
              >
                Create Survey
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Test Plan (selectable table) ─────────────────────────────── */}
        <TabsContent value="plan" className="mt-6">
          {selected && (
            <p className="mb-3 text-xs text-muted-foreground">
              Selected: <span className="font-medium">{selected.name}</span>
            </p>
          )}
          <DataTable
            rows={plans}
            columns={PLAN_COLUMNS}
            getRowId={(p) => p.id}
            getSearchText={(p) => p.name}
            activeId={selected?.id ?? null}
            onRowClick={setSelected}
            loading={loading}
            emptyText="No test plans found."
            initialSortKey="created"
            initialSortDir="desc"
          />
        </TabsContent>

        {/* ── Test Plan Objects ────────────────────────────────────────── */}
        <TabsContent value="objects" className="mt-6">
          {!selected ? (
            <div className="flex h-40 items-center justify-center rounded-md border text-sm text-muted-foreground">
              Select a test plan first (Test Plan tab).
            </div>
          ) : (
            <DataTable
              rows={selected.objects}
              columns={OBJECT_COLUMNS}
              getRowId={(o) => o.id}
              getSearchText={(o) => o.name}
              emptyText="No objects."
              initialSortKey="pos"
            />
          )}
        </TabsContent>

        {/* ── Respondent Information ───────────────────────────────────── */}
        <TabsContent value="respondent" className="mt-6">
          <div className="flex h-40 items-center justify-center rounded-md border text-sm text-muted-foreground">
            Respondent-level fields (external IDs, covariates) will be configured
            here.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
