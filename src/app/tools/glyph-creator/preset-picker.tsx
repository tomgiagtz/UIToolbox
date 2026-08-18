"use client";

import { useMemo, useState, type Dispatch } from "react";
import { AtlasPreview } from "@/components/glyph/atlas-preview";
import { GlyphPreview } from "@/components/glyph/glyph-preview";
import { Button } from "@/components/ui/button";
import { getCatalog } from "@/lib/glyph/catalog";
import { createDefaultProject } from "@/lib/glyph/defaults";
import { resolveDeviceInputs } from "@/lib/glyph/generate";
import {
  PRESETS,
  defaultTakenDevices,
  getPreset,
  presetCatalogIds,
  previewPreset,
  type Preset,
} from "@/lib/glyph/presets";
import type { ProjectAction } from "@/lib/glyph/project";
import type { Project, ResolvedInput } from "@/lib/glyph/types";
import { Modal } from "./modal";

/**
 * The Inputs a Catalog's swatch draws, where its first four aren't the reading —
 * WASD for a keyboard, whose Catalog opens on Esc and the function row. Fixed
 * rather than author-chosen: comparing looks requires comparing the same subject,
 * so moving down the list compares Presets rather than whichever Inputs each
 * author found flattering (ADR-0012 §4).
 */
const SWATCH_INPUTS: Record<string, string[]> = {
  keyboard: ["key-w", "key-a", "key-s", "key-d"],
};

/** How many tiles a swatch draws. */
const SWATCH_TILES = 4;

/** Rendered resolution of a swatch tile; it displays far smaller, at rail scale. */
const SWATCH_CELL_SIZE = 64;

/** One Preset's swatch: its four Glyphs, and the Catalog they were drawn from. */
interface Swatch {
  catalogId: string;
  inputs: ResolvedInput[];
}

/**
 * Resolve a Preset's swatch against a **fresh** project rather than the open one:
 * the swatch says what the Preset looks like, so it must not move with whose
 * project is open (ADR-0012 §4). The Preset's first covered Catalog is the subject.
 *
 * A Catalog with no {@link SWATCH_INPUTS} entry takes the first four Inputs of its
 * Default Selection — still the same four under every Preset covering it, which is
 * the whole property the swatch needs. So a new Catalog has a swatch by existing,
 * and earns an entry above only when its opening Inputs make a poor portrait.
 *
 * `null` where the Preset covers no Catalog this build knows — which the build
 * gate rejects (ADR-0012 §5), so that row simply carries its name and pills.
 */
function swatchFor(preset: Preset): Swatch | null {
  const catalogId = presetCatalogIds(preset)[0];
  if (!catalogId) return null;
  const sample = previewPreset(createDefaultProject(), preset, []);
  const device = sample.devices.find((d) => d.catalogId === catalogId);
  if (!device) return null;

  const resolved = resolveDeviceInputs(device, sample);
  const ids = SWATCH_INPUTS[catalogId];
  if (!ids) return { catalogId, inputs: resolved.slice(0, SWATCH_TILES) };
  // Walked in SWATCH_INPUTS' order, not the Catalog's, so it reads "WASD".
  const byId = new Map(resolved.map((input) => [input.id, input]));
  return { catalogId, inputs: ids.flatMap((id) => byId.get(id) ?? []) };
}

/** Fixed art off fixed data, so it resolves once rather than on every render. */
const SWATCHES = new Map(
  PRESETS.map((preset) => [preset.id, swatchFor(preset)]),
);

/**
 * One Device a Preset covers, as the picker's presence row needs it: the name to
 * call it, how big its Catalog's Default Selection is, and whether the open
 * project already carries such a Device.
 */
export interface CoveredDevice {
  catalogId: string;
  /** Your Device's name where you have one, else the Catalog's. */
  name: string;
  /** How many Inputs this Catalog's Default Selection enables. */
  defaultCount: number;
  /** How many off-catalog Inputs your Device carries; 0 where you have none. */
  customCount: number;
  present: boolean;
}

/**
 * The Devices a Preset covers, in its own order. A Catalog this build doesn't
 * know is dropped — the build gate rejects one (ADR-0012 §5), and `apply-preset`
 * lands nothing on it either, so the picker must not offer a row that does
 * nothing.
 */
export function coveredDevices(
  project: Project,
  preset: Preset,
): CoveredDevice[] {
  return presetCatalogIds(preset).flatMap((catalogId) => {
    const catalog = getCatalog(catalogId);
    if (!catalog) return [];
    const mine = project.devices.find((d) => d.catalogId === catalogId);
    return [
      {
        catalogId,
        name: mine?.name ?? catalog.name,
        defaultCount: catalog.defaultEnabled.length,
        customCount: mine?.custom.length ?? 0,
        present: Boolean(mine),
      },
    ];
  });
}

/**
 * What taking — or not taking — this Device costs, in one sentence (ADR-0012 §4).
 * There is no confirm anywhere in the picker: every destructive option is a
 * checkbox with its consequence stated beside it, and this is that sentence. So
 * it has to be exact about what survives: taking replaces the Catalog selection
 * and leaves your custom Inputs, which the sentence says only where you have some.
 */
export function presenceNote(device: CoveredDevice, taken: boolean): string {
  const { name, defaultCount, customCount } = device;
  if (!device.present) {
    return taken
      ? `Applying adds ${name} with its ${defaultCount} default Inputs.`
      : `Preview only — ${name} won't be added.`;
  }
  const kept =
    customCount === 0
      ? ""
      : customCount === 1
        ? " Your 1 custom Input stays."
        : ` Your ${customCount} custom Inputs stay.`;
  return taken
    ? `Replaces your ${name} selection with the ${defaultCount} default Inputs.${kept}`
    : `Your ${name} Inputs are kept; only the style changes.`;
}

interface PresetPickerProps {
  ref: React.Ref<HTMLDialogElement>;
  project: Project;
  dispatch: Dispatch<ProjectAction>;
}

/**
 * The Preset picker (ADR-0012 §4): a name list on the left, your actual atlas
 * live-restyled on the right.
 *
 * **The card is not the promise; the preview is.** A Preset is style-only, so no
 * card can show your board — an author styled ~24 keyboard keys and you have 60
 * enabled, or 8. So a row promises only the look (a fixed four-tile swatch) and
 * its reach (one pill per Device covered, hollow where you have no such Device),
 * while the pane draws your Devices through {@link resolveDeviceInputs} — the same
 * path generation uses.
 *
 * Both species sit in this one list, since the picker is the definition of the
 * set. Nothing labels a Preset with its species: the action says it, reading
 * **Apply to Xbox** or **Apply to Project**.
 */
export function PresetPicker({ ref, project, dispatch }: PresetPickerProps) {
  const [selectedId, setSelectedId] = useState(PRESETS[0]?.id ?? "");
  // Per-Device presence decisions, keyed `<presetId>:<catalogId>` so moving
  // through the list doesn't lose what you already decided. An unset key falls
  // to `defaultTakenDevices`.
  const [takeOverrides, setTakeOverrides] = useState<Record<string, boolean>>(
    {},
  );
  // Which covered Device the pane shows. Unset — and stale, after a Preset
  // change — falls to the first Device the Preset covers.
  const [previewCatalogId, setPreviewCatalogId] = useState<string | null>(null);

  const preset = getPreset(selectedId) ?? PRESETS[0];
  const covered = preset ? coveredDevices(project, preset) : [];
  const defaultTaken = new Set(
    preset ? defaultTakenDevices(project, preset) : [],
  );
  const isTaken = (catalogId: string) =>
    takeOverrides[`${selectedId}:${catalogId}`] ?? defaultTaken.has(catalogId);
  const taken = covered.filter((d) => isTaken(d.catalogId));

  // The pane's Project, memoized on the take decisions rather than rebuilt every
  // render: `glyphs` feeds a canvas that redraws whenever its identity changes.
  const takenKey = taken.map((d) => d.catalogId).join("|");
  const preview = useMemo(
    () =>
      preset
        ? previewPreset(
            project,
            preset,
            taken.map((d) => d.catalogId),
          )
        : null,
    // `takenKey` stands in for `taken`, whose identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, preset, takenKey],
  );
  // The Device the pane draws: yours where you have it, the Catalog's Default
  // Selection where you don't — every covered Device is previewable either way.
  const shown = previewCatalogId ?? covered[0]?.catalogId;
  const device = preview?.devices.find((d) => d.catalogId === shown);
  const glyphs = useMemo(
    () => (preview && device ? resolveDeviceInputs(device, preview) : []),
    [preview, device],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preset) {
      dispatch({
        type: "apply-preset",
        preset,
        taken: taken.map((d) => d.catalogId),
      });
    }
    // Every decision here was made against the project as it was. A Device you
    // just added is now present, where the default flips to untaken — so keeping
    // the ticks would leave the picker reopening with its most destructive option
    // pre-armed (ADR-0012 §4).
    setTakeOverrides({});
    (e.target as HTMLFormElement).closest("dialog")?.close();
  }

  return (
    <Modal
      ref={ref}
      title="Presets"
      onSubmit={submit}
      className="w-224 space-y-4"
    >
      {(close) =>
        !preset ? (
          <p className="py-4 text-sm text-muted-foreground">
            This build ships no Presets.
          </p>
        ) : (
          <>
            <div className="flex gap-4 pt-3">
              <ul
                aria-label="Presets"
                className="max-h-[60vh] w-56 shrink-0 space-y-1 overflow-y-auto"
              >
                {PRESETS.map((p) => (
                  <li key={p.id}>
                    <PresetRow
                      preset={p}
                      project={project}
                      selected={p.id === preset.id}
                      onSelect={() => {
                        setSelectedId(p.id);
                        // The previewed Device belonged to the Preset you left.
                        setPreviewCatalogId(null);
                      }}
                    />
                  </li>
                ))}
              </ul>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <fieldset className="space-y-1.5">
                  <legend className="mb-1.5 text-sm font-medium">
                    Devices this Preset covers
                  </legend>
                  {covered.map((d) => (
                    <div key={d.catalogId} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Take ${d.name}`}
                        checked={isTaken(d.catalogId)}
                        onChange={(e) =>
                          setTakeOverrides((prev) => ({
                            ...prev,
                            [`${selectedId}:${d.catalogId}`]: e.target.checked,
                          }))
                        }
                        className="size-4"
                      />
                      <button
                        type="button"
                        aria-pressed={d.catalogId === shown}
                        onClick={() => setPreviewCatalogId(d.catalogId)}
                        className={`shrink-0 rounded-md px-2 py-0.5 text-sm ${
                          d.catalogId === shown
                            ? "bg-muted font-semibold"
                            : "hover:bg-muted"
                        }`}
                      >
                        {d.name}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {presenceNote(d, isTaken(d.catalogId))}
                      </span>
                    </div>
                  ))}
                </fieldset>

                <div className="flex min-h-64 items-center justify-center rounded-lg border bg-surface-sunken/20 p-3">
                  {device ? (
                    <AtlasPreview
                      deviceName={device.name}
                      glyphs={glyphs}
                      cellSize={project.exportSettings.cellSize}
                      catalogId={device.catalogId}
                      className="max-h-[38vh] max-w-full object-contain"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This Preset covers no Device this tool knows.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Nothing changes until you apply.
              </p>
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                {/* The species is said by the action, never by a chip — naming
                    the Device as you named it, so the button and the row above
                    it can't call one Device two things. */}
                <Button type="submit">
                  {preset.kind === "device"
                    ? `Apply to ${covered[0]?.name ?? "Device"}`
                    : "Apply to Project"}
                </Button>
              </div>
            </div>
          </>
        )
      }
    </Modal>
  );
}

/**
 * One row of the name list: the fixed swatch, the name, and one pill per Device
 * covered — solid where you have that Device, hollow where you don't. The whole
 * row selects, and what it selects is what the pane previews.
 */
function PresetRow({
  preset,
  project,
  selected,
  onSelect,
}: {
  preset: Preset;
  project: Project;
  selected: boolean;
  onSelect: () => void;
}) {
  const swatch = SWATCHES.get(preset.id);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left ${
        selected ? "bg-muted ring-1 ring-ring" : "hover:bg-muted/60"
      }`}
    >
      <span
        aria-hidden
        className="grid shrink-0 grid-cols-2 gap-0.5 rounded bg-surface-sunken/40 p-1"
      >
        {swatch?.inputs.map((input) => (
          <GlyphPreview
            key={input.id}
            label={input.label}
            cellSize={SWATCH_CELL_SIZE}
            background={input.style.background}
            foreground={input.style.foreground}
            symbolId={input.symbolId}
            device={swatch.catalogId}
            style={{ width: 18, height: 18 }}
          />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {preset.label}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {coveredDevices(project, preset).map((d) => (
            <span
              key={d.catalogId}
              title={
                d.present
                  ? `You have a ${d.name} Device`
                  : `You have no ${d.name} Device — applying can add one`
              }
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                d.present
                  ? "bg-primary/20 text-foreground"
                  : "border border-dashed border-muted-foreground/60 text-muted-foreground"
              }`}
            >
              {d.name}
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}
