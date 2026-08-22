"use client";

import { useEffect, useState } from "react";
import { getImageBlob } from "@/lib/glyph/images";
import { recolorSymbolSvg, type RoleColors } from "@/lib/glyph/symbol-render";
import { getSymbolAsset, getSymbolSvg } from "@/lib/glyph/symbols";

/** Which Asset {@link AssetArt} should draw, and on which Device where it varies. */
export type AssetArtSpec =
  | { kind: "image"; id: string }
  | { kind: "symbol"; id: string; device?: string }
  | { kind: "authored"; id: string; device?: string };

/**
 * The art for a shipped cell, drawn for a gallery rather than for a Glyph.
 *
 * A cell id is bare and resolves through the shared-to-device cascade, so the
 * scope being edited picks the right drawing — a PlayStation dpad on a
 * PlayStation Glyph. But some cells are drawn by **no** shared atlas at all:
 * `bumper` and `trigger` exist only per-device, so at Project scope, which has
 * no Device to resolve against, they would have no art whatsoever. A gallery
 * still has to show what the tile *is*, so it falls back to any atlas that draws
 * it. That is a picture rather than a promise — which Glyph gets which drawing is
 * still the cascade's answer, not this one's.
 */
function gallerySvg(id: string, device?: string): string | undefined {
  const own = getSymbolSvg(id, device);
  if (own) return own;
  for (const atlas of getSymbolAsset(id)?.atlases ?? []) {
    const svg = getSymbolSvg(id, atlas);
    if (svg) return svg;
  }
  return undefined;
}

/**
 * Fixed neutral Paint Roles for shipped art in a picker.
 *
 * Deliberately **not** the cascade's resolved colours. A gallery is for
 * comparing one drawing against another, which only works if they are drawn
 * alike; the honest promise about how art will look in *this* project is the
 * live atlas preview, which renders through the real cascade. #83 lands on the
 * same split for the Preset picker's swatches.
 */
const GALLERY_PAINTS: RoleColors = {
  // Mid-tones, not the near-white a Glyph draws its ink in. A Glyph is painted
  // to read against its own dark tile; a gallery tile sits on the panel surface,
  // so the same colours would be white ink on a white card. These read on either
  // surface, which is what a picker needs and what a Glyph never has to be.
  fill: "#64748b",
  border: "#94a3b8",
  secondary: "#cbd5e1",
};

/**
 * One **Asset**'s artwork, drawn small (ADR-0014).
 *
 * The single place a gallery tile's art comes from, shared by the Style panel's
 * pickers and the Assets window so the two cannot draw the same Asset
 * differently.
 *
 * Rendered as **inline SVG or an `<img>`, never a canvas**. A canvas would mean
 * threading the rasterization caches through the picker for art that is never
 * exported, and it would draw nothing under jsdom — where these components are
 * tested — so a tile would be untestable for the same reason `AtlasPreview` is.
 */
export function AssetArt({
  spec,
  className = "block size-full",
}: {
  spec: AssetArtSpec;
  /** Sizing; defaults to filling whatever box the caller puts it in. */
  className?: string;
}) {
  if (spec.kind === "image") {
    return <UploadedArt id={spec.id} className={className} />;
  }
  const svg = gallerySvg(spec.id, spec.device);
  if (!svg) return <MissingArt className={className} />;
  return (
    <span
      aria-hidden
      className={className}
      // The SVG is generated from atlases in this repo by `npm run symbols`, not
      // user input, and it has to be inlined rather than sourced so its sentinel
      // paint roles can be substituted.
      dangerouslySetInnerHTML={{
        __html: recolorSymbolSvg(svg, GALLERY_PAINTS),
      }}
    />
  );
}

/**
 * An uploaded image's own bytes, from the runtime registry.
 *
 * The object URL is held in state and revoked on unmount rather than derived
 * each render: a fresh URL per render would leak one per frame while a grid
 * re-renders, and revoking during render would race the `<img>` that is reading
 * it.
 */
function UploadedArt({ id, className }: { id: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = getImageBlob(id);
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [id]);

  // No bytes registered is the ordinary case for a config that outlived its
  // assets, not an error — the Glyph itself falls back the same way.
  if (!url) return <MissingArt className={className} />;
  // next/image optimises files it can fetch and measure; this is a blob URL for
  // bytes that never leave the browser, with no intrinsic size known here, so
  // the loader has nothing to do and cannot resolve the src at all.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className} />;
}

/** Stands in for art with no bytes and no drawing, so a tile keeps its shape. */
function MissingArt({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`${className ?? ""} block rounded border border-dashed border-input`}
    />
  );
}
