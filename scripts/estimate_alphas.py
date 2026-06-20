"""Estimate per-respondent alpha values under H1 (preference function) with order effect tau.

Model per respondent (suppressing respondent index):
    y_LP = alpha_P - alpha_L + tau + eps_1
    y_SL = alpha_L - alpha_S + tau + eps_2
    y_PS = alpha_S - alpha_P + tau + eps_3
subject to  alpha_L + alpha_P + alpha_S = 0  (sum-to-zero).

Since the design matrix has tau orthogonal to the alpha columns, and the
information sub-matrix for (alpha_L, alpha_P) is [[6, 3], [3, 6]] after
substituting alpha_S = -alpha_L - alpha_P, the OLS closed form is:

    tau_hat   = (y_LP + y_SL + y_PS) / 3
    alpha_L   = (y_SL - y_LP) / 3
    alpha_P   = (y_LP - y_PS) / 3
    alpha_S   = (y_PS - y_SL) / 3

With 3 observations and 3 free parameters per respondent the model is
saturated (residual df = 0 per respondent), so per-respondent sigma cannot
be estimated from a single respondent's data. We report the pooled
"cycle-residual" RMSE across respondents as a global noise indicator.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

RAW = Path("/home/rune/workspace/projects/conjoint/data/raw_data.tsv")
OUT = Path("/home/rune/workspace/projects/conjoint/data/alpha_estimates.csv")


def main() -> None:
    by_id: dict[str, dict[str, float]] = defaultdict(dict)
    order: list[str] = []
    with RAW.open() as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            rid = row["Id"]
            if rid not in by_id:
                order.append(rid)
            by_id[rid][row["Par"]] = float(row["yny"])

    rows_out = []
    cycle_sums = []
    for rid in order:
        r = by_id[rid]
        y_LP, y_SL, y_PS = r["LP"], r["SL"], r["PS"]
        tau = (y_LP + y_SL + y_PS) / 3.0
        alpha_L = (y_SL - y_LP) / 3.0
        alpha_P = (y_LP - y_PS) / 3.0
        alpha_S = (y_PS - y_SL) / 3.0
        # Cycle residual under H1 (without tau): y_LP + y_SL + y_PS expected
        # = 3*tau if H1 holds, so 3*tau is the per-respondent "bias" estimate.
        # Pure noise around H1 cannot be separated from tau with only 3 obs.
        cycle_sums.append(y_LP + y_SL + y_PS)
        rows_out.append(
            {
                "Id": rid,
                "alpha_L": round(alpha_L, 4),
                "alpha_P": round(alpha_P, 4),
                "alpha_S": round(alpha_S, 4),
                "tau": round(tau, 4),
                "y_LP": y_LP,
                "y_SL": y_SL,
                "y_PS": y_PS,
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Id", "alpha_L", "alpha_P", "alpha_S", "tau", "y_LP", "y_SL", "y_PS"],
        )
        writer.writeheader()
        writer.writerows(rows_out)

    n = len(rows_out)
    # Summary stats
    def stats(key: str) -> tuple[float, float, float, float]:
        xs = [r[key] for r in rows_out]
        mean = sum(xs) / n
        var = sum((x - mean) ** 2 for x in xs) / (n - 1)
        sd = var**0.5
        return mean, sd, min(xs), max(xs)

    print(f"Respondents: {n}")
    print(f"{'param':<10}{'mean':>10}{'sd':>10}{'min':>10}{'max':>10}")
    for key in ("alpha_L", "alpha_P", "alpha_S", "tau"):
        m, sd, lo, hi = stats(key)
        print(f"{key:<10}{m:>10.3f}{sd:>10.3f}{lo:>10.3f}{hi:>10.3f}")

    # The pooled cross-respondent variance of tau gives a sense of the
    # variation of order-effect across people; under H1 cycle sums are
    # exactly 3*tau_i, so we cannot separate sigma from variation in tau.
    print()
    print("Sanity check: alpha_L + alpha_P + alpha_S per respondent (should be 0):")
    sums = [r["alpha_L"] + r["alpha_P"] + r["alpha_S"] for r in rows_out]
    print(f"  max |sum|: {max(abs(s) for s in sums):.6f}")
    print(f"  Wrote {n} rows to {OUT}")


if __name__ == "__main__":
    main()
