import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ColorField, Field, ResetButton, inputClass } from "./controls-ui";

/**
 * The editor's shared control chrome. These three are the de-facto primitives
 * layer beside `Button` (ADR-0013), so they live under `UI/` rather than with
 * the Glyph Creator's own panels.
 */
const meta = {
  title: "UI/Controls",
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The reset affordance. It appears beside a control only when that property is
 * overridden at the current scope, so its presence *is* the "overridden here"
 * cue — worth being able to look at on its own.
 */
export const Reset: Story = {
  render: () => <ResetButton label="Background fill" onReset={fn()} />,
};

export const LabeledField: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-6">
      <Field label="Sprite-Name template">
        {(id) => (
          <input
            id={id}
            className={inputClass}
            defaultValue="{device}_{input}"
          />
        )}
      </Field>
      <Field label="Cell size (px)" hint="Applies to the whole project.">
        {(id) => (
          <select id={id} className={inputClass} defaultValue="128">
            <option>64</option>
            <option>128</option>
            <option>256</option>
          </select>
        )}
      </Field>
      <Field label="Corner radius" onReset={fn()}>
        {(id) => (
          <input
            id={id}
            type="number"
            className={inputClass}
            defaultValue={16}
          />
        )}
      </Field>
    </div>
  ),
};

/** Stateful, so the swatch and the hex readout track what the picker does. */
function ColorFieldHarness({
  initial,
  onReset,
}: {
  initial: string;
  onReset?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-72">
      <ColorField
        label="Background fill"
        value={value}
        onChange={setValue}
        onReset={onReset}
      />
    </div>
  );
}

/**
 * Open the swatch for the popover: a saturation/brightness area, an RGB/HSL/HSB
 * switch that re-channels the sliders under it, and an alpha track over a
 * checkerboard. None of that is reachable from a static screenshot.
 */
export const Color: Story = {
  render: () => <ColorFieldHarness initial="#7c3aed" />,
};

export const ColorOverridden: Story = {
  render: () => <ColorFieldHarness initial="#34d399" onReset={fn()} />,
};

/** A partly transparent value, so the alpha track has something to show. */
export const ColorWithAlpha: Story = {
  render: () => <ColorFieldHarness initial="#7c3aed80" />,
};
