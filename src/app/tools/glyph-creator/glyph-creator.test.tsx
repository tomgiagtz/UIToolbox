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

  it("shows the three editor sections", () => {
    render(<GlyphCreator />);
    for (const title of ["Devices", "Inputs", "Style"]) {
      expect(screen.getByRole("button", { name: title })).toBeInTheDocument();
    }
    // Naming moved into the Export modal, where the names are actually used.
    expect(
      screen.queryByRole("button", { name: "Naming" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the font picker and upload reachable under the Style section", () => {
    render(<GlyphCreator />);
    // Present in the DOM even while the Style section is collapsed, so both
    // keep working for uploads and e2e. The font is a cascade property now, so
    // it is a picker in the Foreground group rather than a lone file input.
    expect(screen.getByLabelText("Font")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload a font")).toBeInTheDocument();
  });

  it("no longer gates the editor behind a font upload (#13)", () => {
    render(<GlyphCreator />);
    // The old "must upload a font first" preview gate is gone — the bundled
    // default renders the preview with no upload.
    expect(
      screen.queryByText(/Upload a font .*to see the live Sprite Atlas/i),
    ).not.toBeInTheDocument();
    // Every bundled family is offered, with the default selected. Queried off
    // the select rather than by role, since the collapsed Style section is
    // hidden from the accessibility tree.
    const picker = screen.getByLabelText("Font") as HTMLSelectElement;
    expect(picker).toHaveValue("Inter");
    expect([...picker.options].map((o) => o.value)).toContain("Titan One");
  });
});

describe("GlyphCreator — discarded config (ADR-0010)", () => {
  beforeEach(() => localStorage.clear());

  it("tells the user their saved project was reset", async () => {
    // A config the current validator can't read — here the old versioned
    // envelope. It is dropped rather than migrated, so the loss is announced.
    localStorage.setItem(
      "uitoolbox.glyph-creator.project",
      JSON.stringify({ version: 5, project: {} }),
    );
    render(<GlyphCreator />);
    // Set last in the mount effect, so the font steps can't overwrite it.
    expect(
      await screen.findByText(/saved project couldn't be read and was reset/i),
    ).toBeInTheDocument();
  });

  it("says nothing when there was no saved project", async () => {
    render(<GlyphCreator />);
    await screen.findByLabelText("Font");
    expect(
      screen.queryByText(/saved project couldn't be read/i),
    ).not.toBeInTheDocument();
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
    const fill = screen.getByLabelText("Background fill");
    fireEvent.change(fill, { target: { value: "#123456" } });
    fireEvent.blur(fill);
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
    const fill = screen.getByLabelText("Background fill");
    fireEvent.change(fill, { target: { value: "#abcdef" } });
    fireEvent.blur(fill);
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

describe("GlyphCreator — preview Device ↔ Style scope sync (#19)", () => {
  beforeEach(() => localStorage.clear());

  /** Add Xbox so a second Device (index 1) and the preview switcher exist. */
  function addSecondDevice() {
    fireEvent.click(screen.getByLabelText("Xbox"));
  }

  it("focusing a Device scope moves the previewed Device to match", () => {
    render(<GlyphCreator />);
    addSecondDevice();
    openStyle();
    fireEvent.change(screen.getByLabelText("Editing style for"), {
      target: { value: "device:1" },
    });
    const preview = screen.getByLabelText(
      "Device to preview",
    ) as HTMLSelectElement;
    expect(preview.value).toBe("1");
  });

  it("switching the previewed Device moves the edited Device scope to match", () => {
    render(<GlyphCreator />);
    addSecondDevice();
    openStyle();
    // Focus a Device scope first — Project is Device-agnostic and stays put.
    fireEvent.change(screen.getByLabelText("Editing style for"), {
      target: { value: "device:0" },
    });
    fireEvent.change(screen.getByLabelText("Device to preview"), {
      target: { value: "1" },
    });
    const scope = screen.getByLabelText(
      "Editing style for",
    ) as HTMLSelectElement;
    expect(scope.value).toBe("device:1");
  });

  it("keeps Project scope when the previewed Device changes", () => {
    render(<GlyphCreator />);
    addSecondDevice();
    openStyle();
    fireEvent.change(screen.getByLabelText("Device to preview"), {
      target: { value: "1" },
    });
    const scope = screen.getByLabelText(
      "Editing style for",
    ) as HTMLSelectElement;
    expect(scope.value).toBe("project");
  });
});
