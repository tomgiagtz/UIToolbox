import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "@/lib/glyph/defaults";
import { projectReducer, type ProjectAction } from "@/lib/glyph/project";
import type { ImageAsset, Project, SymbolSet } from "@/lib/glyph/types";
import { AssetsWindow } from "./assets-window";

const metal: ImageAsset = {
  id: "metal-a1b2.png",
  fileName: "metal.png",
  type: "image/png",
};
const paper: ImageAsset = {
  id: "paper-c3d4.png",
  fileName: "paper.png",
  type: "image/png",
};

/** An imported Set, as `acceptReview` would have produced it. */
const mypad: SymbolSet = {
  id: "set-mypad-x1",
  name: "mypad.svg",
  roleColors: { fill: "#2f9e44", border: "#111111", secondary: "#ffffff" },
  cells: [
    {
      id: "a",
      label: "Jump",
      labelEdited: true,
      col: 0,
      row: 0,
      roles: ["fill"],
      flags: [],
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="128" cy="128" r="90" style="fill:#f00"/></svg>',
    },
    {
      id: "b",
      label: "B",
      labelEdited: false,
      col: 1,
      row: 0,
      roles: ["fill"],
      flags: [],
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="256 0 256 256"><circle cx="384" cy="128" r="90" style="fill:#f00"/></svg>',
    },
  ],
};

function run(project: Project, ...actions: ProjectAction[]): Project {
  return actions.reduce(projectReducer, project);
}

/** A project with both uploads and an Xbox pad to reference them from. */
function base(images: ImageAsset[] = [metal, paper]): Project {
  const project = run(createDefaultProject(), {
    type: "toggle-device",
    catalogId: "xbox",
  });
  return { ...project, images };
}

/**
 * Render the window already open — the editor opens it with `showModal`, which
 * the test setup polyfills, so the harness does the same rather than reaching
 * into content a closed dialog would hide.
 */
function renderWindow({
  project = base(),
  dispatch = vi.fn(),
  onRemoveImages = vi.fn(),
  onUploadImage = vi.fn(async () => metal),
  onUploadFont = vi.fn(async () => ({ family: "UITBFont-1-a" })),
}: {
  project?: Project;
  dispatch?: () => void;
  onRemoveImages?: (ids: string[]) => void;
  onUploadImage?: (file: File) => Promise<ImageAsset>;
  onUploadFont?: (file: File) => Promise<{ family: string }>;
} = {}) {
  function Harness() {
    const ref = useRef<HTMLDialogElement>(null);
    return (
      <>
        <button type="button" onClick={() => ref.current?.showModal()}>
          open
        </button>
        <AssetsWindow
          ref={ref}
          project={project}
          dispatch={dispatch}
          activeDeviceIndex={0}
          onUploadImage={onUploadImage}
          onUploadFont={onUploadFont}
          onRemoveImages={onRemoveImages}
        />
      </>
    );
  }
  render(<Harness />);
  // A closed <dialog> is hidden from the accessibility tree, so role queries
  // would find nothing until the editor opens it.
  fireEvent.click(screen.getByText("open"));
  return { dispatch, onRemoveImages, onUploadImage, onUploadFont };
}

/** The row for one image, by its filename. */
function row(fileName: string): HTMLElement {
  const item = screen
    .getAllByRole("listitem")
    .find((li) => li.textContent?.includes(fileName));
  if (!item) throw new Error(`no row for ${fileName}`);
  return item;
}

describe("AssetsWindow — the Images section (#62)", () => {
  it("lists every upload, and says only whether each is used", () => {
    // Used/Unused and no more: a count of affected Glyphs would mean two
    // different things depending on the tier holding the reference.
    renderWindow();
    expect(row("metal.png")).toHaveTextContent("Unused");
    expect(row("paper.png")).toHaveTextContent("Unused");
  });

  it("reads Used once anything in the cascade names it", () => {
    const project = run(base(), {
      type: "patch-style",
      scope: { tier: "glyph", deviceIndex: 1, glyphId: "xbox-a" },
      patch: {
        foreground: { renderSource: { kind: "image", imageId: metal.id } },
      },
    });
    renderWindow({ project });
    expect(row("metal.png")).toHaveTextContent("Used");
    expect(row("paper.png")).toHaveTextContent("Unused");
  });

  it("takes two presses to remove, and does nothing on the first", async () => {
    const { dispatch, onRemoveImages } = renderWindow();

    await userEvent.click(
      within(row("metal.png")).getByRole("button", { name: /^Remove /i }),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(onRemoveImages).not.toHaveBeenCalled();

    await userEvent.click(
      within(row("metal.png")).getByRole("button", { name: /confirm/i }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "remove-image",
      imageId: metal.id,
    });
    // The reducer drops the manifest row; the bytes are the parent's to forget.
    expect(onRemoveImages).toHaveBeenCalledWith([metal.id]);
  });

  it("disarms a Remove that loses focus, so it cannot be pressed later", async () => {
    const { dispatch } = renderWindow();
    await userEvent.click(
      within(row("metal.png")).getByRole("button", { name: /^Remove /i }),
    );
    await userEvent.click(
      within(row("paper.png")).getByRole("button", { name: /^Remove /i }),
    );

    // The first button is back at rest, so the second press armed the second row
    // rather than removing the first.
    expect(
      within(row("metal.png")).getByRole("button", { name: /^Remove /i }),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("sweeps only the unused, counting them on the button", async () => {
    const project = run(base(), {
      type: "patch-style",
      scope: { tier: "project" },
      patch: { background: { source: { kind: "image", imageId: metal.id } } },
    });
    const { dispatch, onRemoveImages } = renderWindow({ project });

    await userEvent.click(
      screen.getByRole("button", { name: /remove unused \(1\)/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(dispatch).toHaveBeenCalledWith({ type: "sweep-unused-images" });
    expect(onRemoveImages).toHaveBeenCalledWith([paper.id]);
  });

  it("offers no sweep when everything is in use", () => {
    const project = run(
      base(),
      {
        type: "patch-style",
        scope: { tier: "project" },
        patch: { background: { source: { kind: "image", imageId: metal.id } } },
      },
      {
        type: "patch-style",
        scope: { tier: "device", deviceIndex: 1 },
        patch: {
          foreground: { renderSource: { kind: "image", imageId: paper.id } },
        },
      },
    );
    renderWindow({ project });
    expect(
      screen.queryByRole("button", { name: /remove unused/i }),
    ).not.toBeInTheDocument();
  });

  it("says so when the project carries no images", () => {
    renderWindow({ project: base([]) });
    expect(screen.getByText(/no images uploaded yet/i)).toBeInTheDocument();
  });

  it("hands an uploaded file to the editor", async () => {
    const { onUploadImage } = renderWindow();
    const file = new File([new Uint8Array([1])], "new.png", {
      type: "image/png",
    });
    await userEvent.upload(screen.getByLabelText("Upload an image"), file);
    expect(onUploadImage).toHaveBeenCalledWith(file);
  });
});

describe("AssetsWindow — the other Asset kinds (ADR-0014 §3)", () => {
  it("lists bundled families beside uploads, with no way to remove either", async () => {
    renderWindow();
    await userEvent.click(screen.getByRole("tab", { name: "Fonts" }));

    expect(screen.getByText("Inter")).toBeInTheDocument();
    expect(screen.getAllByText("Bundled").length).toBeGreaterThan(0);
    // Removing a font is filed, not built — so the control must not be there.
    expect(
      screen.queryByRole("button", { name: /^Remove /i }),
    ).not.toBeInTheDocument();
  });

  it("takes a font upload", async () => {
    const { onUploadFont } = renderWindow();
    await userEvent.click(screen.getByRole("tab", { name: "Fonts" }));
    const file = new File([new Uint8Array([1])], "Comic.ttf", {
      type: "font/ttf",
    });
    await userEvent.upload(screen.getByLabelText("Upload a font"), file);
    expect(onUploadFont).toHaveBeenCalledWith(file);
  });

  it("offers an import and says the project holds no Sets yet", async () => {
    renderWindow();
    await userEvent.click(screen.getByRole("tab", { name: "Symbol Sets" }));
    expect(screen.getByText(/no sets imported yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/import a symbol set/i)).toBeInTheDocument();
  });

  it("lists an imported Set, its cells, and its preview colours", async () => {
    renderWindow({ project: { ...base(), sets: [mypad] } });
    await userEvent.click(screen.getByRole("tab", { name: "Symbol Sets" }));

    expect(screen.getByText("mypad.svg")).toBeInTheDocument();
    expect(screen.getByText("2 cells")).toBeInTheDocument();
    expect(screen.getByText("Jump")).toBeInTheDocument();
    // The Set's own colours, not the cascade's — this control may never write
    // a style (ADR-0014 §4).
    expect(screen.getByLabelText("fill")).toHaveValue("#2f9e44");
  });

  it("removes a Set behind a confirm, and takes its cells with it", async () => {
    const { dispatch } = renderWindow({
      project: { ...base(), sets: [mypad] },
    });
    await userEvent.click(screen.getByRole("tab", { name: "Symbol Sets" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Remove mypad.svg" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "remove-set",
      setId: mypad.id,
    });
  });

  it("names the cells drawing a colour that is not a Paint Role", async () => {
    const flagged: SymbolSet = {
      ...mypad,
      cells: [
        {
          ...mypad.cells[0],
          flags: [{ shape: "circle", prop: "fill", value: "#fe0000" }],
        },
        mypad.cells[1],
      ],
    };
    renderWindow({ project: { ...base(), sets: [flagged] } });
    await userEvent.click(screen.getByRole("tab", { name: "Symbol Sets" }));
    expect(screen.getByText(/can’t be recoloured: a/i)).toBeInTheDocument();
  });

  it("adds a cell as an Input on the Device the user was looking at", async () => {
    // Importing never creates Inputs (ADR-0015) — a Set is a shipment of art
    // and an Input is a Device's sprite — so this button is how a drawing with
    // no Input to live on gets one, pressed while looking at the art.
    const { dispatch } = renderWindow({
      project: { ...base(), sets: [mypad] },
    });
    await userEvent.click(screen.getByRole("tab", { name: "Symbol Sets" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Add Jump as an Input on/ }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "add-symbol-input",
      deviceIndex: 0,
      label: "Jump",
      symbolId: "a",
    });
  });

  it("won’t add a second Input for a cell the Device already draws", async () => {
    const project = { ...base(), sets: [mypad] };
    const withInput = run(project, {
      type: "add-symbol-input",
      deviceIndex: 0,
      label: "Jump",
      symbolId: "a",
    });
    renderWindow({ project: withInput });
    await userEvent.click(screen.getByRole("tab", { name: "Symbol Sets" }));
    // Nothing links an Input back to its cell but the Symbol it points at, so
    // without this the second press mints a duplicate sprite under a near-
    // identical name and nothing reports it.
    expect(
      screen.getByRole("button", { name: /Add Jump as an Input on/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Add B as an Input on/ }),
    ).toBeEnabled();
  });

  it("shows no per-cell removal: a Set holds what its file draws", async () => {
    renderWindow({ project: { ...base(), sets: [mypad] } });
    await userEvent.click(screen.getByRole("tab", { name: "Symbol Sets" }));
    // The only Remove in the section is the Set's own.
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
  });
});
