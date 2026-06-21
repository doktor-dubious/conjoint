import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, type SurveyOut } from "@/lib/api";

export function SurveyListPage() {
  const [surveys, setSurveys] = useState<SurveyOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSurveys({ testPlan: false })
      .then(setSurveys)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Surveys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Existing conjoint studies in this workspace.
          </p>
        </div>
        <Button asChild>
          <Link to="/surveys/new">New survey</Link>
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && surveys.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No surveys yet</CardTitle>
            <CardDescription>
              Click <b>New survey</b> to create one.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {surveys.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.name}</CardTitle>
              <CardDescription>
                K = {s.K} objects · N = {s.N} comparisons · scale [
                {s.scale_min}, {s.scale_max}]
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {s.description && (
                <p className="text-sm text-muted-foreground">{s.description}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/surveys/${s.id}`}>Open</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/surveys/${s.id}/participate`}>Participate</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/surveys/${s.id}/results`}>Results</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
