"""Command-line interface.

Examples:
    python -m conjoint generate --K 16 --N 20 --out design.csv
    python -m conjoint scan --K 10 --N-min 10 --N-max 20 --out scan.csv
    python -m conjoint generate --K 3 --N 3 --objective min-max-var
"""

import argparse
import csv
import random
import sys
from typing import List

from .design import generate_design
from .scan import variance_scan
from .variance import variance_stats


def _obj_name(i: int, K: int) -> str:
    width = max(2, len(str(K)))
    return f"Obj_{i + 1:0{width}d}"


def cmd_generate(args: argparse.Namespace) -> int:
    directed = generate_design(
        K=args.K,
        N=args.N,
        objective=args.objective,
        seed=args.seed,
        max_iter=args.max_iter,
    )

    # Constrained-shuffle the presentation order to avoid back-to-back same-object trials
    rng = random.Random(args.seed)
    order = list(range(len(directed)))
    best_order = order[:]
    best_adjacent = _count_adjacent_overlap(directed, best_order)
    for _ in range(2000):
        rng.shuffle(order)
        adj = _count_adjacent_overlap(directed, order)
        if adj < best_adjacent:
            best_adjacent = adj
            best_order = order[:]
            if best_adjacent == 0:
                break

    out_path = args.out or "design.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["trial", "left", "right", "pair"])
        for trial_no, idx in enumerate(best_order, 1):
            L, R = directed[idx]
            lo, hi = (L, R) if L < R else (R, L)
            w.writerow([
                trial_no,
                _obj_name(L, args.K),
                _obj_name(R, args.K),
                f"{lo + 1:02d}-{hi + 1:02d}",
            ])
    print(f"Wrote {len(directed)} comparisons to {out_path}")

    # Summary
    undirected = [(min(a, b), max(a, b)) for a, b in directed]
    stats = variance_stats(args.K, undirected)
    print()
    print("Design summary:")
    print(f"  K (objects):      {args.K}")
    print(f"  N (comparisons):  {args.N}")
    print(f"  residual df:      {args.N - args.K}")
    print(f"  objective:        {args.objective}")
    print(f"  min Var/sigma^2:  {stats['min']:.4f}")
    print(f"  max Var/sigma^2:  {stats['max']:.4f}")
    print(f"  max/min ratio:    {stats['ratio']:.2f}")
    print(f"  spanning trees:   {stats['spanning_trees']}")
    print(f"  adjacent overlap: {best_adjacent}/{len(directed) - 1}")
    return 0


def _count_adjacent_overlap(directed, order) -> int:
    bad = 0
    for k in range(len(order) - 1):
        a, b = directed[order[k]]
        c, d = directed[order[k + 1]]
        if {a, b} & {c, d}:
            bad += 1
    return bad


def cmd_scan(args: argparse.Namespace) -> int:
    rows = variance_scan(
        K=args.K,
        N_min=args.N_min,
        N_max=args.N_max,
        objective=args.objective,
        seed=args.seed,
    )
    fieldnames = [
        "N", "residual_df", "min_var", "max_var", "mean_var",
        "ratio", "spanning_trees", "n_distinct_var", "feasible", "note",
    ]
    out_path = args.out or "scan.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            w.writerow(row)
    print(f"Wrote {len(rows)} rows to {out_path}")

    # Also print to stdout
    print()
    print(f"{'N':>3} {'rdf':>4} {'min':>9} {'max':>9} {'mean':>9} "
          f"{'ratio':>7} {'#tree':>10} {'levels':>7} note")
    for r in rows:
        if r["feasible"]:
            print(f"{r['N']:>3} {r['residual_df']:>4} "
                  f"{r['min_var']:>9.4f} {r['max_var']:>9.4f} {r['mean_var']:>9.4f} "
                  f"{r['ratio']:>7.2f} {r['spanning_trees']:>10} "
                  f"{r['n_distinct_var']:>7}")
        else:
            print(f"{r['N']:>3} {r['residual_df']:>4}  -- skipped --   "
                  f"{r['note']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="conjoint",
        description="Pairwise-comparison conjoint design generator and analyzer.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate", help="Generate a design CSV for given (K, N).")
    g.add_argument("--K", type=int, required=True, help="number of objects")
    g.add_argument("--N", type=int, required=True, help="comparisons per respondent")
    g.add_argument("--objective", choices=["d-optimal", "min-max-var"],
                   default="d-optimal")
    g.add_argument("--seed", type=int, default=0)
    g.add_argument("--max-iter", dest="max_iter", type=int, default=500)
    g.add_argument("--out", type=str, default=None)
    g.set_defaults(func=cmd_generate)

    s = sub.add_parser("scan", help="Scan Var(alpha) for a range of N (fixed K).")
    s.add_argument("--K", type=int, required=True)
    s.add_argument("--N-min", dest="N_min", type=int, required=True)
    s.add_argument("--N-max", dest="N_max", type=int, required=True)
    s.add_argument("--objective", choices=["d-optimal", "min-max-var"],
                   default="d-optimal")
    s.add_argument("--seed", type=int, default=0)
    s.add_argument("--out", type=str, default=None)
    s.set_defaults(func=cmd_scan)
    return p


def main(argv: List[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
