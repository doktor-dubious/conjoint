import { useEffect, useMemo, useState } from "react";
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

type Phase = "loading" | "intro" | "rating" | "submitting" | "done" | "error";

export function ParticipantPage() {
  const { id } = useParams<{ id: string }>();
  const surveyId = id ?? "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [survey, setSurvey] = useState<SurveyOut | null>(null);
  const [design, setDesign] = useState<StoredDesignOut | null>(null);
  const [respondentId, setRespondentId] = useState<string | null>(null);
  const [trialIdx, setTrialIdx] = useState(0);
  // Presentation order (indices into design.trials); shuffled per respondent
  // when the survey has randomize_order enabled.
  const [order, setOrder] = useState<number[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [currentValue, setCurrentValue] = useState<number>(0);
  const [touched, setTouched] = useState(false);

  // Load survey + latest design
  useEffect(() => {
    (async () => {
      try {
        const s = await api.getSurvey(surveyId);
        setSurvey(s);
        const designs = await api.listDesigns(surveyId);
        if (designs.length === 0) {
          throw new Error("This survey has no design yet.");
        }
        setDesign(designs[0]); // listDesigns returns newest first
        setOrder(designs[0].trials.map((_, i) => i));
        setPhase("intro");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
  }, [surveyId]);

  const midpoint = useMemo(
    () => (survey ? (survey.scale_min + survey.scale_max) / 2 : 0),
    [survey],
  );
  const currentTrial = useMemo(() => {
    if (!design) return null;
    const idx = order[trialIdx] ?? trialIdx;
    return design.trials[idx] ?? null;
  }, [design, order, trialIdx]);

  // Reset slider for each new trial; preserve revisits
  useEffect(() => {
    if (!currentTrial) return;
    if (values[currentTrial.id] !== undefined) {
      setCurrentValue(values[currentTrial.id]);
      setTouched(true);
    } else {
      setCurrentValue(midpoint);
      setTouched(false);
    }
  }, [currentTrial, midpoint, values]);

  async function startRespondent() {
    try {
      const r = await api.createRespondent(surveyId);
      setRespondentId(r.id);
      setTrialIdx(0);
      setValues({});
      if (design) {
        const idents = design.trials.map((_, i) => i);
        setOrder(survey?.randomize_order ? shuffle(idents) : idents);
      }
      setPhase("rating");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  function recordAndAdvance() {
    if (!currentTrial) return;
    setValues((prev) => ({ ...prev, [currentTrial.id]: currentValue }));
    if (trialIdx + 1 < (design?.trials.length ?? 0)) {
      setTrialIdx(trialIdx + 1);
    } else {
      void submit();
    }
  }

  function goBack() {
    if (trialIdx === 0 || !currentTrial) return;
    setValues((prev) => ({ ...prev, [currentTrial.id]: currentValue }));
    setTrialIdx(trialIdx - 1);
  }

  async function submit() {
    if (!respondentId || !design) return;
    setPhase("submitting");
    try {
      const responses = design.trials.map((t) => ({
        trial_id: t.id,
        raw_value: values[t.id] ?? currentValue,
      }));
      await api.submitResponses(respondentId, responses);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return <Loading />;
  }
  if (phase === "error") {
    return <ErrorBox message={error ?? "unknown error"} surveyId={surveyId} />;
  }
  if (phase === "done") {
    return <ThankYou surveyId={surveyId} />;
  }

  if (!survey || !design) return <Loading />;

  if (phase === "intro") {
    return (
      <div className="container max-w-2xl py-12">
        <Card>
          <CardHeader>
            <CardTitle>{survey.name}</CardTitle>
            <CardDescription>
              You will be shown {design.trials.length} pairwise comparisons.
              For each pair, drag the slider towards the option you prefer.
              The middle of the slider means "no preference".
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button onClick={startRespondent}>Start</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // rating | submitting
  return (
    <div className="container max-w-3xl py-10 space-y-6">
      <div className="text-xs text-muted-foreground font-mono">
        Trial {trialIdx + 1} / {design.trials.length}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-normal">
            Which do you prefer?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-3 items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-semibold">
                {currentTrial?.left_name}
              </div>
              <div className="text-xs text-muted-foreground">left</div>
            </div>
            <div className="text-center text-muted-foreground text-sm">vs</div>
            <div className="text-left">
              <div className="text-2xl font-semibold">
                {currentTrial?.right_name}
              </div>
              <div className="text-xs text-muted-foreground">right</div>
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="range"
              min={survey.scale_min}
              max={survey.scale_max}
              step={0.5}
              value={currentValue}
              onChange={(e) => {
                setCurrentValue(Number(e.target.value));
                setTouched(true);
              }}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>← strongly prefer {currentTrial?.left_name}</span>
              <span>no preference</span>
              <span>strongly prefer {currentTrial?.right_name} →</span>
            </div>
            <div className="text-center text-sm font-mono tabular-nums">
              {currentValue.toFixed(1)}
            </div>
          </div>

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={goBack}
              disabled={trialIdx === 0 || phase === "submitting"}
            >
              Back
            </Button>
            <Button
              onClick={recordAndAdvance}
              disabled={!touched || phase === "submitting"}
            >
              {trialIdx + 1 < design.trials.length
                ? "Next"
                : phase === "submitting"
                  ? "Submitting…"
                  : "Finish"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Loading() {
  return (
    <div className="container py-8">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function ErrorBox({
  message,
  surveyId,
}: {
  message: string;
  surveyId: string;
}) {
  return (
    <div className="container max-w-2xl py-12 space-y-4">
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        {message}
      </div>
      <Button asChild variant="outline">
        <Link to={`/surveys/${surveyId}`}>Back to survey</Link>
      </Button>
    </div>
  );
}

function ThankYou({ surveyId }: { surveyId: string }) {
  return (
    <div className="container max-w-2xl py-12">
      <Card>
        <CardHeader>
          <CardTitle>Thank you!</CardTitle>
          <CardDescription>
            Your responses have been recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={`/surveys/${surveyId}`}>Back to survey</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/surveys/${surveyId}/results`}>See results</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Fisher–Yates shuffle (returns a new array). Used for per-respondent ordering.
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
