import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_FONTS, DEFAULT_FONT_FAMILY } from "@/lib/glyph/bundled-fonts";
import { registerFont } from "@/lib/glyph/font";
import {
  GlyphStylePanel,
  StyleControls,
  type SelectedGlyph,
} from "./style-controls";
import { createDefaultProject } from "@/lib/glyph/defaults";
import { projectReducer } from "@/lib/glyph/project";
import type { StyleOverride, StyleScope } from "@/lib/glyph/style";
import {
  AUTHORED_BACKGROUNDS,
  authoredBackgroundsFor,
} from "@/lib/glyph/symbols";
import type {
  BackgroundShape,
  BackgroundSource,
  FontAsset,
  ImageAsset,
  Project,
} from "@/lib/glyph/types";

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

/** The manifest entry a stubbed font upload resolves to. */
const uploadedFont: FontAsset = {
  family: "UITBFont-9-abc",
  fileName: "Comic.ttf",
};

/**
 * Render the panel at Glyph scope. `source` puts tile art on the resolved style,
 * standing in for one an Input's Catalog seed supplies (as an Xbox bumper has).
 */
function renderPanel({
  onClose = vi.fn(),
  dispatch = vi.fn(),
  onUploadFont = vi.fn(async () => uploadedFont),
  onOpenAssets = vi.fn(),
  source,
  shape,
  project = createDefaultProject(),
  glyph: target = glyph,
  override = {},
}: {
  onClose?: () => void;
  dispatch?: () => void;
  onUploadFont?: (file: File) => Promise<FontAsset>;
  onOpenAssets?: () => void;
  source?: BackgroundSource;
  /** The resolved primitive, which decides which shape tile reads as picked. */
  shape?: BackgroundShape;
  project?: Project;
  glyph?: SelectedGlyph;
  override?: StyleOverride;
} = {}) {
  const base = project.style;
  const style =
    source || shape
      ? {
          ...base,
          background: {
            ...base.background,
            ...(source ? { source } : {}),
            ...(shape ? { shape } : {}),
          },
        }
      : base;
  const props = {
    project,
    dispatch,
    glyph: target,
    style,
    override,
    onClose,
    onUploadFont,
    onOpenAssets,
  };
  const { rerender } = render(<GlyphStylePanel {...props} />);
  return {
    dispatch,
    onClose,
    onUploadFont,
    onOpenAssets,
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

/** The tiles in one picker grid, by its accessible name. */
function optionsIn(label: string): HTMLElement[] {
  return within(screen.getByRole("listbox", { name: label })).getAllByRole(
    "option",
  );
}

const sourceOptions = () => optionsIn("Background source");
const renderSourceOptions = () => optionsIn("Render Source");

/** The caption of the currently selected tile in a grid. */
function selectedIn(label: string): string {
  const selected = optionsIn(label).find(
    (o) => o.getAttribute("aria-selected") === "true",
  );
  return selected?.textContent ?? "";
}

const selectedSource = () => selectedIn("Background source");
const selectedRenderSource = () => selectedIn("Render Source");

/** Press the tile whose caption carries `name`. */
async function pick(label: string, name: string) {
  const tile = optionsIn(label).find((o) => o.textContent?.includes(name));
  if (!tile) throw new Error(`no "${name}" tile in the ${label} grid`);
  await userEvent.click(tile);
}

const pickSource = (name: string) => pick("Background source", name);
const pickRenderSource = (name: string) => pick("Render Source", name);

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
      patch: { foreground: { textColor: "#00ff00ff" } },
    });
  });

  it("writes an explicit shape source when the tile is turned off", async () => {
    // A Glyph whose Catalog seed gives it a tile, the way an Xbox bumper has —
    // the case where omitting the field would be a no-op.
    const { dispatch } = renderPanel({
      project: xboxProject(),
      glyph: xboxA,
      source: { kind: "authored", backgroundId: "bumper" },
    });
    expect(selectedSource()).toContain("Bumper");
    // The primitive already resolved here, so the pick says only "stop using the
    // tile" — the shape it would name is the one already in force.
    await pickSource("Rounded rect");
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-a" },
      patch: { background: { source: { kind: "shape" } } },
    });
  });

  it("picks the source and the primitive in one gesture", async () => {
    const { dispatch } = renderPanel({
      project: xboxProject(),
      glyph: xboxA,
      source: { kind: "authored", backgroundId: "bumper" },
    });
    await pickSource("Circle");
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-a" },
      patch: {
        background: { source: { kind: "shape" }, shape: "circle" },
      },
    });
  });

  it("leaves the primitive falling up when the pick doesn't change it", async () => {
    // Coming off a tile onto the primitive already in force: the tier below
    // says "circle", so pinning it here would freeze a value that was still
    // inherited — which pressing the already-checked radio never did either.
    const { dispatch } = renderPanel({
      project: xboxProject(),
      glyph: xboxA,
      source: { kind: "authored", backgroundId: "bumper" },
      shape: "circle",
    });
    await pickSource("Circle");
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-a" },
      patch: { background: { source: { kind: "shape" } } },
    });
  });

  it("lights the tile of the primitive the cascade resolved", () => {
    renderPanel({ shape: "square" });
    expect(selectedSource()).toContain("Square");
  });

  it("hides the corner radius while a tile supplies the shape", () => {
    const { withTile } = renderPanel();
    expect(screen.getByLabelText(/corner radius/i)).toBeInTheDocument();

    withTile({ kind: "authored", backgroundId: "bumper" });
    // The tile carries its own shape and corners, so the radius goes away — but
    // fill and border stay, since they tint the tile's paint roles.
    expect(screen.queryByLabelText(/corner radius/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Background fill")).toBeInTheDocument();
  });

  it("drops the fill and border controls for an uploaded tile, which draws as authored", () => {
    const { withTile } = renderPanel();
    withTile({ kind: "image", imageId: "img-1.png" });
    expect(screen.queryByLabelText("Background fill")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/border width/i)).not.toBeInTheDocument();
  });

  it("scales both axes together while they are linked", () => {
    const { dispatch } = renderPanel();
    // The box, not the slider: the value arrives unrounded, as typed. The axes
    // start linked because they agree, so one number moves both — scaling a
    // Symbol up is one gesture, as it was under the old uniform control.
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /foreground transform scale X/i }),
      { target: { value: "0.5" } },
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { foreground: { transform: { scale: { x: 0.5, y: 0.5 } } } },
    });
  });

  it("scales one axis alone once the link is off", () => {
    const { dispatch } = renderPanel();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /link foreground transform scale axes/i,
      }),
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /foreground transform scale X/i }),
      { target: { value: "0.5" } },
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      // One axis, so the other keeps falling up the cascade.
      patch: { foreground: { transform: { scale: { x: 0.5 } } } },
    });
  });

  it("rotates a layer in degrees, and only that layer", () => {
    const { dispatch } = renderPanel();
    fireEvent.change(screen.getByLabelText(/background transform rotation/i), {
      target: { value: "90" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { background: { transform: { rotation: 90 } } },
    });
  });

  it("lets the scale slider pass through zero", () => {
    // Zero is not degenerate enough to guard against: the canvas draws nothing
    // through a non-invertible matrix, the number stays visible in the box, and
    // one reset undoes it. Skipping it would need a custom control that broke
    // keyboard stepping.
    const { dispatch } = renderPanel();
    const slider = screen.getAllByRole("slider", {
      name: /foreground transform scale X/i,
    })[0];
    fireEvent.change(slider, { target: { value: "0" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { foreground: { transform: { scale: { x: 0, y: 0 } } } },
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
    id: "metal-a1b2.png",
    fileName: "metal.png",
    type: "image/png",
  };
  const trigger = AUTHORED_BACKGROUNDS.find((a) => a.id === "trigger")!;
  const bumper = AUTHORED_BACKGROUNDS.find((a) => a.id === "bumper")!;

  it("offers none, each drawn primitive, the Device's Authored Backgrounds, and each upload", () => {
    renderPanel({
      project: { ...xboxProject(), images: [image] },
      glyph: xboxA,
    });
    const names = sourceOptions().map((o) => o.textContent ?? "");
    // "None" leads — it is the one choice with no picture — then the primitives,
    // in the order the picker declares them, then the art.
    expect(names[0]).toContain("None");
    expect(names.slice(1, 4)).toEqual([
      expect.stringContaining("Rounded rect"),
      expect.stringContaining("Square"),
      expect.stringContaining("Circle"),
    ]);
    for (const a of authoredBackgroundsFor(["xbox"]))
      expect(names.some((n) => n.includes(a.label))).toBe(true);
    expect(names.some((n) => n.includes(image.fileName))).toBe(true);
  });

  it("offers the Keyboard no shoulder tiles, since it draws none", () => {
    // Offering them would promise art the Glyph silently falls back from: the
    // pads author bumper and trigger, and nothing else does (#45).
    renderPanel();
    const names = sourceOptions().map((o) => o.textContent ?? "");
    expect(names.some((n) => n.includes("Bumper"))).toBe(false);
    expect(names.some((n) => n.includes("Trigger"))).toBe(false);
    // The choices that are not art are always offered: they need no Device.
    expect(names[0]).toContain("None");
    expect(names[1]).toContain("Rounded rect");
  });

  it("points the Background at an uploaded image", async () => {
    const { dispatch } = renderPanel({
      project: { ...createDefaultProject(), images: [image] },
    });
    await pickSource(image.fileName);
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { background: { source: { kind: "image", imageId: image.id } } },
    });
  });

  it("carries nothing over from the source it replaces", async () => {
    // Orientation left the source union, so a re-pick names the tile and only
    // the tile — there is no flag left for it to preserve or to drop.
    const { dispatch } = renderPanel({
      project: xboxProject(),
      glyph: xboxA,
      source: { kind: "authored", backgroundId: bumper.id },
    });
    await pickSource(trigger.label);
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-a" },
      patch: {
        background: { source: { kind: "authored", backgroundId: trigger.id } },
      },
    });
  });

  it('turns the Background off entirely with "none"', async () => {
    const { dispatch } = renderPanel({
      project: xboxProject(),
      glyph: xboxA,
      source: { kind: "authored", backgroundId: bumper.id },
    });
    await pickSource("None");
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-a" },
      patch: { background: { source: { kind: "none" } } },
    });
  });

  it('round-trips a "none" source back into the picker', () => {
    // The tile key and the union have to agree in both directions, or the
    // terminal "shape" fallback silently swallows the selection.
    renderPanel({ source: { kind: "none" } });
    expect(selectedSource()).toContain("None");
  });

  it("hides every Background control while nothing is drawn", () => {
    const { withTile } = renderPanel();
    expect(screen.getByLabelText(/corner radius/i)).toBeInTheDocument();

    withTile({ kind: "none" });
    // Nothing is drawn, so there is nothing left to configure — not even the
    // paints, which an Authored tile would still use. The grid itself stays:
    // it is the way back.
    expect(
      screen.getByRole("listbox", { name: "Background source" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/corner radius/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Background fill")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/border width/i)).not.toBeInTheDocument();
  });

  it("offers no upload here — having an image is the Assets window's job", () => {
    // ADR-0014: this control picks from what the project already has.
    renderPanel();
    expect(
      screen.queryByLabelText("Upload tile image"),
    ).not.toBeInTheDocument();
  });

  it("ends the grid with a tile that opens the Assets window", async () => {
    const { onOpenAssets, dispatch } = renderPanel();
    const names = sourceOptions().map((o) => o.textContent ?? "");
    expect(names.at(-1)).toContain("Add images");

    await pickSource("Add images");
    expect(onOpenAssets).toHaveBeenCalled();
    // It is a way out of the grid, not a value: nothing was picked.
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("GlyphStylePanel — Render Source (issue #20)", () => {
  const image: ImageAsset = {
    id: "arrow-a1b2.png",
    fileName: "arrow.png",
    type: "image/png",
  };

  it("shows a well-known Input rendering its Symbol", () => {
    renderPanel({ project: xboxProject(), glyph: xboxA });
    expect(selectedRenderSource()).toContain("Symbol");
  });

  it("offers no Symbol tile for an Input the Catalog ships none for", () => {
    // Offering it would only resolve straight back to the label.
    renderPanel();
    expect(
      renderSourceOptions().some((o) => o.textContent?.includes("Symbol")),
    ).toBe(false);
    expect(selectedRenderSource()).toContain("Label");
  });

  it("switches a Symbol-rendered Glyph back to its label", async () => {
    const { dispatch } = renderPanel({ project: xboxProject(), glyph: xboxA });
    await pickRenderSource("Label");
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "xbox-a" },
      patch: { foreground: { renderSource: { kind: "label" } } },
    });
  });

  it("shows no image tiles until something has been uploaded", () => {
    // The label, and the way to get some art. The sentence that used to say so
    // is gone: the tile is the same instruction, in the place it applies.
    renderPanel();
    expect(renderSourceOptions().map((o) => o.textContent ?? "")).toEqual([
      expect.stringContaining("Label"),
      expect.stringContaining("Add images"),
    ]);
  });

  it("points the Glyph at an uploaded image", async () => {
    const { dispatch } = renderPanel({
      project: { ...createDefaultProject(), images: [image] },
    });
    await pickRenderSource(image.fileName);
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: {
        foreground: { renderSource: { kind: "image", imageId: image.id } },
      },
    });
  });

  it("points at the image whose tile was pressed, not the first upload", async () => {
    // Each upload is its own tile, so a pick names it directly — there is no
    // "switch back to Image" step left that would have to guess which picture
    // was meant.
    const images: ImageAsset[] = [
      { id: "first-a1.png", fileName: "first.png", type: "image/png" },
      { id: "second-b2.png", fileName: "second.png", type: "image/png" },
    ];
    const { dispatch } = renderPanel({
      project: { ...createDefaultProject(), images },
    });
    await pickRenderSource("second.png");
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: {
        foreground: {
          renderSource: { kind: "image", imageId: "second-b2.png" },
        },
      },
    });
  });

  it("offers no upload here — having an image is the Assets window's job", () => {
    renderPanel();
    expect(screen.queryByLabelText("Upload image")).not.toBeInTheDocument();
  });

  it("ends the grid with a tile that opens the Assets window", async () => {
    // The picker with nothing to pick is where the user most needs the way
    // there: a project with no uploads offers a label, a Symbol, and this.
    const { onOpenAssets, dispatch } = renderPanel({
      project: xboxProject(),
      glyph: xboxA,
    });
    expect(renderSourceOptions().at(-1)?.textContent).toContain("Add images");

    await pickRenderSource("Add images");
    expect(onOpenAssets).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
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
      override: { foreground: { renderSource: { kind: "label" } } },
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

describe("StyleControls — the Background source at each scope (ADR-0012 §2)", () => {
  /** Render the shared Style controls at one scope, over a given base source. */
  function renderAt(scope: StyleScope, source?: BackgroundSource) {
    const project = xboxProject();
    const style = source
      ? {
          ...project.style,
          background: { ...project.style.background, source },
        }
      : project.style;
    render(
      <StyleControls
        project={project}
        dispatch={vi.fn()}
        scope={scope}
        style={style}
        override={{}}
        onUploadFont={vi.fn(async () => uploadedFont)}
        onOpenAssets={vi.fn()}
      />,
    );
  }

  it("offers the Background source control at Device scope", () => {
    // A device-wide source is a real capability.
    renderAt({ tier: "device", deviceIndex: 0 });
    expect(
      screen.getByRole("listbox", { name: "Background source" }),
    ).toBeInTheDocument();
  });

  it("offers it at Project scope too", () => {
    renderAt({ tier: "project" });
    expect(
      screen.getByRole("listbox", { name: "Background source" }),
    ).toBeInTheDocument();
  });

  it("resets both fields one tile can set", async () => {
    // A shape tile writes the source and the primitive, so its reset undoes
    // both — otherwise half the pick survives a control that says "reset".
    const dispatch = vi.fn();
    const project = xboxProject();
    const scope: StyleScope = {
      tier: "glyph",
      deviceIndex: 0,
      glyphId: "xbox-a",
    };
    render(
      <StyleControls
        project={project}
        dispatch={dispatch}
        scope={scope}
        style={project.style}
        override={{
          background: { source: { kind: "shape" }, shape: "circle" },
        }}
        onUploadFont={vi.fn(async () => uploadedFont)}
        onOpenAssets={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /reset background source/i }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "clear-style",
      scope,
      field: "backgroundSource",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "clear-style",
      scope,
      field: "shape",
    });
  });

  it("hides the shape's own controls under a tile at Glyph scope", () => {
    // The source shown really is the one drawn, so a tile supplies the shape.
    renderAt(
      { tier: "glyph", deviceIndex: 0, glyphId: "xbox-lb" },
      { kind: "authored", backgroundId: "bumper" },
    );
    expect(screen.queryByLabelText(/corner radius/i)).not.toBeInTheDocument();
  });
});

describe("StyleControls — the font as a cascade field (ADR-0012 §2)", () => {
  const font: FontAsset = { family: "UITBFont-1-abc", fileName: "Comic.ttf" };

  it("picks a family at the scope being edited, with its own default weight", () => {
    // Picking a family also sets its weight: the weight a face stays legible at
    // is a property of that face, not a constant (#76).
    const { dispatch } = renderPanel();
    fireEvent.change(screen.getByLabelText("Font"), {
      target: { value: "JetBrains Mono" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: { foreground: { fontFamily: "JetBrains Mono", fontWeight: 500 } },
    });
  });

  it("offers the project's uploads beside the bundled families", () => {
    renderPanel({ project: { ...createDefaultProject(), fonts: [font] } });
    const picker = screen.getByLabelText("Font") as HTMLSelectElement;
    const values = [...picker.options].map((o) => o.value);
    expect(values).toContain("Inter");
    // Labelled by filename: the minted family name would mean nothing to anyone.
    expect(values).toContain(font.family);
    expect(
      [...picker.options].find((o) => o.value === font.family)?.textContent,
    ).toBe("Comic.ttf");
  });

  it("shows a reset button only where the font is overridden here", () => {
    renderPanel();
    expect(
      screen.queryByRole("button", { name: /reset font to inherited/i }),
    ).not.toBeInTheDocument();

    renderPanel({ override: { foreground: { fontFamily: "Titan One" } } });
    expect(
      screen.getAllByRole("button", { name: /reset font to inherited/i })[0],
    ).toBeInTheDocument();
  });

  it("clears just the font when its reset is pressed", () => {
    const { dispatch } = renderPanel({
      override: { foreground: { fontFamily: "Titan One" } },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /reset font to inherited/i }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "clear-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      field: "font",
    });
  });

  it("hides the weight control for a face with no weight axis", () => {
    // Nothing is registered under jsdom, so no axis is known — and an unknown
    // axis offers no choice, exactly as a static font doesn't.
    renderPanel();
    expect(screen.queryByLabelText(/Font weight/)).not.toBeInTheDocument();
  });
});

describe("StyleControls — the weight control follows registration (#80)", () => {
  /**
   * Stand in for the browser's FontFace, which jsdom has no implementation of.
   * `registerFont` only needs the constructor to accept the bytes and `load()`
   * to resolve; the axis it records comes from reading those bytes, not from
   * anything the face reports back.
   */
  function stubFontFace() {
    const faces = new Set<unknown>();
    vi.stubGlobal(
      "FontFace",
      class {
        constructor(
          public family: string,
          public data: ArrayBuffer,
        ) {}
        load() {
          return Promise.resolve(this);
        }
      },
    );
    vi.stubGlobal("document", document);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { add: (f: unknown) => faces.add(f) },
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  it("appears once a family registers after the first render", async () => {
    // The regression: the axis is read from a registry that fills in
    // asynchronously, so the component that *subscribes* has to be the one that
    // *reads*. A parent computing it into a prop hands down the `undefined` it
    // captured before the face arrived, and the control never appears.
    stubFontFace();
    const bytes = readFileSync(
      join(process.cwd(), "public", "fonts", BUNDLED_FONTS[0].file),
    );

    renderPanel();
    // Settle every effect the first render queued, so the re-render below can
    // only have come from the registration — without this the tree re-renders
    // on its own and the assertion proves nothing.
    await act(async () => {});
    expect(screen.queryByLabelText(/Font weight/)).not.toBeInTheDocument();

    await act(async () => {
      await registerFont(
        DEFAULT_FONT_FAMILY,
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      );
    });
    expect(screen.getByLabelText(/Font weight/)).toBeInTheDocument();
  });
});
