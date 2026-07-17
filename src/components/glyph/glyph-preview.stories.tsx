import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GlyphPreview } from "./glyph-preview";
import type { Background } from "@/lib/glyph/types";

const roundedRect: Background = {
  shape: "rounded-rect",
  fill: "#1e293b",
  cornerRadius: 18,
  border: { width: 4, color: "#475569" },
};

const meta = {
  title: "Glyph/GlyphPreview",
  component: GlyphPreview,
  parameters: { layout: "centered" },
  args: {
    label: "Space",
    cellSize: 128,
    textColor: "#f8fafc",
    background: roundedRect,
    fontFamily: "sans-serif",
  },
} satisfies Meta<typeof GlyphPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RoundedRect: Story = {};

export const Square: Story = {
  args: {
    label: "A",
    background: { ...roundedRect, shape: "square" },
  },
};

export const Circle: Story = {
  args: {
    label: "B",
    background: { ...roundedRect, shape: "circle" },
  },
};

export const NoBackground: Story = {
  args: {
    label: "→",
    textColor: "#0f172a",
    background: { ...roundedRect, shape: "none" },
  },
};

export const ThickBorder: Story = {
  args: {
    label: "Ctrl",
    background: {
      ...roundedRect,
      fill: "#7c3aed",
      border: { width: 10, color: "#facc15" },
    },
  },
};

export const LongLabelAutoShrinks: Story = {
  args: { label: "Right Stick" },
};
