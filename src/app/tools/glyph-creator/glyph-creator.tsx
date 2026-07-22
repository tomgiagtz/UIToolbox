"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { DisclosureGroup } from "react-aria-components";
import { AtlasPreview } from "@/components/glyph/atlas-preview";
import {
  downloadArtifact,
  downloadArtifacts,
  exportDevice,
} from "@/lib/glyph/exporter";
import {
  loadDefaultFont,
  loadFontFromFile,
  registerFont,
} from "@/lib/glyph/font";
import {
  generateTilesets,
  resolveDeviceInputs,
  resolveScopeStyle,
} from "@/lib/glyph/generate";
import { DEFAULT_FONT_FAMILY, createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { StyleOverride, StyleScope } from "@/lib/glyph/style";
import type { Project } from "@/lib/glyph/types";
import { exportProjectFile, importProjectFile } from "@/lib/glyph/project-file";
import {
  clear as clearPersisted,
  loadConfig,
  loadFont,
  saveConfig,
  saveFont,
} from "@/lib/glyph/project-store";
import {
  GlyphStylePopover,
  StyleControls,
  StyleScopeSwitcher,
  type SelectedGlyph,
} from "./style-controls";
import { DeviceControls, InputEditor } from "./device-controls";
import { NamingControls } from "./naming-controls";
import { ProjectMenuBar } from "./project-menu-bar";
import { PanelSection } from "./panel-section";
import { FontUpload } from "./font-upload";

type Status =
  | { kind: "idle" }
  | { kind: "loading-font" }
  | { kind: "ready"; fontName: string }
  | { kind: "generating"; fontName: string }
  | { kind: "done"; fontName: string; files: string[] }
  | { kind: "error"; message: string };

/**
 * Track the edge (px) of the largest square that fits inside an element's
 * content box, so the preview can be sized to fill its pane as a square. Returns
 * a ref to attach and the current square edge (0 until first measured, e.g. in
 * environments without ResizeObserver such as jsdom).
 */
function useSquareSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(Math.floor(Math.min(width, height)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

/** The sparse override stored at `scope` — `{}` at Project scope or if missing. */
function overrideAt(project: Project, scope: StyleScope): StyleOverride {
  if (scope.tier === "project") return {};
  const device = project.devices[scope.deviceIndex];
  if (!device) return {};
  if (scope.tier === "device") return device.style;
  return device.glyphStyles[scope.glyphId] ?? {};
}

/** True when `scope` still points at a Device (and Glyph) that resolves today. */
function isScopeValid(scope: StyleScope, project: Project): boolean {
  if (scope.tier === "project") return true;
  const device = project.devices[scope.deviceIndex];
  if (!device) return false;
  if (scope.tier === "device") return true;
  return resolveDeviceInputs(device, project).some(
    (i) => i.id === scope.glyphId,
  );
}

/** True when a selected Glyph still resolves on its Device. */
function isGlyphValid(glyph: SelectedGlyph, project: Project): boolean {
  return isScopeValid(
    { tier: "glyph", deviceIndex: glyph.deviceIndex, glyphId: glyph.glyphId },
    project,
  );
}

export function GlyphCreator() {
  // The whole editor is a thin shell over the project state + reducer; every
  // control dispatches a ProjectAction (see project.ts).
  const [project, dispatch] = useReducer(projectReducer, undefined, () =>
    createDefaultProject(),
  );
  // A font is available for preview + generation. True once the bundled Inter
  // (or a restored upload) is registered.
  const [fontLoaded, setFontLoaded] = useState(false);
  // A custom font was uploaded/imported (vs. the always-available bundled Inter).
  // Gates only the "Include font" ZIP option, since Inter never needs bundling.
  const [hasUploadedFont, setHasUploadedFont] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);
  // Which cascade tier the Style tab edits, plus the Glyph the user last picked
  // in the preview (kept so the switcher can offer "Glyph: <label>" as a target).
  const [styleScope, setStyleScope] = useState<StyleScope>({ tier: "project" });
  const [selectedGlyph, setSelectedGlyph] = useState<SelectedGlyph | null>(
    null,
  );
  const preview = useSquareSize();
  // Until the persisted config + font have been restored, the save effect must
  // not fire — otherwise the initial default project overwrites saved storage
  // before the load below runs.
  const hydrated = useRef(false);

  // Mark the always-available bundled Inter as the active font: preview +
  // generation are enabled, no custom upload is bundled into saved ZIPs, and the
  // status reflects the default. Shared by mount, config-only import, and reset
  // so "revert to the default font" is one behavior in one place.
  function markDefaultFontReady() {
    setFontLoaded(true);
    setHasUploadedFont(false);
    setStatus({ kind: "ready", fontName: DEFAULT_FONT_FAMILY });
  }

  // Restore persisted state on mount: config from localStorage, font blob from
  // IndexedDB (re-registered under the same family the config carries).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = loadConfig();
      if (saved && !cancelled)
        dispatch({ type: "load-project", project: saved });
      // Migrate pre-#13 configs that predate the bundled font (empty family) so
      // they render in Inter instead of the browser default.
      if (saved && saved.font.family === "" && !cancelled) {
        dispatch({ type: "set-font", family: DEFAULT_FONT_FAMILY });
      }

      // Always register the bundled Inter so preview + generation work with no
      // upload. It stays available even after an upload overrides it for output.
      try {
        await loadDefaultFont();
        if (!cancelled) markDefaultFontReady();
      } catch {
        // In a real browser a failure here (offline / 404) means the editor has
        // no font, so surface it — Generate stays disabled otherwise with no
        // explanation. Under jsdom (no FontFace) the failure is expected, so
        // stay silent and let an upload or e2e provide the real font.
        if (!cancelled && typeof FontFace !== "undefined") {
          setStatus({
            kind: "error",
            message:
              "Couldn't load the default font. Check your connection or upload a font (Style tab).",
          });
        }
      }

      // A restored upload overrides Inter for both preview and generation.
      try {
        const font = await loadFont();
        if (font && !cancelled) {
          await registerFont(font.family, font.blob);
          if (cancelled) return;
          setFontLoaded(true);
          setHasUploadedFont(true);
          setStatus({ kind: "ready", fontName: font.fileName });
        }
      } catch {
        // A missing or undecodable persisted font just means no restore; the
        // developer re-uploads. Config + bundled Inter still apply above.
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
  // The active Device's Glyphs, resolved through the cascade — shared by the
  // preview and by cell-click → Glyph selection so both index the same list.
  const activeInputs = activeDevice
    ? resolveDeviceInputs(activeDevice, project)
    : [];

  // Devices/Glyphs can disappear (delete, toggled off). Drop a scope or selected
  // Glyph that no longer resolves so the Style tab never edits a phantom target.
  const validScope = isScopeValid(styleScope, project)
    ? styleScope
    : ({ tier: "project" } as StyleScope);
  const validSelectedGlyph =
    selectedGlyph && isGlyphValid(selectedGlyph, project)
      ? selectedGlyph
      : null;
  const scopeStyle = resolveScopeStyle(project, validScope);
  const scopeOverride = overrideAt(project, validScope);

  // Select the Glyph in cell `index` of the active Device, opening its floating
  // editor over the preview. The sidebar scope is left untouched — the popover is
  // the Glyph-scope surface, so the two don't fight over the same target.
  function onSelectGlyph(index: number) {
    const input = activeInputs[index];
    if (!input) return;
    setSelectedGlyph({
      deviceIndex: activeIndex,
      glyphId: input.id,
      label: input.label,
    });
  }

  // The selected Glyph's cascade scope + resolved/raw style, feeding the popover.
  const selectedGlyphScope: StyleScope | null = validSelectedGlyph
    ? {
        tier: "glyph",
        deviceIndex: validSelectedGlyph.deviceIndex,
        glyphId: validSelectedGlyph.glyphId,
      }
    : null;

  // The previewed Device and the edited Style scope share their Device: changing
  // one moves the other so the two selects never disagree. Project stays Project
  // (it's Device-agnostic); a Device/Glyph scope always previews its own Device.
  function onScopeChange(scope: StyleScope) {
    setStyleScope(scope);
    if (scope.tier !== "project") setActiveDeviceIndex(scope.deviceIndex);
  }

  function onPreviewDeviceChange(index: number) {
    setActiveDeviceIndex(index);
    setStyleScope((prev) =>
      prev.tier === "project" ? prev : { tier: "device", deviceIndex: index },
    );
    // A Glyph popover from the previously previewed Device no longer applies.
    setSelectedGlyph((prev) =>
      prev && prev.deviceIndex !== index ? null : prev,
    );
  }

  async function onFontChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ kind: "loading-font" });
    try {
      const family = await loadFontFromFile(file);
      dispatch({ type: "set-font", family });
      setFontLoaded(true);
      setHasUploadedFont(true);
      setStatus({ kind: "ready", fontName: file.name });
      // Persist the blob so the font survives a reload (self-guards on failure).
      await saveFont({ family, fileName: file.name, blob: file });
    } catch {
      // The upload failed, but the bundled Inter is still available — keep the
      // preview rendering rather than gating it.
      setStatus({
        kind: "error",
        message: `Couldn't load "${file.name}". Please choose a valid font file (.ttf, .otf, .woff, .woff2).`,
      });
    }
  }

  async function onGenerate() {
    if (!canGenerate) return;
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
        setHasUploadedFont(true);
        setStatus({ kind: "ready", fontName: imported.font.fileName });
      } else {
        // Config-only: the referenced upload isn't present, so fall back to the
        // always-available Inter for both preview and generation.
        if (imported.project.font.family !== DEFAULT_FONT_FAMILY) {
          dispatch({ type: "set-font", family: DEFAULT_FONT_FAMILY });
        }
        markDefaultFontReady();
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
    if (
      !window.confirm(
        "Discard all changes and start over? This clears the saved config and font.",
      )
    ) {
      return;
    }
    await clearPersisted();
    dispatch({ type: "load-project", project: createDefaultProject() });
    // The bundled Inter stays registered, so the reset preview keeps rendering.
    markDefaultFontReady();
    setActiveDeviceIndex(0);
    setStyleScope({ tier: "project" });
    setSelectedGlyph(null);
  }

  const isBusy = status.kind === "loading-font" || status.kind === "generating";
  const canGenerate = fontLoaded && project.devices.length > 0 && !isBusy;
  const fontName =
    status.kind === "ready" ||
    status.kind === "generating" ||
    status.kind === "done"
      ? status.fontName
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 gap-4">
        <aside
          aria-label="Editor controls"
          className="flex w-160 shrink-0 flex-col overflow-hidden rounded-lg border"
        >
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold">Editor</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <DisclosureGroup
              defaultExpandedKeys={["devices"]}
              allowsMultipleExpanded={true}
            >
              <PanelSection
                id="devices"
                title="Devices"
                help="Pick which input Devices to generate. Each selected Device makes one Sprite Atlas."
              >
                <DeviceControls
                  project={project}
                  dispatch={dispatch}
                  activeIndex={activeIndex}
                  onSelectDevice={setActiveDeviceIndex}
                />
              </PanelSection>

              <PanelSection
                id="inputs"
                title="Inputs"
                help="Add, rename, or remove the controls for the selected Device."
              >
                {activeDevice ? (
                  <InputEditor
                    device={activeDevice}
                    deviceIndex={activeIndex}
                    dispatch={dispatch}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Select at least one Device to edit its Inputs.
                  </p>
                )}
              </PanelSection>

              <PanelSection
                id="style"
                title="Style"
                help="Set the font (Inter by default) and the tile background, colors, and cell size."
              >
                <div className="space-y-5">
                  <FontUpload fontName={fontName} onFontChange={onFontChange} />
                  <StyleScopeSwitcher
                    project={project}
                    scope={validScope}
                    selectedGlyph={validSelectedGlyph}
                    onScopeChange={onScopeChange}
                  />
                  <StyleControls
                    project={project}
                    dispatch={dispatch}
                    scope={validScope}
                    style={scopeStyle}
                    override={scopeOverride}
                  />
                </div>
              </PanelSection>

              <PanelSection
                id="naming"
                title="Naming"
                help="Control Sprite Names and the exported file names."
              >
                <NamingControls
                  project={project}
                  dispatch={dispatch}
                  activeIndex={activeIndex}
                />
              </PanelSection>
            </DisclosureGroup>
          </div>
        </aside>

        <section
          ref={preview.ref}
          aria-label="Sprite Atlas preview"
          className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-lg border bg-muted/20 p-4"
        >
          {project.devices.length > 1 && (
            <div className="absolute right-3 top-3 z-10">
              <label className="sr-only" htmlFor="preview-device">
                Device to preview
              </label>
              <select
                id="preview-device"
                value={activeIndex}
                onChange={(e) => onPreviewDeviceChange(Number(e.target.value))}
                className="rounded-md border border-input bg-background/95 px-2.5 py-1.5 text-sm shadow-sm backdrop-blur"
              >
                {project.devices.map((d, i) => (
                  <option key={d.name} value={i}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {fontLoaded && activeDevice ? (
            // Largest square that fits the pane; the atlas is drawn to fill it.
            <div
              className="flex items-center justify-center"
              style={{ width: preview.size, height: preview.size }}
            >
              <AtlasPreview
                deviceName={activeDevice.name}
                glyphs={activeInputs}
                cellSize={project.cellSize}
                fontFamily={project.font.family}
                className="h-full w-full rounded-md object-contain"
                onSelectGlyph={onSelectGlyph}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {!fontLoaded
                ? "Loading font…"
                : "Select a Device to preview its Sprite Atlas."}
            </p>
          )}

          {validSelectedGlyph && selectedGlyphScope && (
            <GlyphStylePopover
              project={project}
              dispatch={dispatch}
              glyph={validSelectedGlyph}
              style={resolveScopeStyle(project, selectedGlyphScope)}
              override={overrideAt(project, selectedGlyphScope)}
              onClose={() => setSelectedGlyph(null)}
            />
          )}
        </section>
      </div>

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
        hasUploadedFont={hasUploadedFont}
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
