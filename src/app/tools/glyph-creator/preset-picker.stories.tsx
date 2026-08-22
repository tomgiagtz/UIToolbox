import { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/glyph/types";
import { WithGlyphFont, storyProject } from "@/stories/fixtures";
import { PresetPicker } from "./preset-picker";

/**
 * `PresetPicker` is a `Modal`, so the story owns the trigger the way the editor's
 * menu bar does. The rail's swatches and the pane both draw real canvases off
 * the shipped `PRESETS`, which makes this the closest thing the project has to a
 * visual regression surface for Preset rendering.
 */
function PresetPickerHarness({ project }: { project: Project }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <WithGlyphFont>
      <Button onClick={() => ref.current?.showModal()}>Browse Presets</Button>
      <PresetPicker ref={ref} project={project} dispatch={fn()} />
    </WithGlyphFont>
  );
}

const meta = {
  title: "Editor/PresetPicker",
  component: PresetPickerHarness,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { project: storyProject },
} satisfies Meta<typeof PresetPickerHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A fresh project: the Keyboard Device only, so a Preset covering it opens with
 * that Device taken by default.
 */
export const FreshProject: Story = {};

/**
 * A project whose one Device carries custom Inputs. Taking a Preset replaces
 * that Device's Catalog selection but leaves the custom Inputs alone, and the
 * presence note in the rail says so.
 */
export const WithCustomInputs: Story = {
  args: {
    project: {
      ...storyProject,
      devices: [
        {
          ...storyProject.devices[0],
          custom: [{ id: "custom-jump", label: "Jump" }],
        },
      ],
    },
  },
};
