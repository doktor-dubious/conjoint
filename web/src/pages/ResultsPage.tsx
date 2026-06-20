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
  type AlphaEstimate,
  type AnalyzeResponse,
  type RespondentAnalysis,
  type SurveyOut,
} from "@/lib/api";

export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const surveyId = Number(id);

  const [survey, setSurvey] = useState<SurveyOut | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        api.getSurvey(surveyId),
        api.analyze(surveyId),
      ]);
      setSurvey(s);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void run();
  }, [surveyId]);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {survey?.name ?? "Results"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            OLS analysis per respondent
            {result && `, design #${result.design_id}`}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={run} disabled={loading}>
            {loading ? "Running…" : "Re-run analysis"}
          </Button>
          <Button asChild variant="outline">
            <Link to={`/surveys/${surveyId}`}>Back to survey</Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground">Computing…</p>
      )}

      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Aggregate</CardTitle>
              <CardDescription>
                Mean α across {result.n_respondents} fitted respondent
                {result.n_respondents === 1 ? "" : "s"}. Higher α = more
                preferred.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.aggregate ? (
                <AlphaTable rows={result.aggregate} showSE={false} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No respondents yet.
                </p>
              )}
            </CardContent>
          </Card>

          <h2 className="text-lg font-semibold pt-2">
            Per-respondent fits ({result.per_respondent.length})
          </h2>

          <div className="grid gap-4">
            {result.per_respondent.map((r) => (
              <RespondentCard key={r.respondent_id} fit={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RespondentCard({ fit }: { fit: RespondentAnalysis }) {
  const hasSE = fit.alphas.some((a) => a.se !== null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Respondent #{fit.respondent_id}
          {fit.external_id && (
            <span className="ml-2 text-xs font-mono text-muted-foreground">
              ({fit.external_id})
            </span>
          )}
        </CardTitle>
        <CardDescription className="space-x-3">
          <span>n = {fit.n_responses}</span>
          <span>residual df = {fit.residual_df}</span>
          {fit.sigma_hat !== null && (
            <span>σ̂ = {fit.sigma_hat.toFixed(3)}</span>
          )}
          <span>
            τ̂ = {fit.tau.toFixed(3)}
            {fit.tau_se !== null && ` (SE ${fit.tau_se.toFixed(3)})`}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlphaTable rows={fit.alphas} showSE={hasSE} />
      </CardContent>
    </Card>
  );
}

function AlphaTable({
  rows,
  showSE,
}: {
  rows: AlphaEstimate[];
  showSE: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.alpha - a.alpha);
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="py-1.5">Object</th>
          <th className="py-1.5 text-right">α̂</th>
          {showSE && <th className="py-1.5 text-right">SE</th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.object_id} className="border-t">
            <td className="py-1.5 font-mono">{r.name}</td>
            <td className="py-1.5 text-right tabular-nums">
              {r.alpha.toFixed(3)}
            </td>
            {showSE && (
              <td className="py-1.5 text-right tabular-nums">
                {r.se !== null ? r.se.toFixed(3) : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
