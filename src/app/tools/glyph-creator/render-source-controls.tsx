"use client";

import { useId, type Dispatch } from "react";
import type { ResolvedRenderSource } from "@/lib/glyph/generate";
import type { ProjectAction } from "@/lib/glyph/project";
import { isOverrideFieldSet } from "@/lib/glyph/style";
import type { StyleOverride, StyleScope } from "@/lib/glyph/style";
import type { ImageAsset } from "@/lib/glyph/types";
import { ResetButton, inputClass } from "./controls-ui";

/** File types the image picker accepts — raster art plus SVG. */
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/**
 * Picks a Glyph's **Render Source** (ADR-0004): its font-drawn label, its bundled
 * Symbol, or a custom image the user uploads.
 *
 * The choice is one more Glyph-tier entry in the Style Cascade, so it is written
 * with the same `patch-style` / `clear-style` actions as any other override and
 * gets the same "fall back up the cascade" reset control.
 *
 * The label is never one of the things being replaced in the domain sense — it
 * stays the Input's identity and the source of its Sprite Name — so switching to
 * artwork changes only what is drawn.
 */
export function RenderSourceControls({
  dispatch,
  scope,
  source,
  hasSymbol,
  images,
  override,
  onUploadImage,
}: {
  dispatch: Dispatch<ProjectAction>;
  /** The Glyph being edited. */
  scope: StyleScope;
  /** What this Glyph draws today, resolved through the cascade. */
  source: ResolvedRenderSource;
  /** Whether the Catalog offers this Input a Symbol to switch to. */
  hasSymbol: boolean;
  /** The project's uploaded images, any of which this Glyph can point at. */
  images: ImageAsset[];
  /** Raw sparse override at `scope`, for the reset control. */
  override: StyleOverride;
  /** Hand an uploaded file to the editor, which registers and persists it. */
  onUploadImage: (file: File) => void;
}) {
  const groupId = useId();
  const isOverridden = isOverrideFieldSet(override, "renderSource");

  function choose(kind: ResolvedRenderSource["kind"]) {
    if (kind === "image") {
      // Coming back to Image restores the Glyph's own picture, not the first
      // upload — the id survives on the override while another source is shown,
      // so switching away and back mustn't silently repoint it.
      const previous = override.renderSource;
      const imageId =
        previous?.kind === "image" &&
        images.some((i) => i.id === previous.imageId)
          ? previous.imageId
          : images[0]?.id;
      // With an empty manifest there's nothing to point at; the picker below
      // prompts for a file instead.
      if (!imageId) return;
      return patch({ kind: "image", imageId });
    }
    patch({ kind });
  }

  function patch(renderSource: StyleOverride["renderSource"]) {
    dispatch({ type: "patch-style", scope, patch: { renderSource } });
  }

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <span>Render Source</span>
        {isOverridden && (
          <ResetButton
            label="Render Source"
            onReset={() =>
              dispatch({ type: "clear-style", scope, field: "renderSource" })
            }
          />
        )}
      </legend>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={groupId}
            checked={source.kind === "label"}
            onChange={() => choose("label")}
            className="size-4"
          />
          Label
        </label>
        {/* An Input the Catalog ships no Symbol for isn't offered one: the
            choice would resolve straight back to the label. */}
        {hasSymbol && (
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={groupId}
              checked={source.kind === "symbol"}
              onChange={() => choose("symbol")}
              className="size-4"
            />
            Symbol
          </label>
        )}
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={groupId}
            checked={source.kind === "image"}
            disabled={images.length === 0}
            onChange={() => choose("image")}
            className="size-4"
          />
          Image
        </label>
      </div>

      {source.kind === "image" && images.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <label htmlFor={`${groupId}-image`} className="text-sm font-medium">
            Image file
          </label>
          <select
            id={`${groupId}-image`}
            className={inputClass}
            value={source.imageId}
            onChange={(e) => patch({ kind: "image", imageId: e.target.value })}
          >
            {images.map((image) => (
              <option key={image.id} value={image.id}>
                {image.fileName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-1.5 flex flex-col gap-1.5">
        <label htmlFor={`${groupId}-upload`} className="text-sm font-medium">
          Upload image
        </label>
        <input
          id={`${groupId}-upload`}
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadImage(file);
            // Clear the input so re-picking the same file still fires a change.
            e.target.value = "";
          }}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPEG, WebP, or SVG. Uploads stay in your browser and are drawn on
          the Glyph&apos;s tile. Size them with Content scale below.
        </p>
      </div>
    </fieldset>
  );
}
