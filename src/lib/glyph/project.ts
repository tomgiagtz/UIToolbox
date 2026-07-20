import {
  DEVICE_CATALOGS,
  getCatalog,
  type DeviceCatalog,
} from "@/lib/glyph/catalog";
import { createDeviceFromCatalog } from "@/lib/glyph/presets";
import type {
  Background,
  BackgroundShape,
  CaseStyle,
  DeviceConfig,
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
  | { type: "set-font"; family: string }
  // --- Project-tier style (#4) ---
  | { type: "set-text-color"; color: string }
  | { type: "set-cell-size"; size: number }
  | { type: "set-bg-shape"; shape: BackgroundShape }
  | { type: "set-bg-fill"; fill: string }
  | { type: "set-bg-corner-radius"; radius: number }
  | { type: "set-bg-border-width"; width: number }
  | { type: "set-bg-border-color"; color: string }
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

    case "set-text-color":
      return { ...project, textColor: action.color };

    case "set-cell-size":
      return { ...project, cellSize: action.size };

    case "set-bg-shape":
      return patchBackground(project, { shape: action.shape });

    case "set-bg-fill":
      return patchBackground(project, { fill: action.fill });

    case "set-bg-corner-radius":
      return patchBackground(project, { cornerRadius: action.radius });

    case "set-bg-border-width":
      return patchBorder(project, { width: action.width });

    case "set-bg-border-color":
      return patchBorder(project, { color: action.color });

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

/** Return `project` with a shallow patch applied to its Background. */
function patchBackground(
  project: Project,
  patch: Partial<Background>,
): Project {
  return { ...project, background: { ...project.background, ...patch } };
}

/** Return `project` with a shallow patch applied to its Background border. */
function patchBorder(
  project: Project,
  patch: Partial<Background["border"]>,
): Project {
  return patchBackground(project, {
    border: { ...project.background.border, ...patch },
  });
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
