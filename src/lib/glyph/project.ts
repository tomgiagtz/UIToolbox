import {
  DEVICE_CATALOGS,
  getCatalog,
  type DeviceCatalog,
} from "@/lib/glyph/catalog";
import { createDeviceFromCatalog } from "@/lib/glyph/presets";
import {
  clearOverrideField,
  mergeOverride,
  resolveStyle,
  type StyleField,
  type StyleOverride,
  type StyleScope,
} from "@/lib/glyph/style";
import type { CaseStyle, DeviceConfig, Project } from "@/lib/glyph/types";

/**
 * Every edit the UI can make to a {@link Project}. Keeping these as plain data
 * actions behind {@link projectReducer} makes the whole editing surface a pure,
 * unit-testable seam, so the React layer stays a thin dispatcher.
 */
export type ProjectAction =
  // Replace the whole project — used by ProjectStore to hydrate restored state.
  | { type: "load-project"; project: Project }
  | { type: "set-name"; name: string }
  | { type: "set-font"; family: string }
  // --- Style Cascade edits (#4, #19) ---
  // Patch/clear a sparse override at any scope; the Project tier folds the patch
  // into its full base style, Device/Glyph tiers merge into their StyleOverride.
  | { type: "patch-style"; scope: StyleScope; patch: StyleOverride }
  | { type: "clear-style"; scope: StyleScope; field: StyleField }
  // cellSize stays Project-global — not part of the cascade (ADR-0006).
  | { type: "set-cell-size"; size: number }
  // --- Devices, Catalog selection & custom Inputs (#5, #15) ---
  | { type: "toggle-device"; catalogId: string }
  | { type: "toggle-input"; deviceIndex: number; inputId: string }
  | { type: "add-custom-input"; deviceIndex: number; label: string }
  | {
      type: "edit-custom-input";
      deviceIndex: number;
      id: string;
      label: string;
    }
  | { type: "remove-custom-input"; deviceIndex: number; id: string }
  // --- Naming (#6) ---
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

    case "set-font":
      return { ...project, font: { family: action.family } };

    case "patch-style":
      return patchStyle(project, action.scope, action.patch);

    case "clear-style":
      return clearStyle(project, action.scope, action.field);

    case "set-cell-size":
      return { ...project, cellSize: action.size };

    case "toggle-device":
      return {
        ...project,
        devices: toggleDevice(project.devices, action.catalogId),
      };

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

    case "set-naming-template":
      return {
        ...project,
        naming: { ...project.naming, template: action.template },
      };

    case "set-naming-case":
      return { ...project, naming: { ...project.naming, case: action.case } };

    case "set-filename-template":
      return { ...project, filenameTemplate: action.template };
  }
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
    const resolved = resolveStyle(
      { textColor: project.textColor, background: project.background },
      patch,
    );
    return {
      ...project,
      textColor: resolved.textColor,
      background: resolved.background,
    };
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
