"use client";

import type { Dispatch } from "react";
import type { ResolvedRenderSource } from "@/lib/glyph/generate";
import type { ProjectAction } from "@/lib/glyph/project";
import { isOverrideFieldSet } from "@/lib/glyph/style";
import type {
  RenderSourceOverride,
  StyleOverride,
  StyleScope,
} from "@/lib/glyph/style";
import { pickableSymbols } from "@/lib/glyph/symbols";
import type { ImageAsset } from "@/lib/glyph/types";
import { AssetArt } from "./asset-art";
import {
  AssetGrid,
  imageIdFromKey,
  imageKey,
  imageTiles,
  type AssetGridItem,
} from "./asset-grid";
import { ResetButton } from "./controls-ui";

/**
 * Picks a Glyph's **Render Source** (ADR-0004): its font-drawn label, its
 * bundled Symbol, or one of the project's custom images.
 *
 * A grid of the art itself rather than radios and a filename dropdown, so the
 * user picks something they can see (ADR-0014 §7, #45). The label has no artwork
 * to show, so its tile shows the word — an empty tile would read as art that
 * failed to load.
 *
 * Uploading happens in the **Assets window**, not here: this control picks from
 * what the project has, and having is the window's job. The choice is one more
 * Glyph-tier entry in the Style Cascade, written with the same `patch-style` /
 * `clear-style` actions as any other override, with the same reset control.
 *
 * **Every** Symbol the Device can draw is offered, not just the Catalog's own
 * (ADR-0015). The Catalog's keeps the id-less `symbol` key so that Glyph goes
 * on tracking its Catalog and a Catalog fix reaches it; every other tile pins
 * its id. Without the pinned tiles an imported Set's new drawings would be
 * unreachable — nothing else in the tool can point a Glyph at one.
 *
 * The label is never one of the things replaced in the domain sense — it stays
 * the Input's identity and the source of its Sprite Name — so switching to
 * artwork changes only what is drawn.
 */
export function RenderSourceControls({
  dispatch,
  scope,
  source,
  symbolId,
  deviceCatalogId,
  images,
  override,
  onOpenAssets,
}: {
  dispatch: Dispatch<ProjectAction>;
  /** The Glyph being edited. */
  scope: StyleScope;
  /** What this Glyph draws today, resolved through the cascade. */
  source: ResolvedRenderSource;
  /** The Symbol the Catalog gives this Input, if any — drawn on its tile. */
  symbolId: string | undefined;
  /** Which Device's Set the Symbol is drawn from (a Catalog id). */
  deviceCatalogId: string | undefined;
  /** The project's uploaded images, any of which this Glyph can point at. */
  images: ImageAsset[];
  /** Raw sparse override at `scope`, for the reset control. */
  override: StyleOverride;
  /** Open the Assets window, which the grid's trailing tile leads to. */
  onOpenAssets: () => void;
}) {
  const isOverridden = isOverrideFieldSet(override, "renderSource");

  const symbolArt = (id: string) => (
    <AssetArt spec={{ kind: "symbol", id, device: deviceCatalogId }} />
  );

  const items: AssetGridItem[] = [
    {
      key: "label",
      label: "Label",
      art: <span className="text-xs font-medium">Abc</span>,
    },
    // The Catalog's own Symbol, id-less so it keeps tracking the Catalog. Listed
    // first and under the plain name, because for a well-known Input this is
    // simply "its Symbol" — the pinned tiles below are the deliberate choice.
    ...(symbolId
      ? [{ key: SYMBOL_KEY, label: "Symbol", art: symbolArt(symbolId) }]
      : []),
    // Deduped against the Catalog's, so a Glyph never sees its own Symbol twice.
    ...pickableSymbols(deviceCatalogId ? [deviceCatalogId] : [])
      .filter((symbol) => symbol.id !== symbolId)
      .map((symbol) => ({
        key: symbolKey(symbol.id),
        label: symbol.label,
        art: symbolArt(symbol.id),
      })),
    ...imageTiles(images),
  ];

  function onSelect(key: string) {
    const imageId = imageIdFromKey(key);
    if (imageId) return patch({ kind: "image", imageId });
    const pinned = symbolIdFromKey(key);
    if (pinned) return patch({ kind: "symbol", symbolId: pinned });
    if (key === "label" || key === SYMBOL_KEY) patch({ kind: key });
  }

  function patch(renderSource: RenderSourceOverride) {
    dispatch({
      type: "patch-style",
      scope,
      patch: { foreground: { renderSource } },
    });
  }

  return (
    // Full row: a gallery in one third of the panel truncates every caption.
    <div className="col-span-full flex flex-col gap-1.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-sm font-medium">Render Source</span>
        {isOverridden && (
          <ResetButton
            label="Render Source"
            onReset={() =>
              dispatch({ type: "clear-style", scope, field: "renderSource" })
            }
          />
        )}
      </div>

      <AssetGrid
        label="Render Source"
        items={items}
        selectedKey={selectedKey(source, symbolId, items)}
        onSelect={onSelect}
        onAdd={onOpenAssets}
        // Every Symbol is on offer now, so this grid runs to dozens of tiles
        // where it used to hold three. Capped and scrolled rather than left to
        // push the rest of the Style panel off the screen.
        className="max-h-64 overflow-y-auto"
      />
    </div>
  );
}

/** Tile key for the Catalog's own Symbol — the one Symbol tile carrying no id. */
const SYMBOL_KEY = "symbol";

/** Tile key prefix for a Symbol pinned by id. */
const SYMBOL_PIN = "symbol:";

/** The tile key pinning `id`. */
function symbolKey(id: string): string {
  return `${SYMBOL_PIN}${id}`;
}

/** The Symbol id a tile key pins, or `null` if the key pins none. */
function symbolIdFromKey(key: string): string | null {
  return key.startsWith(SYMBOL_PIN) ? key.slice(SYMBOL_PIN.length) : null;
}

/**
 * The grid key for what the Glyph draws today.
 *
 * A resolved image whose id has left the manifest cannot appear here — the
 * resolver falls back to the Symbol or label before this sees it. A resolved
 * *Symbol* can: a pin outlives the Set that drew it, and unlike an image the
 * resolver deliberately takes a pinned id at its word rather than degrading
 * (see `resolveRenderSource`). So the key is checked against the tiles and
 * comes back `null` when the pinned Symbol is no longer among them — the grid's
 * documented spelling for "the stored value is not on offer", which shows
 * nothing selected instead of lighting the wrong tile.
 */
function selectedKey(
  source: ResolvedRenderSource,
  catalogSymbolId: string | undefined,
  items: AssetGridItem[],
): string | null {
  if (source.kind === "image") return imageKey(source.imageId);
  if (source.kind === "label") return "label";
  const key =
    source.symbolId === catalogSymbolId
      ? SYMBOL_KEY
      : symbolKey(source.symbolId);
  return items.some((item) => item.key === key) ? key : null;
}
