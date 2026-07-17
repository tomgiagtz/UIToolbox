import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders the UIToolbox heading", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: "UIToolbox" }),
    ).toBeInTheDocument();
  });

  it("links to the Input Glyph Creator tool", () => {
    render(<Home />);
    const link = screen.getByRole("link", { name: /Input Glyph Creator/i });
    expect(link).toHaveAttribute("href", "/tools/glyph-creator");
  });
});
