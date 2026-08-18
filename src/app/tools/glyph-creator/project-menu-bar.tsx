"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "./modal";

interface ProjectMenuBarProps {
  /** Current config name; the Save dialog edits this. */
  name: string;
  onNameChange: (name: string) => void;
  /**
   * Whether the project carries any uploaded font — gates the "Include fonts"
   * option. Bundled families ship with the tool, so they never travel in a save.
   */
  hasUploadedFont: boolean;
  canExport: boolean;
  /** Save the current project to a file; `includeFonts` picks ZIP vs JSON. */
  onSave: (includeFonts: boolean) => void;
  /** A project file the user chose to load. */
  onLoadFile: (file: File) => void;
  /** Reset everything (config + persisted fonts). Parent confirms first. */
  onDelete: () => void;
  /** Open the Preset picker; the parent owns it and the edit it dispatches. */
  onPresets: () => void;
  /** Open the Export modal; the parent owns it and the download it triggers. */
  onExport: () => void;
}

/**
 * The always-visible bottom toolbar: Save / Load / Delete a project, plus the
 * primary Export action. Sticks to the bottom of the viewport so the developer
 * can act from anywhere in the (long) editor.
 */
export function ProjectMenuBar({
  name,
  onNameChange,
  hasUploadedFont,
  canExport,
  onSave,
  onLoadFile,
  onDelete,
  onPresets,
  onExport,
}: ProjectMenuBarProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const [includeFont, setIncludeFont] = useState(false);

  function openSaveDialog() {
    // Default to bundling the fonts whenever there are any to bundle.
    setIncludeFont(hasUploadedFont);
    dialogRef.current?.showModal();
  }

  function submitSave(e: React.FormEvent) {
    e.preventDefault();
    onSave(includeFont && hasUploadedFont);
    dialogRef.current?.close();
  }

  function onLoadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file later by clearing the input.
    e.target.value = "";
    if (file) onLoadFile(file);
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t bg-surface-base/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface-base/80">
      <div className="relative flex items-center gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={openSaveDialog}>
            Save…
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => loadInputRef.current?.click()}
          >
            Load…
          </Button>
          <Button type="button" variant="outline" onClick={onDelete}>
            Delete
          </Button>
          <Button type="button" variant="outline" onClick={onPresets}>
            Presets…
          </Button>
        </div>

        {/* Inline-editable config name: reads as plain text, becomes a field on
            click/focus. Kept in sync with the Save dialog's name via the model. */}
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          aria-label="Project name"
          title="Click to rename the project"
          className="absolute left-1/2 hidden w-40 max-w-[40%] -translate-x-1/2 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-center text-sm font-medium text-muted-foreground hover:border-input focus:border-input focus:bg-surface-base focus:text-foreground focus:outline-none sm:block"
        />

        <div className="ml-auto">
          <Button type="button" onClick={onExport} disabled={!canExport}>
            Export…
          </Button>
        </div>
      </div>

      <input
        ref={loadInputRef}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        aria-label="Load project file"
        onChange={onLoadChange}
        className="hidden"
      />

      <SaveDialog
        ref={dialogRef}
        name={name}
        onNameChange={onNameChange}
        hasUploadedFont={hasUploadedFont}
        includeFont={includeFont}
        onIncludeFontChange={setIncludeFont}
        onSubmit={submitSave}
      />
    </div>
  );
}

interface SaveDialogProps {
  ref: React.Ref<HTMLDialogElement>;
  name: string;
  onNameChange: (name: string) => void;
  hasUploadedFont: boolean;
  includeFont: boolean;
  onIncludeFontChange: (value: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function SaveDialog({
  ref,
  name,
  onNameChange,
  hasUploadedFont,
  includeFont,
  onIncludeFontChange,
  onSubmit,
}: SaveDialogProps) {
  return (
    <Modal
      ref={ref}
      title="Save project"
      onSubmit={onSubmit}
      className="w-80 space-y-4"
    >
      {(close) => (
        <>
          <div className="space-y-1.5">
            <label htmlFor="save-name" className="text-sm font-medium">
              Config name
            </label>
            <input
              id="save-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-input bg-surface-base px-3 py-1.5 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Used as the download filename.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeFont && hasUploadedFont}
              disabled={!hasUploadedFont}
              onChange={(e) => onIncludeFontChange(e.target.checked)}
            />
            <span
              className={hasUploadedFont ? undefined : "text-muted-foreground"}
            >
              Include fonts
              {hasUploadedFont ? " (saves a .zip)" : " (upload a font first)"}
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
