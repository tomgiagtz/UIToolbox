import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppBar } from "./app-bar";

const meta = {
  title: "UI/AppBar",
  component: AppBar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    left: <span className="font-heading text-lg">UIToolbox</span>,
  },
} satisfies Meta<typeof AppBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LeftOnly: Story = {};

export const WithCenterTitle: Story = {
  args: { center: <span className="text-sm font-medium">Glyph Creator</span> },
};

/**
 * The center stays centered on the bar, not on the space the left content
 * leaves — which is the whole reason it is absolutely positioned.
 */
export const WideLeftContent: Story = {
  args: {
    left: (
      <span className="font-heading text-lg">
        ← Back to a tool with a long name
      </span>
    ),
    center: <span className="text-sm font-medium">Glyph Creator</span>,
  },
};
