"""Pydantic request/response models for the API."""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


Objective = Literal["d-optimal", "min-max-var"]


# ---------------------------------------------------------------------------
# Stateless: direct design + scan
# ---------------------------------------------------------------------------


class DesignRequest(BaseModel):
    K: int = Field(..., ge=2, description="number of objects")
    N: int = Field(..., ge=2, description="comparisons per respondent")
    objective: Objective = "d-optimal"
    seed: int = 0
    max_iter: int = Field(500, ge=0, le=5000)
    object_names: Optional[List[str]] = Field(
        None, description="optional names; defaults to Obj_01..Obj_K"
    )


class Trial(BaseModel):
    trial: int
    left: str
    right: str
    pair: str


class DesignSummary(BaseModel):
    K: int
    N: int
    residual_df: int
    objective: Objective
    min_var: float
    max_var: float
    mean_var: float
    ratio: float
    spanning_trees: int
    n_distinct_var: int


class DesignResponse(BaseModel):
    summary: DesignSummary
    trials: List[Trial]


class ScanRequest(BaseModel):
    K: int = Field(..., ge=2)
    N_min: int = Field(..., ge=2)
    N_max: int = Field(..., ge=2)
    objective: Objective = "d-optimal"
    seed: int = 0


class ScanRow(BaseModel):
    N: int
    residual_df: int
    min_var: Optional[float]
    max_var: Optional[float]
    mean_var: Optional[float]
    ratio: Optional[float]
    spanning_trees: Optional[int]
    n_distinct_var: Optional[int]
    feasible: bool
    note: str


class ScanResponse(BaseModel):
    K: int
    objective: Objective
    rows: List[ScanRow]


# ---------------------------------------------------------------------------
# Persistent: surveys / designs / respondents / responses
# ---------------------------------------------------------------------------


class SurveyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    K: int = Field(..., ge=2)
    N: int = Field(..., ge=2)
    scale_min: float = -50.0
    scale_max: float = 50.0
    randomize_order: bool = False
    object_names: List[str] = Field(
        ..., description="length-K list of object display names"
    )


class SurveyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ObjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    position: int
    name: str


class SurveyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: Optional[str]
    K: int
    N: int
    scale_min: float
    scale_max: float
    randomize_order: bool
    created_at: datetime
    objects: List[ObjectOut]


class GenerateDesignRequest(BaseModel):
    objective: Objective = "d-optimal"
    seed: int = 0
    max_iter: int = Field(500, ge=0, le=5000)


class ManualDesignRequest(BaseModel):
    """Persist a design with an explicit, caller-supplied comparison order.

    `edges` is the ordered list of (left_position, right_position) pairs,
    0-indexed into the survey's objects. Used when the user has manually
    reordered / shuffled the generated comparisons before finalizing.
    """
    objective: Objective = "d-optimal"
    seed: int = 0
    max_iter: int = Field(500, ge=0, le=5000)
    edges: List[tuple[int, int]] = Field(
        ..., description="ordered (left_position, right_position) pairs"
    )


class StoredTrialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    trial_number: int
    left_id: str
    right_id: str
    left_name: str
    right_name: str


class StoredDesignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    survey_id: str
    objective: str
    seed: int
    max_iter: int
    min_var: float
    max_var: float
    mean_var: float
    ratio: float
    spanning_trees: int
    created_at: datetime
    trials: List[StoredTrialOut]


class RespondentCreate(BaseModel):
    external_id: Optional[str] = None


class RespondentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    survey_id: str
    external_id: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]


class ResponseSubmit(BaseModel):
    trial_id: str
    raw_value: float


class ResponseBatchSubmit(BaseModel):
    responses: List[ResponseSubmit]


class ResponseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    respondent_id: str
    trial_id: str
    raw_value: float
    y: float
    recorded_at: datetime


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------


class AlphaEstimate(BaseModel):
    object_id: str
    position: int
    name: str
    alpha: float
    se: Optional[float] = None  # null if model saturated (residual_df == 0)


class RespondentAnalysis(BaseModel):
    respondent_id: str
    external_id: Optional[str]
    n_responses: int
    residual_df: int
    sigma_hat: Optional[float]
    tau: float
    tau_se: Optional[float]
    alphas: List[AlphaEstimate]


class AnalyzeResponse(BaseModel):
    survey_id: str
    design_id: str
    n_respondents: int
    per_respondent: List[RespondentAnalysis]
    aggregate: Optional[List[AlphaEstimate]] = None
