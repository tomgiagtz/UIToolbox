import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlyphStylePanel, type SelectedGlyph } from "./style-controls";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { StyleOverride } from "@/lib/glyph/style";
import { AUTHORED_BACKGROUNDS } from "@/lib/glyph/symbols";
import type { BackgroundSource, ImageAsset, Project } from "@/lib/glyph/types";

const glyph: SelectedGlyph = {
  deviceIndex: 0,
  glyphId: "a",
  label: "A",
};

/** The Xbox `A` Glyph — a Catalog Input that ships a Symbol. */
const xboxA: SelectedGlyph = { deviceIndex: 0, glyphId: "xbox-a", label: "A" };

/** A project whose only Device is the Xbox pad, so `xboxA` resolves on it. */
function xboxProject(images: ImageAsset[] = []): Project {
  const project = [
    { type: "toggle-device", catalogId: "keyboard" } as const,
    { type: "toggle-device", catalogId: "xbox" } as const,
  ].reduce(projectReducer, createDefaultProject());
  return { ...project, images };
}

/** The manifest entry a stubbed upload resolves to. */
const uploaded: ImageAsset = {
  id: "img-9.png",
  fileName: "tile.png",
  type: "image/png",
};

/**
 * Render the panel at Glyph scope. `source` puts tile art on the resolved style,
 * standing in for one inherited from the Catalog per-Input tier (as an Xbox
 * bumper has).
 */
function renderPanel({
  onClose = vi.fn(),
  dispatch = vi.fn(),
  onUploadImage = vi.fn(async () => uploaded),
  source,
  project = createDefaultProject(),
  glyph: target = glyph,
  override = {},
}: {
  onClose?: () => void;
  dispatch?: () => void;
  onUploadImage?: (file: File) => Promise<ImageAsset>;
  source?: BackgroundSource;
  project?: Project;
  glyph?: SelectedGlyph;
  override?: StyleOverride;
} = {}) {
  const base = project.style;
  const style = source
    ? { ...base, background: { ...base.background, source } }
    : base;
  const props = {
    project,
    dispatch,
    glyph: target,
    style,
    override,
    onClose,
    onUploadImage,
  };
  const { rerender } = render(<GlyphStylePanel {...props} />);
  return {
    dispatch,
    onClose,
    onUploadImage,
    /** Re-render the same panel with a tile applied. */
    withTile: (tile: BackgroundSource) =>
      rerender(
        <GlyphStylePanel
          {...props}
          style={{ ...base, background: { ...base.background, source: tile } }}
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

  it("writes an explicit shape source when the tile is turned off", () => {
    // A Glyph that inherits a tile from the Catalog per-Input tier, the way an
    // Xbox bumper does — the case where omitting the field would be a no-op.
    const { dispatch } = renderPanel({
      source: { kind: "authored", backgroundId: "bumper" },
    });
    const select = screen.getByLabelText("Background source");
    expect((select as HTMLSelectElement).value).toBe("authored:bumper");
    fireEvent.change(select, { target: { value: "shape" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { background: { source: { kind: "shape" } } },
    });
  });

  it("hides the shape controls while a tile supplies the shape", () => {
    const { withTile } = renderPanel();
    expect(screen.getByText("Background shape")).toBeInTheDocument();

    withTile({ kind: "authored", backgroundId: "bumper" });
    // The tile carries its own shape and corners, so those controls go away —
    // but fill and border stay, since they tint the tile's paint roles.
    expect(screen.queryByText("Background shape")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/corner radius/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Background fill")).toBeInTheDocument();
  });

  it("drops the fill and border controls for an uploaded tile, which draws as authored", () => {
    const { withTile } = renderPanel();
    withTile({ kind: "image", imageId: "img-1.png" });
    expect(screen.queryByLabelText("Background fill")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/border width/i)).not.toBeInTheDocument();
  });

  it("scales the Render Source through the cascade", () => {
    const { dispatch } = renderPanel();
    const slider = screen.getByLabelText(/content scale \(100%\)/i);
    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { contentScale: 0.5 },
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

describe("GlyphStylePanel — Background source (issue #22)", () => {
  const image: ImageAsset = {
    id: "img-1.png",
    fileName: "metal.png",
    type: "image/png",
  };

  it("offers the plain shape, none, every Authored Background, and each upload", () => {
    renderPanel({ project: { ...createDefaultProject(), images: [image] } });
    const select = screen.getByLabelText("Background source");
    const options = [...select.querySelectorAll("option")].map((o) => o.value);
    // The two "no art" choices lead, in the order the picker declares them.
    expect(options[0]).toBe("none");
    expect(options[1]).toBe("shape");
    for (const a of AUTHORED_BACKGROUNDS)
      expect(options).toContain(`authored:${a.id}`);
    expect(options).toContain(`image:${image.id}`);
  });

  it("points the Background at an uploaded image", () => {
    const { dispatch } = renderPanel({
      project: { ...createDefaultProject(), images: [image] },
    });
    fireEvent.change(screen.getByLabelText("Background source"), {
      target: { value: `image:${image.id}` },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { background: { source: { kind: "image", imageId: image.id } } },
    });
  });

  it("keeps a mirrored tile mirrored when it is re-picked", () => {
    // Re-picking a bumper's own tile must not quietly un-flip it.
    const { dispatch } = renderPanel({
      source: { kind: "authored", backgroundId: "bumper", flipX: true },
    });
    fireEvent.change(screen.getByLabelText("Background source"), {
      target: { value: "authored:bumper" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: {
        background: {
          source: { kind: "authored", backgroundId: "bumper", flipX: true },
        },
      },
    });
  });

  it('turns the Background off entirely with "none"', () => {
    const { dispatch } = renderPanel({
      source: { kind: "authored", backgroundId: "bumper" },
    });
    fireEvent.change(screen.getByLabelText("Background source"), {
      target: { value: "none" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { background: { source: { kind: "none" } } },
    });
  });

  it('round-trips a "none" source back into the picker', () => {
    // The option value and the union have to agree in both directions, or the
    // terminal "shape" fallback silently swallows the selection.
    renderPanel({ source: { kind: "none" } });
    expect(
      (screen.getByLabelText("Background source") as HTMLSelectElement).value,
    ).toBe("none");
  });

  it("hides every Background control while nothing is drawn", () => {
    const { withTile } = renderPanel();
    expect(screen.getByText("Background shape")).toBeInTheDocument();

    withTile({ kind: "none" });
    // Nothing is drawn, so there is nothing left to configure — not even the
    // paints, which an Authored tile would still use.
    expect(screen.queryByText("Background shape")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/corner radius/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Background fill")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/border width/i)).not.toBeInTheDocument();
  });

  it("draws a newly uploaded tile image on the Glyph", async () => {
    const { dispatch } = renderPanel();
    const file = new File([new Uint8Array([1])], "tile.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Upload tile image"), {
      target: { files: [file] },
    });
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: "patch-style",
        scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
        patch: {
          background: { source: { kind: "image", imageId: uploaded.id } },
        },
      }),
    );
  });
});

describe("GlyphStylePanel — Render Source (issue #20)", () => {
  const image: ImageAsset = {
    id: "img-1.png",
    fileName: "arrow.png",
    type: "image/png",
  };

  it("shows a well-known Input rendering its Symbol", () => {
    renderPanel({ project: xboxProject(), glyph: xboxA });
    expect(screen.getByLabelText("Symbol")).toBeChecked();
  });

  it("offers no Symbol option for an Input the Catalog ships none for", () => {
    // Offering it would only resolve straight back to the label.
    renderPanel();
    expect(screen.queryByLabelText("Symbol")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toBeChecked();
  });

  it("switches a Symbol-rendered Glyph back to its label", () => {
    const { dispatch } = renderPanel({
      project: xboxProject(),
      glyph: xboxA,
    });
    fireEvent.click(screen.getByLabelText("Label"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-a" },
      patch: { renderSource: { kind: "label" } },
    });
  });

  it("can't pick Image until something has been uploaded", () => {
    renderPanel();
    expect(screen.getByLabelText("Image")).toBeDisabled();
    // Nothing to choose between yet, so no picker either — just the upload field.
    expect(screen.queryByLabelText("Image file")).not.toBeInTheDocument();
  });

  it("enables Image once the project carries one", () => {
    renderPanel({ project: { ...createDefaultProject(), images: [image] } });
    expect(screen.getByLabelText("Image")).not.toBeDisabled();
  });

  it("points the Glyph at an uploaded image", () => {
    const { dispatch } = renderPanel({
      project: { ...createDefaultProject(), images: [image] },
    });
    fireEvent.click(screen.getByLabelText("Image"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { renderSource: { kind: "image", imageId: image.id } },
    });
  });

  it("hands an uploaded file to the editor", () => {
    const { onUploadImage } = renderPanel();
    const file = new File([new Uint8Array([1])], "arrow.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Upload image"), {
      target: { files: [file] },
    });
    expect(onUploadImage).toHaveBeenCalledWith(file);
  });

  it("offers no reset while the Glyph just inherits its Render Source", () => {
    renderPanel({ project: xboxProject(), glyph: xboxA });
    expect(
      screen.queryByRole("button", { name: /reset render source/i }),
    ).not.toBeInTheDocument();
  });

  it("resets an overridden Render Source back up the cascade", () => {
    const { dispatch } = renderPanel({
      project: xboxProject(),
      glyph: xboxA,
      override: { renderSource: { kind: "label" } },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /reset render source/i }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "clear-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-a" },
      field: "renderSource",
    });
  });
});

describe("GlyphStylePanel — returning to a custom image (issue #20)", () => {
  const images: ImageAsset[] = [
    { id: "img-1.png", fileName: "first.png", type: "image/png" },
    { id: "img-2.png", fileName: "second.png", type: "image/png" },
  ];

  it("restores the Glyph's own image, not the first upload", () => {
    // The id survives on the override while the label is shown, so switching
    // back must not silently repoint the Glyph at someone else's picture.
    const { dispatch } = renderPanel({
      project: { ...createDefaultProject(), images },
      override: { renderSource: { kind: "image", imageId: "img-2.png" } },
    });
    fireEvent.click(screen.getByLabelText("Image"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { renderSource: { kind: "image", imageId: "img-2.png" } },
    });
  });
});
