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
import type { ImageAsset } from "@/lib/glyph/types";
import { AssetArt } from "./asset-art";
import { AssetGrid, type AssetGridItem } from "./asset-grid";
import { ResetButton } from "./controls-ui";

/**
 * Picks a Glyph's **Render Source** (ADR-0004): its font-drawn label, its
 * bundled Symbol, or one of the project's custom images.
 *
 * A grid of the art itself rather than radios and a filename dropdown, so the
 * user picks something they can see (ADR-0014 §5, #45). The label has no artwork
 * to show, so its tile shows the word — an empty tile would read as art that
 * failed to load.
 *
 * Uploading happens in the **Assets window**, not here: this control picks from
 * what the project has, and having is the window's job. The choice is one more
 * Glyph-tier entry in the Style Cascade, written with the same `patch-style` /
 * `clear-style` actions as any other override, with the same reset control.
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
}) {
  const isOverridden = isOverrideFieldSet(override, "renderSource");

  const items: AssetGridItem[] = [
    {
      key: "label",
      label: "Label",
      art: <span className="text-xs font-medium">Abc</span>,
    },
    // An Input the Catalog ships no Symbol for isn't offered one: the choice
    // would resolve straight back to the label.
    ...(symbolId
      ? [
          {
            key: "symbol",
            label: "Symbol",
            art: (
              <AssetArt
                spec={{ kind: "symbol", id: symbolId, device: deviceCatalogId }}
              />
            ),
          },
        ]
      : []),
    ...images.map((image) => ({
      key: `image:${image.id}`,
      label: image.fileName,
      art: <AssetArt spec={{ kind: "image", id: image.id }} />,
    })),
  ];

  function onSelect(key: string) {
    if (key === "label" || key === "symbol") return patch({ kind: key });
    patch({ kind: "image", imageId: key.slice("image:".length) });
  }

  function patch(renderSource: RenderSourceOverride) {
    dispatch({
      type: "patch-style",
      scope,
      patch: { foreground: { renderSource } },
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
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
        selectedKey={selectedKey(source)}
        onSelect={onSelect}
      />

      {images.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Upload an image in the Assets window to draw one here.
        </p>
      )}
    </div>
  );
}

/**
 * The grid key for what the Glyph draws today.
 *
 * A resolved image whose id has left the manifest cannot appear here — the
 * resolver falls back to the Symbol or label before this sees it — so the key
 * always names a tile the grid is showing.
 */
function selectedKey(source: ResolvedRenderSource): string {
  if (source.kind === "image") return `image:${source.imageId}`;
  return source.kind;
}
