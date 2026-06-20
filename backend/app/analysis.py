"""OLS analysis of paired-comparison responses.

Model (per respondent, under H1):
    y_k = alpha_{R(k)} - alpha_{L(k)} + tau + epsilon_k,
    epsilon ~ N(0, sigma^2),
    sum_i alpha_i = 0.

We parameterize beta = (alpha_1, ..., alpha_{K-1}, tau)^T with
alpha_K = -sum_{i<K} alpha_i, and fit by OLS.

If residual_df = N - K >= 1, SE(alpha_i) = sigma_hat * sqrt(C_ii) where
C = (X'X)^{-1} (after the sum-to-zero reparameterization).
"""

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import numpy as np


@dataclass
class RespondentFit:
    n_responses: int
    residual_df: int
    sigma_hat: Optional[float]   # None if residual_df == 0
    tau: float
    tau_se: Optional[float]
    alpha: np.ndarray             # shape (K,)
    alpha_se: Optional[np.ndarray]  # shape (K,) or None


def fit_respondent(
    K: int,
    trials: Sequence[Tuple[int, int]],
    y: Sequence[float],
) -> RespondentFit:
    """Fit OLS for one respondent.

    Args:
        K: number of objects (0..K-1)
        trials: list of (left_idx, right_idx) tuples, length N
        y: list of slider responses (already centered: y_AB = -y_BA)
    """
    N = len(trials)
    if len(y) != N:
        raise ValueError(f"len(y)={len(y)} != len(trials)={N}")
    if N == 0:
        raise ValueError("no responses")

    # Build X with reduced parameterization (K-1 free alphas + tau).
    # For each row, alpha_K is eliminated as -(alpha_1 + ... + alpha_{K-1}).
    # If observation row in full parameters is (e_R - e_L + tau), then in
    # reduced parameters it becomes:
    #   - if K is involved (R == K-1 or L == K-1), we substitute
    #   - otherwise the row is e_R - e_L on the first K-1 columns
    X = np.zeros((N, K), dtype=float)  # K-1 alpha + 1 tau columns
    for k, (L, R) in enumerate(trials):
        # full alpha row in K coordinates:
        full = np.zeros(K)
        full[R] += 1.0
        full[L] -= 1.0
        # reduce: alpha_i_reduced = full[i] - full[K-1], for i in 0..K-2
        # because alpha_{K-1} substitutes to -sum_{i<K-1} alpha_i.
        # Equivalently the reduced design row is full[:-1] - full[-1]
        X[k, : K - 1] = full[: K - 1] - full[K - 1]
        X[k, K - 1] = 1.0  # tau

    yv = np.asarray(y, dtype=float)
    # Solve OLS
    beta_hat, residuals, rank, _sv = np.linalg.lstsq(X, yv, rcond=None)
    fitted = X @ beta_hat
    resid = yv - fitted
    residual_df = N - K  # K params (K-1 alpha + 1 tau) when rank is full
    if rank < K:
        # rank-deficient (e.g., not enough connectivity in observed trials)
        # Try with whatever rank we have.
        residual_df = max(N - rank, 0)

    if residual_df > 0:
        rss = float(resid @ resid)
        sigma2 = rss / residual_df
        sigma_hat = float(np.sqrt(sigma2))
        # Covariance matrix of beta_hat
        XtX = X.T @ X
        cov = sigma2 * np.linalg.pinv(XtX)
        beta_se = np.sqrt(np.maximum(np.diag(cov), 0))
    else:
        sigma_hat = None
        cov = None
        beta_se = None

    alpha_reduced = beta_hat[: K - 1]
    tau = float(beta_hat[K - 1])
    alpha = np.concatenate([alpha_reduced, [-alpha_reduced.sum()]])

    if beta_se is not None:
        alpha_red_se = beta_se[: K - 1]
        # Var(alpha_K) = sum_{i,j<K-1} Cov(alpha_i, alpha_j)
        cov_alpha = cov[: K - 1, : K - 1]
        var_K = float(cov_alpha.sum())
        alpha_se = np.concatenate([alpha_red_se, [np.sqrt(max(var_K, 0))]])
        tau_se = float(beta_se[K - 1])
    else:
        alpha_se = None
        tau_se = None

    return RespondentFit(
        n_responses=N,
        residual_df=residual_df,
        sigma_hat=sigma_hat,
        tau=tau,
        tau_se=tau_se,
        alpha=alpha,
        alpha_se=alpha_se,
    )


def aggregate_alphas(fits: List[RespondentFit]) -> Optional[np.ndarray]:
    """Mean alpha across respondents, per object. Returns None if no fits."""
    if not fits:
        return None
    K = len(fits[0].alpha)
    arr = np.array([f.alpha for f in fits if len(f.alpha) == K])
    return arr.mean(axis=0)
