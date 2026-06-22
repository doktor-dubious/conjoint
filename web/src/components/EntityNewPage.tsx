import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Simple create form shared by the Organizations/Users "New" pages.
export function EntityNewPage({
  noun,
  listPath,
  onCreate,
}: {
  noun: string;
  listPath: string;
  onCreate: (data: {
    name: string;
    description?: string;
    notes?: string;
  }) => Promise<{ id: string }>;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description || undefined,
        notes: notes || undefined,
      });
      navigate(listPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="w-full px-6 py-8">
      <div className="max-w-2xl space-y-5">
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. ${noun === "user" ? "Alice" : "Acme Corp"}`}
            required
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </Field>
        <Field label="Notes" htmlFor="notes">
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes"
          />
        </Field>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(listPath)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={create}
            disabled={!name.trim() || creating}
          >
            {creating ? "Creating…" : `Create ${noun}`}
          </Button>
        </div>
      </div>
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
