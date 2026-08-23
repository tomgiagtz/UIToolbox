import { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/glyph/types";
import { storyImages, storyProject } from "@/stories/fixtures";
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
 * with the tool and never travel in a save, and Symbol Sets stands as the home
 * ADR-0007 §5 asked for with nothing in it yet.
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
