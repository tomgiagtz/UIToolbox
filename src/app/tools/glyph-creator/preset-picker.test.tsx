import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PresetPicker,
  coveredDevices,
  presenceNote,
  swatchFor,
} from "./preset-picker";
import { createDefaultProject } from "@/lib/glyph/defaults";
import { PRESETS, type Preset } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";

/**
 * The shipped set is the picker's set (ADR-0012 §3), so these run against it —
 * reached by species rather than by id, so shipping another Preset doesn't
 * rewrite the suite.
 */
const deviceSpecies = PRESETS.find((p) => p.kind === "device")!;
const projectSpecies = PRESETS.find((p) => p.kind === "project")!;

/** The Devices `preset` covers that a fresh project does *not* carry. */
function absentIn(project: Project, preset: Preset) {
  return coveredDevices(project, preset).filter((d) => !d.present);
}

function renderPicker({
  project = createDefaultProject(),
  dispatch = vi.fn(),
}: { project?: Project; dispatch?: () => void } = {}) {
  const ref = createRef<HTMLDialogElement>();
  render(<PresetPicker ref={ref} project={project} dispatch={dispatch} />);
  // The parent opens it; a closed <dialog> is hidden from the a11y tree.
  ref.current!.showModal();
  return { dispatch, project, ref };
}

/** Move the picker to `preset` by clicking its row. */
function select(preset: Preset) {
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(preset.label) }),
  );
}

describe("PresetPicker — the list", () => {
  it("lists every shipped Preset, since the picker is the definition of the set", () => {
    renderPicker();
    for (const preset of PRESETS) {
      expect(
        screen.getByRole("button", { name: new RegExp(preset.label) }),
      ).toBeInTheDocument();
    }
  });

  it("gives every row a four-tile swatch, whatever Catalog it covers", () => {
    renderPicker();
    // A Catalog with no SWATCH_INPUTS entry falls back to the opening four of
    // its Default Selection, so a swatch-less row can't happen.
    for (const preset of PRESETS) {
      const row = screen.getByRole("button", {
        name: new RegExp(preset.label),
      });
      expect(row.querySelectorAll("canvas"), preset.label).toHaveLength(4);
    }
  });

  it("draws a keyboard swatch as WASD, not as the Catalog's opening keys", () => {
    const keyboardFirst = PRESETS.find(
      (p) =>
        coveredDevices(createDefaultProject(), p)[0]?.catalogId === "keyboard",
    );
    if (!keyboardFirst) return;
    renderPicker();

    const row = screen.getByRole("button", {
      name: new RegExp(keyboardFirst.label),
    });
    expect(
      [...row.querySelectorAll("canvas")].map((c) =>
        c.getAttribute("aria-label"),
      ),
    ).toEqual(["W", "A", "S", "D"].map((l) => `Glyph preview for ${l}`));
  });

  /**
   * Where a Catalog has no SWATCH_INPUTS entry the swatch is its Default
   * Selection's opening four — so Catalog order silently decides what every
   * Preset covering it looks like in the list. Pinned per Catalog rather than
   * per Preset: a new Preset over a known Catalog needs no row, a reorder fails
   * here, and whoever did it then either accepts the new portrait or writes a
   * SWATCH_INPUTS entry.
   */
  const SWATCHES_BY_CATALOG: Record<string, string[]> = {
    keyboard: ["key-w", "key-a", "key-s", "key-d"],
    xbox: ["xbox-a", "xbox-b", "xbox-x", "xbox-y"],
    playstation: ["ps-cross", "ps-circle", "ps-square", "ps-triangle"],
  };

  it.each(PRESETS.map((p) => [p.label, p] as const))(
    "draws %s's swatch from the Inputs its Catalog is pinned to",
    (_label, preset) => {
      const swatch = swatchFor(preset);
      expect(swatch).not.toBeNull();
      const expected = SWATCHES_BY_CATALOG[swatch!.catalogId];
      expect(
        expected,
        `no pinned swatch for ${swatch!.catalogId}`,
      ).toBeDefined();
      expect(swatch!.inputs.map((i) => i.id)).toEqual(expected);
    },
  );

  it("says a Device you have apart from one you don't, on the row's pills", () => {
    const project = createDefaultProject();
    renderPicker({ project });

    // Solid vs hollow is a colour, so the fact behind it is asserted instead.
    expect(screen.getByTitle("You have a Keyboard Device")).toBeInTheDocument();
    for (const device of absentIn(project, deviceSpecies)) {
      expect(
        screen.getAllByTitle(
          `You have no ${device.name} Device — applying can add one`,
        ).length,
      ).toBeGreaterThan(0);
    }
  });

  it("names the species in the action, never in a chip", () => {
    renderPicker();

    select(deviceSpecies);
    const covered = coveredDevices(createDefaultProject(), deviceSpecies);
    expect(
      screen.getByRole("button", { name: `Apply to ${covered[0].name}` }),
    ).toBeInTheDocument();

    select(projectSpecies);
    expect(
      screen.getByRole("button", { name: "Apply to Project" }),
    ).toBeInTheDocument();
  });
});

describe("PresetPicker — presence is a per-Device toggle", () => {
  it("takes a Device you lack and leaves a Device you have untaken", () => {
    const project = createDefaultProject();
    renderPicker({ project });
    select(projectSpecies);

    // Asymmetric on purpose: adding a Device costs nothing, while replacing a
    // curated selection is the most expensive thing in the tool.
    for (const device of coveredDevices(project, projectSpecies)) {
      const box = screen.getByRole("checkbox", { name: `Take ${device.name}` });
      if (device.present) expect(box, device.name).not.toBeChecked();
      else expect(box, device.name).toBeChecked();
    }
  });

  it("states the consequence of every option beside it, instead of confirming", () => {
    const project = createDefaultProject();
    renderPicker({ project });
    select(projectSpecies);

    const keyboard = coveredDevices(project, projectSpecies).find(
      (d) => d.catalogId === "keyboard",
    )!;
    expect(screen.getByText(presenceNote(keyboard, false))).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", { name: `Take ${keyboard.name}` }),
    );
    expect(screen.getByText(presenceNote(keyboard, true))).toBeInTheDocument();
  });

  it("previews a Device you lack, and says it won't be added when untaken", () => {
    const project = createDefaultProject();
    renderPicker({ project });
    select(deviceSpecies);

    const absent = absentIn(project, deviceSpecies)[0];
    // Nothing a Preset covers is ever unpreviewable (ADR-0012 §4): the pane
    // materialises the Device from its Catalog's Default Selection.
    expect(
      screen.getByRole("img", { name: `${absent.name} Sprite Atlas preview` }),
    ).toBeInTheDocument();

    // Untaking it: the payload now lands nowhere, and the pane keeps drawing it.
    fireEvent.click(
      screen.getByRole("checkbox", { name: `Take ${absent.name}` }),
    );
    expect(
      screen.getByText(`Preview only — ${absent.name} won't be added.`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: `${absent.name} Sprite Atlas preview` }),
    ).toBeInTheDocument();
  });

  it("switches the pane to whichever covered Device you click", () => {
    const project = createDefaultProject();
    renderPicker({ project });
    select(projectSpecies);

    const covered = coveredDevices(project, projectSpecies);
    for (const device of covered) {
      fireEvent.click(screen.getByRole("button", { name: device.name }));
      expect(
        screen.getByRole("img", {
          name: `${device.name} Sprite Atlas preview`,
        }),
      ).toBeInTheDocument();
    }
    expect(covered.length).toBeGreaterThan(1);
  });
});

describe("PresetPicker — applying", () => {
  it("commits the Preset with the Devices the user took", () => {
    const project = createDefaultProject();
    const { dispatch } = renderPicker({ project });
    select(projectSpecies);

    fireEvent.click(screen.getByRole("button", { name: "Apply to Project" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "apply-preset",
      preset: projectSpecies,
      taken: absentIn(project, projectSpecies).map((d) => d.catalogId),
    });
  });

  it("forgets take decisions on apply, so the defaults are read afresh", () => {
    // A Device you just added is present now, where the default is untaken. A
    // surviving tick would re-arm the most destructive option in the picker.
    const project = createDefaultProject();
    const { dispatch, ref } = renderPicker({ project });
    select(deviceSpecies);
    const absent = absentIn(project, deviceSpecies)[0];
    fireEvent.click(
      screen.getByRole("checkbox", { name: `Take ${absent.name}` }),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Apply to / }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ taken: [] }),
    );
    // Reopened — with a mocked dispatch the project is unchanged, so the box is
    // back at its default rather than at what was ticked a moment ago.
    ref.current!.showModal();
    expect(
      screen.getByRole("checkbox", { name: `Take ${absent.name}` }),
    ).toBeChecked();
  });

  it("takes nothing until Apply is pressed", () => {
    const { dispatch } = renderPicker();
    select(deviceSpecies);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Take ${coveredDevices(createDefaultProject(), deviceSpecies)[0].name}`,
      }),
    );

    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("presenceNote", () => {
  const device = {
    catalogId: "xbox",
    name: "Xbox",
    defaultCount: 16,
    customCount: 0,
    present: false,
  };

  it("covers all four presence cases in one sentence each", () => {
    expect(presenceNote(device, true)).toBe(
      "Applying adds Xbox with its 16 default Inputs.",
    );
    expect(presenceNote(device, false)).toBe(
      "Preview only — Xbox won't be added.",
    );
    const mine = { ...device, present: true };
    expect(presenceNote(mine, true)).toBe(
      "Replaces your Xbox selection with the 16 default Inputs.",
    );
    expect(presenceNote(mine, false)).toBe(
      "Your Xbox Inputs are kept; only the style changes.",
    );
  });

  it("promises the custom Inputs back, and only where there are some", () => {
    const mine = { ...device, present: true, customCount: 1 };
    // "Aren't removed", not "are kept": the Glyph tier goes with every other
    // tier, so a custom Input survives the apply but its styling doesn't.
    expect(presenceNote(mine, true)).toBe(
      "Replaces your Xbox selection with the 16 default Inputs. Your custom Inputs aren't removed.",
    );
    expect(presenceNote({ ...mine, customCount: 3 }, true)).toBe(
      "Replaces your Xbox selection with the 16 default Inputs. Your custom Inputs aren't removed.",
    );
    // Untaken keeps everything, so there is nothing to single out.
    expect(presenceNote(mine, false)).toBe(
      "Your Xbox Inputs are kept; only the style changes.",
    );
  });
});

describe("coveredDevices", () => {
  it("calls a Device you have by your name for it", () => {
    const renamed = projectReducer(createDefaultProject(), {
      type: "load-project",
      project: (() => {
        const p = createDefaultProject();
        return { ...p, devices: [{ ...p.devices[0], name: "PC" }] };
      })(),
    });

    const keyboard = coveredDevices(renamed, projectSpecies).find(
      (d) => d.catalogId === "keyboard",
    );
    expect(keyboard).toMatchObject({ name: "PC", present: true });
  });
});
