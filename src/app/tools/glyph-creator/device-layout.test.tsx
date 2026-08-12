import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDeviceFromCatalog } from "@/lib/glyph/defaults";
import { getCatalog } from "@/lib/glyph/catalog";
import { DeviceLayout } from "./device-layout";

function keyboardDevice() {
  return createDeviceFromCatalog(getCatalog("keyboard")!);
}

describe("DeviceLayout", () => {
  it("renders a clickable control for every Catalog Input", () => {
    const device = keyboardDevice();
    render(<DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />);
    // Space is in the Default Selection; a letter like Z is in the Catalog but off.
    expect(screen.getByRole("button", { name: "Space" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Z" })).toBeInTheDocument();
  });

  it("marks enabled Inputs pressed and disabled ones not", () => {
    const device = keyboardDevice();
    render(<DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />);
    // "W" ships in the Keyboard's Default Selection; "Z" does not.
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
    render(
      <DeviceLayout device={device} deviceIndex={2} dispatch={dispatch} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Z" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "toggle-input",
      deviceIndex: 2,
      inputId: "key-z",
    });
  });

  it("draws the mouse as a mouse, not as three more keycaps", () => {
    const device = keyboardDevice();
    render(<DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />);
    // Every mouse Input is a node on the nested mouse schematic — including the
    // blank body and the two side buttons, which the keycap row never had.
    for (const name of ["Mouse", "LMB", "RMB", "MMB", "Mouse 4", "Mouse 5"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    // And they hang off a schematic of their own, not the keycap board.
    expect(
      screen.getByRole("group", { name: "Mouse buttons" }),
    ).toBeInTheDocument();
  });

  it("dispatches a toggle for a clicked mouse button", async () => {
    const dispatch = vi.fn();
    const device = keyboardDevice();
    render(
      <DeviceLayout device={device} deviceIndex={1} dispatch={dispatch} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mouse 4" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "toggle-input",
      deviceIndex: 1,
      inputId: "mouse-4",
    });
  });

  it("draws nothing inside a mouse node, whose Symbol depicts the whole mouse", () => {
    const device = keyboardDevice();
    render(<DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />);
    // Same argument as the d-pad: every mouse Symbol draws the whole silhouette
    // and emphasises one part, so nesting one inside a button would put a mouse
    // inside a mouse. The node's position on the schematic already says which.
    const lmb = screen.getByRole("button", { name: "LMB" });
    expect(lmb.querySelector("svg")).not.toBeInTheDocument();
    expect(lmb.querySelector("text")).not.toBeInTheDocument();
  });

  it("renders clickable pad buttons over a decoration layer", () => {
    const device = createDeviceFromCatalog(getCatalog("xbox")!);
    const { container } = render(
      <DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />,
    );
    // Every pad button is reachable; e.g. the A face button.
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    // The outline + any backers render as a non-interactive layer behind them.
    expect(container.querySelector("[data-decoration]")).toBeInTheDocument();
  });

  it("draws a pad Input's real Symbol in place of the label placeholder", () => {
    const device = createDeviceFromCatalog(getCatalog("xbox")!);
    const { container } = render(
      <DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />,
    );
    // The A button has a Symbol (xbox-a), so it embeds a nested <svg> whose
    // sentinels have been recoloured to currentColor — no bare-label glyph.
    const a = screen.getByRole("button", { name: "A" });
    const symbol = a.querySelector("svg");
    expect(symbol).toBeInTheDocument();
    expect(symbol?.innerHTML).toContain("currentColor");
    // The decoration layer is the only other <svg>; the button's own text
    // placeholder is gone now that a Symbol renders.
    expect(a.querySelector("text")).not.toBeInTheDocument();
    // The whole diagram still carries currentColor'd symbol art.
    expect(container.innerHTML).toContain("currentColor");
  });

  it("draws nothing inside a d-pad arm, whose Symbol depicts the whole cluster", () => {
    const device = createDeviceFromCatalog(getCatalog("xbox")!);
    render(<DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />);
    // `dpad-up` art draws all four arms; nesting it in one arm would show a
    // whole d-pad inside a quarter of itself. The Layout's own geometry already
    // says "up", so the node stays a bare shape — no Symbol, no label.
    const up = screen.getByRole("button", { name: "D-Pad Up" });
    expect(up.querySelector("svg")).not.toBeInTheDocument();
    expect(up.querySelector("text")).not.toBeInTheDocument();
  });

  it("falls back to a label placeholder on authored-path nodes with no Symbol", () => {
    const device = createDeviceFromCatalog(getCatalog("xbox")!);
    render(<DeviceLayout device={device} deviceIndex={0} dispatch={vi.fn()} />);
    // LB is an arbitrary <path>, and uses an Authored Background rather than a
    // Symbol — so it shows its short label. It rendered blank before its shape
    // could report a centre.
    const lb = screen.getByRole("button", { name: "LB" });
    expect(lb.querySelector("svg")).not.toBeInTheDocument();
    expect(lb.querySelector("text")).toHaveTextContent("LB");
  });
});
