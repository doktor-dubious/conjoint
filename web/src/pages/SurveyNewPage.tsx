import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImageIcon, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

type ObjectDef = { text: string; description: string; image: string | null };
const EMPTY_DEF: ObjectDef = { text: "", description: "", image: null };
const isDefined = (d: ObjectDef | undefined): boolean =>
  !!d && (d.text.trim().length > 0 || d.image !== null);

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

const STORAGE_KEY = "surveys_new_form";

export function SurveyNewPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabKey>("core");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [plans, setPlans] = useState<SurveyOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SurveyOut | null>(null);

  // Per-object definitions (text / description / image). Held in page state
  // until the survey-creation backend exists; keyed by object id.
  const [objectDefs, setObjectDefs] = useState<Record<string, ObjectDef>>({});
  const [selectedObject, setSelectedObject] = useState<ObjectOut | null>(null);
  const [objTab, setObjTab] = useState<"text" | "image">("text");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFirstRenderRef = useRef(true);

  // Restore form state from localStorage on mount.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setName(state.name || "");
        setDescription(state.description || "");
        setObjectDefs(state.objectDefs || {});
      } catch (e) {
        // ignore parse errors
      }
    }
    isFirstRenderRef.current = false;
  }, []);

  // Save form state to localStorage whenever it changes (but not on first render).
  useEffect(() => {
    if (isFirstRenderRef.current) return;
    const state = { name, description, selectedId: selected?.id ?? null, objectDefs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [name, description, selected?.id, objectDefs]);

  useEffect(() => {
    api
      .listSurveys()
      .then((surveys) => {
        setPlans(surveys);
        // Restore selected plan if it exists in the current list.
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const state = JSON.parse(saved);
            if (state.selectedId) {
              const restored = surveys.find((s) => s.id === state.selectedId);
              if (restored) setSelected(restored);
            }
          } catch (e) {
            // ignore
          }
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Switching test plan clears the object definitions + open detail.
  useEffect(() => {
    setSelectedObject(null);
    setObjectDefs({});
  }, [selected?.id]);

  function updateDef(id: string, patch: Partial<ObjectDef>) {
    setObjectDefs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? EMPTY_DEF), ...patch },
    }));
  }

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedObject) return;
    const reader = new FileReader();
    reader.onload = () =>
      updateDef(selectedObject.id, { image: String(reader.result) });
    reader.readAsDataURL(file);
    e.target.value = ""; // allow re-selecting the same file
  }

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

  // Underline for the object detail tabs (Text / Image).
  const objTabsRef = useRef<HTMLDivElement>(null);
  const [objIndicator, setObjIndicator] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const list = objTabsRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>("[data-state='active']");
    if (el) setObjIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [objTab, selectedObject]);

  const objectColumns = useMemo<DataTableColumn<ObjectOut>[]>(
    () => [
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
      {
        key: "status",
        header: "Status",
        render: (o) =>
          isDefined(objectDefs[o.id]) ? (
            <Badge>Defined</Badge>
          ) : (
            <Badge variant="secondary">Undefined</Badge>
          ),
        headClassName: "w-32",
      },
    ],
    [objectDefs],
  );

  const currentDef =
    (selectedObject && objectDefs[selectedObject.id]) || EMPTY_DEF;

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
            <>
              <DataTable
                rows={selected.objects}
                columns={objectColumns}
                getRowId={(o) => o.id}
                getSearchText={(o) => o.name}
                activeId={selectedObject?.id ?? null}
                onRowClick={setSelectedObject}
                emptyText="No objects."
                initialSortKey="pos"
              />

              {/* Object detail pane */}
              {selectedObject && (
                <div className="mt-8 border-t pt-6">
                  <p className="mb-4 text-sm">
                    Defining{" "}
                    <span className="font-medium">{selectedObject.name}</span>
                  </p>
                  <Tabs
                    value={objTab}
                    onValueChange={(v) => setObjTab(v as "text" | "image")}
                    className="gap-0"
                  >
                    <div className="relative w-full">
                      <TabsList
                        ref={objTabsRef}
                        className="flex h-auto w-full rounded-none border-b border-border bg-transparent p-0"
                      >
                        <TabsTrigger value="text" className={TAB_CLASS}>
                          Text
                        </TabsTrigger>
                        <TabsTrigger value="image" className={TAB_CLASS}>
                          Image
                        </TabsTrigger>
                      </TabsList>
                      <div
                        className="absolute bottom-0 h-0.5 bg-foreground transition-all duration-300 ease-in-out"
                        style={{
                          left: objIndicator.left,
                          width: objIndicator.width,
                        }}
                      />
                    </div>

                    {/* Text */}
                    <TabsContent value="text" className="mt-6">
                      <div className="max-w-2xl space-y-5">
                        <Field label="Object Text" htmlFor="obj-text">
                          <Input
                            id="obj-text"
                            value={currentDef.text}
                            placeholder="e.g. Pernille"
                            onChange={(e) =>
                              updateDef(selectedObject.id, {
                                text: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field
                          label="Object Description"
                          htmlFor="obj-description"
                        >
                          <Textarea
                            id="obj-description"
                            value={currentDef.description}
                            placeholder="Optional longer description shown to respondents"
                            onChange={(e) =>
                              updateDef(selectedObject.id, {
                                description: e.target.value,
                              })
                            }
                          />
                        </Field>
                      </div>
                    </TabsContent>

                    {/* Image */}
                    <TabsContent value="image" className="mt-6">
                      <div className="max-w-2xl space-y-4">
                        <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-md border bg-muted/20">
                          {currentDef.image ? (
                            <img
                              src={currentDef.image}
                              alt={selectedObject.name}
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <ImageIcon className="h-8 w-8 opacity-50" />
                              <span className="text-sm">No image uploaded</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="h-4 w-4" />
                            {currentDef.image ? "Replace image" : "Upload image"}
                          </Button>
                          {currentDef.image && (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                updateDef(selectedObject.id, { image: null })
                              }
                            >
                              Remove
                            </Button>
                          )}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={onImageFile}
                          />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </>
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
