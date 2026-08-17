/**
 * WCAG 2.1 contrast maths over the OKLCH token values in `./candidates`.
 *
 * The OKLab transform below is Björn Ottosson's published matrix — a fixed
 * constant, not something with a maintained implementation behind it.
 *
 * Its one hazard is that a mistyped coefficient does not announce itself: it
 * shifts every ratio slightly, in the direction that lets a failing palette
 * through this gate for CI's axe check to reject later. `contrast.test.ts`
 * closes that off by pinning {@link toHex} against known conversions, so the
 * matrix has to disagree with a correct answer before it can be wrong quietly.
 */

interface Rgb {
  /** sRGB channels, gamma-encoded and clamped to 0–1 — what actually paints. */
  r: number;
  g: number;
  b: number;
  alpha: number;
}

/** `oklch(L C H)` or `oklch(L C H / A%)`, the two forms `globals.css` uses. */
const OKLCH =
  /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/;

const clamp = (n: number) => Math.min(Math.max(n, 0), 1);

/** Gamma-encode one linear-light channel into sRGB. */
function encode(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Decode one sRGB channel back to linear light. */
function decode(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Parse an OKLCH string into gamma-encoded sRGB.
 *
 * Encoding and clamping here rather than staying in linear light is deliberate:
 * an out-of-gamut color is clipped by the browser before it is painted, so a
 * ratio computed on the unclipped value would describe a color nobody sees.
 */
function srgb(color: string): Rgb {
  const m = OKLCH.exec(color.trim());
  if (!m) throw new Error(`Unparseable OKLCH color: ${color}`);

  const [, lRaw, cRaw, hRaw, aRaw, pct] = m;
  const L = Number(lRaw);
  const C = Number(cRaw);
  const h = (Number(hRaw) * Math.PI) / 180;
  const alpha =
    aRaw === undefined ? 1 : pct ? Number(aRaw) / 100 : Number(aRaw);

  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // OKLab → LMS, cubed back out of the perceptual cube root.
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m2 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: clamp(encode(4.0767416621 * l - 3.3077115913 * m2 + 0.2309699292 * s)),
    g: clamp(encode(-1.2684380046 * l + 2.6097574011 * m2 - 0.3413193965 * s)),
    b: clamp(encode(-0.0041960863 * l - 0.7034186147 * m2 + 1.707614701 * s)),
    alpha,
  };
}

/**
 * Flatten a translucent foreground onto its background.
 *
 * Needed because several tokens are alpha whites (`oklch(1 0 0 / 10%)`), and a
 * ratio computed on an alpha color without compositing is meaningless — it
 * measures a color that is never painted.
 */
function composite(fg: Rgb, bg: Rgb): Rgb {
  const mix = (f: number, b: number) => f * fg.alpha + b * (1 - fg.alpha);
  return {
    r: mix(fg.r, bg.r),
    g: mix(fg.g, bg.g),
    b: mix(fg.b, bg.b),
    alpha: 1,
  };
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b);
}

/**
 * Contrast ratio between two token values, compositing the foreground onto the
 * background first. The background is assumed opaque — every surface token in
 * this system is.
 */
export function contrastRatio(foreground: string, background: string): number {
  const bg = srgb(background);
  const fg = composite(srgb(foreground), bg);
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Hex form of a token value, for carrying a chosen color into Figma. */
export function toHex(color: string): string {
  const { r, g, b } = srgb(color);
  const byte = (c: number) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
