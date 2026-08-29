"use client";

import { useId, type Dispatch } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectAction } from "@/lib/glyph/project";
import { PAINT_ROLES } from "@/lib/glyph/symbols/paint-roles.mjs";
import type { SetReview } from "@/lib/glyph/symbols/set-import";
import type {
  DeviceConfig,
  PaintRole,
  Project,
  RoleColors,
  SymbolSet,
} from "@/lib/glyph/types";
import { SetCellArt } from "./asset-art";
import { ConfirmButton } from "./confirm-button";
import {
  DEFAULT_SET_ROLE_COLORS,
  canRefreshFromPath,
  useSetImport,
} from "./use-set-import";

/**
 * The Assets window's **Symbol Sets** section (#39) — the home ADR-0014 §3 gave
 * this work.
 *
 * A Set is one authored SVG whose cells are the Symbols and Authored Backgrounds
 * the project can draw with. This section is where one is acquired, re-read, and
 * configured; what a *Glyph* draws stays the Style panel's question, so nothing
 * here selects anything (ADR-0014 §1).
 *
 * It has two faces and never both at once. Idle, it lists what the project
 * holds. Mid-import, it shows the **review** — a description of a change that
 * has not happened yet — because the one thing a refresh may not do is take art
 * away without saying so (ADR-0015).
 */
export function SetsSection({
  project,
  dispatch,
  activeDeviceIndex,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  /** Which Device "Add as Input" lands a cell on (ADR-0015). */
  activeDeviceIndex: number;
}) {
  const { state, hostRef, importFile, refresh, accept, rename, dismiss } =
    useSetImport(project, dispatch);

  return (
    <div className="flex flex-col gap-4">
      {/*
        Where `measureAtlas` mounts the atlas to measure it. Off-screen rather
        than hidden: `getBBox()` needs a rendered subtree, and `display:none`
        measures as nothing at all.
      */}
      <div
        ref={hostRef}
        aria-hidden
        className="pointer-events-none fixed left-[-10000px] top-0 size-0 overflow-hidden"
      />

      {state.kind === "reviewing" ? (
        <ImportReview
          review={state.review}
          name={state.source.name}
          colors={
            project.sets.find((set) => set.id === state.source.id)
              ?.roleColors ?? DEFAULT_SET_ROLE_COLORS
          }
          onAccept={accept}
          onRename={rename}
          onCancel={dismiss}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            A Symbol Set is one SVG whose cells are the Symbols and Authored
            Backgrounds you can draw with. Sets that ship with the tool are
            always present; import your own to add to them.
          </p>

          {state.kind === "error" && (
            <Notice tone="error">{state.message}</Notice>
          )}
          {state.kind === "stranded" && (
            <Notice tone="warning">{state.message}</Notice>
          )}

          {project.sets.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No Sets imported yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {project.sets.map((set) => (
                <InstalledSet
                  key={set.id}
                  set={set}
                  dispatch={dispatch}
                  device={project.devices[activeDeviceIndex] ?? null}
                  deviceIndex={activeDeviceIndex}
                  onRefresh={() => void refresh(set)}
                />
              ))}
            </ul>
          )}

          <ImportControl onPick={(file) => void importFile(file)} />
        </>
      )}
    </div>
  );
}

/** A short message about the last thing that happened, in the section's flow. */
function Notice({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={`rounded-lg border p-3 text-sm ${
        tone === "error"
          ? "border-destructive/40 text-destructive"
          : "border-amber-500/40 text-amber-700 dark:text-amber-400"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * One installed Set: its art in the colours it is viewed in, and the three
 * things that can be done to it.
 *
 * There is no per-cell control, deliberately. A Set holds exactly what its file
 * draws, so the only way to remove a Symbol is to stop drawing it and refresh —
 * which is what keeps a Set from ever drifting from its atlas (ADR-0015 §2).
 */
function InstalledSet({
  set,
  dispatch,
  device,
  deviceIndex,
  onRefresh,
}: {
  set: SymbolSet;
  dispatch: Dispatch<ProjectAction>;
  /** The Device "Add as Input" lands on; `null` in a project with none. */
  device: DeviceConfig | null;
  deviceIndex: number;
  onRefresh: () => void;
}) {
  const flagged = set.cells.filter((cell) => cell.flags.length > 0);

  return (
    <li className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {set.name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {set.cells.length} {set.cells.length === 1 ? "cell" : "cells"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
          {canRefreshFromPath() ? "Refresh" : "Refresh…"}
        </Button>
        <ConfirmButton
          label="Remove"
          name={`Remove ${set.name}`}
          onConfirm={() => dispatch({ type: "remove-set", setId: set.id })}
        />
      </div>

      <CellStrip
        cells={set.cells}
        colors={set.roleColors}
        device={device}
        onAddInput={(cell) =>
          dispatch({
            type: "add-symbol-input",
            deviceIndex,
            label: cell.label,
            symbolId: cell.id,
          })
        }
      />

      <RoleColorControls
        colors={set.roleColors}
        onChange={(roleColors) =>
          dispatch({ type: "set-role-colors", setId: set.id, roleColors })
        }
      />

      {flagged.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {flagged.length} {flagged.length === 1 ? "cell draws" : "cells draw"}{" "}
          in a colour that isn’t a Paint Role, so{" "}
          {flagged.length === 1 ? "it" : "they"} can’t be recoloured:{" "}
          {flagged.map((cell) => cell.id).join(", ")}.
        </p>
      )}
    </li>
  );
}

/**
 * Every cell of a Set, small, in the colours the Set is viewed in — each with
 * the one deliberate act that turns a drawing into something exportable.
 *
 * Importing never creates Inputs (ADR-0015): a Set is a shipment of art, and an
 * Input is a Device's sprite, so what lands in an atlas stays the user's call —
 * the mirror of ADR-0014 §5's "removal is always explicit". A cell is reachable
 * from any Glyph's Render Source picker the moment it is imported; this button
 * is just the shortcut for art that has no Input to live on yet, taken while
 * looking at the drawing.
 */
function CellStrip({
  cells,
  colors,
  device,
  onAddInput,
}: {
  cells: SymbolSet["cells"];
  colors: RoleColors;
  device: DeviceConfig | null;
  onAddInput: (cell: SymbolSet["cells"][number]) => void;
}) {
  /** Cell ids the active Device already has a custom Input pointed at. */
  const taken = new Set(
    (device?.custom ?? [])
      .map(
        (input) =>
          device?.glyphStyles[input.id]?.foreground?.renderSource ?? null,
      )
      .flatMap((source) =>
        source?.kind === "symbol" && source.symbolId ? [source.symbolId] : [],
      ),
  );

  return (
    <ul className="flex flex-wrap gap-2">
      {cells.map((cell) => (
        <li
          key={cell.id}
          title={`${cell.label} (${cell.id})`}
          className="flex w-16 flex-col items-center gap-1"
        >
          <SetCellArt
            svg={cell.svg}
            colors={colors}
            className="size-12 object-contain"
          />
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">
            {cell.label}
          </span>
          {device && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-full px-1 text-[10px]"
              // Pressed twice, this would mint a second Input drawing the same
              // cell — an atlas with two identical sprites under near-identical
              // names. Nothing else would have caught it: an Input carries no
              // link back to the cell beyond the Symbol it is pointed at.
              disabled={taken.has(cell.id)}
              aria-label={`Add ${cell.label} as an Input on ${device.name}`}
              onClick={() => onAddInput(cell)}
            >
              {taken.has(cell.id) ? "Added" : "Add as Input"}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The Set's default Paint Role colours — how its art is **viewed**, not a
 * cascade tier (ADR-0015 §3).
 *
 * Authored art is painted in sentinels, which are legible as data and illegible
 * as a drawing, so a Set carries the colours to look at it in. What a Glyph
 * draws in is the Style panel's `symbolPaints`, and this never touches it: the
 * one rule keeping the two surfaces from growing into each other (ADR-0014 §4).
 */
function RoleColorControls({
  colors,
  onChange,
}: {
  colors: RoleColors;
  onChange: (colors: RoleColors) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="text-xs text-muted-foreground">Preview colours</span>
      {PAINT_ROLES.map((role: PaintRole) => (
        <div key={role} className="flex items-center gap-1.5">
          <label htmlFor={`${id}-${role}`} className="text-xs capitalize">
            {role}
          </label>
          <input
            id={`${id}-${role}`}
            type="color"
            value={colors[role]}
            onChange={(e) => onChange({ ...colors, [role]: e.target.value })}
            className="size-6 cursor-pointer rounded border bg-transparent p-0"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Start an import.
 *
 * Where the File System Access API exists this is a button, because the picker
 * it opens is what hands back the re-readable handle a **Refresh** needs. Where
 * it doesn't (Firefox, Safari) it is an ordinary file input: the same import,
 * with refreshing degraded to picking the file again.
 */
function ImportControl({ onPick }: { onPick: (file?: File) => void }) {
  const id = useId();

  if (canRefreshFromPath()) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => onPick()}
        >
          Import a Symbol Set
        </Button>
        <p className="text-xs text-muted-foreground">
          One SVG of grid-placed cells, painted in the Paint Role sentinels. The
          tool remembers the file for this session, so re-exporting and hitting
          Refresh pulls your changes in.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Import a Symbol Set
      </label>
      <input
        id={id}
        type="file"
        accept="image/svg+xml,.svg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-surface-base file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-surface-hover"
      />
      <p className="text-xs text-muted-foreground">
        One SVG of grid-placed cells, painted in the Paint Role sentinels. This
        browser can’t re-open a file on its own, so refreshing asks for it
        again.
      </p>
    </div>
  );
}

/** How a review row reads, and what it costs — `gone` is the one that takes. */
const STATUS_LABEL: Record<SetReview["entries"][number]["status"], string> = {
  new: "New",
  unchanged: "Unchanged",
  redrawn: "Redrawn",
  gone: "Removed",
};

/**
 * The import review: everything accepting would do, before it is done.
 *
 * Named losses come first. A cell that leaves is shown *as a row* rather than
 * summarised away, because the review exists so that art never disappears
 * quietly — the same reason the warning names ids rather than counting them.
 */
function ImportReview({
  review,
  name,
  colors,
  onAccept,
  onRename,
  onCancel,
}: {
  review: SetReview;
  name: string;
  colors: RoleColors;
  onAccept: () => void;
  onRename: (id: string, label: string) => void;
  onCancel: () => void;
}) {
  const kept = review.entries.filter((entry) => entry.status !== "gone");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {review.isRefresh ? "Refreshing" : "Importing"} {name}
        </h3>
        <span className="text-xs text-muted-foreground">
          {kept.length} {kept.length === 1 ? "cell" : "cells"}
        </span>
      </div>

      {review.stranded.length > 0 && (
        <Notice tone="warning">
          Accepting removes art{" "}
          {review.stranded
            .map(
              (s) =>
                `“${s.id}” (${s.glyphs} Glyph${s.glyphs === 1 ? "" : "s"})`,
            )
            .join(", ")}{" "}
          — those Glyphs will draw their labels until the drawing has it again.
        </Notice>
      )}

      {review.renameHint && <Notice tone="warning">{review.renameHint}</Notice>}

      {review.duplicates.length > 0 && (
        <Notice tone="warning">
          Drawn more than once: {review.duplicates.join(", ")}. The first
          drawing of each is the one kept.
        </Notice>
      )}

      <ul className="flex flex-col gap-1.5">
        {review.entries.map((entry) => (
          <li
            key={entry.id}
            className={`flex items-center gap-3 rounded-md border p-2 ${
              entry.status === "gone" ? "border-dashed opacity-60" : ""
            }`}
          >
            <SetCellArt
              svg={entry.svg}
              colors={colors}
              className="size-10 shrink-0 object-contain"
            />
            <span className="min-w-0 flex-1">
              {entry.status === "gone" ? (
                // Nothing to name: this row is what accepting takes away.
                <span className="block truncate text-sm">{entry.label}</span>
              ) : (
                <input
                  aria-label={`Label for ${entry.id}`}
                  value={entry.label}
                  onChange={(e) => onRename(entry.id, e.target.value)}
                  className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-input focus:border-input focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
              <span className="block truncate text-xs text-muted-foreground">
                {entry.id} ·{" "}
                {entry.binding.kind === "catalog"
                  ? `binds to ${entry.binding.inputs.join(", ")}`
                  : "not in the Catalog"}
                {entry.flags.length > 0 && " · non-role paint"}
                {entry.labelEdited && " · renamed"}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {STATUS_LABEL[entry.status]}
            </span>
          </li>
        ))}
      </ul>

      {review.skipped.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Skipped {review.skipped.length}{" "}
            {review.skipped.length === 1 ? "thing" : "things"} in this file
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {review.skipped.map((skip) => (
              <li key={skip.id}>
                <span className="font-medium">{skip.id}</span> — {skip.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={onAccept}>
          {review.isRefresh ? "Accept changes" : "Add to project"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
