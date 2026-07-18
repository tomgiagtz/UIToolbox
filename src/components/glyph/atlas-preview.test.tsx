import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { gridPack } from "@/lib/glyph/packer";
import type { Background } from "@/lib/glyph/types";
import { AtlasPreview } from "./atlas-preview";

const background: Background = {
  shape: "rounded-rect",
  fill: "#222222",
  cornerRadius: 16,
  border: { width: 0, color: "#000000" },
};

function renderAtlas(props: Partial<React.ComponentProps<typeof AtlasPreview>> = {}) {
  return render(
    <AtlasPreview
      deviceName="Keyboard"
      inputs={["A", "B", "Space"]}
      cellSize={128}
      textColor="#ffffff"
      background={background}
      fontFamily="Test"
      {...props}
    />,
  );
}

describe("AtlasPreview", () => {
  it("renders a canvas sized to the packed power-of-two atlas", () => {
    const inputs = ["A", "B", "Space", "Enter", "Shift"];
    const cellSize = 128;
    renderAtlas({ inputs, cellSize });

    const canvas = screen.getByRole("img", {
      name: /Keyboard Sprite Atlas preview/i,
    }) as HTMLCanvasElement;
    const { atlasSize } = gridPack(inputs.length, cellSize);

    expect(canvas.width).toBe(atlasSize.width);
    expect(canvas.height).toBe(atlasSize.height);
  });

  it("shows a placeholder instead of a canvas when there are no inputs", () => {
    renderAtlas({ inputs: [] });

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
