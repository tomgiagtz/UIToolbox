import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportDialog, type ExportSelection } from "./export-dialog";
import { createDefaultProject } from "@/lib/glyph/presets";
import { projectReducer } from "@/lib/glyph/project";
import type { Project } from "@/lib/glyph/types";

/** Keyboard (the default Device) plus the Xbox pad, so selection has choices. */
function twoDeviceProject(): Project {
  return [{ type: "toggle-device", catalogId: "xbox" } as const].reduce(
    projectReducer,
    createDefaultProject(),
  );
}

function renderDialog({
  project = twoDeviceProject(),
  dispatch = vi.fn(),
  onExport = vi.fn(),
  exporting = false,
}: {
  project?: Project;
  dispatch?: () => void;
  onExport?: (selection: ExportSelection) => void;
  exporting?: boolean;
} = {}) {
  const ref = createRef<HTMLDialogElement>();
  const props = {
    ref,
    project,
    dispatch,
    activeIndex: 0,
    exporting,
    onExport,
  };
  const { rerender } = render(<ExportDialog {...props} />);
  // The parent opens it; a closed <dialog> is hidden from the a11y tree.
  ref.current!.showModal();
  return {
    ref,
    dispatch,
    onExport,
    /** Re-render as the parent would after the user edited the Device list. */
    withProject: (next: Project) =>
      rerender(<ExportDialog {...props} project={next} />),
  };
}

const exportButton = () => screen.getByRole("button", { name: "Export" });

describe("ExportDialog — selection", () => {
  it("offers every Device and both file types, all selected", () => {
    renderDialog();

    for (const name of ["Keyboard", "Xbox"]) {
      expect(screen.getByRole("checkbox", { name })).toBeChecked();
    }
    expect(
      screen.getByRole("checkbox", { name: /Sprite Atlas/ }),
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Metadata/ })).toBeChecked();
    expect(exportButton()).toBeEnabled();
  });

  it("exports only the checked Devices and file types", () => {
    const { onExport } = renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: "Keyboard" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Metadata/ }));
    fireEvent.click(exportButton());

    expect(onExport).toHaveBeenCalledWith({
      devices: [1],
      png: true,
      json: false,
    } satisfies ExportSelection);
  });

  it("blocks an export with no Device selected", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: "Keyboard" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Xbox" }));

    expect(exportButton()).toBeDisabled();
  });

  it("blocks an export with no file type selected", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: /Sprite Atlas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Metadata/ }));

    expect(exportButton()).toBeDisabled();
  });

  it("re-selects every Device when the project's Devices change", () => {
    const { withProject } = renderDialog({
      project: createDefaultProject(),
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Keyboard" }));
    expect(
      screen.getByRole("checkbox", { name: "Keyboard" }),
    ).not.toBeChecked();

    // A Device added after the dialog mounted must not arrive unselected —
    // stale indices would export the wrong pad entirely.
    withProject(twoDeviceProject());
    expect(screen.getByRole("checkbox", { name: "Keyboard" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Xbox" })).toBeChecked();
  });
});

describe("ExportDialog — naming", () => {
  it("hosts the naming controls, so names are settled at export time", () => {
    const { dispatch } = renderDialog();

    const template = screen.getByLabelText("Sprite-Name template");
    fireEvent.change(template, { target: { value: "{input}" } });

    expect(dispatch).toHaveBeenCalledWith({
      type: "set-naming-template",
      template: "{input}",
    });
    expect(screen.getByLabelText("Output-filename template")).toBeVisible();
    expect(screen.getByRole("radio", { name: "kebab-case" })).toBeVisible();
  });
});
