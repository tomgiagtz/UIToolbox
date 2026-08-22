import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ImageUploadField } from "./image-upload-field";

const meta = {
  title: "Editor/ImageUploadField",
  component: ImageUploadField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    label: "Custom image",
    hint: "Drawn in place of this Glyph's label.",
    onUpload: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageUploadField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RenderSource: Story = {};

/** The Background's tile art — the other place an upload can start (#22). */
export const BackgroundTile: Story = {
  args: {
    label: "Tile image",
    hint: "Tiled across the Background instead of a flat fill.",
  },
};
