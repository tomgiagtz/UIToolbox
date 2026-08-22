import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { TransformOverride } from "@/lib/glyph/style";
import type { LayerTransform } from "@/lib/glyph/types";
import { identityTransform } from "@/lib/glyph/defaults";
import { TransformField } from "./transform-field";

/**
 * `TransformField` is controlled, so a bare story would render sliders that
 * don't move. This holds the transform and applies the sparse patches the
 * component emits.
 */
function TransformHarness({
  initial,
  ...props
}: {
  initial: LayerTransform;
  label: string;
  hint?: string;
  onResetRotation?: () => void;
  onResetScale?: () => void;
}) {
  const [transform, setTransform] = useState(initial);
  const onChange = (patch: TransformOverride) =>
    setTransform((prev) => ({
      rotation: patch.rotation ?? prev.rotation,
      scale: { ...prev.scale, ...patch.scale },
    }));
  return (
    <div className="w-80">
      <TransformField {...props} transform={transform} onChange={onChange} />
    </div>
  );
}

const meta = {
  title: "Editor/TransformField",
  component: TransformHarness,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    label: "Background transform",
    initial: identityTransform(),
  },
} satisfies Meta<typeof TransformHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Identity: Story = {};

/**
 * A seeded mirror opens with the axes **unlinked**, because a linked drag
 * through `x: -1, y: 1` would silently un-mirror the layer.
 */
export const SeededMirror: Story = {
  args: { initial: { rotation: 0, scale: { x: -1, y: 1 } } },
};

/** Rotation and scale each carry their own reset, since each is its own control. */
export const Overridden: Story = {
  args: {
    label: "Foreground transform",
    hint: "Applies to the label or Symbol drawn in the cell.",
    initial: { rotation: 45, scale: { x: 0.75, y: 0.75 } },
    onResetRotation: fn(),
    onResetScale: fn(),
  },
};
