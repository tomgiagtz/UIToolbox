import { render, screen } from "@testing-library/react";
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

  it("no longer gates the editor behind a font upload (#13)", () => {
    render(<GlyphCreator />);
    // The old "must upload a font first" preview gate is gone — the bundled
    // Inter renders the preview with no upload.
    expect(
      screen.queryByText(/Upload a font .*to see the live Sprite Atlas/i),
    ).not.toBeInTheDocument();
    // The Style copy points at Inter as the default rather than demanding one.
    expect(screen.getByText(/Inter is used by default/i)).toBeInTheDocument();
  });
});
