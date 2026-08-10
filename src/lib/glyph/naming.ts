import { DEFAULT_PROJECT_NAME } from "@/lib/glyph/defaults";
import type { CaseStyle } from "@/lib/glyph/types";

export interface NameTokens {
  device: string;
  input: string;
  index: string;
}

/** Reduce a config name to a filesystem-safe base filename (no extension). */
export function safeBaseName(name: string): string {
  const safe = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safe || DEFAULT_PROJECT_NAME;
}

/**
 * The word separator a given case style uses — so callers appending to an
 * already-cased name (e.g. a collision suffix) stay consistent with it.
 * camelCase has no separator.
 */
export function caseSeparator(caseStyle: CaseStyle): string {
  switch (caseStyle) {
    case "snake":
      return "_";
    case "kebab":
      return "-";
    case "camel":
      return "";
  }
}

/**
 * Build a Sprite Name from a template + already-slugified token values + a case
 * style.
 *
 * The template's `{device}`, `{input}`, `{index}` tokens are substituted;
 * unknown `{...}` tokens expand to nothing. The whole expansion is then split
 * into word tokens (on any non-alphanumeric — including the template's literal
 * separators and the underscores inside slug values) and re-joined per
 * {@link CaseStyle}, so the chosen case is consistent across token boundaries.
 */
export function applyTemplate(
  template: string,
  tokens: NameTokens,
  caseStyle: CaseStyle,
): string {
  const expanded = template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in tokens ? tokens[key as keyof NameTokens] : "",
  );

  const words = expanded
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());

  switch (caseStyle) {
    case "snake":
      return words.join("_");
    case "kebab":
      return words.join("-");
    case "camel":
      return words
        .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
        .join("");
  }
}
