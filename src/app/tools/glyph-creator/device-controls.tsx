"use client";

import { useState, type Dispatch, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectAction } from "@/lib/glyph/project";
import { DEVICE_PRESETS } from "@/lib/glyph/presets";
import type { Project } from "@/lib/glyph/types";
import { inputClass } from "./controls-ui";

/**
 * Controls for Devices (#5): pick which Devices to generate (each seeded from an
 * editable Preset) and choose which one to preview/edit. The chosen Device's
 * Input labels are edited by {@link InputEditor} in the Inputs section.
 */
export function DeviceControls({
  project,
  dispatch,
  activeIndex,
  onSelectDevice,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  activeIndex: number;
  onSelectDevice: (index: number) => void;
}) {
  return (
    <div className="space-y-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Devices</legend>
        <div className="flex flex-wrap gap-4">
          {DEVICE_PRESETS.map((preset) => {
            const selected = project.devices.some(
              (d) => d.name === preset.name,
            );
            return (
              <label
                key={preset.id}
                className="flex items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    dispatch({ type: "toggle-device", presetId: preset.id })
                  }
                  className="size-4"
                />
                {preset.name}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Each selected Device generates one Sprite Atlas + metadata file.
        </p>
      </fieldset>

      {project.devices.length > 1 && (
        <div
          role="group"
          aria-label="Device to edit"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm font-medium">Editing:</span>
          {project.devices.map((d, i) => (
            <button
              key={d.name}
              type="button"
              aria-pressed={i === activeIndex}
              onClick={() => onSelectDevice(i)}
              className={
                i === activeIndex
                  ? "rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
                  : "rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
              }
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Editor for one Device's Input labels: add, rename, or remove. Lives in the
 * Inputs section of the editor panel (the Devices section owns which Device is
 * active). Every change dispatches a {@link ProjectAction}.
 */
export function InputEditor({
  device,
  deviceIndex,
  dispatch,
}: {
  device: Project["devices"][number];
  deviceIndex: number;
  dispatch: Dispatch<ProjectAction>;
}) {
  const [draft, setDraft] = useState("");

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const label = draft.trim();
    if (!label) return;
    dispatch({ type: "add-input", deviceIndex, label });
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <ul aria-label={`${device.name} Inputs`} className="flex flex-col gap-2">
        {device.inputs.map((label, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              aria-label={`${device.name} Input ${i + 1} label`}
              value={label}
              onChange={(e) =>
                dispatch({
                  type: "edit-input",
                  deviceIndex,
                  inputIndex: i,
                  label: e.target.value,
                })
              }
              className={`${inputClass} w-48`}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${label || `Input ${i + 1}`}`}
              onClick={() =>
                dispatch({ type: "remove-input", deviceIndex, inputIndex: i })
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} className="flex items-center gap-2">
        <input
          aria-label={`New Input label for ${device.name}`}
          placeholder="Add an Input, e.g. F5"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`${inputClass} w-48`}
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={!draft.trim()}
        >
          Add Input
        </Button>
      </form>
    </div>
  );
}
