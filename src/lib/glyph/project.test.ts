import { describe, expect, it } from "vitest";
import { projectReducer, type ProjectAction } from "@/lib/glyph/project";
import { DEFAULT_FONT_FAMILY, createDefaultProject } from "@/lib/glyph/presets";
import type { Project } from "@/lib/glyph/types";

function base(): Project {
  return createDefaultProject("TestFont");
}

describe("createDefaultProject", () => {
  it("seeds the bundled Inter family when no font is given", () => {
    expect(createDefaultProject().font.family).toBe(DEFAULT_FONT_FAMILY);
    expect(DEFAULT_FONT_FAMILY).toBe("Inter");
  });

  it("uses an explicitly provided family", () => {
    expect(createDefaultProject("TestFont").font.family).toBe("TestFont");
  });
});

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

describe("projectReducer — devices (#5)", () => {
  it("adds a Device seeded from a Catalog Preset", () => {
    const next = run(base(), { type: "toggle-device", catalogId: "xbox" });
    expect(next.devices.map((d) => d.name)).toEqual(["Keyboard", "Xbox"]);
    expect(next.devices[1].catalogId).toBe("xbox");
    expect(next.devices[1].enabled).toContain("xbox-a");
    expect(next.devices[1].custom).toEqual([]);
  });

  it("keeps Devices in Catalog order regardless of toggle sequence", () => {
    const next = run(
      base(),
      { type: "toggle-device", catalogId: "playstation" },
      { type: "toggle-device", catalogId: "xbox" },
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
      { type: "toggle-device", catalogId: "xbox" },
      { type: "toggle-device", catalogId: "xbox" },
    );
    expect(next.devices.map((d) => d.name)).toEqual(["Keyboard"]);
  });
});

describe("projectReducer — Catalog Inputs & custom Inputs (#15)", () => {
  it("disables an enabled Catalog Input", () => {
    const next = run(base(), {
      type: "toggle-input",
      deviceIndex: 0,
      inputId: "key-w",
    });
    expect(next.devices[0].enabled).not.toContain("key-w");
  });

  it("re-enables a Catalog Input in Catalog order", () => {
    // key-esc sits before key-w, key-a … in the Catalog, so re-enabling it lands
    // ahead of them rather than at the end.
    const next = run(
      base(),
      { type: "toggle-input", deviceIndex: 0, inputId: "key-esc" },
      { type: "toggle-input", deviceIndex: 0, inputId: "key-esc" },
    );
    const enabled = next.devices[0].enabled;
    expect(enabled).toContain("key-esc");
    expect(enabled.indexOf("key-esc")).toBeLessThan(enabled.indexOf("key-w"));
  });

  it("adds a custom Input with a fresh id", () => {
    const next = run(base(), {
      type: "add-custom-input",
      deviceIndex: 0,
      label: "F5",
    });
    expect(next.devices[0].custom).toEqual([{ id: "custom-1", label: "F5" }]);
  });

  it("gives each custom Input a distinct id", () => {
    const next = run(
      base(),
      { type: "add-custom-input", deviceIndex: 0, label: "F5" },
      { type: "add-custom-input", deviceIndex: 0, label: "F6" },
    );
    expect(next.devices[0].custom.map((c) => c.id)).toEqual([
      "custom-1",
      "custom-2",
    ]);
  });

  it("ignores an empty or whitespace-only custom Input", () => {
    const next = run(
      base(),
      { type: "add-custom-input", deviceIndex: 0, label: "   " },
      { type: "add-custom-input", deviceIndex: 0, label: "" },
    );
    expect(next.devices[0].custom).toEqual([]);
  });

  it("edits a custom Input label in place", () => {
    const next = run(
      base(),
      { type: "add-custom-input", deviceIndex: 0, label: "F5" },
      {
        type: "edit-custom-input",
        deviceIndex: 0,
        id: "custom-1",
        label: "F6",
      },
    );
    expect(next.devices[0].custom).toEqual([{ id: "custom-1", label: "F6" }]);
  });

  it("removes a custom Input by id", () => {
    const next = run(
      base(),
      { type: "add-custom-input", deviceIndex: 0, label: "F5" },
      { type: "remove-custom-input", deviceIndex: 0, id: "custom-1" },
    );
    expect(next.devices[0].custom).toEqual([]);
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
