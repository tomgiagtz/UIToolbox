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

/**
 * The tight content bounds of the packed cells — the size the preview canvas is
 * drawn at (the exported texture's power-of-two padding is dropped for preview).
 */
function contentBounds(placements: ReturnType<typeof gridPack>["placements"]) {
  return placements.reduce(
    (acc, { rect }) => ({
      width: Math.max(acc.width, rect.x + rect.w),
      height: Math.max(acc.height, rect.y + rect.h),
    }),
    { width: 1, height: 1 },
  );
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
  it("renders a canvas sized to the packed content bounds (no POT padding)", () => {
    const glyphs = glyphsOf(["A", "B", "Space", "Enter", "Shift"]);
    const cellSize = 128;
    renderAtlas({ glyphs, cellSize });

    const canvas = screen.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    }) as HTMLCanvasElement;
    const { placements } = gridPack(glyphs.length, cellSize);
    const content = contentBounds(placements);

    expect(canvas.width).toBe(content.width);
    expect(canvas.height).toBe(content.height);
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
    const { placements } = gridPack(glyphs.length, cellSize);
    const content = contentBounds(placements);

    // Render the canvas 1:1 with the content (no object-contain scaling) so a
    // click at a placement's center maps straight back to that cell's index.
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: content.width,
        height: content.height,
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
    const { placements } = gridPack(glyphs.length, cellSize);
    const content = contentBounds(placements);
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: content.width,
        height: content.height,
      }) as DOMRect;

    // 129px lands in the 2px gutter just past the first cell's far edge.
    fireEvent.click(canvas, { clientX: 129, clientY: 10 });
    expect(onSelectGlyph).not.toHaveBeenCalled();
  });
});
