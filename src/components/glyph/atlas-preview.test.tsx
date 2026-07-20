import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

function renderAtlas(props: Partial<React.ComponentProps<typeof AtlasPreview>> = {}) {
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
});
