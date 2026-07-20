import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDeviceFromCatalog } from "@/lib/glyph/presets";
import { getCatalog } from "@/lib/glyph/catalog";
import { DeviceLayout } from "./device-layout";

function keyboardDevice() {
  return createDeviceFromCatalog(getCatalog("keyboard")!);
}

describe("DeviceLayout", () => {
  it("renders a clickable control for every Catalog Input", () => {
    const device = keyboardDevice();
    render(<DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />);
    // Space is enabled by the Preset; a letter like Z is in the Catalog but off.
    expect(screen.getByRole("button", { name: "Space" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Z" })).toBeInTheDocument();
  });

  it("marks enabled Inputs pressed and disabled ones not", () => {
    const device = keyboardDevice();
    render(<DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />);
    // "W" ships enabled in the Keyboard Preset; "Z" does not.
    expect(screen.getByRole("button", { name: "W" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Z" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("dispatches a toggle for the clicked Input", async () => {
    const dispatch = vi.fn();
    const device = keyboardDevice();
    render(<DeviceLayout device={device} deviceIndex={2} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole("button", { name: "Z" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "toggle-input",
      deviceIndex: 2,
      inputId: "key-z",
    });
  });

  it("renders pad nodes over a prototype outline", () => {
    const device = createDeviceFromCatalog(getCatalog("xbox")!);
    const { container } = render(
      <DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />,
    );
    // Every pad button is reachable; e.g. the A face button.
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    // The prototype controller outline is a decorative path behind the nodes.
    expect(container.querySelector("path[data-outline]")).toBeInTheDocument();
  });
});
