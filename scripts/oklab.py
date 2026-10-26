"""Minimal OKLab / OKLCH helpers (sRGB, D65)."""
import numpy as np


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255


def _lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def oklab(h):
    r, g, b = _lin(rgb(h))
    l = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def oklch(h):
    L, a, b = oklab(h)
    return float(L), float(np.hypot(a, b)), float(np.degrees(np.arctan2(b, a)) % 360)


def in_gamut(L, C, H):
    a, b = C * np.cos(np.radians(H)), C * np.sin(np.radians(H))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb_ = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    return all(-1e-4 <= v <= 1 + 1e-4 for v in rgb_)


def max_chroma(L, H):
    lo, hi = 0.0, 0.4
    for _ in range(24):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if in_gamut(L, mid, H) else (lo, mid)
    return lo


def dh(h1, h2):
    """signed hue difference h2 - h1 in -180..180"""
    return (h2 - h1 + 180) % 360 - 180


def cusp(H):
    """lightness and chroma of the most chromatic in-gamut color of a hue"""
    best = (0.0, 0.0)
    for i in range(30, 100):
        L = i / 100
        c = max_chroma(L, H)
        if c > best[1]:
            best = (L, c)
    return best
