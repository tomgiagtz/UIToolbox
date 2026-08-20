"use client";

import { useEffect, type Dispatch, type ReactNode } from "react";
import { Button, Tooltip, TooltipTrigger } from "react-aria-components";
import { X } from "lucide-react";
import { getWeightAxis } from "@/lib/glyph/font";
import { defaultWeightFor } from "@/lib/glyph/fonts";
import { resolveScopeRenderSource } from "@/lib/glyph/generate";
import type { ProjectAction } from "@/lib/glyph/project";
import { isOverrideFieldSet } from "@/lib/glyph/style";
import type {
  GlyphStyle,
  StyleField,
  StyleOverride,
  StyleScope,
} from "@/lib/glyph/style";
import { authoredBackgroundsFor } from "@/lib/glyph/symbols";
import type {
  BackgroundShape,
  BackgroundSource,
  FontAsset,
  ImageAsset,
  Project,
} from "@/lib/glyph/types";
import { CellSizeField } from "./cell-size-field";
import { ColorField, Field, ResetButton, inputClass } from "./controls-ui";
import { FontField } from "./font-field";
import { AssetArt } from "./asset-art";
import {
  AssetGrid,
  imageIdFromKey,
  imageKey,
  imageTiles,
  type AssetGridItem,
} from "./asset-grid";
import { RenderSourceControls } from "./render-source-controls";
import { TransformField } from "./transform-field";

/** Tile key prefix for a drawn primitive, which pins `shape` as well as a source. */
const SHAPE_KEY = "shape:";

/**
 * The drawn primitives, one tile each in the source grid.
 *
 * A primitive has a picture — it *is* one — so it earns a tile the way art does,
 * and picking it is one gesture rather than "Shape", then which shape.
 */
const SHAPES: { value: BackgroundShape; label: string; art: string }[] = [
  { value: "rounded-rect", label: "Rounded rect", art: "rounded-md" },
  { value: "square", label: "Square", art: "rounded-none" },
  { value: "circle", label: "Circle", art: "rounded-full" },
];

/**
 * Stable tile key for what a Background draws. The shape is half of it, because
 * the primitives are three tiles rather than one: `{ kind: "shape" }` on its own
 * doesn't say which of them is lit.
 */
function tileKey(source: BackgroundSource, shape: BackgroundShape): string {
  if (source.kind === "authored") return `authored:${source.backgroundId}`;
  if (source.kind === "image") return imageKey(source.imageId);
  if (source.kind === "none") return "none";
  return `${SHAPE_KEY}${shape}`;
}

/** What picking a tile writes: always a source, plus a shape where one is drawn. */
interface BackgroundPick {
  source: BackgroundSource;
  shape?: BackgroundShape;
}

/**
 * Read a picked tile key back into the Background fields it sets.
 *
 * Nothing is carried over from the source it replaces: a source says only where
 * the art comes from, and orientation left the union for the tile layer's
 * transform (ADR-0012 §2), so replacing one wholesale can't disturb it.
 *
 * `shape` rides along only when the pick changes it — which is what the radio set
 * this grid replaces did, a radio not firing when you press the one already
 * checked. It matters at an override tier: writing it regardless would pin a
 * Glyph's shape to the value it was inheriting, on a click that changed nothing.
 */
function backgroundFromKey(
  value: string,
  shape: BackgroundShape,
): BackgroundPick {
  if (value.startsWith("authored:")) {
    const backgroundId = value.slice("authored:".length);
    return { source: { kind: "authored", backgroundId } };
  }
  const imageId = imageIdFromKey(value);
  if (imageId) return { source: { kind: "image", imageId } };
  // Before the fallback: a drawn primitive is what an unrecognized key becomes,
  // so a missed branch here would round-trip "none" into one.
  if (value === "none") return { source: { kind: "none" } };
  const picked = SHAPES.find((s) => `${SHAPE_KEY}${s.value}` === value)?.value;
  return {
    source: { kind: "shape" },
    ...(picked && picked !== shape ? { shape: picked } : {}),
  };
}

/**
 * Picks where a Glyph's Background tile comes from: nothing at all, the drawn
 * shape, a shipped **Authored Background**, or one of the project's uploaded
 * tile images (issue #22).
 *
 * A grid of the tiles themselves rather than a list of ids (ADR-0014 §5, #45).
 * The drawn primitives are tiles in it too — one each, drawn as themselves —
 * because a picker of pictures has no reason to send the user to a second
 * control for the one choice that is already a picture. Only `none` heads the
 * grid carrying a word, having no picture to carry.
 *
 * Picking a primitive writes an explicit `{ kind: "shape" }` rather than
 * clearing the field: a Catalog **seed** outranks it, so bumpers and triggers
 * would otherwise just fall back to their authored tile.
 *
 * Uploading is the **Assets window**'s job, not this control's: this picks from
 * what the project has.
 */
function BackgroundSourceField({
  source,
  shape,
  images,
  devices,
  onChange,
  onReset,
  onOpenAssets,
}: {
  /** The effective source at the current scope. */
  source: BackgroundSource;
  /** The effective primitive, which says which shape tile reads as picked. */
  shape: BackgroundShape;
  /** The project's uploaded images, any of which can serve as a tile. */
  images: ImageAsset[];
  /**
   * The Catalog ids this scope covers — one Device, or every Device in the
   * project at Project scope. Both which tiles may be offered and which Set they
   * are drawn from come from it.
   */
  devices: string[];
  onChange: (pick: BackgroundPick) => void;
  onReset?: () => void;
  onOpenAssets: () => void;
}) {
  const items: AssetGridItem[] = [
    {
      key: "none",
      label: "None",
      art: <span className="text-xs font-medium">None</span>,
    },
    ...SHAPES.map((s) => ({
      key: `${SHAPE_KEY}${s.value}`,
      label: s.label,
      art: <span className={`size-8 border-2 border-current ${s.art}`} />,
    })),
    // Only tiles every Device in scope can draw: offering the rest would draw a
    // picture the Glyph then falls back from, silently.
    ...authoredBackgroundsFor(devices).map((tile) => ({
      key: `authored:${tile.id}`,
      label: tile.label,
      art: (
        <AssetArt
          spec={{ kind: "authored", id: tile.id, device: devices[0] }}
        />
      ),
    })),
    ...imageTiles(images),
  ];

  return (
    // Full row: a gallery in one third of the panel truncates every caption.
    <div className="col-span-full flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Background source</span>
        {onReset ? (
          <ResetButton label="Background source" onReset={onReset} />
        ) : null}
      </div>
      <AssetGrid
        label="Background source"
        items={items}
        selectedKey={tileKey(source, shape)}
        onSelect={(key) => onChange(backgroundFromKey(key, shape))}
        onAdd={onOpenAssets}
      />
    </div>
  );
}

/** Stable option value for a {@link StyleScope} in the switcher's `<select>`. */
function scopeValue(scope: StyleScope): string {
  if (scope.tier === "project") return "project";
  if (scope.tier === "device") return `device:${scope.deviceIndex}`;
  // Only one Glyph is ever targetable at a time (the selected one), so a bare
  // sentinel is enough — the switcher resolves it back through `selectedGlyph`.
  return "glyph";
}

/** The Glyph currently targetable by the switcher (selected via a preview cell). */
export interface SelectedGlyph {
  deviceIndex: number;
  glyphId: string;
  label: string;
}

/**
 * Picks which tier of the Style Cascade the controls edit: the Project base,
 * one selected Device, or the Glyph the user picked in the preview. A "?" tooltip
 * explains scope. cellSize + font stay Project-global regardless of scope.
 */
export function StyleScopeSwitcher({
  project,
  scope,
  selectedGlyph,
  onScopeChange,
}: {
  project: Project;
  scope: StyleScope;
  selectedGlyph: SelectedGlyph | null;
  onScopeChange: (scope: StyleScope) => void;
}) {
  function onChange(value: string) {
    if (value === "project") return onScopeChange({ tier: "project" });
    if (value.startsWith("device:")) {
      return onScopeChange({
        tier: "device",
        deviceIndex: Number(value.slice("device:".length)),
      });
    }
    if (value === "glyph" && selectedGlyph) {
      onScopeChange({
        tier: "glyph",
        deviceIndex: selectedGlyph.deviceIndex,
        glyphId: selectedGlyph.glyphId,
      });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor="style-scope" className="text-sm font-medium">
          Editing style for
        </label>
        <TooltipTrigger delay={300}>
          <Button
            aria-label="About style scope"
            className="flex size-5 items-center justify-center rounded-full border border-input text-xs text-muted-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            ?
          </Button>
          <Tooltip
            offset={6}
            className="motion-popup max-w-64 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-surface-base shadow-md"
          >
            Scope sets which layer you edit. Project is the base for every
            Glyph; a Device or a single Glyph overrides only itself. Narrower
            scopes win. Click a cell in the preview to edit that Glyph.
          </Tooltip>
        </TooltipTrigger>
      </div>
      <select
        id="style-scope"
        className={inputClass}
        value={scopeValue(scope)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="project">Project (all Glyphs)</option>
        {project.devices.map((d, i) => (
          <option key={d.catalogId || d.name} value={`device:${i}`}>
            {d.name}
          </option>
        ))}
        {selectedGlyph && (
          <option value="glyph">Glyph: {selectedGlyph.label}</option>
        )}
      </select>
    </div>
  );
}

/**
 * Controls for Glyph appearance, resolved through the Style Cascade (#4, #19).
 * They display the effective `style` at the current `scope` and every edit
 * dispatches a scoped `patch-style`. When a property is overridden at a
 * non-Project scope, a reset control appears next to it that clears just that
 * override (`clear-style`), so it falls back up the cascade.
 */
export function StyleControls({
  project,
  dispatch,
  scope,
  style,
  override,
  showCellSize = true,
  showRenderSource = false,
  onUploadFont,
  onOpenAssets,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  scope: StyleScope;
  /** Effective style at `scope` (what the controls show). */
  style: GlyphStyle;
  /** Raw sparse override at `scope` (`{}` at Project scope). */
  override: StyleOverride;
  /**
   * Show the Project-global Cell size control. On by default; the per-Glyph
   * popover hides it since cell size never cascades (ADR-0006).
   */
  showCellSize?: boolean;
  /**
   * Show the Render Source picker in the Foreground group. Off by default: a
   * Render Source is per-Input, so only a Glyph-tier scope can edit one, while
   * the sidebar addresses whole tiers.
   */
  showRenderSource?: boolean;
  /** Hand an uploaded font to the editor; resolves to its manifest entry. */
  onUploadFont: (file: File) => Promise<FontAsset>;
  /** Open the Assets window, which the pickers' trailing tile leads to. */
  onOpenAssets: () => void;
}) {
  const bg = style.background;
  const fg = style.foreground;
  const renderSource =
    showRenderSource && scope.tier === "glyph"
      ? resolveScopeRenderSource(project, scope)
      : undefined;
  // Which Device's Set the gallery draws from: a bare cell id resolves through
  // the shared->device cascade, so a pad's own bumper art shows on its own tiles.
  // A Project-tier source applies to every Device, so the tiles it may offer are
  // the ones they can all draw; a Device or Glyph scope answers for one.
  const devices =
    scope.tier === "project"
      ? project.devices.map((d) => d.catalogId)
      : [project.devices[scope.deviceIndex]?.catalogId].filter(
          (id) => id !== undefined,
        );
  const showsShapeFields = bg.source.kind === "shape";
  /**
   * Show the fill and border controls: they paint an Authored tile's sentinel
   * roles or a drawn shape. An uploaded tile draws as authored and "none" draws
   * nothing, so at a scope resolving to either they would be inert.
   */
  const showsPaintFields = showsShapeFields || bg.source.kind === "authored";

  /** A reset handler for `field`, or undefined when it isn't overridden here. */
  function resetFor(field: StyleField): (() => void) | undefined {
    if (scope.tier === "project" || !isOverrideFieldSet(override, field))
      return undefined;
    return () => dispatch({ type: "clear-style", scope, field });
  }

  const patch = (styleFields: StyleOverride) =>
    dispatch({ type: "patch-style", scope, patch: styleFields });

  /**
   * The grid's reset. One tile can set two fields, so resetting it clears both —
   * but only while a primitive is what it shows: an override on `shape` under a
   * tile source is invisible here, and a reset that changed nothing on screen
   * would be worse than one that isn't offered.
   */
  const resetSource = resetFor("backgroundSource");
  const resetShape = showsShapeFields ? resetFor("shape") : undefined;
  const resetTile =
    resetSource || resetShape
      ? () => {
          resetSource?.();
          resetShape?.();
        }
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* One group per drawing layer, in the order they are painted. Every
          control in a group writes one property of that layer's object, so the
          panel reads as the shape the cascade resolves (ADR-0012 §2). */}
      <LayerGroup title="Background">
        <BackgroundSourceField
          source={bg.source}
          shape={bg.shape}
          images={project.images}
          devices={devices}
          onChange={(pick) => patch({ background: pick })}
          onReset={resetTile}
          onOpenAssets={onOpenAssets}
        />

        <TransformField
          label="Background transform"
          hint="Rotates and scales the whole tile — art or drawn shape alike."
          transform={bg.transform}
          onChange={(transform) => patch({ background: { transform } })}
          onResetRotation={resetFor("backgroundRotation")}
          onResetScale={resetFor("backgroundScale")}
        />

        {showsPaintFields && (
          <ColorField
            label="Background fill"
            value={bg.fill}
            onChange={(fill) => patch({ background: { fill } })}
            onReset={resetFor("fill")}
          />
        )}

        {showsShapeFields && bg.shape === "rounded-rect" && (
          <Field
            label={`Corner radius (${bg.cornerRadius}px)`}
            onReset={resetFor("cornerRadius")}
          >
            {(id) => (
              <input
                id={id}
                type="range"
                min={0}
                max={64}
                value={bg.cornerRadius}
                onChange={(e) =>
                  patch({
                    background: { cornerRadius: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            )}
          </Field>
        )}

        {showsPaintFields && (
          <>
            <Field
              label={`Border width (${bg.border.width}px)`}
              onReset={resetFor("borderWidth")}
            >
              {(id) => (
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={20}
                  value={bg.border.width}
                  onChange={(e) =>
                    patch({
                      background: { border: { width: Number(e.target.value) } },
                    })
                  }
                  className="w-full"
                />
              )}
            </Field>

            <ColorField
              label="Border color"
              value={bg.border.color}
              onChange={(color) => patch({ background: { border: { color } } })}
              onReset={resetFor("borderColor")}
            />
          </>
        )}
      </LayerGroup>

      <LayerGroup title="Foreground">
        {/* Which source is drawn is per-Input, so it appears only where a single
            Glyph is being edited — but it is a foreground property, and belongs
            with the rest of the layer rather than floating above the panel. */}
        {renderSource && (
          <RenderSourceControls
            dispatch={dispatch}
            scope={scope}
            source={renderSource.source}
            symbolId={renderSource.symbolId}
            deviceCatalogId={devices[0]}
            images={project.images}
            override={override}
            onOpenAssets={onOpenAssets}
          />
        )}

        {/* The font paints the label, which is one of this layer's Render
            Sources, so it cascades and is edited here rather than above the
            panel (ADR-0012 §2). Picking a family also sets its weight: the
            legible weight is a property of the face. */}
        <FontField
          project={project}
          family={fg.fontFamily}
          weight={fg.fontWeight}
          onChange={(fontFamily) =>
            patch({
              foreground: {
                fontFamily,
                fontWeight: defaultWeightFor(
                  fontFamily,
                  getWeightAxis(fontFamily),
                ),
              },
            })
          }
          onWeightChange={(fontWeight) => patch({ foreground: { fontWeight } })}
          onReset={resetFor("font")}
          onResetWeight={resetFor("fontWeight")}
          onUpload={onUploadFont}
        />

        <ColorField
          label="Text color"
          value={fg.textColor}
          onChange={(textColor) => patch({ foreground: { textColor } })}
          onReset={resetFor("textColor")}
        />

        <TransformField
          label="Foreground transform"
          hint="Rotates and scales the label, Symbol, or image drawn on the tile. A negative scale mirrors that axis."
          transform={fg.transform}
          onChange={(transform) => patch({ foreground: { transform } })}
          onResetRotation={resetFor("foregroundRotation")}
          onResetScale={resetFor("foregroundScale")}
        />

        {/* Symbol Paint Role colours (ADR-0007): fill / border / secondary
            recolour a Symbol's sentinel shapes independently. They apply only to
            Glyphs that render a Symbol, but live in the shared Style panel so the
            cascade UI isn't forked. */}
        <ColorField
          label="Symbol fill"
          value={fg.symbolPaints.fill}
          onChange={(fill) => patch({ foreground: { symbolPaints: { fill } } })}
          onReset={resetFor("symbolFill")}
        />
        <ColorField
          label="Symbol border"
          value={fg.symbolPaints.border}
          onChange={(color) =>
            patch({ foreground: { symbolPaints: { border: color } } })
          }
          onReset={resetFor("symbolBorder")}
        />
        <ColorField
          label="Symbol secondary"
          value={fg.symbolPaints.secondary}
          onChange={(secondary) =>
            patch({ foreground: { symbolPaints: { secondary } } })
          }
          onReset={resetFor("symbolSecondary")}
        />
      </LayerGroup>

      {/* Neither layer's: an atlas output value that never cascades (ADR-0006),
          so it sits outside both groups rather than inside whichever is nearer. */}
      {showCellSize && <CellSizeField project={project} dispatch={dispatch} />}
    </div>
  );
}

/**
 * One drawing layer's controls, under a heading naming the layer. The grouping is
 * the payoff of the layer split: a reader can see which object each control
 * writes without reading the handler.
 */
function LayerGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">{title}</legend>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

/**
 * A docked editor for a single Glyph, shown below the Editor sidebar once the
 * user clicks that Glyph's cell. It edits the Glyph tier of the Style Cascade —
 * the same `patch-style`/`clear-style` flow as the sidebar — so overrides here
 * win over the Project and Device defaults. Cell size is hidden because it never
 * cascades. Dismiss with the close button or Escape.
 */
export function GlyphStylePanel({
  project,
  dispatch,
  glyph,
  style,
  override,
  onClose,
  onUploadFont,
  onOpenAssets,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  glyph: SelectedGlyph;
  /** Effective style for the Glyph (resolved through the cascade). */
  style: GlyphStyle;
  /** Raw sparse override stored on the Glyph. */
  override: StyleOverride;
  onClose: () => void;
  /** Hand an uploaded font to the editor; resolves to its manifest entry. */
  onUploadFont: (file: File) => Promise<FontAsset>;
  /** Open the Assets window, which the pickers' trailing tile leads to. */
  onOpenAssets: () => void;
}) {
  const scope: StyleScope = {
    tier: "glyph",
    deviceIndex: glyph.deviceIndex,
    glyphId: glyph.glyphId,
  };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section
      aria-label={`Edit Glyph ${glyph.label}`}
      className="flex max-h-[45%] shrink-0 flex-col overflow-hidden rounded-lg border"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          Editing Glyph:{" "}
          <span className="text-muted-foreground">{glyph.label}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Glyph editor"
          title="Close (Esc)"
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* Render Source is per-Input, so this panel is the only place it's
            editable — the sidebar's Style controls address whole tiers. */}
        <StyleControls
          project={project}
          dispatch={dispatch}
          scope={scope}
          style={style}
          override={override}
          showCellSize={false}
          showRenderSource
          onUploadFont={onUploadFont}
          onOpenAssets={onOpenAssets}
        />
      </div>
    </section>
  );
}
