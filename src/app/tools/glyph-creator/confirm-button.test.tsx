import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmButton } from "./confirm-button";

describe("ConfirmButton — arm, then act (ADR-0014 §5)", () => {
  it("does nothing on the first press", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Remove" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /confirm/i })).toHaveTextContent(
      "Confirm",
    );
  });

  it("acts on the second, and disarms again", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Remove" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Back at rest, so a third press arms rather than removing again.
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("disarms when focus leaves", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Remove" onConfirm={onConfirm} />);

    const button = screen.getByRole("button", { name: "Remove" });
    await userEvent.click(button);
    fireEvent.blur(button);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("disarms on Esc without letting it close the window", async () => {
    const onEscape = vi.fn();
    render(
      // Esc inside the Assets window would otherwise dismiss the dialog, which
      // is not what disarming a button should do.
      <div onKeyDown={onEscape}>
        <ConfirmButton label="Remove" onConfirm={vi.fn()} />
      </div>,
    );

    const button = screen.getByRole("button", { name: "Remove" });
    await userEvent.click(button);
    fireEvent.keyDown(button, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("takes an accessible name that says more than the visible text", () => {
    render(
      <ConfirmButton
        label="Remove"
        name="Remove metal.png"
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Remove metal.png" }),
    ).toHaveTextContent("Remove");
  });
});
