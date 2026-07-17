import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/glyph/slugify";

describe("slugify", () => {
  it("lowercases a simple label", () => {
    expect(slugify("A")).toBe("a");
    expect(slugify("LMB")).toBe("lmb");
  });

  it("joins whitespace-separated words with underscores", () => {
    expect(slugify("Right Stick")).toBe("right_stick");
    expect(slugify("  Left   Bumper ")).toBe("left_bumper");
  });

  it("maps arrow symbols to direction words", () => {
    expect(slugify("→")).toBe("arrow_right");
    expect(slugify("←")).toBe("arrow_left");
    expect(slugify("↑")).toBe("arrow_up");
    expect(slugify("↓")).toBe("arrow_down");
  });

  it("maps common punctuation symbols to words", () => {
    expect(slugify("+")).toBe("plus");
    expect(slugify("-")).toBe("minus");
    expect(slugify("?")).toBe("question");
  });

  it("keeps digits and separates letter/number runs sensibly", () => {
    expect(slugify("F1")).toBe("f1");
    expect(slugify("Num 1")).toBe("num_1");
  });

  it("collapses stray punctuation into a single separator", () => {
    expect(slugify("Ctrl + Alt")).toBe("ctrl_plus_alt");
    expect(slugify("L / R")).toBe("l_slash_r");
  });

  it("falls back to a safe token when nothing normalizable remains", () => {
    expect(slugify("")).toBe("glyph");
    expect(slugify("   ")).toBe("glyph");
  });
});
