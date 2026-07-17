import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import Home from "./page";

const meta = {
  component: Home,
  tags: ["ai-generated"],
} satisfies Meta<typeof Home>;

export default meta;
type Story = StoryObj<typeof meta>;

// The landing page: intro copy plus the tool directory. Each tool card links
// through to its route via a Button-as-Link.
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "UIToolbox" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /open input glyph creator/i }),
    ).toHaveAttribute("href", "/tools/glyph-creator");
  },
};
