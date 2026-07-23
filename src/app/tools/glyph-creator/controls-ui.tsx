"use client";

import { useId, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import {
  ColorArea,
  ColorThumb,
  ColorSlider,
  SliderTrack,
  Button,
  Dialog,
  DialogTrigger,
  Popover,
  ColorPicker,
  ColorSwatch,
  ColorField as AriaColorField,
  Input,
  Label,
  parseColor,
  getColorChannels,
  type ColorSpace,
} from "react-aria-components";
import { cn } from "@/lib/utils";

/** Shared Tailwind for text/number/select controls in the editor panels. */
export const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * A circle-arrow button that clears a scoped override so the property falls back
 * up the Style Cascade. Rendered next to a control only when that property is
 * overridden at the current scope (the parent decides), so its presence doubles
 * as the "this is overridden here" cue.
 */
export function ResetButton({
  label,
  onReset,
}: {
  /** Field name, for the accessible label (e.g. "Background fill"). */
  label: string;
  onReset: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onReset}
      aria-label={`Reset ${label} to inherited`}
      title="Reset to inherited"
      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RotateCcw aria-hidden className="size-4" />
    </button>
  );
}

/** A labeled control. The label is wired to the control via a generated id. */
export function Field({
  label,
  children,
  hint,
  onReset,
}: {
  label: string;
  hint?: string;
  /** When set, an overridden-at-this-scope reset button sits to the right. */
  onReset?: () => void;
  /** Receives the id to attach to the underlying control. */
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children(id)}</div>
        {onReset ? <ResetButton label={label} onReset={onReset} /> : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function safeParseColor(value: string) {
  try {
    return parseColor(value);
  } catch {
    return parseColor("#000000");
  }
}

/** A labeled color picker with a small hex readout beside the swatch. */
export function ColorField({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** When set, an overridden-at-this-scope reset button sits to the right. */
  onReset?: () => void;
}) {
  const id = useId();
  const [space, setSpace] = useState<ColorSpace>("hsb");
  return (
    <ColorPicker
      value={safeParseColor(value)}
      onChange={(c) => onChange(c.toString("hexa").toLowerCase())}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {/* Trigger + popover: DialogTrigger wraps EXACTLY the Button and the Popover. */}
          <DialogTrigger>
            <Button className="rounded-md border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ColorSwatch className="block h-9 w-12 rounded-md" />
            </Button>
            <Popover
              placement="bottom start"
              className="rounded-lg border bg-popover p-4 shadow-md outline-none"
            >
              <Dialog className="flex flex-col gap-3 outline-none">
                <ColorArea
                  colorSpace="hsb"
                  xChannel="saturation"
                  yChannel="brightness"
                  className="h-40 w-56 rounded-md"
                >
                  <ColorThumb className="h-4 w-4 rounded-full border-2 border-gray-500 shadow" />
                </ColorArea>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${id}-space`}
                    className="text-sm font-medium"
                  >
                    Color space
                  </label>
                  <select
                    id={`${id}-space`}
                    className={inputClass}
                    value={space}
                    onChange={(e) => setSpace(e.target.value as ColorSpace)}
                  >
                    <option value="rgb">RGB</option>
                    <option value="hsl">HSL</option>
                    <option value="hsb">HSB</option>
                  </select>
                </div>

                <div className="flex w-56 flex-col gap-2">
                  {getColorChannels(space).map((channel) => (
                    <ColorSlider
                      key={channel}
                      colorSpace={space}
                      channel={channel}
                      className="flex flex-col gap-1"
                    >
                      <Label className="text-xs capitalize text-muted-foreground">
                        {channel}
                      </Label>
                      <SliderTrack className="h-6 rounded-md">
                        <ColorThumb className="top-1/2 h-5 w-5 rounded-full border-2 border-gray-500 shadow" />
                      </SliderTrack>
                    </ColorSlider>
                  ))}

                  <ColorSlider channel="alpha" className="flex flex-col gap-1">
                    <Label className="text-xs capitalize text-muted-foreground">
                      Alpha
                    </Label>
                    {/* Checkerboard sits behind the track; React Aria paints the
                        transparent→color gradient on the track itself. */}
                    <div
                      className="rounded-md"
                      style={{
                        background:
                          "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 12px 12px",
                      }}
                    >
                      <SliderTrack className="h-6 rounded-md">
                        <ColorThumb className="top-1/2 h-5 w-5 rounded-full border-2 border-gray-500 shadow" />
                      </SliderTrack>
                    </div>
                  </ColorSlider>
                </div>
              </Dialog>
            </Popover>
          </DialogTrigger>

          {/* Hex readout lives OUTSIDE the trigger so it doesn't hijack the press. */}
          <AriaColorField aria-label={label} className="flex-1">
            <Input id={id} className={cn(inputClass, "w-full font-mono")} />
          </AriaColorField>

          {onReset ? <ResetButton label={label} onReset={onReset} /> : null}
        </div>
      </div>
    </ColorPicker>
  );
}
