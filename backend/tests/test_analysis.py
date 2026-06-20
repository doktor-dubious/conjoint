"""Tests for app.analysis.fit_respondent.

These tests require numpy. Run inside the backend container:
    docker compose run --rm api pytest backend/tests/
or in a venv with numpy installed:
    PYTHONPATH=. python -m pytest backend/tests/
"""

import math

import numpy as np
import pytest

from app.analysis import fit_respondent


# Rune 1 ordering: object 0 = P, 1 = S, 2 = L
# Trials, using positions (left, right):
#   PS = (0, 1)   y_PS = alpha_S - alpha_P + tau
#   SL = (1, 2)   y_SL = alpha_L - alpha_S + tau
#   LP = (2, 0)   y_LP = alpha_P - alpha_L + tau
RUNE1_TRIPLE_TRIALS = [(0, 1), (1, 2), (2, 0)]  # PS, SL, LP


def closed_form_K3(y_PS: float, y_SL: float, y_LP: float):
    """Closed-form OLS for the K=3 saturated case from the Rune 1 analysis."""
    tau = (y_PS + y_SL + y_LP) / 3.0
    alpha_P = (y_LP - y_PS) / 3.0
    alpha_S = (y_PS - y_SL) / 3.0
    alpha_L = (y_SL - y_LP) / 3.0
    return alpha_P, alpha_S, alpha_L, tau


# ---------------------------------------------------------------------------
# Saturated K=3, N=3
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "y_PS,y_SL,y_LP",
    [
        # (Rune 1) respondent 288714172 from the corrected NY dataset
        (-3.0, -2.0, -1.0),
        # Extreme respondent 288715371
        (25.0, -25.0, -25.0),
        # Symmetric: zeros
        (0.0, 0.0, 0.0),
        # Asymmetric / arbitrary
        (12.5, -7.0, 3.25),
    ],
)
def test_K3_saturated_matches_closed_form(y_PS, y_SL, y_LP):
    fit = fit_respondent(
        K=3,
        trials=RUNE1_TRIPLE_TRIALS,
        y=[y_PS, y_SL, y_LP],
    )
    a_P_expected, a_S_expected, a_L_expected, tau_expected = closed_form_K3(
        y_PS, y_SL, y_LP
    )

    assert fit.residual_df == 0
    assert fit.sigma_hat is None
    assert fit.alpha_se is None
    assert fit.tau_se is None

    assert fit.alpha[0] == pytest.approx(a_P_expected, abs=1e-9)
    assert fit.alpha[1] == pytest.approx(a_S_expected, abs=1e-9)
    assert fit.alpha[2] == pytest.approx(a_L_expected, abs=1e-9)
    assert fit.tau == pytest.approx(tau_expected, abs=1e-9)

    # Sum-to-zero constraint
    assert sum(fit.alpha) == pytest.approx(0.0, abs=1e-9)


def test_K3_saturated_extreme_reproduces_observations():
    """For the saturated K=3 case the residuals must be exactly zero."""
    y = [25.0, -25.0, -25.0]
    fit = fit_respondent(K=3, trials=RUNE1_TRIPLE_TRIALS, y=y)
    a_P, a_S, a_L = fit.alpha[0], fit.alpha[1], fit.alpha[2]
    tau = fit.tau
    # Reproduce: y_PS = a_S - a_P + tau, etc.
    assert (a_S - a_P + tau) == pytest.approx(y[0], abs=1e-9)
    assert (a_L - a_S + tau) == pytest.approx(y[1], abs=1e-9)
    assert (a_P - a_L + tau) == pytest.approx(y[2], abs=1e-9)


# ---------------------------------------------------------------------------
# K=3, N=20 (Rune 1 production design): residual df = 17, SEs available.
# We construct a synthetic respondent with known true alphas + noise.
# ---------------------------------------------------------------------------


def _build_rune1_K3_N20_design():
    """The (6, 6, 8) D-optimal allocation we used for Rune 1: 3 PS each
    direction, 3 PL each direction, 4 SL each direction."""
    trials = []
    trials += [(0, 1)] * 3 + [(1, 0)] * 3            # PS direction-balanced
    trials += [(0, 2)] * 3 + [(2, 0)] * 3            # PL direction-balanced
    trials += [(1, 2)] * 4 + [(2, 1)] * 4            # SL direction-balanced
    return trials


def test_K3_N20_recovers_alpha_with_zero_noise():
    trials = _build_rune1_K3_N20_design()
    true_alpha = np.array([2.0, -3.0, 1.0])          # sums to zero
    true_tau = 0.5
    y = [true_alpha[R] - true_alpha[L] + true_tau for (L, R) in trials]

    fit = fit_respondent(K=3, trials=trials, y=y)
    assert fit.residual_df == 20 - 3
    assert fit.sigma_hat == pytest.approx(0.0, abs=1e-9)
    assert fit.tau == pytest.approx(true_tau, abs=1e-9)
    for i in range(3):
        assert fit.alpha[i] == pytest.approx(true_alpha[i], abs=1e-9)


def test_K3_N20_unbiased_under_noise_and_SEs_finite():
    """Under independent Gaussian noise, the OLS point estimate should be
    very close to the truth at this many observations, and SEs should be
    finite and positive."""
    rng = np.random.default_rng(2026)
    trials = _build_rune1_K3_N20_design()
    true_alpha = np.array([5.0, -4.0, -1.0])
    true_tau = 0.0
    sigma_true = 2.0

    # Average over many synthetic respondents for a tighter check
    estimates = []
    for _ in range(200):
        eps = rng.normal(0.0, sigma_true, size=len(trials))
        y = [
            true_alpha[R] - true_alpha[L] + true_tau + eps[k]
            for k, (L, R) in enumerate(trials)
        ]
        fit = fit_respondent(K=3, trials=trials, y=y)
        estimates.append(fit.alpha)
        # SEs are finite, positive, and tau_se is finite
        assert fit.alpha_se is not None
        assert all(s > 0 and math.isfinite(s) for s in fit.alpha_se)
        assert fit.tau_se is not None and math.isfinite(fit.tau_se)

    mean_alpha = np.mean(estimates, axis=0)
    # Sample mean should be near the true alpha (within a few SE/sqrt(N))
    for i in range(3):
        assert mean_alpha[i] == pytest.approx(true_alpha[i], abs=0.5)


# ---------------------------------------------------------------------------
# K=4, N=12 (Gabrielsen beer design: each unordered pair twice, both directions)
# ---------------------------------------------------------------------------


def test_K4_N12_recovers_alpha():
    """Each of C(4,2)=6 pairs appears twice (once per direction). 12 obs,
    residual_df = 12 - 4 = 8."""
    pairs = [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]
    trials = []
    for a, b in pairs:
        trials.append((a, b))
        trials.append((b, a))
    true_alpha = np.array([3.0, 1.0, -1.0, -3.0])
    true_tau = -0.25
    y = [true_alpha[R] - true_alpha[L] + true_tau for (L, R) in trials]

    fit = fit_respondent(K=4, trials=trials, y=y)
    assert fit.residual_df == 12 - 4
    assert fit.sigma_hat == pytest.approx(0.0, abs=1e-9)
    assert fit.tau == pytest.approx(true_tau, abs=1e-9)
    for i in range(4):
        assert fit.alpha[i] == pytest.approx(true_alpha[i], abs=1e-9)
    # Sum-to-zero
    assert float(fit.alpha.sum()) == pytest.approx(0.0, abs=1e-9)
