import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { GlyphCreator } from "./glyph-creator";

describe("GlyphCreator editor shell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the four editor sections", () => {
    render(<GlyphCreator />);
    for (const title of ["Devices", "Inputs", "Style", "Naming"]) {
      expect(screen.getByRole("button", { name: title })).toBeInTheDocument();
    }
  });

  it("keeps the font upload reachable under the Style section", () => {
    render(<GlyphCreator />);
    // Present in the DOM even while the Style section is collapsed, so the
    // "Font file" label keeps working for uploads and e2e.
    expect(screen.getByLabelText("Font file")).toBeInTheDocument();
  });

  it("collapses and re-expands the editor panel", async () => {
    const user = userEvent.setup();
    render(<GlyphCreator />);

    await user.click(
      screen.getByRole("button", { name: /Collapse editor panel/i }),
    );
    // Section triggers disappear when the panel is collapsed.
    expect(
      screen.queryByRole("button", { name: "Devices" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Expand editor panel/i }),
    );
    expect(screen.getByRole("button", { name: "Devices" })).toBeInTheDocument();
  });
});
