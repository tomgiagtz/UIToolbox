"use client";

import type { Dispatch } from "react";
import type { ProjectAction } from "@/lib/glyph/project";
import type { BackgroundShape, Project } from "@/lib/glyph/types";
import { ColorField, Field, inputClass } from "./controls-ui";

const SHAPES: { value: BackgroundShape; label: string }[] = [
  { value: "rounded-rect", label: "Rounded rect" },
  { value: "square", label: "Square" },
  { value: "circle", label: "Circle" },
  { value: "none", label: "None (label only)" },
];

/** Common power-of-two-friendly cell sizes; also drives output resolution. */
const CELL_SIZES = [32, 48, 64, 96, 128, 192, 256];

/**
 * Controls for Glyph appearance (#4): text color, Background shape/fill/border,
 * and cell size. Pure presentational — every change is a {@link ProjectAction}
 * so the live preview and generated output stay in lock-step.
 */
export function StyleControls({
  project,
  dispatch,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
}) {
  const { background: bg } = project;

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <ColorField
        label="Text color"
        value={project.textColor}
        onChange={(color) => dispatch({ type: "set-text-color", color })}
      />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Background shape</legend>
        <div className="flex flex-wrap gap-3">
          {SHAPES.map((s) => (
            <label key={s.value} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="bg-shape"
                value={s.value}
                checked={bg.shape === s.value}
                onChange={() => dispatch({ type: "set-bg-shape", shape: s.value })}
                className="size-4"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Cell size (px)" hint="Output resolution per Glyph.">
        {(id) => (
          <select
            id={id}
            className={inputClass}
            value={project.cellSize}
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

      {bg.shape !== "none" && (
        <ColorField
          label="Background fill"
          value={bg.fill}
          onChange={(fill) => dispatch({ type: "set-bg-fill", fill })}
        />
      )}

      {bg.shape === "rounded-rect" && (
        <Field label={`Corner radius (${bg.cornerRadius}px)`}>
          {(id) => (
            <input
              id={id}
              type="range"
              min={0}
              max={64}
              value={bg.cornerRadius}
              onChange={(e) =>
                dispatch({
                  type: "set-bg-corner-radius",
                  radius: Number(e.target.value),
                })
              }
              className="w-full"
            />
          )}
        </Field>
      )}

      {bg.shape !== "none" && (
        <>
          <Field label={`Border width (${bg.border.width}px)`}>
            {(id) => (
              <input
                id={id}
                type="range"
                min={0}
                max={20}
                value={bg.border.width}
                onChange={(e) =>
                  dispatch({
                    type: "set-bg-border-width",
                    width: Number(e.target.value),
                  })
                }
                className="w-full"
              />
            )}
          </Field>

          <ColorField
            label="Border color"
            value={bg.border.color}
            onChange={(color) => dispatch({ type: "set-bg-border-color", color })}
          />
        </>
      )}
    </div>
  );
}
