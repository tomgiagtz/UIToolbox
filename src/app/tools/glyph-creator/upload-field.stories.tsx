import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { FONT_ACCEPT, IMAGE_ACCEPT, UploadField } from "./upload-field";

const meta = {
  title: "Editor/UploadField",
  component: UploadField,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { onUpload: fn() },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UploadField>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The two kinds side by side, which is the point of the component: what differs
 * is the `accept` list and a sentence, and the chrome is shared.
 */
export const Image: Story = {
  args: {
    label: "Add an image",
    accept: IMAGE_ACCEPT,
    hint: "PNG, JPEG, WebP, or SVG. Uploads stay in your browser.",
  },
};

export const Font: Story = {
  args: {
    label: "Add a font",
    accept: FONT_ACCEPT,
    hint: "TTF, OTF, WOFF, or WOFF2. Uploads stay in your browser.",
  },
};
