"use client";

import { useState, type Dispatch } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectAction } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";
import { Modal } from "./modal";
import { NamingControls } from "./naming-controls";

/** The two artifacts a Device exports (ADR-0003). */
export type FileType = "png" | "json";

const FILE_TYPES: { type: FileType; label: string; help: string }[] = [
  {
    type: "png",
    label: "Sprite Atlas (.png)",
    help: "Padded to power-of-two dimensions, which engines and mipmapping generally require.",
  },
  {
    type: "json",
    label: "Metadata (.json)",
    help: "TexturePacker-format sidecar mapping each Sprite Name to its cell in the atlas — how your engine looks a Glyph up.",
  },
];

/**
 * What the user chose to export. Devices are held by index rather than name, so
 * renaming one while the modal is open can't point the export at a different
 * Device.
 */
export interface ExportSelection {
  devices: number[];
  fileTypes: FileType[];
}

interface ExportDialogProps {
  ref: React.Ref<HTMLDialogElement>;
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  onExport: (selection: ExportSelection) => void;
}

/**
 * The Export confirmation modal (#21): which Devices, which file types, and the
 * naming that decides what those files are called. Nothing downloads until the
 * user confirms here, and everything they pick arrives as a single .zip (or the
 * bare file, when they picked exactly one).
 *
 * Naming lives here rather than in the editor sidebar because it only matters at
 * export time — its live sample doubles as a preview of this dialog's output.
 */
export function ExportDialog({
  ref,
  project,
  dispatch,
  onExport,
}: ExportDialogProps) {
  const [devices, setDevices] = useState<number[]>(() =>
    project.devices.map((_, i) => i),
  );
  const [fileTypes, setFileTypes] = useState<FileType[]>(["png", "json"]);

  // Indices only mean something against one Device list, so re-select all of
  // them whenever that list changes. Keyed on catalog ids rather than names, so
  // a rename — which leaves every index valid — keeps the user's picks.
  const deviceIds = project.devices.map((d) => d.catalogId).join("|");
  const [seededFor, setSeededFor] = useState(deviceIds);
  if (seededFor !== deviceIds) {
    setSeededFor(deviceIds);
    setDevices(project.devices.map((_, i) => i));
  }

  // Read back in Device / file-type order rather than click order, so the same
  // picks always export the same way round.
  const selection: ExportSelection = {
    devices: project.devices
      .map((_, i) => i)
      .filter((i) => devices.includes(i)),
    fileTypes: FILE_TYPES.map((f) => f.type).filter((t) =>
      fileTypes.includes(t),
    ),
  };
  const canExport =
    selection.devices.length > 0 && selection.fileTypes.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canExport) return;
    onExport(selection);
    (e.target as HTMLFormElement).closest("dialog")?.close();
  }

  return (
    <Modal
      ref={ref}
      title="Export"
      onSubmit={submit}
      className="w-112 space-y-5"
    >
      {(close) => (
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Devices</legend>
            {project.devices.map((device, index) => (
              <Check
                key={device.catalogId}
                label={device.name}
                checked={devices.includes(index)}
                onChange={() => setDevices(toggle(devices, index))}
              />
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Each Device exports its own Sprite Atlas.
            </p>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Files</legend>
            {FILE_TYPES.map(({ type, label, help }) => (
              <div key={type}>
                <Check
                  label={label}
                  checked={fileTypes.includes(type)}
                  onChange={() => setFileTypes(toggle(fileTypes, type))}
                />
                <p className="pl-6 text-xs text-muted-foreground">{help}</p>
              </div>
            ))}
          </fieldset>

          <div className="space-y-1.5 border-t pt-5">
            <h3 className="text-sm font-medium">Naming</h3>
            <NamingControls
              project={project}
              dispatch={dispatch}
              // Preview the first Device actually being exported, so the sample
              // filenames are ones this dialog will produce.
              activeIndex={selection.devices[0] ?? 0}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Picking more than one file downloads them together as a single .zip.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canExport}>
              Export
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Add `value` to the selection, or drop it when it's already there. */
function toggle<T extends number | string>(selection: T[], value: T): T[] {
  return selection.includes(value)
    ? selection.filter((v) => v !== value)
    : [...selection, value];
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4"
      />
      <span>{label}</span>
    </label>
  );
}
