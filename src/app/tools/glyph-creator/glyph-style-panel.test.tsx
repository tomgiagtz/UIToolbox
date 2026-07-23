import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlyphStylePanel, type SelectedGlyph } from "./style-controls";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectBaseStyle } from "@/lib/glyph/generate";

const glyph: SelectedGlyph = {
  deviceIndex: 0,
  glyphId: "a",
  label: "A",
};

function renderPanel(onClose = vi.fn(), dispatch = vi.fn()) {
  const project = createDefaultProject();
  render(
    <GlyphStylePanel
      project={project}
      dispatch={dispatch}
      glyph={glyph}
      style={projectBaseStyle(project)}
      override={{}}
      onClose={onClose}
    />,
  );
  return { dispatch, onClose };
}

describe("GlyphStylePanel", () => {
  it("names the selected Glyph and hides the Project-global cell size", () => {
    renderPanel();
    expect(
      screen.getByRole("region", { name: /edit glyph a/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    // Cell size never cascades, so it stays out of the per-Glyph editor.
    expect(screen.queryByLabelText(/cell size/i)).not.toBeInTheDocument();
  });

  it("edits store a sparse Glyph-scope patch", () => {
    const { dispatch } = renderPanel();
    // The hex field is a React Aria ColorField: it commits on blur, not on
    // each keystroke, and serialises to 8-digit hexa.
    const input = screen.getByLabelText("Text color");
    fireEvent.change(input, { target: { value: "#00ff00" } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { textColor: "#00ff00ff" },
    });
  });

  it("closes via the close button and Escape", () => {
    const { onClose } = renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: /close glyph editor/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
