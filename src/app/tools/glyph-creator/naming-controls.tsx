"use client";

import { useMemo, type Dispatch } from "react";
import { generateTilesets, resolveDeviceInputs } from "@/lib/glyph/generate";
import type { ProjectAction } from "@/lib/glyph/project";
import type { CaseStyle, Project } from "@/lib/glyph/types";
import { Field, inputClass } from "./controls-ui";

const CASES: { value: CaseStyle; label: string }[] = [
  { value: "snake", label: "snake_case" },
  { value: "kebab", label: "kebab-case" },
  { value: "camel", label: "camelCase" },
];

/**
 * Controls for output naming (#6): the Sprite-Name template ({device}/{input}/
 * {index}), a case style applied over the mandatory slug normalization, and the
 * output-filename template ({device}). A live sample shows the effect on the
 * Device being edited.
 */
export function NamingControls({
  project,
  dispatch,
  activeIndex,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  activeIndex: number;
}) {
  const sample = useMemo(() => {
    const active = project.devices[activeIndex];
    if (!active || resolveDeviceInputs(active, project).length === 0)
      return null;
    const [output] = generateTilesets({ ...project, devices: [active] });
    return {
      filename: output.filename,
      names: output.placements.slice(0, 4).map((p) => p.spriteName),
      more: Math.max(0, output.placements.length - 4),
    };
  }, [project, activeIndex]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Sprite-Name template"
          hint="Tokens: {device}, {input}, {index}"
        >
          {(id) => (
            <input
              id={id}
              value={project.naming.template}
              onChange={(e) =>
                dispatch({
                  type: "set-naming-template",
                  template: e.target.value,
                })
              }
              className={`${inputClass} font-mono`}
              spellCheck={false}
            />
          )}
        </Field>

        <Field label="Output-filename template" hint="Token: {device}">
          {(id) => (
            <input
              id={id}
              value={project.filenameTemplate}
              onChange={(e) =>
                dispatch({
                  type: "set-filename-template",
                  template: e.target.value,
                })
              }
              className={`${inputClass} font-mono`}
              spellCheck={false}
            />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Case style</legend>
        <div className="flex flex-wrap gap-3">
          {CASES.map((c) => (
            <label key={c.value} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="naming-case"
                value={c.value}
                checked={project.naming.case === c.value}
                onChange={() =>
                  dispatch({ type: "set-naming-case", case: c.value })
                }
                className="size-4"
              />
              <span className="font-mono">{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {sample && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="mb-1 font-medium">Sample output</p>
          <p className="text-muted-foreground">
            File: <span className="font-mono">{sample.filename}.png</span> /{" "}
            <span className="font-mono">{sample.filename}.json</span>
          </p>
          <p className="mt-1 text-muted-foreground">
            Sprite Names:{" "}
            <span className="font-mono">{sample.names.join(", ")}</span>
            {sample.more > 0 ? ` … (+${sample.more} more)` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
