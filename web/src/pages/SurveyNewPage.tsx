import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export function SurveyNewPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [K, setK] = useState(3);
  const [N, setN] = useState(3);
  const [scaleMin, setScaleMin] = useState(-50);
  const [scaleMax, setScaleMax] = useState(50);
  const [objectNames, setObjectNames] = useState<string[]>(
    Array.from({ length: 3 }, (_, i) => `Obj_${(i + 1).toString().padStart(2, "0")}`),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resize object names when K changes
  useEffect(() => {
    setObjectNames((prev) => {
      if (prev.length === K) return prev;
      const next = prev.slice(0, K);
      while (next.length < K) {
        next.push(`Obj_${(next.length + 1).toString().padStart(2, "0")}`);
      }
      return next;
    });
  }, [K]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const survey = await api.createSurvey({
        name,
        description: description || undefined,
        K,
        N,
        scale_min: scaleMin,
        scale_max: scaleMax,
        object_names: objectNames,
      });
      // Auto-generate a default D-optimal design
      await api.generateDesign(survey.id, { objective: "d-optimal", seed: 0 });
      navigate(`/surveys/${survey.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>New survey</CardTitle>
          <CardDescription>
            Creates the survey and a default D-optimal design in one step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kommunevalg Rune"
                required
              />
            </Field>

            <Field label="Description (optional)">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-4 gap-3">
              <Field label="K (objects)">
                <Input
                  type="number"
                  min={2}
                  value={K}
                  onChange={(e) => setK(Number(e.target.value))}
                />
              </Field>
              <Field label="N (comparisons)">
                <Input
                  type="number"
                  min={2}
                  value={N}
                  onChange={(e) => setN(Number(e.target.value))}
                />
              </Field>
              <Field label="Scale min">
                <Input
                  type="number"
                  value={scaleMin}
                  onChange={(e) => setScaleMin(Number(e.target.value))}
                />
              </Field>
              <Field label="Scale max">
                <Input
                  type="number"
                  value={scaleMax}
                  onChange={(e) => setScaleMax(Number(e.target.value))}
                />
              </Field>
            </div>

            <div>
              <Label className="mb-2 block">Object names</Label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {objectNames.map((n, i) => (
                  <Input
                    key={i}
                    value={n}
                    onChange={(e) =>
                      setObjectNames((prev) =>
                        prev.map((v, idx) => (idx === i ? e.target.value : v)),
                      )
                    }
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/surveys")}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create survey + design"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
