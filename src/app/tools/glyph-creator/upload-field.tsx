"use client";

import { useId } from "react";

/** File types an image upload accepts — raster art plus SVG. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/** File types a font upload accepts. */
export const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2,font/*";

/**
 * A labeled file input for adding an Asset to the project, used by the Assets
 * window — the one place an upload can start, since having an Asset is the
 * window's job and picking one is the Style panel's (ADR-0014 §1).
 *
 * One field for every kind rather than one per kind: what differs between an
 * image and a font is the `accept` list and a sentence of prose, while the part
 * worth getting right once — the reset below, and the file-input chrome — is the
 * same either way.
 */
export function UploadField({
  label,
  accept,
  hint,
  onUpload,
}: {
  label: string;
  /** The input's `accept` list; see the constants above. */
  accept: string;
  /** The whole hint sentence, naming the formats this field takes. */
  hint: string;
  onUpload: (file: File) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          // Clear the input so re-picking the same file still fires a change.
          e.target.value = "";
        }}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-surface-base file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-surface-hover"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
