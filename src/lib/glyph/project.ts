import {
  DEVICE_CATALOGS,
  getCatalog,
  type DeviceCatalog,
} from "@/lib/glyph/catalog";
import { createDeviceFromCatalog } from "@/lib/glyph/defaults";
import type { Preset, PresetDevice } from "@/lib/glyph/presets";
import {
  NO_OVERRIDE,
  clearOverrideField,
  mergeOverride,
  resolveStyle,
  type StyleField,
  type StyleOverride,
  type StyleScope,
} from "@/lib/glyph/style";
import type {
  CaseStyle,
  DeviceConfig,
  ExportSettings,
  FontAsset,
  ImageAsset,
  NamingConfig,
  Project,
} from "@/lib/glyph/types";

/**
 * Every edit the UI can make to a {@link Project}. Keeping these as plain data
 * actions behind {@link projectReducer} makes the whole editing surface a pure,
 * unit-testable seam, so the React layer stays a thin dispatcher.
 */
export type ProjectAction =
  // Replace the whole project — used by ProjectStore to hydrate restored state.
  | { type: "load-project"; project: Project }
  | { type: "set-name"; name: string }
  // --- Style Cascade edits (#4, #19) ---
  // Patch/clear a sparse override at any scope; the Project tier folds the patch
  // into its full base style, Device/Glyph tiers merge into their StyleOverride.
  | { type: "patch-style"; scope: StyleScope; patch: StyleOverride }
  | { type: "clear-style"; scope: StyleScope; field: StyleField }
  // --- Devices, Catalog selection & custom Inputs (#5, #15) ---
  | { type: "toggle-device"; catalogId: string }
  // --- Shipped Presets (#83) ---
  // Land a shipped **Preset**: style onto every covered Device this project has,
  // plus the Project tier for a Project Preset. `taken` names the Catalogs whose
  // *presence* the user opted into — the only way this action touches a
  // selection (ADR-0012 §3/§4). The picker previews by running this very action,
  // so what is shown and what is committed cannot diverge.
  | { type: "apply-preset"; preset: Preset; taken: string[] }
  | { type: "toggle-input"; deviceIndex: number; inputId: string }
  | { type: "add-custom-input"; deviceIndex: number; label: string }
  | {
      type: "edit-custom-input";
      deviceIndex: number;
      id: string;
      label: string;
    }
  | { type: "remove-custom-input"; deviceIndex: number; id: string }
  // --- Uploaded assets (#20, #80) ---
  // Each adds an upload to the project's shared manifest, so the cascade can
  // then point at it via `patch-style` — a Glyph's `renderSource` at an image,
  // any tier's `fontFamily` at a font. Neither carries bytes: those are handled
  // outside the config (see `images.ts`, `project-store.ts`). Bundled font
  // families are never added here; they are code (ADR-0012 §6).
  | { type: "add-font"; font: FontAsset }
  | { type: "add-image"; image: ImageAsset }
  // --- Export settings: cell size + naming (#6, #21) ---
  // All Project-global. `cellSize` is an atlas output value rather than a cascade
  // tier (ADR-0006), which is why it sits beside naming (ADR-0012 §6).
  | { type: "set-cell-size"; size: number }
  | { type: "set-naming-template"; template: string }
  | { type: "set-naming-case"; case: CaseStyle }
  | { type: "set-filename-template"; template: string };

/**
 * Apply one {@link ProjectAction} to a {@link Project}, returning a new object.
 * Never mutates its input, so it drops straight into React's `useReducer`.
 */
export function projectReducer(
  project: Project,
  action: ProjectAction,
): Project {
  switch (action.type) {
    case "load-project":
      return action.project;

    case "set-name":
      return { ...project, name: action.name };

    case "patch-style":
      return patchStyle(project, action.scope, action.patch);

    case "clear-style":
      return clearStyle(project, action.scope, action.field);

    case "toggle-device":
      return {
        ...project,
        devices: toggleDevice(project.devices, action.catalogId),
      };

    case "apply-preset":
      return applyPreset(project, action.preset, new Set(action.taken));

    case "toggle-input":
      return {
        ...project,
        devices: patchDevice(project.devices, action.deviceIndex, (d) =>
          toggleInput(d, action.inputId),
        ),
      };

    case "add-custom-input": {
      const label = action.label.trim();
      if (!label) return project;
      return {
        ...project,
        devices: patchDevice(project.devices, action.deviceIndex, (d) => ({
          ...d,
          custom: [...d.custom, { id: nextCustomId(d), label }],
        })),
      };
    }

    case "edit-custom-input":
      return {
        ...project,
        devices: patchDevice(project.devices, action.deviceIndex, (d) => ({
          ...d,
          custom: d.custom.map((c) =>
            c.id === action.id ? { ...c, label: action.label } : c,
          ),
        })),
      };

    case "remove-custom-input":
      return {
        ...project,
        devices: patchDevice(project.devices, action.deviceIndex, (d) => ({
          ...d,
          custom: d.custom.filter((c) => c.id !== action.id),
          // Drop any Glyph override that keyed off the removed custom Input.
          glyphStyles: omitKey(d.glyphStyles, action.id),
        })),
      };

    case "add-font":
      return { ...project, fonts: [...project.fonts, action.font] };

    case "add-image":
      return { ...project, images: [...project.images, action.image] };

    case "set-cell-size":
      return patchExportSettings(project, { cellSize: action.size });

    case "set-naming-template":
      return patchNaming(project, { template: action.template });

    case "set-naming-case":
      return patchNaming(project, { case: action.case });

    case "set-filename-template":
      return patchNaming(project, { filenameTemplate: action.template });
  }
}

/** Patch the export settings block, leaving the rest of the project alone. */
function patchExportSettings(
  project: Project,
  patch: Partial<ExportSettings>,
): Project {
  return {
    ...project,
    exportSettings: { ...project.exportSettings, ...patch },
  };
}

/** Patch the naming config inside the export settings block. */
function patchNaming(project: Project, patch: Partial<NamingConfig>): Project {
  return patchExportSettings(project, {
    naming: { ...project.exportSettings.naming, ...patch },
  });
}

/**
 * Apply a sparse style patch at `scope`. The Project tier folds the patch into
 * its full base style (via {@link resolveStyle}); the Device and Glyph tiers deep-
 * merge it into their sparse {@link StyleOverride} so only the set properties win.
 */
function patchStyle(
  project: Project,
  scope: StyleScope,
  patch: StyleOverride,
): Project {
  if (scope.tier === "project") {
    return { ...project, style: resolveStyle(project.style, patch) };
  }
  return patchDeviceStyle(project, scope, (override) =>
    mergeOverride(override, patch),
  );
}

/**
 * Clear one field of the override at `scope`, so it falls back up the cascade.
 * A no-op at the Project tier, which has no override to clear (its base style is
 * always fully set).
 */
function clearStyle(
  project: Project,
  scope: StyleScope,
  field: StyleField,
): Project {
  if (scope.tier === "project") return project;
  return patchDeviceStyle(project, scope, (override) =>
    clearOverrideField(override, field),
  );
}

/**
 * Apply `edit` to the sparse override addressed by a Device- or Glyph-tier
 * `scope`. A Glyph override that collapses to `{}` is dropped from `glyphStyles`
 * so an unedited Glyph leaves no trace.
 */
function patchDeviceStyle(
  project: Project,
  scope: Exclude<StyleScope, { tier: "project" }>,
  edit: (override: StyleOverride) => StyleOverride,
): Project {
  return {
    ...project,
    devices: patchDevice(project.devices, scope.deviceIndex, (device) => {
      if (scope.tier === "device") {
        return { ...device, style: edit(device.style) };
      }
      const next = edit(device.glyphStyles[scope.glyphId] ?? {});
      const glyphStyles = { ...device.glyphStyles };
      if (Object.keys(next).length > 0) glyphStyles[scope.glyphId] = next;
      else delete glyphStyles[scope.glyphId];
      return { ...device, glyphStyles };
    }),
  };
}

/**
 * Land a Preset on a Project (ADR-0012 §3). Style reaches every covered Device
 * the project has; `taken` governs **presence**, per Catalog:
 *
 * - absent + taken — the Device is created from its Catalog's Default Selection.
 * - absent + untaken — that entry's payload lands nowhere.
 * - present + taken — the Catalog selection is replaced by the Default Selection,
 *   while the Device's custom Inputs survive it.
 * - present + untaken — the selection survives whole; only the style changes.
 *
 * A Project Preset additionally replaces the Project tier, which belongs to no
 * Device and so is never taken or not.
 */
function applyPreset(
  project: Project,
  preset: Preset,
  taken: Set<string>,
): Project {
  let devices = project.devices;

  for (const entry of preset.devices) {
    const catalog = getCatalog(entry.catalogId);
    // A Preset naming an unknown Catalog is a build defect the gate rejects
    // (ADR-0012 §5); if one ever gets through, that entry simply lands nowhere.
    if (!catalog) continue;

    const isTaken = taken.has(catalog.id);
    let at = devices.findIndex((d) => d.catalogId === catalog.id);
    if (at === -1) {
      if (!isTaken) continue;
      devices = insertInCatalogOrder(devices, catalog);
      at = devices.findIndex((d) => d.catalogId === catalog.id);
    }
    devices = patchDevice(devices, at, (device) =>
      styleDevice(
        // Taking replaces the *Catalog* selection only. An off-catalog Input is
        // something the Preset's Catalog cannot express and its author never saw,
        // so a Default Selection has nothing to say about it and taking one must
        // not be how it gets deleted.
        isTaken ? { ...device, enabled: [...catalog.defaultEnabled] } : device,
        entry,
      ),
    );
  }

  const next = { ...project, devices };
  if (preset.kind === "device") return next;
  // `resolveStyle` with no overrides is a detached copy of a full style, which is
  // exactly what the Project tier is.
  return { ...next, style: resolveStyle(preset.style) };
}

/**
 * Give a Device the Preset's two style tiers. Both **replace** what was there
 * rather than merging: a Preset is a whole look, and a merge would leave a hybrid
 * that is neither — with the user's old per-Glyph rules outranking the look they
 * just chose. The selection is untouched here; only {@link applyPreset} decides
 * that (ADR-0012 §3).
 *
 * Every override is copied off the Preset on the way in, so the shipped set —
 * module data shared by every project — can never be edited through a Device.
 */
function styleDevice(device: DeviceConfig, entry: PresetDevice): DeviceConfig {
  return {
    ...device,
    style: mergeOverride(NO_OVERRIDE, entry.style),
    glyphStyles: Object.fromEntries(
      Object.entries(entry.glyphStyles).map(([id, override]) => [
        id,
        mergeOverride(NO_OVERRIDE, override),
      ]),
    ),
  };
}

/** The Catalog ordinal for a Device's catalogId, or a large value if unknown. */
function catalogOrder(catalogId: string): number {
  const i = DEVICE_CATALOGS.findIndex((c) => c.id === catalogId);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/**
 * Add the Device for `catalogId` if absent — inserted so Devices stay in Catalog
 * order — or remove it if already present. Toggling is by catalogId so an edited
 * Device (renamed, re-selected Inputs) still round-trips.
 */
function toggleDevice(
  devices: DeviceConfig[],
  catalogId: string,
): DeviceConfig[] {
  const catalog = getCatalog(catalogId);
  if (!catalog) return devices;

  if (devices.some((d) => d.catalogId === catalog.id)) {
    return devices.filter((d) => d.catalogId !== catalog.id);
  }
  return insertInCatalogOrder(devices, catalog);
}

function insertInCatalogOrder(
  devices: DeviceConfig[],
  catalog: DeviceCatalog,
): DeviceConfig[] {
  const device = createDeviceFromCatalog(catalog);
  const order = catalogOrder(catalog.id);
  const at = devices.findIndex((d) => catalogOrder(d.catalogId) > order);
  if (at === -1) return [...devices, device];
  return [...devices.slice(0, at), device, ...devices.slice(at)];
}

/**
 * Enable or disable a Catalog Input on a Device. Enabling inserts the id so the
 * enabled list stays in Catalog order; disabling removes it and drops any Glyph
 * override that keyed off it.
 */
function toggleInput(device: DeviceConfig, inputId: string): DeviceConfig {
  if (device.enabled.includes(inputId)) {
    return {
      ...device,
      enabled: device.enabled.filter((id) => id !== inputId),
      glyphStyles: omitKey(device.glyphStyles, inputId),
    };
  }

  const catalog = getCatalog(device.catalogId);
  if (!catalog || !catalog.inputs.some((i) => i.id === inputId)) return device;

  const rank = (id: string) => catalog.inputs.findIndex((i) => i.id === id);
  const target = rank(inputId);
  const at = device.enabled.findIndex((id) => rank(id) > target);
  const enabled =
    at === -1
      ? [...device.enabled, inputId]
      : [...device.enabled.slice(0, at), inputId, ...device.enabled.slice(at)];
  return { ...device, enabled };
}

/** Next custom id for a Device: `custom-<n>` above the highest existing one. */
function nextCustomId(device: DeviceConfig): string {
  let max = 0;
  for (const { id } of device.custom) {
    const match = /^custom-(\d+)$/.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `custom-${max + 1}`;
}

/** Return a copy of `record` without `key` (no-op if absent). */
function omitKey<V>(record: Record<string, V>, key: string): Record<string, V> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function patchDevice(
  devices: DeviceConfig[],
  index: number,
  patch: (device: DeviceConfig) => DeviceConfig,
): DeviceConfig[] {
  return devices.map((d, i) => (i === index ? patch(d) : d));
}
