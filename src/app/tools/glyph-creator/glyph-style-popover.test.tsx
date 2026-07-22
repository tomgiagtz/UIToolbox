import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlyphStylePopover, type SelectedGlyph } from "./style-controls";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectBaseStyle } from "@/lib/glyph/generate";

const glyph: SelectedGlyph = {
  deviceIndex: 0,
  glyphId: "a",
  label: "A",
};

function renderPopover(onClose = vi.fn(), dispatch = vi.fn()) {
  const project = createDefaultProject();
  render(
    <GlyphStylePopover
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

describe("GlyphStylePopover", () => {
  it("names the selected Glyph and hides the Project-global cell size", () => {
    renderPopover();
    expect(
      screen.getByRole("dialog", { name: /edit glyph a/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    // Cell size never cascades, so it stays out of the per-Glyph editor.
    expect(screen.queryByLabelText(/cell size/i)).not.toBeInTheDocument();
  });

  it("edits store a sparse Glyph-scope patch", () => {
    const { dispatch } = renderPopover();
    fireEvent.change(screen.getByLabelText("Text color"), {
      target: { value: "#00ff00" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { textColor: "#00ff00" },
    });
  });

  it("closes via the close button and Escape", () => {
    const { onClose } = renderPopover();
    fireEvent.click(
      screen.getByRole("button", { name: /close glyph editor/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
