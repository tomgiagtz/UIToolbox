import { describe, expect, it } from "vitest";
import { projectReducer, type ProjectAction } from "@/lib/glyph/project";
import { createDefaultProject } from "@/lib/glyph/presets";
import type { Project } from "@/lib/glyph/types";

function base(): Project {
  return createDefaultProject("TestFont");
}

function run(project: Project, ...actions: ProjectAction[]): Project {
  return actions.reduce(projectReducer, project);
}

describe("projectReducer — style (#4)", () => {
  it("sets the text color", () => {
    const next = run(base(), { type: "set-text-color", color: "#ff0000" });
    expect(next.textColor).toBe("#ff0000");
  });

  it("sets the cell size", () => {
    const next = run(base(), { type: "set-cell-size", size: 256 });
    expect(next.cellSize).toBe(256);
  });

  it("sets the Background shape without dropping other fields", () => {
    const next = run(base(), { type: "set-bg-shape", shape: "circle" });
    expect(next.background.shape).toBe("circle");
    expect(next.background.fill).toBe(base().background.fill);
  });

  it("sets fill, corner radius, and border", () => {
    const next = run(
      base(),
      { type: "set-bg-fill", fill: "#123456" },
      { type: "set-bg-corner-radius", radius: 30 },
      { type: "set-bg-border-width", width: 8 },
      { type: "set-bg-border-color", color: "#abcdef" },
    );
    expect(next.background.fill).toBe("#123456");
    expect(next.background.cornerRadius).toBe(30);
    expect(next.background.border).toEqual({ width: 8, color: "#abcdef" });
  });

  it("does not mutate the previous project (immutability)", () => {
    const prev = base();
    const snapshot = JSON.parse(JSON.stringify(prev));
    projectReducer(prev, { type: "set-bg-fill", fill: "#000000" });
    expect(prev).toEqual(snapshot);
  });
});

describe("projectReducer — devices & inputs (#5)", () => {
  it("adds a Device seeded from a Preset", () => {
    const next = run(base(), { type: "toggle-device", presetId: "xbox" });
    expect(next.devices.map((d) => d.name)).toEqual(["Keyboard", "Xbox"]);
    expect(next.devices[1].inputs).toContain("A");
  });

  it("keeps Devices in Preset order regardless of toggle sequence", () => {
    const next = run(
      base(),
      { type: "toggle-device", presetId: "playstation" },
      { type: "toggle-device", presetId: "xbox" },
    );
    expect(next.devices.map((d) => d.name)).toEqual([
      "Keyboard",
      "Xbox",
      "PlayStation",
    ]);
  });

  it("removes a Device when toggled off", () => {
    const next = run(
      base(),
      { type: "toggle-device", presetId: "xbox" },
      { type: "toggle-device", presetId: "xbox" },
    );
    expect(next.devices.map((d) => d.name)).toEqual(["Keyboard"]);
  });

  it("adds an Input to a Device", () => {
    const next = run(base(), {
      type: "add-input",
      deviceIndex: 0,
      label: "F5",
    });
    expect(next.devices[0].inputs.at(-1)).toBe("F5");
  });

  it("ignores an empty or whitespace-only added Input", () => {
    const next = run(
      base(),
      { type: "add-input", deviceIndex: 0, label: "   " },
      { type: "add-input", deviceIndex: 0, label: "" },
    );
    expect(next.devices[0].inputs).toEqual(base().devices[0].inputs);
  });

  it("edits an Input label in place", () => {
    const next = run(base(), {
      type: "edit-input",
      deviceIndex: 0,
      inputIndex: 0,
      label: "W-edited",
    });
    expect(next.devices[0].inputs[0]).toBe("W-edited");
  });

  it("removes an Input", () => {
    const before = base().devices[0].inputs.length;
    const next = run(base(), {
      type: "remove-input",
      deviceIndex: 0,
      inputIndex: 0,
    });
    expect(next.devices[0].inputs.length).toBe(before - 1);
    expect(next.devices[0].inputs[0]).toBe("A");
  });
});

describe("projectReducer — naming (#6)", () => {
  it("sets the Sprite-Name template", () => {
    const next = run(base(), {
      type: "set-naming-template",
      template: "btn_{input}",
    });
    expect(next.naming.template).toBe("btn_{input}");
  });

  it("sets the case style", () => {
    const next = run(base(), { type: "set-naming-case", case: "kebab" });
    expect(next.naming.case).toBe("kebab");
  });

  it("sets the output-filename template", () => {
    const next = run(base(), {
      type: "set-filename-template",
      template: "atlas_{device}",
    });
    expect(next.filenameTemplate).toBe("atlas_{device}");
  });
});

describe("projectReducer — font", () => {
  it("updates the registered font family", () => {
    const next = run(base(), { type: "set-font", family: "NewFamily" });
    expect(next.font.family).toBe("NewFamily");
  });
});
