import { describe, expect, it } from "vitest";
import { applyTemplate } from "@/lib/glyph/naming";

describe("applyTemplate", () => {
  const tokens = (over: Partial<Record<"device" | "input" | "index", string>>) => ({
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
      applyTemplate("{device}_{index}_{input}", tokens({ index: "3" }), "snake"),
    ).toBe("keyboard_3_right_stick");
  });

  it("treats literal punctuation in the template as a word boundary", () => {
    expect(applyTemplate("{input}", tokens({ input: "a" }), "camel")).toBe("a");
    expect(
      applyTemplate("btn.{input}", tokens({ input: "a" }), "snake"),
    ).toBe("btn_a");
  });

  it("ignores unknown tokens (leaves no braces in output)", () => {
    expect(applyTemplate("{device}_{bogus}", tokens({}), "snake")).toBe(
      "keyboard",
    );
  });
});
