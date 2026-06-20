"""Conjoint analysis: pairwise-comparison experimental design and analysis.

Module layout:
    design.py     -- generate a D-optimal directed pairwise-comparison design
    variance.py   -- Laplacian, pseudo-inverse, Var(alpha)/sigma^2 statistics
    scan.py       -- scan Var(alpha) across a range of N for fixed K
    _linalg.py    -- rational linear-algebra helpers (no numpy dependency)
    cli.py        -- command-line entrypoint
"""

from .design import generate_design, orient_eulerian
from .variance import variance_stats, laplacian, pseudoinverse_diag
from .scan import variance_scan

__all__ = [
    "generate_design",
    "orient_eulerian",
    "variance_stats",
    "laplacian",
    "pseudoinverse_diag",
    "variance_scan",
]
