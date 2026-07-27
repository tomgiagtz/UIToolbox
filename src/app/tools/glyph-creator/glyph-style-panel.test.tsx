import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlyphStylePanel, type SelectedGlyph } from "./style-controls";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectBaseStyle } from "@/lib/glyph/generate";
import { AUTHORED_BACKGROUNDS } from "@/lib/glyph/symbols";

const glyph: SelectedGlyph = {
  deviceIndex: 0,
  glyphId: "a",
  label: "A",
};

/**
 * Render the panel at Glyph scope. `backgroundId` puts an Authored Background
 * tile on the resolved style, standing in for one inherited from the Catalog
 * per-Input tier (as an Xbox bumper has).
 */
function renderPanel({
  onClose = vi.fn(),
  dispatch = vi.fn(),
  backgroundId,
}: {
  onClose?: () => void;
  dispatch?: () => void;
  backgroundId?: string;
} = {}) {
  const project = createDefaultProject();
  const base = projectBaseStyle(project);
  const style = backgroundId
    ? { ...base, background: { ...base.background, backgroundId } }
    : base;
  const props = {
    project,
    dispatch,
    glyph,
    style,
    override: {},
    onClose,
  };
  const { rerender } = render(<GlyphStylePanel {...props} />);
  return {
    dispatch,
    onClose,
    /** Re-render the same panel with a tile applied. */
    withTile: (id: string) =>
      rerender(
        <GlyphStylePanel
          {...props}
          style={{
            ...base,
            background: { ...base.background, backgroundId: id },
          }}
        />,
      ),
  };
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

  it("offers every Authored Background as a source, plus the plain shape", () => {
    renderPanel();
    const select = screen.getByLabelText("Background source");
    const options = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(options[0]).toBe("");
    for (const a of AUTHORED_BACKGROUNDS) expect(options).toContain(a.id);
  });

  it("writes an explicit null when the source is set back to the plain shape", () => {
    // A Glyph that inherits a tile from the Catalog per-Input tier, the way an
    // Xbox bumper does — the case where omitting the field would be a no-op.
    const { dispatch } = renderPanel({ backgroundId: "xbox-bumper" });
    const select = screen.getByLabelText("Background source");
    expect((select as HTMLSelectElement).value).toBe("xbox-bumper");
    fireEvent.change(select, { target: { value: "" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { background: { backgroundId: null } },
    });
  });

  it("hides the shape controls while a tile supplies the shape", () => {
    const { withTile } = renderPanel();
    expect(screen.getByText("Background shape")).toBeInTheDocument();

    withTile("xbox-bumper");
    // The tile carries its own shape and corners, so those controls go away —
    // but fill and border stay, since they tint the tile's paint roles.
    expect(screen.queryByText("Background shape")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/corner radius/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Background fill")).toBeInTheDocument();
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
