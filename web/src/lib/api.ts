// Typed fetch client for the conjoint API.
// In dev, Vite proxies /api/* to the backend at :8000.

export type Objective = "d-optimal" | "min-max-var";

// ---------- stateless: design / scan ----------

export interface ScanRow {
  N: number;
  residual_df: number;
  min_var: number | null;
  max_var: number | null;
  mean_var: number | null;
  ratio: number | null;
  spanning_trees: number | null;
  n_distinct_var: number | null;
  feasible: boolean;
  note: string;
}

export interface ScanResponse {
  K: number;
  objective: Objective;
  rows: ScanRow[];
}

export interface Trial {
  trial: number;
  left: string;
  right: string;
  pair: string;
}

export interface DesignSummary {
  K: number;
  N: number;
  residual_df: number;
  objective: Objective;
  min_var: number;
  max_var: number;
  mean_var: number;
  ratio: number;
  spanning_trees: number;
  n_distinct_var: number;
}

export interface DesignResponse {
  summary: DesignSummary;
  trials: Trial[];
}

// ---------- persistent: surveys / designs ----------

export interface ObjectOut {
  id: string;
  position: number;
  name: string;
  text: string | null;
  description: string | null;
  image: string | null;
}

export interface SurveyOut {
  id: string;
  name: string;
  description: string | null;
  K: number;
  N: number;
  scale_min: number;
  scale_max: number;
  randomize_order: boolean;
  source_test_plan_id: string | null;
  created_at: string;
  objects: ObjectOut[];
}

export interface ObjectDefIn {
  position: number;
  text?: string | null;
  description?: string | null;
  image?: string | null;
}

export interface SurveyInstanceCreate {
  name: string;
  description?: string;
  objects: ObjectDefIn[];
}

export interface SurveyCreate {
  name: string;
  description?: string;
  K: number;
  N: number;
  scale_min: number;
  scale_max: number;
  randomize_order?: boolean;
  object_names: string[];
}

export interface StoredTrialOut {
  id: string;
  trial_number: number;
  left_id: string;
  right_id: string;
  left_name: string;
  right_name: string;
}

export interface StoredDesignOut {
  id: string;
  survey_id: string;
  objective: Objective;
  seed: number;
  max_iter: number;
  min_var: number;
  max_var: number;
  mean_var: number;
  ratio: number;
  spanning_trees: number;
  created_at: string;
  trials: StoredTrialOut[];
}

export interface RespondentOut {
  id: string;
  survey_id: string;
  external_id: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ResponseSubmit {
  trial_id: string;
  raw_value: number;
}

export interface ResponseOut {
  id: string;
  respondent_id: string;
  trial_id: string;
  raw_value: number;
  y: number;
  recorded_at: string;
}

// ---------- analysis ----------

export interface AlphaEstimate {
  object_id: string;
  position: number;
  name: string;
  alpha: number;
  se: number | null;
}

export interface RespondentAnalysis {
  respondent_id: string;
  external_id: string | null;
  n_responses: number;
  residual_df: number;
  sigma_hat: number | null;
  tau: number;
  tau_se: number | null;
  alphas: AlphaEstimate[];
}

export interface AnalyzeResponse {
  survey_id: string;
  design_id: string;
  n_respondents: number;
  per_respondent: RespondentAnalysis[];
  aggregate: AlphaEstimate[] | null;
}

// ---------- fetch helpers ----------

async function request<R>(
  path: string,
  init?: RequestInit,
): Promise<R> {
  const resp = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${detail}`);
  }
  if (resp.status === 204) return undefined as R;
  return resp.json() as Promise<R>;
}

function get<R>(path: string) {
  return request<R>(path);
}

function post<T, R>(path: string, body: T) {
  return request<R>(path, { method: "POST", body: JSON.stringify(body) });
}

export const api = {
  // stateless
  scan(req: {
    K: number;
    N_min: number;
    N_max: number;
    objective?: Objective;
    seed?: number;
  }) {
    return post<typeof req, ScanResponse>("/api/scan", req);
  },
  design(req: {
    K: number;
    N: number;
    objective?: Objective;
    seed?: number;
    object_names?: string[];
  }) {
    return post<typeof req, DesignResponse>("/api/design", req);
  },

  // surveys
  listSurveys(opts?: { testPlan?: boolean }) {
    const q =
      opts?.testPlan === undefined ? "" : `?test_plan=${opts.testPlan}`;
    return get<SurveyOut[]>(`/api/surveys${q}`);
  },
  instantiateSurvey(testPlanId: string, req: SurveyInstanceCreate) {
    return post<SurveyInstanceCreate, SurveyOut>(
      `/api/surveys/${testPlanId}/instantiate`,
      req,
    );
  },
  getSurvey(id: string) {
    return get<SurveyOut>(`/api/surveys/${id}`);
  },
  createSurvey(req: SurveyCreate) {
    return post<SurveyCreate, SurveyOut>("/api/surveys", req);
  },
  updateSurvey(
    id: string,
    req: { name?: string; description?: string | null },
  ) {
    return request<SurveyOut>(`/api/surveys/${id}`, {
      method: "PATCH",
      body: JSON.stringify(req),
    });
  },
  deleteSurvey(id: string) {
    return request<void>(`/api/surveys/${id}`, { method: "DELETE" });
  },

  // designs
  generateDesign(
    surveyId: string,
    req: { objective?: Objective; seed?: number; max_iter?: number } = {},
  ) {
    return post<typeof req, StoredDesignOut>(
      `/api/surveys/${surveyId}/design`,
      req,
    );
  },
  // Persist a design with an explicit, caller-supplied comparison order.
  storeManualDesign(
    surveyId: string,
    req: {
      objective?: Objective;
      seed?: number;
      max_iter?: number;
      edges: [number, number][];
    },
  ) {
    return post<typeof req, StoredDesignOut>(
      `/api/surveys/${surveyId}/design/manual`,
      req,
    );
  },
  listDesigns(surveyId: string) {
    return get<StoredDesignOut[]>(`/api/surveys/${surveyId}/designs`);
  },

  // respondents
  createRespondent(surveyId: string, externalId?: string) {
    return post<{ external_id?: string }, RespondentOut>(
      `/api/surveys/${surveyId}/respondents`,
      { external_id: externalId },
    );
  },
  submitResponses(respondentId: string, responses: ResponseSubmit[]) {
    return post<{ responses: ResponseSubmit[] }, ResponseOut[]>(
      `/api/respondents/${respondentId}/responses`,
      { responses },
    );
  },

  // analysis
  analyze(surveyId: string, designId?: string) {
    const q = designId !== undefined ? `?design_id=${designId}` : "";
    return post<Record<string, never>, AnalyzeResponse>(
      `/api/surveys/${surveyId}/analyze${q}`,
      {} as Record<string, never>,
    );
  },
};
