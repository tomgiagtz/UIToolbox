"use client";

import { useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlyphPreview } from "@/components/glyph/glyph-preview";
import { downloadArtifacts, exportDevice } from "@/lib/glyph/exporter";
import { loadFontFromFile } from "@/lib/glyph/font";
import { generateTilesets } from "@/lib/glyph/generate";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import { StyleControls } from "./style-controls";
import { DeviceControls } from "./device-controls";
import { NamingControls } from "./naming-controls";

type Status =
  | { kind: "idle" }
  | { kind: "loading-font" }
  | { kind: "ready"; fontName: string }
  | { kind: "generating"; fontName: string }
  | { kind: "done"; fontName: string; files: string[] }
  | { kind: "error"; message: string };

/**
 * On-screen edge (px) each preview Glyph is displayed at, so the whole grid
 * fits regardless of the chosen cell size. The canvas is still rendered at the
 * real `cellSize` (below), so its resolution — sharp vs. blocky — reflects the
 * output; only the CSS display box is pinned to this size.
 */
const PREVIEW_DISPLAY = 96;

export function GlyphCreator() {
  // The whole editor is a thin shell over the project state + reducer; every
  // control dispatches a ProjectAction (see project.ts).
  const [project, dispatch] = useReducer(projectReducer, "", createDefaultProject);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Devices can be removed, so the stored index may fall out of range.
  const activeIndex = Math.min(
    activeDeviceIndex,
    Math.max(0, project.devices.length - 1),
  );
  const activeDevice = project.devices[activeIndex] ?? null;

  async function onFontChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ kind: "loading-font" });
    try {
      const family = await loadFontFromFile(file);
      dispatch({ type: "set-font", family });
      setFontLoaded(true);
      setStatus({ kind: "ready", fontName: file.name });
    } catch {
      setFontLoaded(false);
      setStatus({
        kind: "error",
        message: `Couldn't load "${file.name}". Please choose a valid font file (.ttf, .otf, .woff, .woff2).`,
      });
    }
  }

  async function onGenerate() {
    if (!canGenerate) return;
    const fontName =
      status.kind === "ready" || status.kind === "done" ? status.fontName : "font";
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
      setStatus({ kind: "error", message: "Generation failed. Please try again." });
    }
  }

  const isBusy = status.kind === "loading-font" || status.kind === "generating";
  const canGenerate = fontLoaded && project.devices.length > 0 && !isBusy;

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
          <label htmlFor="font-file" className="text-sm font-medium">
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

      <section aria-labelledby="devices-heading" className="space-y-3">
        <h2 id="devices-heading" className="text-xl font-semibold">
          2. Choose Devices &amp; Inputs
        </h2>
        <DeviceControls
          project={project}
          dispatch={dispatch}
          activeIndex={activeIndex}
          onSelectDevice={setActiveDeviceIndex}
        />
      </section>

      <section aria-labelledby="style-heading" className="space-y-3">
        <h2 id="style-heading" className="text-xl font-semibold">
          3. Style the Glyphs
        </h2>
        <StyleControls project={project} dispatch={dispatch} />
      </section>

      <section aria-labelledby="naming-heading" className="space-y-3">
        <h2 id="naming-heading" className="text-xl font-semibold">
          4. Name the output
        </h2>
        <NamingControls
          project={project}
          dispatch={dispatch}
          activeIndex={activeIndex}
        />
      </section>

      <section aria-labelledby="preview-heading" className="space-y-3">
        <h2 id="preview-heading" className="text-xl font-semibold">
          5. Preview the Glyphs
        </h2>
        {fontLoaded && activeDevice ? (
          <ul
            aria-label={`${activeDevice.name} Glyph preview grid`}
            className="flex flex-wrap gap-3"
          >
            {activeDevice.inputs.map((label, i) => (
              <li key={`${label}-${i}`} className="flex flex-col items-center gap-1">
                <GlyphPreview
                  label={label}
                  cellSize={project.cellSize}
                  textColor={project.textColor}
                  background={project.background}
                  fontFamily={project.font.family}
                  className="rounded-md"
                  style={{ width: PREVIEW_DISPLAY, height: PREVIEW_DISPLAY }}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {fontLoaded
              ? "Select a Device to preview its Glyphs."
              : "Upload a font to see a live preview of the Glyphs."}
          </p>
        )}
      </section>

      <section aria-labelledby="generate-heading" className="space-y-3">
        <h2 id="generate-heading" className="text-xl font-semibold">
          6. Generate the Sprite Atlases
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Downloads one power-of-two PNG atlas and a TexturePacker-format JSON
          sidecar per selected Device.
        </p>
        <Button onClick={onGenerate} disabled={!canGenerate}>
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
