"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { GlyphPreview } from "@/components/glyph/glyph-preview";
import {
  downloadArtifact,
  downloadArtifacts,
  exportDevice,
} from "@/lib/glyph/exporter";
import { loadFontFromFile, registerFont } from "@/lib/glyph/font";
import { generateTilesets } from "@/lib/glyph/generate";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import { exportProjectFile, importProjectFile } from "@/lib/glyph/project-file";
import {
  clear as clearPersisted,
  loadConfig,
  loadFont,
  saveConfig,
  saveFont,
} from "@/lib/glyph/project-store";
import { StyleControls } from "./style-controls";
import { DeviceControls } from "./device-controls";
import { NamingControls } from "./naming-controls";
import { ProjectMenuBar } from "./project-menu-bar";

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
  // Until the persisted config + font have been restored, the save effect must
  // not fire — otherwise the initial default project overwrites saved storage
  // before the load below runs.
  const hydrated = useRef(false);

  // Restore persisted state on mount: config from localStorage, font blob from
  // IndexedDB (re-registered under the same family the config carries).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = loadConfig();
      if (saved && !cancelled) dispatch({ type: "load-project", project: saved });

      try {
        const font = await loadFont();
        if (font && !cancelled) {
          await registerFont(font.family, font.blob);
          if (cancelled) return;
          setFontLoaded(true);
          setStatus({ kind: "ready", fontName: font.fileName });
        }
      } catch {
        // A missing or undecodable persisted font just means no restore; the
        // developer re-uploads. Config still restored above.
      } finally {
        if (!cancelled) hydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the config on every change, once hydration has completed.
  useEffect(() => {
    if (hydrated.current) saveConfig(project);
  }, [project]);

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
      // Persist the blob so the font survives a reload (self-guards on failure).
      await saveFont({ family, fileName: file.name, blob: file });
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

  // Save the project to a file. With the font it's a ZIP (config + font file),
  // otherwise a config-only JSON. The font blob comes straight from IndexedDB.
  async function onSave(includeFont: boolean) {
    try {
      const font = includeFont ? await loadFont() : null;
      const artifact = await exportProjectFile(project, font);
      downloadArtifact(artifact);
    } catch {
      setStatus({ kind: "error", message: "Couldn't save the project file." });
    }
  }

  // Load a project file (JSON or ZIP). Config is hydrated via load-project; a
  // bundled font is re-registered and re-persisted so it also survives reloads.
  async function onLoadFile(file: File) {
    try {
      const imported = await importProjectFile(file);
      if (!imported) {
        setStatus({
          kind: "error",
          message: `"${file.name}" isn't a valid project file.`,
        });
        return;
      }
      dispatch({ type: "load-project", project: imported.project });
      if (imported.font) {
        await registerFont(imported.font.family, imported.font.blob);
        await saveFont(imported.font);
        setFontLoaded(true);
        setStatus({ kind: "ready", fontName: imported.font.fileName });
      } else {
        // Config-only: the referenced font isn't present, so require an upload.
        setFontLoaded(false);
        setStatus({ kind: "idle" });
      }
    } catch {
      setStatus({
        kind: "error",
        message: `Couldn't load "${file.name}".`,
      });
    }
  }

  // Reset everything: default config plus cleared localStorage + IndexedDB.
  async function onDelete() {
    if (!window.confirm("Discard all changes and start over? This clears the saved config and font.")) {
      return;
    }
    await clearPersisted();
    dispatch({ type: "load-project", project: createDefaultProject("") });
    setFontLoaded(false);
    setActiveDeviceIndex(0);
    setStatus({ kind: "idle" });
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
          6. Save &amp; Generate
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          <strong>Generate</strong> downloads one power-of-two PNG atlas and a
          TexturePacker-format JSON sidecar per selected Device.{" "}
          <strong>Save</strong> writes a reusable project file (config JSON, or a
          ZIP that also bundles your font); <strong>Load</strong> restores one.
        </p>
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

      <ProjectMenuBar
        name={project.name}
        onNameChange={(name) => dispatch({ type: "set-name", name })}
        fontLoaded={fontLoaded}
        canGenerate={canGenerate}
        generating={status.kind === "generating"}
        onSave={onSave}
        onLoadFile={onLoadFile}
        onDelete={onDelete}
        onGenerate={onGenerate}
      />
    </div>
  );
}
