import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { gridPack } from "@/lib/glyph/packer";
import type { GlyphStyle } from "@/lib/glyph/style";
import { AtlasPreview, type PreviewGlyph } from "./atlas-preview";

const style: GlyphStyle = {
  textColor: "#ffffff",
  background: {
    shape: "rounded-rect",
    fill: "#222222",
    cornerRadius: 16,
    border: { width: 0, color: "#000000" },
  },
};

/** Build preview Glyphs from labels, all sharing the one test style. */
function glyphsOf(labels: string[]): PreviewGlyph[] {
  return labels.map((label) => ({ label, style }));
}

function renderAtlas(
  props: Partial<React.ComponentProps<typeof AtlasPreview>> = {},
) {
  return render(
    <AtlasPreview
      deviceName="Keyboard"
      glyphs={glyphsOf(["A", "B", "Space"])}
      cellSize={128}
      fontFamily="Test"
      {...props}
    />,
  );
}

describe("AtlasPreview", () => {
  it("renders a canvas sized to the packed power-of-two atlas", () => {
    const glyphs = glyphsOf(["A", "B", "Space", "Enter", "Shift"]);
    const cellSize = 128;
    renderAtlas({ glyphs, cellSize });

    const canvas = screen.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    }) as HTMLCanvasElement;
    const { atlasSize } = gridPack(glyphs.length, cellSize);

    expect(canvas.width).toBe(atlasSize.width);
    expect(canvas.height).toBe(atlasSize.height);
  });

  it("shows a placeholder instead of a canvas when there are no inputs", () => {
    renderAtlas({ glyphs: [] });

    expect(
      screen.queryByRole("img", { name: /Sprite Atlas preview/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no Inputs/i)).toBeInTheDocument();
  });

  it("names the atlas after the Device so the selector can distinguish devices", () => {
    renderAtlas({ deviceName: "Xbox" });

    expect(
      screen.getByRole("img", { name: /Xbox Sprite Atlas preview/i }),
    ).toBeInTheDocument();
  });

  it("reports the clicked cell index via onSelectGlyph", () => {
    const onSelectGlyph = vi.fn();
    const glyphs = glyphsOf(["A", "B", "Space", "Enter", "Shift"]);
    const cellSize = 128;
    renderAtlas({ glyphs, cellSize, onSelectGlyph });

    const canvas = screen.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    }) as HTMLCanvasElement;
    const { atlasSize, placements } = gridPack(glyphs.length, cellSize);

    // Render the canvas 1:1 with the atlas (no object-contain scaling) so a click
    // at a placement's center maps straight back to that cell's index.
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: atlasSize.width,
        height: atlasSize.height,
      }) as DOMRect;

    const cell = placements[2].rect;
    fireEvent.click(canvas, {
      clientX: cell.x + cell.w / 2,
      clientY: cell.y + cell.h / 2,
    });
    expect(onSelectGlyph).toHaveBeenCalledWith(2);
  });

  it("ignores a click in the gutter (no cell selected)", () => {
    const onSelectGlyph = vi.fn();
    const glyphs = glyphsOf(["A", "B", "Space", "Enter", "Shift"]);
    const cellSize = 128;
    renderAtlas({ glyphs, cellSize, onSelectGlyph });

    const canvas = screen.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    }) as HTMLCanvasElement;
    const { atlasSize } = gridPack(glyphs.length, cellSize);
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: atlasSize.width,
        height: atlasSize.height,
      }) as DOMRect;

    // 129px lands in the 2px gutter just past the first cell's far edge.
    fireEvent.click(canvas, { clientX: 129, clientY: 10 });
    expect(onSelectGlyph).not.toHaveBeenCalled();
  });
});
