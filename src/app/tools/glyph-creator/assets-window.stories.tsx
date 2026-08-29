import { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/glyph/types";
import { storyImages, storyProject, storySet } from "@/stories/fixtures";
import { AssetsWindow } from "./assets-window";

/**
 * The window owns its own `<dialog>` and the editor opens it with `showModal()`,
 * so the story ships the trigger rather than forcing it open — Esc, the
 * backdrop, and the focus trap only behave as the user meets them on a dialog
 * that was opened that way.
 *
 * Every callback is a spy: uploads resolve without registering bytes and the
 * dispatch never reaches a reducer, so the rows here don't move. The Actions
 * panel is where the effect shows.
 */
function AssetsWindowHarness({ project }: { project: Project }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button onClick={() => ref.current?.showModal()}>Open Assets</Button>
      <AssetsWindow
        ref={ref}
        project={project}
        dispatch={fn()}
        activeDeviceIndex={0}
        onUploadImage={fn(async () => storyImages[0])}
        onUploadFont={fn(async () => ({ family: "UITBFont-1-a" }))}
        onRemoveImages={fn()}
      />
    </>
  );
}

const meta = {
  title: "Editor/AssetsWindow",
  component: AssetsWindowHarness,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { project: storyProject },
} satisfies Meta<typeof AssetsWindowHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A fresh project. Images is empty, Fonts lists the bundled families that ship
 * with the tool and never travel in a save, and Symbol Sets offers an import
 * with nothing yet to list.
 */
export const Empty: Story = {};

/**
 * Two uploads, one of them the Project base's Background tile. That reference is
 * what makes the row read **Used** — and what keeps the sweep from offering it,
 * since the button counts only the unreferenced one.
 */
export const WithImages: Story = {
  args: {
    project: {
      ...storyProject,
      images: storyImages,
      style: {
        ...storyProject.style,
        background: {
          ...storyProject.style.background,
          source: { kind: "image", imageId: storyImages[0].id },
        },
      },
    },
  },
};

/** Nothing references either upload, so the sweep offers to take both at once. */
export const AllUnused: Story = {
  args: { project: { ...storyProject, images: storyImages } },
};

/**
 * A project carrying an imported **Symbol Set** (#39).
 *
 * Its cells are drawn in the Set's own **preview colours**, not the cascade's:
 * authored art is painted in sentinels, which are legible as data and illegible
 * as a drawing. Changing those colours changes how the Set is *looked at* and
 * never what a Glyph draws (ADR-0015 §3).
 *
 * The third cell exports an off-primary red, so it is flagged by id: it will
 * pass through as authored and cannot be recoloured, which is the failure the
 * flag exists to make loud.
 */
export const WithSymbolSet: Story = {
  args: { project: { ...storyProject, sets: [storySet] } },
};
