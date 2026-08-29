"use client";

import { useCallback, useRef, useState, type Dispatch } from "react";
import { slugify } from "@/lib/glyph/slugify";
import { projectCatalogInputs, symbolUses } from "@/lib/glyph/symbol-refs";
import type { ProjectAction } from "@/lib/glyph/project";
import {
  AtlasParseError,
  measureAtlas,
} from "@/lib/glyph/symbols/measure-atlas";
import {
  acceptReview,
  buildReview,
  strandedWarning,
  windowAtlas,
  type SetReview,
} from "@/lib/glyph/symbols/set-import";
import type { Project, RoleColors, SymbolSet } from "@/lib/glyph/types";

/**
 * The Paint Role colours a Set is first *viewed* in (ADR-0015 §3).
 *
 * Not the sentinels themselves: art painted `#ff0000` / `#0000ff` / `#00ff00` is
 * legible as data and illegible as a drawing, and the first thing an importer
 * does is look at it. A dark outline over a mid fill with a light highlight is
 * the shape most authored art has.
 */
export const DEFAULT_SET_ROLE_COLORS: RoleColors = {
  fill: "#2f9e44",
  border: "#111111",
  secondary: "#ffffff",
};

/**
 * Where a Set's file came from, and whether the tool can re-open it by itself.
 *
 * `handle` is the File System Access API's re-readable reference. It is kept in
 * memory for the session only: persisting one means storing it in IndexedDB and
 * re-requesting permission on the next visit, and the gesture it saves — "I
 * re-exported, pull it in again" — belongs to the sitting where the drawing was
 * changed. Without a handle, refreshing asks for the file again, which is also
 * the whole story on Firefox and Safari.
 */
export interface SetSource {
  id: string;
  name: string;
  handle: FileSystemFileHandle | null;
}

/** What the Symbol Sets section is doing right now. */
export type SetImportState =
  | { kind: "idle" }
  /** A draft is open: nothing has touched the project yet. */
  | { kind: "reviewing"; review: SetReview; source: SetSource }
  | { kind: "error"; message: string }
  /** Accepted, but the file stopped drawing art some Glyphs were using. */
  | { kind: "stranded"; message: string };

/** Whether this browser can re-open a file it was given (Chrome and Edge do). */
export function canRefreshFromPath(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/** Mint a Set id from its filename, the way an image id is minted (ADR-0014 §6). */
function mintSetId(fileName: string): string {
  const stem = fileName.replace(/\.svg$/i, "").replaceAll("-", " ");
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `set-${slugify(stem)}-${tag}`;
}

/**
 * The Symbol Set import flow (#39): pick or re-read a file, review what it would
 * do, then accept or cancel.
 *
 * Nothing here writes to the project except {@link accept}, which dispatches one
 * `install-set`. That split is the point of a review: until it is accepted, an
 * import is a description of a change and not the change.
 */
export function useSetImport(
  project: Project,
  dispatch: Dispatch<ProjectAction>,
) {
  const [state, setState] = useState<SetImportState>({ kind: "idle" });
  /** The off-screen element `measureAtlas` mounts into; see that module. */
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** Session-lived file handles, keyed by Set id. */
  const handles = useRef(new Map<string, FileSystemFileHandle>());

  /**
   * Read one file into a review draft against `installed` (null for a first
   * import). The measuring host has to be mounted, so this is only ever called
   * from an event handler, never during render.
   */
  const review = useCallback(
    async (file: File, source: SetSource, installed: SymbolSet | null) => {
      const host = hostRef.current;
      if (!host) return;
      try {
        const windowed = windowAtlas(measureAtlas(await file.text(), host));
        setState({
          kind: "reviewing",
          source,
          review: buildReview(
            windowed,
            projectCatalogInputs(project),
            installed,
            symbolUses(project),
          ),
        });
      } catch (error) {
        setState({
          kind: "error",
          message:
            error instanceof AtlasParseError
              ? error.message
              : `Couldn’t read “${file.name}”.`,
        });
      }
    },
    [project],
  );

  /**
   * Import a Set from a file the user picks.
   *
   * Prefers `showOpenFilePicker` so the handle can be kept and refreshed from;
   * `fallback` is the plain `<input type="file">` File for browsers without it,
   * which import exactly the same and simply cannot refresh in place.
   */
  const importFile = useCallback(
    async (fallback?: File) => {
      let file = fallback;
      let handle: FileSystemFileHandle | null = null;

      if (!file && canRefreshFromPath()) {
        try {
          [handle] = await window.showOpenFilePicker!({
            types: [
              {
                description: "Symbol Set (SVG)",
                accept: { "image/svg+xml": [".svg"] },
              },
            ],
          });
          file = await handle.getFile();
        } catch {
          // A dismissed picker is not an error; the user changed their mind.
          return;
        }
      }
      if (!file) return;

      const id = mintSetId(file.name);
      if (handle) handles.current.set(id, handle);
      await review(file, { id, name: file.name, handle }, null);
    },
    [review],
  );

  /**
   * Re-read an installed Set from the path it came from.
   *
   * With no retained handle the user is asked for the file again — the same
   * reconciliation either way, since a re-pick may legitimately land on a
   * different path and the Set keeps its own name regardless.
   */
  const refresh = useCallback(
    async (set: SymbolSet, fallback?: File) => {
      const handle = handles.current.get(set.id) ?? null;
      let file = fallback;

      if (!file && handle) {
        try {
          file = await handle.getFile();
        } catch {
          setState({
            kind: "error",
            message: `Couldn’t re-open the file behind “${set.name}”. Pick it again to refresh.`,
          });
          return;
        }
      }
      if (!file && canRefreshFromPath()) {
        try {
          const [picked] = await window.showOpenFilePicker!({
            types: [
              {
                description: "Symbol Set (SVG)",
                accept: { "image/svg+xml": [".svg"] },
              },
            ],
          });
          handles.current.set(set.id, picked);
          file = await picked.getFile();
        } catch {
          return;
        }
      }
      if (!file) return;

      // The Set keeps its own id and name: this is the same shipment re-read,
      // however it was found, so accepting replaces it rather than adding one.
      await review(file, { id: set.id, name: set.name, handle }, set);
    },
    [review],
  );

  /** Take the draft: one `install-set`, plus rule 5's warning if art was lost. */
  const accept = useCallback(() => {
    if (state.kind !== "reviewing") return;
    const previous =
      project.sets.find((set) => set.id === state.source.id) ?? null;
    dispatch({
      type: "install-set",
      set: acceptReview(
        state.review,
        previous,
        state.source,
        DEFAULT_SET_ROLE_COLORS,
      ),
    });
    setState(
      state.review.stranded.length
        ? { kind: "stranded", message: strandedWarning(state.review.stranded) }
        : { kind: "idle" },
    );
  }, [state, project.sets, dispatch]);

  /**
   * Rename one cell in the open draft.
   *
   * Marks the label **typed**, which is what makes it survive later refreshes
   * (rule 2) — an untouched label re-derives from the Catalog instead, so
   * correcting a Catalog label fixes every Set that binds to it. Editing here
   * rather than after accepting is deliberate: the review is where the importer
   * is looking at the art, and it is the only moment a `gone` row still exists
   * to be reasoned about.
   */
  const rename = useCallback((id: string, label: string) => {
    setState((current) =>
      current.kind !== "reviewing"
        ? current
        : {
            ...current,
            review: {
              ...current.review,
              entries: current.review.entries.map((entry) =>
                entry.id === id
                  ? { ...entry, label, labelEdited: true }
                  : entry,
              ),
            },
          },
    );
  }, []);

  /** Drop the draft. The project is untouched, because it always was. */
  const dismiss = useCallback(() => setState({ kind: "idle" }), []);

  return { state, hostRef, importFile, refresh, accept, rename, dismiss };
}
