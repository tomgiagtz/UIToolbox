"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlyphPreview } from "@/components/glyph/glyph-preview";
import { downloadArtifacts, exportDevice } from "@/lib/glyph/exporter";
import { loadFontFromFile } from "@/lib/glyph/font";
import { generateTilesets } from "@/lib/glyph/generate";
import { createDefaultProject } from "@/lib/glyph/presets";

type Status =
  | { kind: "idle" }
  | { kind: "loading-font" }
  | { kind: "ready"; fontName: string }
  | { kind: "generating"; fontName: string }
  | { kind: "done"; fontName: string; files: string[] }
  | { kind: "error"; message: string };

/**
 * Preview cell size in px. Smaller than the 128px output cell so the full grid
 * fits on screen; the shared renderer scales proportionally, so the preview
 * still reflects the output faithfully.
 */
const PREVIEW_CELL = 96;

export function GlyphCreator() {
  const [fontFamily, setFontFamily] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = useMemo(
    () => (fontFamily ? createDefaultProject(fontFamily) : null),
    [fontFamily],
  );
  const keyboard = project?.devices[0] ?? null;

  async function onFontChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ kind: "loading-font" });
    try {
      const family = await loadFontFromFile(file);
      setFontFamily(family);
      setStatus({ kind: "ready", fontName: file.name });
    } catch {
      setFontFamily(null);
      setStatus({
        kind: "error",
        message: `Couldn't load "${file.name}". Please choose a valid font file (.ttf, .otf, .woff, .woff2).`,
      });
    }
  }

  async function onGenerate() {
    if (!project) return;
    const fontName =
      status.kind === "ready" || status.kind === "done"
        ? status.fontName
        : "font";
    setStatus({ kind: "generating", fontName });
    try {
      const outputs = generateTilesets(project);
      const files: string[] = [];
      for (const output of outputs) {
        const { png, json } = await exportDevice(output, {
          textColor: project.textColor,
          background: project.background,
          fontFamily: project.font.family,
        });
        await downloadArtifacts([png, json]);
        files.push(png.filename, json.filename);
      }
      setStatus({ kind: "done", fontName, files });
    } catch {
      setStatus({
        kind: "error",
        message: "Generation failed. Please try again.",
      });
    }
  }

  const hasFont = fontFamily !== null && project !== null;
  const isBusy = status.kind === "loading-font" || status.kind === "generating";

  return (
    <div className="space-y-8">
      <section aria-labelledby="upload-heading" className="space-y-3">
        <h2 id="upload-heading" className="text-xl font-semibold">
          1. Upload a font
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your font is used to render every Glyph, and never leaves your browser.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="font-file"
            className="text-sm font-medium"
          >
            Font file
          </label>
          <input
            ref={fileInputRef}
            id="font-file"
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/*"
            onChange={onFontChange}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
          />
        </div>
      </section>

      <section aria-labelledby="preview-heading" className="space-y-3">
        <h2 id="preview-heading" className="text-xl font-semibold">
          2. Preview the Keyboard Glyphs
        </h2>
        {hasFont && keyboard ? (
          <ul
            aria-label="Keyboard Glyph preview grid"
            className="flex flex-wrap gap-3"
          >
            {keyboard.inputs.map((label, i) => (
              <li
                key={`${label}-${i}`}
                className="flex flex-col items-center gap-1"
              >
                <GlyphPreview
                  label={label}
                  cellSize={PREVIEW_CELL}
                  textColor={project.textColor}
                  background={project.background}
                  fontFamily={project.font.family}
                  className="rounded-md"
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Upload a font to see a live preview of the Keyboard Glyphs.
          </p>
        )}
      </section>

      <section aria-labelledby="generate-heading" className="space-y-3">
        <h2 id="generate-heading" className="text-xl font-semibold">
          3. Generate the Sprite Atlas
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Downloads a power-of-two PNG atlas and a TexturePacker-format JSON
          sidecar.
        </p>
        <Button onClick={onGenerate} disabled={!hasFont || isBusy}>
          {status.kind === "generating" ? "Generating…" : "Generate"}
        </Button>
      </section>

      <p role="status" aria-live="polite" className="text-sm">
        {status.kind === "loading-font" && "Loading font…"}
        {status.kind === "ready" &&
          `Loaded "${status.fontName}". Ready to generate.`}
        {status.kind === "generating" && "Generating atlas…"}
        {status.kind === "done" && (
          <span className="text-foreground">
            Done — downloaded {status.files.join(" and ")}.
          </span>
        )}
        {status.kind === "error" && (
          <span className="text-destructive">{status.message}</span>
        )}
      </p>
    </div>
  );
}
