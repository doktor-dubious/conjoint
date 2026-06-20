"""Rational linear algebra used for exact computation on small designs.

For K <= ~100 vertices this is fast enough; for larger K, swap in numpy.
"""

from fractions import Fraction
from typing import List


Matrix = List[List[Fraction]]


def inv(M: Matrix) -> Matrix:
    """Gauss-Jordan inverse of a square rational matrix."""
    n = len(M)
    A = [[Fraction(M[i][j]) for j in range(n)] for i in range(n)]
    I = [[Fraction(1 if i == j else 0) for j in range(n)] for i in range(n)]
    for k in range(n):
        pivot = None
        for i in range(k, n):
            if A[i][k] != 0:
                pivot = i
                break
        if pivot is None:
            raise ValueError("singular matrix")
        if pivot != k:
            A[k], A[pivot] = A[pivot], A[k]
            I[k], I[pivot] = I[pivot], I[k]
        p = A[k][k]
        for j in range(n):
            A[k][j] /= p
            I[k][j] /= p
        for i in range(n):
            if i != k and A[i][k] != 0:
                f = A[i][k]
                for j in range(n):
                    A[i][j] -= f * A[k][j]
                    I[i][j] -= f * I[k][j]
    return I


def det(M: Matrix) -> Fraction:
    """Determinant via Gaussian elimination."""
    n = len(M)
    A = [[Fraction(M[i][j]) for j in range(n)] for i in range(n)]
    d = Fraction(1)
    sign = 1
    for k in range(n):
        pivot = None
        for i in range(k, n):
            if A[i][k] != 0:
                pivot = i
                break
        if pivot is None:
            return Fraction(0)
        if pivot != k:
            A[k], A[pivot] = A[pivot], A[k]
            sign = -sign
        d *= A[k][k]
        for i in range(k + 1, n):
            if A[i][k] != 0:
                f = A[i][k] / A[k][k]
                for j in range(k, n):
                    A[i][j] -= f * A[k][j]
    return d * sign
