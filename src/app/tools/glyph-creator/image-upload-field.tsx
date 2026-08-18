"use client";

import { useId } from "react";

/** File types an image upload accepts — raster art plus SVG. */
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/**
 * A labeled file input for adding an image to the project, used by the Assets
 * window — the one place an upload can start, since having an Asset is the
 * window's job and picking one is the Style panel's (ADR-0014).
 */
export function ImageUploadField({
  label,
  hint,
  onUpload,
}: {
  label: string;
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
        accept={IMAGE_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          // Clear the input so re-picking the same file still fires a change.
          e.target.value = "";
        }}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-surface-base file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-surface-hover"
      />
      <p className="text-xs text-muted-foreground">
        PNG, JPEG, WebP, or SVG. Uploads stay in your browser. {hint}
      </p>
    </div>
  );
}
