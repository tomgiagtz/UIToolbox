import {
  DEVICE_PRESETS,
  createDeviceFromPreset,
  type DevicePreset,
} from "@/lib/glyph/presets";
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
  | { type: "set-font"; family: string }
  // --- Style (#4) ---
  | { type: "set-text-color"; color: string }
  | { type: "set-cell-size"; size: number }
  | { type: "set-bg-shape"; shape: BackgroundShape }
  | { type: "set-bg-fill"; fill: string }
  | { type: "set-bg-corner-radius"; radius: number }
  | { type: "set-bg-border-width"; width: number }
  | { type: "set-bg-border-color"; color: string }
  // --- Devices & Inputs (#5) ---
  | { type: "toggle-device"; presetId: string }
  | { type: "add-input"; deviceIndex: number; label: string }
  | { type: "edit-input"; deviceIndex: number; inputIndex: number; label: string }
  | { type: "remove-input"; deviceIndex: number; inputIndex: number }
  // --- Naming (#6) ---
  | { type: "set-naming-template"; template: string }
  | { type: "set-naming-case"; case: CaseStyle }
  | { type: "set-filename-template"; template: string };

/**
 * Apply one {@link ProjectAction} to a {@link Project}, returning a new object.
 * Never mutates its input, so it drops straight into React's `useReducer`.
 */
export function projectReducer(project: Project, action: ProjectAction): Project {
  switch (action.type) {
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
      return { ...project, devices: toggleDevice(project.devices, action.presetId) };

    case "add-input": {
      const label = action.label.trim();
      if (!label) return project;
      return {
        ...project,
        devices: patchDevice(project.devices, action.deviceIndex, (d) => ({
          ...d,
          inputs: [...d.inputs, label],
        })),
      };
    }

    case "edit-input":
      return {
        ...project,
        devices: patchDevice(project.devices, action.deviceIndex, (d) => ({
          ...d,
          inputs: d.inputs.map((input, i) =>
            i === action.inputIndex ? action.label : input,
          ),
        })),
      };

    case "remove-input":
      return {
        ...project,
        devices: patchDevice(project.devices, action.deviceIndex, (d) => ({
          ...d,
          inputs: d.inputs.filter((_, i) => i !== action.inputIndex),
        })),
      };

    case "set-naming-template":
      return { ...project, naming: { ...project.naming, template: action.template } };

    case "set-naming-case":
      return { ...project, naming: { ...project.naming, case: action.case } };

    case "set-filename-template":
      return { ...project, filenameTemplate: action.template };
  }
}

/** Return `project` with a shallow patch applied to its Background. */
function patchBackground(project: Project, patch: Partial<Background>): Project {
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

/** The preset ordinal for a Device name, or a large value for custom Devices. */
function presetOrder(name: string): number {
  const i = DEVICE_PRESETS.findIndex((p) => p.name === name);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/**
 * Add the Device for `presetId` if absent (inserted so Devices stay in Preset
 * order), or remove it if already present. Toggling is by Device name so an
 * edited Device still round-trips.
 */
function toggleDevice(devices: DeviceConfig[], presetId: string): DeviceConfig[] {
  const preset = DEVICE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return devices;

  if (devices.some((d) => d.name === preset.name)) {
    return devices.filter((d) => d.name !== preset.name);
  }
  return insertInPresetOrder(devices, preset);
}

function insertInPresetOrder(
  devices: DeviceConfig[],
  preset: DevicePreset,
): DeviceConfig[] {
  const device = createDeviceFromPreset(preset);
  const order = presetOrder(preset.name);
  const at = devices.findIndex((d) => presetOrder(d.name) > order);
  if (at === -1) return [...devices, device];
  return [...devices.slice(0, at), device, ...devices.slice(at)];
}

function patchDevice(
  devices: DeviceConfig[],
  index: number,
  patch: (device: DeviceConfig) => DeviceConfig,
): DeviceConfig[] {
  return devices.map((d, i) => (i === index ? patch(d) : d));
}
