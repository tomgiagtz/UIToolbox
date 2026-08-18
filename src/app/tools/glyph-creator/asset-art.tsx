"use client";

import { useEffect, useState } from "react";
import { getImageBlob } from "@/lib/glyph/images";
import { recolorSymbolSvg, type RoleColors } from "@/lib/glyph/symbol-render";
import { getSymbolSvg } from "@/lib/glyph/symbols";

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
export type AssetArtSpec =
  | { kind: "image"; id: string }
  | { kind: "symbol"; id: string; device?: string }
  | { kind: "authored"; id: string; device?: string };

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
  fill: "#e2e8f0",
  border: "#64748b",
  secondary: "#94a3b8",
};

export function AssetArt({
  spec,
  className,
}: {
  spec: AssetArtSpec;
  /** Sizing comes from the caller; the art fills whatever box it is given. */
  className?: string;
}) {
  if (spec.kind === "image") {
    return <UploadedArt id={spec.id} className={className} />;
  }
  const svg = getSymbolSvg(spec.id, spec.device);
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
