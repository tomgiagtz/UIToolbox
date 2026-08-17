/**
 * The app chrome's two faces, self-hosted through `next/font` (ADR-0013 §6).
 *
 * **`next/font/local`, not `next/font/google`.** The Google loader fetches at
 * build time, which makes an offline or network-restricted build fail on a
 * dependency that isn't in the lockfile. The bytes are committed beside this
 * file for the same reason the Glyph faces are committed under `public/fonts/`.
 *
 * Both are exposed to Tailwind by `globals.css` as `font-sans` (body) and
 * `font-heading` (display), so a component names a role rather than a family.
 *
 * These are **not** Glyph fonts and must never be listed in `BUNDLED_FONTS`
 * (`src/lib/glyph/bundled-fonts.ts`). That registry is the set of families a
 * *user* can draw a Glyph's label in; this file is the app's own chrome. ADR-0013
 * keeps the two vocabularies apart, and a face appearing in both would put the
 * app's UI font in the user's font picker.
 */
import localFont from "next/font/local";

/**
 * Display face — headings only. Kept from the original Figma file because it is
 * a real choice with actual character, which the rest of the app had none of.
 * It ships one weight upstream, so there is nothing to vary.
 */
export const displayFont = localFont({
  src: "./fonts/CalSans-Regular.woff2",
  variable: "--font-display",
  weight: "400",
  display: "swap",
  // Public Sans rather than a generic stack: if Cal Sans is still loading, the
  // fallback should be the face the rest of the page is already using.
  fallback: ["Public Sans", "system-ui", "sans-serif"],
});

/**
 * Body face, replacing Calibri — which was never a choice, only what a font
 * picker falls back to on Windows. Public Sans ships a weight axis, so the
 * whole 100–900 range is available to a single file.
 */
export const bodyFont = localFont({
  src: "./fonts/PublicSans-Variable.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
