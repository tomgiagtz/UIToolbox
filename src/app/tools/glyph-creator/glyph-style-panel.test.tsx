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
import { AUTHORED_BACKGROUNDS } from "@/lib/glyph/symbols";
import type {
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
  source,
  project = createDefaultProject(),
  glyph: target = glyph,
  override = {},
}: {
  onClose?: () => void;
  dispatch?: () => void;
  onUploadFont?: (file: File) => Promise<FontAsset>;
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
    onUploadFont,
  };
  const { rerender } = render(<GlyphStylePanel {...props} />);
  return {
    dispatch,
    onClose,
    onUploadFont,
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
      source: { kind: "authored", backgroundId: "bumper" },
    });
    expect(selectedSource()).toContain(
      AUTHORED_BACKGROUNDS.find((a) => a.id === "bumper")!.label,
    );
    await pickSource("Shape");
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

  it("offers the plain shape, none, every Authored Background, and each upload", () => {
    renderPanel({ project: { ...createDefaultProject(), images: [image] } });
    const names = sourceOptions().map((o) => o.textContent ?? "");
    // The two "no art" choices lead, in the order the picker declares them.
    expect(names[0]).toContain("None");
    expect(names[1]).toContain("Shape");
    for (const a of AUTHORED_BACKGROUNDS)
      expect(names.some((n) => n.includes(a.label))).toBe(true);
    expect(names.some((n) => n.includes(image.fileName))).toBe(true);
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
      source: { kind: "authored", backgroundId: bumper.id },
    });
    await pickSource(trigger.label);
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
      patch: {
        background: { source: { kind: "authored", backgroundId: trigger.id } },
      },
    });
  });

  it('turns the Background off entirely with "none"', async () => {
    const { dispatch } = renderPanel({
      source: { kind: "authored", backgroundId: bumper.id },
    });
    await pickSource("None");
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 0, glyphId: "a" },
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
    expect(screen.getByText("Background shape")).toBeInTheDocument();

    withTile({ kind: "none" });
    // Nothing is drawn, so there is nothing left to configure — not even the
    // paints, which an Authored tile would still use.
    expect(screen.queryByText("Background shape")).not.toBeInTheDocument();
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
    renderPanel();
    expect(renderSourceOptions()).toHaveLength(1);
    expect(
      screen.getByText(/upload an image in the assets window/i),
    ).toBeInTheDocument();
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

  it("hides the shape controls under a tile at Glyph scope", () => {
    // The source shown really is the one drawn, so a tile supplies the shape.
    renderAt(
      { tier: "glyph", deviceIndex: 0, glyphId: "xbox-lb" },
      { kind: "authored", backgroundId: "bumper" },
    );
    expect(screen.queryByText("Background shape")).not.toBeInTheDocument();
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
