/**
 * Normalize an Input label into a safe, lowercase identifier.
 *
 * Slug normalization is mandatory — exports break otherwise (see CONTEXT.md,
 * "Sprite Name"). The result is a snake-cased string of word tokens; downstream
 * {@link applyTemplate} re-cases it as needed.
 *
 * Rules:
 * - ASCII letters/digits form word tokens; letter↔digit runs stay together
 *   ("F1" → `f1`).
 * - Whitespace and unmapped punctuation act as token separators.
 * - Recognized symbols expand to words ("→" → `arrow_right`, "+" → `plus`).
 * - When nothing normalizable remains, falls back to `glyph`.
 */
const SYMBOL_WORDS: Record<string, string> = {
  "→": "arrow_right",
  "←": "arrow_left",
  "↑": "arrow_up",
  "↓": "arrow_down",
  "+": "plus",
  "-": "minus",
  "/": "slash",
  "\\": "backslash",
  "*": "star",
  "&": "and",
  "@": "at",
  "#": "hash",
  "%": "percent",
  "=": "equals",
  "?": "question",
  "!": "bang",
  ".": "dot",
  ",": "comma",
  ":": "colon",
  ";": "semicolon",
};

const WORD_CHAR = /[a-z0-9]/;

export function slugify(label: string): string {
  const chars = [...label.toLowerCase()];
  const words: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      words.push(current);
      current = "";
    }
  };

  for (const ch of chars) {
    if (WORD_CHAR.test(ch)) {
      current += ch;
    } else if (ch in SYMBOL_WORDS) {
      flush();
      words.push(SYMBOL_WORDS[ch]);
    } else {
      // Whitespace or unmapped punctuation — a token boundary.
      flush();
    }
  }
  flush();

  return words.length > 0 ? words.join("_") : "glyph";
}
