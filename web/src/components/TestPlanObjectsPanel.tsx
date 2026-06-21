import { useEffect, useRef, useState } from "react";
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
import type { ObjectOut } from "@/lib/api";

const TAB_CLASS = "rounded-none py-2.5";

export type ObjectValues = {
  name?: string | null;
  text?: string | null;
  description?: string | null;
  image?: string | null;
};

type ObjTab = "details" | "text" | "image";

// Renders a generic object label "O3" as O with a superscript number;
// a concrete name (e.g. "Pernille") is shown verbatim.
export function ObjLabel({ name }: { name: string }) {
  const m = /^O(\d+)$/.exec(name);
  if (!m) return <>{name}</>;
  return (
    <span>
      O<sup className="text-[0.7em]">{m[1]}</sup>
    </span>
  );
}

/**
 * Shared "Test Plan Objects" panel: a DataTable of objects (with O# / given
 * name + a Defined/Undefined status) plus a detail pane (Details / Text /
 * Image). When `onUpdate` is supplied the fields are editable (survey
 * creation); otherwise it is a read-only view of stored definitions.
 */
export function TestPlanObjectsPanel({
  objects,
  valuesById,
  onUpdate,
}: {
  objects: ObjectOut[];
  valuesById: Record<string, ObjectValues>;
  onUpdate?: (id: string, patch: ObjectValues) => void;
}) {
  const editable = !!onUpdate;
  const [selected, setSelected] = useState<ObjectOut | null>(null);
  const [tab, setTab] = useState<ObjTab>("details");
  const fileRef = useRef<HTMLInputElement>(null);

  const labelFor = (o: ObjectOut) => valuesById[o.id]?.name?.trim() || o.name;
  const isDefined = (o: ObjectOut) => {
    const v = valuesById[o.id];
    return !!v && (!!v.text?.trim() || !!v.image);
  };

  // Detail-tab sliding underline.
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>(
      "[data-state='active']",
    );
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab, selected]);

  const columns: DataTableColumn<ObjectOut>[] = [
    {
      key: "pos",
      header: "#",
      sortable: true,
      sortValue: (o) => o.position,
      render: (o) => o.position + 1,
      className: "tabular-nums text-muted-foreground",
      headClassName: "w-12",
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortValue: (o) => labelFor(o).toLowerCase(),
      render: (o) => (
        <span className="font-medium">
          <ObjLabel name={labelFor(o)} />
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (o) =>
        isDefined(o) ? (
          <Badge>Defined</Badge>
        ) : (
          <Badge variant="secondary">Undefined</Badge>
        ),
      headClassName: "w-28",
    },
  ];

  const cur: ObjectValues = (selected && valuesById[selected.id]) || {};

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected || !onUpdate) return;
    const reader = new FileReader();
    reader.onload = () =>
      onUpdate(selected.id, { image: String(reader.result) });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <>
      <DataTable
        rows={objects}
        columns={columns}
        getRowId={(o) => o.id}
        getSearchText={(o) =>
          `${labelFor(o)} ${valuesById[o.id]?.description ?? ""}`
        }
        activeId={selected?.id ?? null}
        onRowClick={setSelected}
        emptyText="No objects."
        initialSortKey="pos"
      />

      {selected && (
        <div className="mt-8 border-t pt-6">
          <p className="mb-4 text-sm">
            {editable ? "Defining" : "Object"}{" "}
            <span className="font-medium">
              <ObjLabel name={labelFor(selected)} />
            </span>
          </p>
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as ObjTab)}
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
                <TabsTrigger value="text" className={TAB_CLASS}>
                  Text
                </TabsTrigger>
                <TabsTrigger value="image" className={TAB_CLASS}>
                  Image
                </TabsTrigger>
              </TabsList>
              <div
                className="absolute bottom-0 h-0.5 bg-foreground transition-all duration-300 ease-in-out"
                style={{ left: indicator.left, width: indicator.width }}
              />
            </div>

            {/* Details */}
            <TabsContent value="details" className="mt-6 max-w-2xl space-y-5">
              <Field label="Name" htmlFor="obj-name">
                <Input
                  id="obj-name"
                  value={cur.name ?? ""}
                  readOnly={!editable}
                  placeholder={editable ? "e.g. Pernille" : undefined}
                  onChange={
                    editable
                      ? (e) => onUpdate?.(selected.id, { name: e.target.value })
                      : undefined
                  }
                />
              </Field>
            </TabsContent>

            {/* Text */}
            <TabsContent value="text" className="mt-6 max-w-2xl space-y-5">
              <Field label="Object Text" htmlFor="obj-text">
                <Input
                  id="obj-text"
                  value={cur.text ?? ""}
                  readOnly={!editable}
                  placeholder={editable ? "e.g. a short label or slogan" : undefined}
                  onChange={
                    editable
                      ? (e) => onUpdate?.(selected.id, { text: e.target.value })
                      : undefined
                  }
                />
              </Field>
              <Field label="Object Description" htmlFor="obj-description">
                <Textarea
                  id="obj-description"
                  value={cur.description ?? ""}
                  readOnly={!editable}
                  placeholder={
                    editable ? "Optional longer description for respondents" : undefined
                  }
                  onChange={
                    editable
                      ? (e) =>
                          onUpdate?.(selected.id, {
                            description: e.target.value,
                          })
                      : undefined
                  }
                />
              </Field>
            </TabsContent>

            {/* Image */}
            <TabsContent value="image" className="mt-6 max-w-2xl space-y-4">
              <div className="flex h-56 w-full items-center justify-center overflow-hidden rounded-md border bg-muted/20">
                {cur.image ? (
                  <img
                    src={cur.image}
                    alt={labelFor(selected)}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 opacity-50" />
                    <span className="text-sm">
                      {editable ? "No image uploaded" : "No image"}
                    </span>
                  </div>
                )}
              </div>
              {editable && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {cur.image ? "Replace image" : "Upload image"}
                  </Button>
                  {cur.image && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onUpdate?.(selected.id, { image: null })}
                    >
                      Remove
                    </Button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onImageFile}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </>
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
