import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  api,
  type StoredDesignOut,
  type SurveyOut,
} from "@/lib/api";

export function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const surveyId = Number(id);
  const [survey, setSurvey] = useState<SurveyOut | null>(null);
  const [designs, setDesigns] = useState<StoredDesignOut[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      const [s, ds] = await Promise.all([
        api.getSurvey(surveyId),
        api.listDesigns(surveyId),
      ]);
      setSurvey(s);
      setDesigns(ds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void reload();
  }, [surveyId]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await api.generateDesign(surveyId, {
        objective: "d-optimal",
        seed: designs.length,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  function downloadCSV(d: StoredDesignOut) {
    const header = "trial,left,right,left_id,right_id";
    const rows = d.trials.map(
      (t) =>
        `${t.trial_number},${t.left_name},${t.right_name},${t.left_id},${t.right_id}`,
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `design-${surveyId}-${d.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!survey) {
    return (
      <div className="container py-8">
        {error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {survey.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            K = {survey.K} · N = {survey.N} · scale [{survey.scale_min},{" "}
            {survey.scale_max}]
          </p>
          {survey.description && (
            <p className="text-sm mt-2">{survey.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={`/surveys/${surveyId}/participate`}>Participate</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/surveys/${surveyId}/results`}>Results</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Objects ({survey.objects.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-6 space-y-1 text-sm font-mono">
            {survey.objects.map((o) => (
              <li key={o.id}>{o.name}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Designs ({designs.length})
        </h2>
        <Button onClick={generate} disabled={generating}>
          {generating ? "Generating…" : "Generate new design"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {designs.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <CardTitle className="text-base">Design #{d.id}</CardTitle>
              <CardDescription>
                {d.objective} · seed {d.seed} · {new Date(d.created_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <Stat label="min Var" value={d.min_var.toFixed(4)} />
                <Stat label="max Var" value={d.max_var.toFixed(4)} />
                <Stat label="ratio" value={d.ratio.toFixed(2)} />
                <Stat label="spanning trees" value={d.spanning_trees.toString()} />
              </dl>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadCSV(d)}>
                  Download CSV
                </Button>
                <span className="text-xs text-muted-foreground">
                  {d.trials.length} trials
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
