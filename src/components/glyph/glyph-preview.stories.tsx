import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GlyphPreview } from "./glyph-preview";
import type { Foreground } from "@/lib/glyph/style";
import type { Background } from "@/lib/glyph/types";
import {
  DEFAULT_SYMBOL_PAINTS,
  DEFAULT_TEXT_COLOR,
  identityTransform,
} from "@/lib/glyph/defaults";

const roundedRect: Background = {
  source: { kind: "shape" },
  transform: identityTransform(),
  shape: "rounded-rect",
  fill: "#1e293b",
  cornerRadius: 18,
  border: { width: 4, color: "#475569" },
};

const foreground: Foreground = {
  transform: identityTransform(),
  textColor: DEFAULT_TEXT_COLOR,
  symbolPaints: DEFAULT_SYMBOL_PAINTS,
};

const meta = {
  title: "Glyph/GlyphPreview",
  component: GlyphPreview,
  parameters: { layout: "centered" },
  args: {
    label: "Space",
    cellSize: 128,
    background: roundedRect,
    foreground,
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
    foreground: { ...foreground, textColor: "#0f172a" },
    background: { ...roundedRect, source: { kind: "none" } },
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

export const CustomColors: Story = {
  args: {
    label: "X",
    foreground: { ...foreground, textColor: "#022c22" },
    background: {
      ...roundedRect,
      fill: "#34d399",
      border: { width: 6, color: "#065f46" },
    },
  },
};
