"use client";

import { useEffect, useState, type Dispatch } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectAction } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";
import { NamingControls } from "./naming-controls";

/**
 * What the user chose to export. Devices are held by index rather than name, so
 * a rename between opening the dialog and confirming can't point the export at
 * the wrong Device.
 */
export interface ExportSelection {
  devices: number[];
  png: boolean;
  json: boolean;
}

interface ExportDialogProps {
  ref: React.Ref<HTMLDialogElement>;
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  /** The Device the editor is on, for the naming sample. */
  activeIndex: number;
  exporting: boolean;
  onExport: (selection: ExportSelection) => void;
}

/**
 * The Export confirmation modal (#21): which Devices, which file types, and the
 * naming that decides what those files are called. Nothing downloads until the
 * user confirms here, and everything they pick arrives as a single .zip (or the
 * bare file, when they picked exactly one).
 *
 * Naming lives here rather than in the editor sidebar because it only matters at
 * export time — the live sample below doubles as a preview of this dialog's
 * output.
 */
export function ExportDialog({
  ref,
  project,
  dispatch,
  activeIndex,
  exporting,
  onExport,
}: ExportDialogProps) {
  const dialogRef = ref as React.RefObject<HTMLDialogElement | null>;
  const deviceNames = project.devices.map((d) => d.name).join(" ");

  const [devices, setDevices] = useState<number[]>(() =>
    project.devices.map((_, i) => i),
  );
  const [png, setPng] = useState(true);
  const [json, setJson] = useState(true);

  // Indices only mean something against one Device list, so re-select all of
  // them whenever that list changes rather than carrying stale ones forward.
  const [seededFor, setSeededFor] = useState(deviceNames);
  if (seededFor !== deviceNames) {
    setSeededFor(deviceNames);
    setDevices(project.devices.map((_, i) => i));
  }

  // Reflect Esc / backdrop dismissal without leaving stale open state anywhere.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (e: Event) => e.preventDefault(); // let the form handle close
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [dialogRef]);

  function toggleDevice(index: number) {
    setDevices((current) =>
      current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index].sort((a, b) => a - b),
    );
  }

  const canExport = devices.length > 0 && (png || json) && !exporting;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canExport) return;
    onExport({ devices, png, json });
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="export-dialog-title"
      className="fixed inset-0 m-auto h-fit max-h-[85vh] w-fit rounded-lg border bg-background p-0 text-foreground backdrop:bg-black/40"
    >
      <form
        onSubmit={submit}
        method="dialog"
        className="max-h-[85vh] w-112 space-y-5 overflow-y-auto p-5"
      >
        <h2 id="export-dialog-title" className="text-lg font-semibold">
          Export
        </h2>

        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">Devices</legend>
          {project.devices.map((device, index) => (
            <label
              key={device.name}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={devices.includes(index)}
                onChange={() => toggleDevice(index)}
                className="size-4"
              />
              <span>{device.name}</span>
            </label>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Each Device exports its own Sprite Atlas.
          </p>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">Files</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={png}
              onChange={(e) => setPng(e.target.checked)}
              className="size-4"
            />
            <span>Sprite Atlas (.png)</span>
          </label>
          <p className="pb-1 pl-6 text-xs text-muted-foreground">
            Padded to power-of-two dimensions, which engines and mipmapping
            generally require.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={json}
              onChange={(e) => setJson(e.target.checked)}
              className="size-4"
            />
            <span>Metadata (.json)</span>
          </label>
          <p className="pl-6 text-xs text-muted-foreground">
            TexturePacker-format sidecar mapping each Sprite Name to its cell in
            the atlas — how your engine looks a Glyph up.
          </p>
        </fieldset>

        <div className="space-y-1.5 border-t pt-5">
          <h3 className="text-sm font-medium">Naming</h3>
          <NamingControls
            project={project}
            dispatch={dispatch}
            activeIndex={activeIndex}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Picking more than one file downloads them together as a single .zip.
        </p>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canExport}>
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
