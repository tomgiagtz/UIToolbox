"use client";

import { useState, type Dispatch, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DEVICE_CATALOGS, getCatalog } from "@/lib/glyph/catalog";
import type { ProjectAction } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";
import { inputClass } from "./controls-ui";
import { DeviceLayout } from "./device-layout";

/**
 * Controls for Devices (#5): pick which Devices to generate (each seeded from a
 * Catalog Preset) and choose which one to preview/edit. The chosen Device's
 * enabled Catalog Inputs and custom Inputs are edited by {@link InputEditor} in
 * the Inputs section.
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
          {DEVICE_CATALOGS.map((catalog) => {
            const selected = project.devices.some(
              (d) => d.catalogId === catalog.id,
            );
            return (
              <label key={catalog.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    dispatch({ type: "toggle-device", catalogId: catalog.id })
                  }
                  className="size-4"
                />
                {catalog.name}
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
              key={d.catalogId || d.name}
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
 * Editor for one Device's Inputs (ADR-0005): a clickable code-drawn Device
 * Layout for toggling which fixed **Catalog** Inputs are enabled, plus an
 * add/rename/remove list for free-text **custom** Inputs. Lives in the Inputs
 * section of the editor panel. Every change dispatches a {@link ProjectAction}.
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
  const catalog = getCatalog(device.catalogId);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const label = draft.trim();
    if (!label) return;
    dispatch({ type: "add-custom-input", deviceIndex, label });
    setDraft("");
  }

  return (
    <div className="space-y-5">
      {catalog && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Catalog Inputs</p>
          <p className="text-xs text-muted-foreground">
            Click an Input on the Layout to toggle whether it generates a Glyph.
            Enabled Inputs are highlighted; dimmed ones are off.
          </p>
          <DeviceLayout
            device={device}
            deviceIndex={deviceIndex}
            dispatch={dispatch}
          />
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium">Custom Inputs</p>
        {device.custom.length > 0 && (
          <ul
            aria-label={`${device.name} custom Inputs`}
            className="flex flex-col gap-2"
          >
            {device.custom.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <input
                  aria-label={`${device.name} custom Input ${c.label || c.id} label`}
                  value={c.label}
                  onChange={(e) =>
                    dispatch({
                      type: "edit-custom-input",
                      deviceIndex,
                      id: c.id,
                      label: e.target.value,
                    })
                  }
                  className={`${inputClass} w-48`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${c.label || c.id}`}
                  onClick={() =>
                    dispatch({ type: "remove-custom-input", deviceIndex, id: c.id })
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onAdd} className="flex items-center gap-2">
          <input
            aria-label={`New custom Input for ${device.name}`}
            placeholder="Add a custom Input, e.g. F5"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`${inputClass} w-48`}
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!draft.trim()}>
            Add Input
          </Button>
        </form>
      </div>
    </div>
  );
}
