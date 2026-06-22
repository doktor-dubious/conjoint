"""Smoke tests for the design generator. Run with:
    python -m unittest conjoint.tests.test_design
"""

import unittest
from fractions import Fraction

from conjoint.design import generate_design, target_degrees, orient_eulerian
from conjoint.variance import (
    is_connected,
    pseudoinverse_diag,
    spanning_tree_count,
    variance_stats,
)


def _undirected(directed):
    return [(min(a, b), max(a, b)) for a, b in directed]


def _direction_counts(directed):
    left = {}
    right = {}
    for L, R in directed:
        left[L] = left.get(L, 0) + 1
        right[R] = right.get(R, 0) + 1
    return left, right


class TestTargetDegrees(unittest.TestCase):
    def test_K_equal_N(self):
        self.assertEqual(target_degrees(3, 3), [2, 2, 2])
        self.assertEqual(target_degrees(10, 10), [2] * 10)

    def test_K_plus_2(self):
        # 16 objects, 18 comparisons -> 36 total degree -> two 4s, fourteen 2s
        self.assertEqual(sum(target_degrees(16, 18)), 36)
        self.assertEqual(target_degrees(16, 18).count(4), 2)
        self.assertEqual(target_degrees(16, 18).count(2), 14)

    def test_K_16_N_20(self):
        # The hand-derived design has degree distribution: four 4s + twelve 2s
        self.assertEqual(sorted(target_degrees(16, 20)), [2]*12 + [4]*4)


class TestGenerateDesign(unittest.TestCase):
    def test_K_3_N_3_triangle(self):
        directed = generate_design(K=3, N=3, seed=1)
        self.assertEqual(len(directed), 3)
        undirected = _undirected(directed)
        self.assertEqual(len(set(undirected)), 3)  # 3 distinct pairs = K_3
        left, right = _direction_counts(directed)
        # Strict tau-orthogonality: each vertex has equal #left and #right
        for v in range(3):
            self.assertEqual(left.get(v, 0), right.get(v, 0),
                             f"vertex {v} direction-imbalanced")

    def test_K_16_N_20_beats_handcomputed(self):
        """Local search must find something at least as good as the
        hand-built 16-cycle + 4-chord-cycle baseline (2160 spanning trees,
        max Var 0.987, ratio 2.63)."""
        directed = generate_design(K=16, N=20, seed=42, max_iter=400)
        self.assertEqual(len(directed), 20)
        undirected = _undirected(directed)
        stats = variance_stats(16, undirected)
        self.assertGreaterEqual(stats["spanning_trees"], 2160)
        self.assertLessEqual(stats["max"], 0.99)
        self.assertLessEqual(stats["ratio"], 2.63)

    def test_direction_balance(self):
        cases = [
            (3, 3), (3, 4), (3, 5),
            (4, 4), (4, 5), (4, 6), (4, 8),
            (5, 5), (5, 6), (5, 7), (5, 8), (5, 10),
            (6, 6), (6, 8), (6, 10),
            (10, 10), (10, 11), (10, 12), (10, 14), (10, 18),
            (16, 16), (16, 17), (16, 20), (16, 24),
        ]
        for K, N in cases:
            with self.subTest(K=K, N=N):
                directed = generate_design(K=K, N=N, seed=0, max_iter=50)
                self.assertEqual(len(directed), N)
                left, right = _direction_counts(directed)
                for v in range(K):
                    self.assertEqual(
                        left.get(v, 0), right.get(v, 0),
                        f"K={K}, N={N}: vertex {v} imbalanced "
                        f"({left.get(v,0)} L vs {right.get(v,0)} R)"
                    )

    def test_N_K_plus_1_now_supported(self):
        """Previously rejected; now constructed via (K-1)-cycle + doubled edge."""
        directed = generate_design(K=10, N=11, seed=0, max_iter=50)
        self.assertEqual(len(directed), 11)

    def test_K_1_rejected(self):
        with self.assertRaises(ValueError):
            generate_design(K=1, N=2)

    def test_N_less_than_K_rejected(self):
        with self.assertRaises(ValueError):
            generate_design(K=5, N=4)


class TestVarianceMonotone(unittest.TestCase):
    """Variances should generally shrink as N grows (more info per object)."""

    def test_mean_var_decreases(self):
        means = []
        for N in [10, 12, 14, 16, 18, 20]:
            directed = generate_design(K=10, N=N, seed=0)
            undirected = _undirected(directed)
            stats = variance_stats(10, undirected)
            means.append(stats["mean"])
        # Strictly decreasing
        for a, b in zip(means, means[1:]):
            self.assertGreater(a, b)


class TestEulerianOrientation(unittest.TestCase):
    def test_all_balanced(self):
        # 16-cycle + 4-cycle chord on hubs
        edges = [(i, (i + 1) % 16) for i in range(16)]
        edges += [(0, 4), (4, 12), (12, 8), (8, 0)]
        edges = [(min(a, b), max(a, b)) for a, b in edges]
        directed = orient_eulerian(16, edges)
        self.assertEqual(len(directed), 20)
        left, right = _direction_counts(directed)
        for v in range(16):
            self.assertEqual(left.get(v, 0), right.get(v, 0))


if __name__ == "__main__":
    unittest.main()


class TestForbidReverse(unittest.TestCase):
    """Reverse-free designs: no unordered pair used in both directions."""

    def _reverse_pairs(self, directed):
        s = set(directed)
        return [(a, b) for (a, b) in directed if (b, a) in s]

    def test_no_reverse_pairs(self):
        for K, N in [(3, 3), (4, 4), (5, 5), (5, 6), (5, 7), (5, 10), (16, 20)]:
            d = generate_design(K, N, forbid_reverse=True, seed=1)
            self.assertEqual(len(d), N)
            self.assertEqual(self._reverse_pairs(d), [],
                             f"reverse pair found for K={K}, N={N}")
            self.assertTrue(is_connected(K, _undirected(d)))

    def test_infeasible_raises(self):
        from conjoint.design import InfeasibleDesign
        for K, N in [(4, 5), (4, 6), (5, 8), (5, 9), (5, 11)]:
            with self.assertRaises(InfeasibleDesign):
                generate_design(K, N, forbid_reverse=True, seed=1)

    def test_default_allows_reverse(self):
        # K=4, N=6 is feasible (with reverse pairs) under the default mode.
        d = generate_design(4, 6, seed=1)
        self.assertEqual(len(d), 6)
