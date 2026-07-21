import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { GlyphCreator } from "./glyph-creator";

/** Expand the Style section so its scope switcher + controls are interactive. */
function openStyle() {
  fireEvent.click(screen.getByRole("button", { name: "Style" }));
}

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

describe("GlyphCreator — Style Cascade scope switcher (#19)", () => {
  beforeEach(() => localStorage.clear());

  it("offers Project and each Device as scopes", () => {
    render(<GlyphCreator />);
    openStyle();
    const scope = screen.getByLabelText(
      "Editing style for",
    ) as HTMLSelectElement;
    const options = Array.from(scope.options).map((o) => o.textContent);
    expect(options).toContain("Project (all Glyphs)");
    expect(options).toContain("Keyboard");
  });

  it("explains scope in the '?' tooltip trigger", () => {
    render(<GlyphCreator />);
    openStyle();
    expect(
      screen.getByRole("button", { name: /about style scope/i }),
    ).toBeInTheDocument();
  });

  it("editing at Project scope shows no reset affordance (nothing overridden)", () => {
    render(<GlyphCreator />);
    openStyle();
    fireEvent.change(screen.getByLabelText("Background fill"), {
      target: { value: "#123456" },
    });
    expect(
      screen.queryByRole("button", { name: /reset background fill/i }),
    ).not.toBeInTheDocument();
  });

  it("a Device-scope edit stores a sparse override, surfacing a reset control", () => {
    render(<GlyphCreator />);
    openStyle();
    // Switch the scope to the Keyboard Device, then change its Background fill.
    fireEvent.change(screen.getByLabelText("Editing style for"), {
      target: { value: "device:0" },
    });
    fireEvent.change(screen.getByLabelText("Background fill"), {
      target: { value: "#abcdef" },
    });
    // The reset circle-arrow appears only because that property is now overridden
    // at the Device scope.
    const reset = screen.getByRole("button", {
      name: /reset background fill to inherited/i,
    });
    expect(reset).toBeInTheDocument();

    // Clearing it drops the override, so the affordance disappears again.
    fireEvent.click(reset);
    expect(
      screen.queryByRole("button", { name: /reset background fill/i }),
    ).not.toBeInTheDocument();
  });
});
