import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { storyProject } from "@/stories/fixtures";
import { CellSizeField } from "./cell-size-field";

const meta = {
  title: "Editor/CellSizeField",
  component: CellSizeField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  args: { project: storyProject, dispatch: fn() },
} satisfies Meta<typeof CellSizeField>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The dispatch is a spy, so changing the select shows the `set-cell-size` action
 * in the Actions panel rather than moving the control — the value is the
 * project's, and this story has no reducer behind it.
 */
export const Default: Story = {};

export const LargestCell: Story = {
  args: {
    project: {
      ...storyProject,
      exportSettings: { ...storyProject.exportSettings, cellSize: 256 },
    },
  },
};
