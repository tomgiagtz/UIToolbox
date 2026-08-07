"use client";

import type { Dispatch } from "react";
import type { ProjectAction } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";
import { Field, inputClass } from "./controls-ui";

/** Common power-of-two-friendly cell sizes; also drives output resolution. */
const CELL_SIZES = [32, 48, 64, 96, 128, 192, 256];

/**
 * The Project-global cell size — an export setting (ADR-0012 §6) that is still
 * tuned from the sidebar, because it is the one atlas value you set by watching
 * the live grid re-flow.
 *
 * It therefore appears twice: in the Style panel beside the look it is judged
 * against, and in the Export dialog beside the rest of `exportSettings`. Both
 * dispatch the same action, so the two are the same control rather than two
 * states that can disagree.
 */
export function CellSizeField({
  project,
  dispatch,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
}) {
  return (
    <Field
      label="Cell size (px)"
      hint="Output resolution per Glyph — applies to the whole project."
    >
      {(id) => (
        <select
          id={id}
          className={inputClass}
          value={project.exportSettings.cellSize}
          onChange={(e) =>
            dispatch({ type: "set-cell-size", size: Number(e.target.value) })
          }
        >
          {CELL_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}×{n}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
