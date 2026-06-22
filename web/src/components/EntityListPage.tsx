import { useEffect, useRef, useState } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";

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

const TAB_CLASS = "rounded-none py-2.5";

export type EntityBase = {
  id: string;
  name: string;
  description?: string | null;
  notes?: string | null;
};

export type EntityTab<T> = {
  value: string;
  label: string;
  render: (entity: T) => React.ReactNode;
};

type Patch = { name?: string; description?: string | null; notes?: string | null };

export function EntityListPage<T extends EntityBase>({
  load,
  columns,
  getSearchText,
  onCreate,
  onUpdate,
  onDelete,
  noun,
  emptyText,
  storageKey,
  extraTabs = [],
}: {
  load: () => Promise<T[]>;
  columns: DataTableColumn<T>[];
  getSearchText: (row: T) => string;
  onCreate: (data: {
    name: string;
    description?: string;
    notes?: string;
  }) => Promise<T>;
  onUpdate: (id: string, patch: Patch) => Promise<T>;
  onDelete: (id: string) => Promise<void>;
  noun: string;
  emptyText: string;
  storageKey: string;
  extraTabs?: EntityTab<T>[];
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<T | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const [maximized, setMaximized] = useState(
    () => localStorage.getItem(`${storageKey}_detail_max`) === "1",
  );
  useEffect(() => {
    localStorage.setItem(`${storageKey}_detail_max`, maximized ? "1" : "0");
  }, [maximized, storageKey]);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  useEffect(() => {
    setEditName(selected?.name ?? "");
    setEditDesc(selected?.description ?? "");
    setEditNotes(selected?.notes ?? "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function openCreate() {
    setNewName("");
    setNewDesc("");
    setNewNotes("");
    setCreateError(null);
    setCreateOpen(true);
  }
  async function confirmCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onCreate({
        name: newName.trim(),
        description: newDesc || undefined,
        notes: newNotes || undefined,
      });
      setRows((prev) => [created, ...prev]);
      setSelected(created);
      setDetailTab("details");
      setCreateOpen(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    load()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(patch: Patch) {
    if (!selected) return;
    try {
      const updated = await onUpdate(selected.id, patch);
      setSelected(updated);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Detail-tab sliding underline.
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const measure = () => {
      const el = tabsRef.current?.querySelector<HTMLElement>(
        "[data-state='active']",
      );
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
      await onDelete(selected.id);
      setRows((prev) => prev.filter((r) => r.id !== selected.id));
      setSelected(null);
      setDeleteOpen(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
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

      <div className={cn(selected && maximized && "hidden")}>
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New {noun}
          </Button>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          getSearchText={getSearchText}
          activeId={selected?.id ?? null}
          onRowClick={(r) => {
            setSelected(r);
            setDetailTab("details");
          }}
          loading={loading}
          emptyText={emptyText}
          hideCount
          initialSortKey="created"
          initialSortDir="desc"
        />
      </div>

      {selected && (
        <div className={cn(maximized ? "" : "mt-8 border-t pt-6")}>
          <Tabs
            value={detailTab}
            onValueChange={setDetailTab}
            className="gap-0"
          >
            <div className="relative w-full">
              <TabsList
                ref={tabsRef}
                className="flex h-auto w-full rounded-none border-b border-border bg-transparent p-0"
              >
                <TabsTrigger value="details" className={TAB_CLASS}>
                  Details
                </TabsTrigger>
                {extraTabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className={TAB_CLASS}>
                    {t.label}
                  </TabsTrigger>
                ))}
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

            <TabsContent value="details" className="mt-6 max-w-2xl space-y-4">
              <StatRow label="ID" value={<CopyId id={selected.id} />} />
              <Field label="Name" htmlFor="e-name">
                <Input
                  id="e-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => {
                    const v = editName.trim();
                    if (v && v !== selected.name) save({ name: v });
                    else setEditName(selected.name);
                  }}
                />
              </Field>
              <Field label="Description" htmlFor="e-desc">
                <Textarea
                  id="e-desc"
                  value={editDesc}
                  placeholder="Optional description"
                  onChange={(e) => setEditDesc(e.target.value)}
                  onBlur={() => {
                    if (editDesc !== (selected.description ?? ""))
                      save({ description: editDesc });
                  }}
                />
              </Field>
              <Field label="Notes" htmlFor="e-notes">
                <Textarea
                  id="e-notes"
                  value={editNotes}
                  placeholder="Internal notes"
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={() => {
                    if (editNotes !== (selected.notes ?? ""))
                      save({ notes: editNotes });
                  }}
                />
              </Field>
            </TabsContent>

            {extraTabs.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-6">
                {t.render(selected)}
              </TabsContent>
            ))}

            <TabsContent value="actions" className="mt-6 max-w-2xl space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    Delete {noun}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Permanently delete this {noun}. This action cannot be
                    undone.
                  </p>
                </div>
                <Button variant="destructive" onClick={openDelete}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Are you absolutely sure?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <b>{selected?.name}</b>.
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
                I understand this permanently deletes this {noun}.
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">New {noun}</DialogTitle>
            <DialogDescription>
              Create a new {noun}. You can edit details later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Name" htmlFor="new-name">
              <Input
                id="new-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
              />
            </Field>
            <Field label="Description" htmlFor="new-desc">
              <Textarea
                id="new-desc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional description"
              />
            </Field>
            <Field label="Notes" htmlFor="new-notes">
              <Textarea
                id="new-notes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Internal notes"
              />
            </Field>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// A read-only DataTable of related lite entities (e.g. an org's users).
export function RelationTable({
  rows,
  emptyText,
}: {
  rows: { id: string; name: string }[];
  emptyText: string;
}) {
  return (
    <DataTable
      rows={rows}
      columns={[
        {
          key: "name",
          header: "Name",
          sortable: true,
          sortValue: (r) => r.name.toLowerCase(),
          render: (r) => <span className="font-medium">{r.name}</span>,
        },
      ]}
      getRowId={(r) => r.id}
      getSearchText={(r) => r.name}
      emptyText={emptyText}
      initialSortKey="name"
    />
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
          navigator.clipboard?.writeText(id);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Copy className="h-3.5 w-3.5 hover:scale-110" />
        )}
      </button>
    </span>
  );
}
