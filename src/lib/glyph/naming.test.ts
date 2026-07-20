import { describe, expect, it } from "vitest";
import { applyTemplate } from "@/lib/glyph/naming";
import { slugify } from "@/lib/glyph/slugify";

describe("applyTemplate", () => {
  const tokens = (
    over: Partial<Record<"device" | "input" | "index", string>>,
  ) => ({
    device: "keyboard",
    input: "right_stick",
    index: "0",
    ...over,
  });

  it("substitutes tokens with snake_case by default template", () => {
    expect(applyTemplate("{device}_{input}", tokens({}), "snake")).toBe(
      "keyboard_right_stick",
    );
  });

  it("renders kebab-case across token and separator boundaries", () => {
    expect(applyTemplate("{device}_{input}", tokens({}), "kebab")).toBe(
      "keyboard-right-stick",
    );
  });

  it("renders camelCase across token and separator boundaries", () => {
    expect(applyTemplate("{device}_{input}", tokens({}), "camel")).toBe(
      "keyboardRightStick",
    );
  });

  it("supports the {index} token", () => {
    expect(
      applyTemplate(
        "{device}_{index}_{input}",
        tokens({ index: "3" }),
        "snake",
      ),
    ).toBe("keyboard_3_right_stick");
  });

  it("treats literal punctuation in the template as a word boundary", () => {
    expect(applyTemplate("{input}", tokens({ input: "a" }), "camel")).toBe("a");
    expect(applyTemplate("btn.{input}", tokens({ input: "a" }), "snake")).toBe(
      "btn_a",
    );
  });

  it("ignores unknown tokens (leaves no braces in output)", () => {
    expect(applyTemplate("{device}_{bogus}", tokens({}), "snake")).toBe(
      "keyboard",
    );
  });
});

describe("template + case over slugged labels (#6)", () => {
  // The mandatory slug normalization runs first; the template + case apply on
  // top of the slugged tokens, exactly as generateTilesets composes them.
  const named = (
    device: string,
    label: string,
    template: string,
    c: Parameters<typeof applyTemplate>[2],
  ) =>
    applyTemplate(
      template,
      { device: slugify(device), input: slugify(label), index: "0" },
      c,
    );

  it("snake_case over a spaced label", () => {
    expect(named("Xbox", "Right Stick", "{device}_{input}", "snake")).toBe(
      "xbox_right_stick",
    );
  });

  it("kebab-case over a symbol label", () => {
    expect(named("Keyboard", "→", "{device}_{input}", "kebab")).toBe(
      "keyboard-arrow-right",
    );
  });

  it("camelCase over a mixed label", () => {
    // "-" is a recognized symbol → "minus"; "PlayStation" is one slug token.
    expect(named("PlayStation", "D-Pad Up", "{device}_{input}", "camel")).toBe(
      "playstationDMinusPadUp",
    );
  });
});
