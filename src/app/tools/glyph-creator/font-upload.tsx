"use client";

/**
 * Font picker for the Style section. The uploaded font renders every Glyph and
 * never leaves the browser. Kept as its own component so the Style section can
 * lead with it while {@link StyleControls} stays focused on appearance.
 */
export function FontUpload({
  fontName,
  onFontChange,
}: {
  /** Name of the currently loaded font file, if any. */
  fontName: string | null;
  onFontChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="font-file" className="text-sm font-medium">
        Font file
      </label>
      <input
        id="font-file"
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/*"
        onChange={onFontChange}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
      />
      <p className="text-xs text-muted-foreground">
        {fontName
          ? `Loaded "${fontName}". Used to render every Glyph.`
          : "Inter is used by default. Upload your own to override it — it never leaves your browser."}
      </p>
    </div>
  );
}
