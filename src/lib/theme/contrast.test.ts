import { describe, expect, it } from "vitest";
import { CANDIDATES, TEXT_PAIRS, UI_PAIRS } from "./candidates";
import { contrastRatio, toHex } from "./contrast";

/**
 * Known OKLCH → sRGB conversions, pinning the matrix in `contrast.ts`.
 *
 * This is what makes the rest of the file trustworthy. A mistyped coefficient
 * shifts every ratio slightly and silently, in the direction that lets a
 * failing palette through the gate — so the transform is held against fixed
 * answers and has to break one of them before it can be wrong quietly.
 *
 * The neutral steps double as a check on something else: they must land exactly
 * on Tailwind's neutral ramp, which is what #98 seeded the Figma primitives
 * from, so a drift here would also mean Figma and code had parted company.
 */
describe("OKLCH → sRGB", () => {
  it.each([
    ["oklch(0.145 0 0)", "#0a0a0a"],
    ["oklch(0.205 0 0)", "#171717"],
    ["oklch(0.269 0 0)", "#262626"],
    ["oklch(0.708 0 0)", "#a1a1a1"],
    ["oklch(0.922 0 0)", "#e5e5e5"],
    ["oklch(0.985 0 0)", "#fafafa"],
    // Chromatic values, where a bad coefficient shows up first.
    ["oklch(0.7 0.16 295)", "#a787f6"],
    ["oklch(0.72 0.12 200)", "#14bbc2"],
    ["oklch(0.78 0.13 75)", "#e8aa4e"],
    ["oklch(0.704 0.191 22.216)", "#ff6467"],
  ])("%s → %s", (oklch, hex) => {
    expect(toHex(oklch)).toBe(hex);
  });

  it("rejects a value it cannot parse rather than guessing", () => {
    expect(() => toHex("#a787f6")).toThrow(/Unparseable/);
  });
});

/**
 * The palette's acceptance test.
 *
 * ADR-0013 makes WCAG 2.1 AA the gate a palette has to clear, and #99 requires
 * it cleared *before* anything binds — a palette discovered to fail after #100
 * has to be redone rather than tuned. Checking it by eye in Figma is the weak
 * version of this, so it is measured here instead, on the same values the
 * candidate frames are painted from.
 */
describe.each(CANDIDATES.map((c) => [c.name, c] as const))(
  "candidate %s",
  (_name, candidate) => {
    function value(role: string): string {
      const v = candidate.color[role];
      if (!v) throw new Error(`${candidate.name} has no token "${role}"`);
      return v;
    }

    it.each(TEXT_PAIRS)("%s on %s reaches 4.5:1", (fg, bg) => {
      expect(contrastRatio(value(fg), value(bg))).toBeGreaterThanOrEqual(4.5);
    });

    // SC 1.4.11: a focus indicator is a non-text element that has to be
    // identifiable against whatever surface it lands on. The rail stacks three,
    // so the ring is checked against all three rather than the page ground only.
    it.each(UI_PAIRS)("%s on %s reaches 3:1", (fg, bg) => {
      expect(contrastRatio(value(fg), value(bg))).toBeGreaterThanOrEqual(3);
    });

    it("has an explicit line height on every type step", () => {
      for (const [name, step] of Object.entries(candidate.type)) {
        expect(step.lineHeight, `${name} line height`).toBeGreaterThan(
          step.size,
        );
      }
    });
  },
);
