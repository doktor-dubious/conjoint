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

export type SurveyStatus = "inactive" | "running" | "completed";

export interface EntityLite {
  id: string;
  name: string;
}

export interface OrganizationOut {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  created_at: string;
  users: EntityLite[];
}

export interface UserOut {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  created_at: string;
  organizations: EntityLite[];
}

export interface SurveyOut {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  status: SurveyStatus;
  K: number;
  N: number;
  scale_min: number;
  scale_max: number;
  randomize_order: boolean;
  source_test_plan_id: string | null;
  organization_id: string | null;
  organization: EntityLite | null;
  users: EntityLite[];
  created_at: string;
  objects: ObjectOut[];
}

export interface ObjectDefIn {
  position: number;
  name?: string | null;
  text?: string | null;
  description?: string | null;
  image?: string | null;
}

export interface SurveyInstanceCreate {
  name: string;
  description?: string;
  objects: ObjectDefIn[];
}

export interface ImportResult {
  respondents_added: number;
  responses_added: number;
  skipped: number;
  total_respondents: number;
  total_responses: number;
  errors: string[];
}

export interface SurveyDataRow {
  id: string;
  respondent_id: string;
  external_id: string | null;
  trial_number: number;
  left_position: number;
  right_position: number;
  left_name: string;
  right_name: string;
  raw_value: number;
  y: number;
  recorded_at: string | null;
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

// Extract the human-readable message from a FastAPI error response
// (`{"detail": "..."}`), falling back to the raw text / status line.
async function errorMessage(resp: Response): Promise<string> {
  const text = await resp.text();
  try {
    const j = JSON.parse(text);
    if (j && typeof j.detail === "string") return j.detail;
  } catch {
    /* not JSON */
  }
  return text || `${resp.status} ${resp.statusText}`;
}

async function request<R>(
  path: string,
  init?: RequestInit,
): Promise<R> {
  const resp = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    throw new Error(await errorMessage(resp));
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
    forbid_reverse?: boolean;
  }) {
    return post<typeof req, ScanResponse>("/api/scan", req);
  },
  design(req: {
    K: number;
    N: number;
    objective?: Objective;
    seed?: number;
    forbid_reverse?: boolean;
    object_names?: string[];
  }) {
    return post<typeof req, DesignResponse>("/api/design", req);
  },

  // surveys
  listSurveys(opts?: { testPlan?: boolean; organizationId?: string }) {
    const qs = new URLSearchParams();
    if (opts?.testPlan !== undefined) qs.set("test_plan", String(opts.testPlan));
    if (opts?.organizationId) qs.set("organization_id", opts.organizationId);
    const q = qs.toString();
    return get<SurveyOut[]>(`/api/surveys${q ? `?${q}` : ""}`);
  },

  // organizations
  listOrganizations() {
    return get<OrganizationOut[]>("/api/organizations");
  },
  createOrganization(req: {
    name: string;
    description?: string;
    notes?: string;
    user_ids?: string[];
  }) {
    return post<typeof req, OrganizationOut>("/api/organizations", req);
  },
  updateOrganization(
    id: string,
    req: {
      name?: string;
      description?: string | null;
      notes?: string | null;
      user_ids?: string[];
    },
  ) {
    return request<OrganizationOut>(`/api/organizations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(req),
    });
  },
  deleteOrganization(id: string) {
    return request<void>(`/api/organizations/${id}`, { method: "DELETE" });
  },

  // users
  listUsers() {
    return get<UserOut[]>("/api/users");
  },
  createUser(req: {
    name: string;
    description?: string;
    notes?: string;
    organization_ids?: string[];
  }) {
    return post<typeof req, UserOut>("/api/users", req);
  },
  updateUser(
    id: string,
    req: {
      name?: string;
      description?: string | null;
      notes?: string | null;
      organization_ids?: string[];
    },
  ) {
    return request<UserOut>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(req),
    });
  },
  deleteUser(id: string) {
    return request<void>(`/api/users/${id}`, { method: "DELETE" });
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
    req: {
      name?: string;
      description?: string | null;
      notes?: string | null;
      status?: SurveyStatus;
      organization_id?: string | null;
      user_ids?: string[];
    },
  ) {
    return request<SurveyOut>(`/api/surveys/${id}`, {
      method: "PATCH",
      body: JSON.stringify(req),
    });
  },
  deleteSurvey(id: string) {
    return request<void>(`/api/surveys/${id}`, { method: "DELETE" });
  },
  async importResponses(
    surveyId: string,
    file: File,
    opts?: {
      idColumn?: string;
      leftColumn?: string;
      rightColumn?: string;
      valueColumn?: string;
      oneIndexed?: boolean;
    },
  ): Promise<ImportResult> {
    const form = new FormData();
    form.append("file", file);
    if (opts?.idColumn) form.append("id_column", opts.idColumn);
    if (opts?.leftColumn) form.append("left_column", opts.leftColumn);
    if (opts?.rightColumn) form.append("right_column", opts.rightColumn);
    if (opts?.valueColumn) form.append("value_column", opts.valueColumn);
    if (opts?.oneIndexed !== undefined)
      form.append("one_indexed", String(opts.oneIndexed));
    // No JSON content-type — the browser sets the multipart boundary.
    const resp = await fetch(`/api/surveys/${surveyId}/responses/import`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) {
      throw new Error(await errorMessage(resp));
    }
    return resp.json() as Promise<ImportResult>;
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
  listResponses(surveyId: string) {
    return get<SurveyDataRow[]>(`/api/surveys/${surveyId}/responses`);
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
