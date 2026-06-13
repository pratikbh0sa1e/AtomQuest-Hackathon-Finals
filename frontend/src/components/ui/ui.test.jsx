import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./Button.jsx";
import { Card } from "./Card.jsx";
import { Input } from "./Input.jsx";
import { SectionLabel } from "./SectionLabel.jsx";

describe("Button", () => {
  it("renders primary variant with children", () => {
    render(<Button>Click me</Button>);
    expect(
      screen.getByRole("button", { name: "Click me" }),
    ).toBeInTheDocument();
  });

  it("renders secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button", { name: "Secondary" });
    expect(btn).toBeInTheDocument();
  });

  it("renders ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole("button", { name: "Ghost" })).toBeInTheDocument();
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
  });

  it("has touch-manipulation class for tap targets", () => {
    render(<Button>Tap</Button>);
    expect(screen.getByRole("button", { name: "Tap" }).className).toContain(
      "touch-manipulation",
    );
  });
});

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies accentTop border class when prop is set", () => {
    const { container } = render(<Card accentTop>Content</Card>);
    expect(container.firstChild.className).toContain("border-t-2");
  });

  it("applies hover effect class when hoverEffect prop is set", () => {
    const { container } = render(<Card hoverEffect>Content</Card>);
    expect(container.firstChild.className).toContain("hover:shadow-md");
  });

  it("does not apply accentTop class by default", () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild.className).not.toContain("border-t-2");
  });
});

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("defaults to type text", () => {
    render(<Input placeholder="text" />);
    expect(screen.getByPlaceholderText("text").type).toBe("text");
  });

  it("accepts password type", () => {
    render(<Input type="password" placeholder="pwd" />);
    expect(screen.getByPlaceholderText("pwd").type).toBe("password");
  });

  it("has h-12 class for height", () => {
    render(<Input placeholder="hi" />);
    expect(screen.getByPlaceholderText("hi").className).toContain("h-12");
  });
});

describe("SectionLabel", () => {
  it("renders label text", () => {
    render(<SectionLabel>Active Sessions</SectionLabel>);
    expect(screen.getByText("Active Sessions")).toBeInTheDocument();
  });

  it("renders two horizontal rule spans", () => {
    const { container } = render(<SectionLabel>Label</SectionLabel>);
    const rules = container.querySelectorAll('[aria-hidden="true"]');
    expect(rules).toHaveLength(2);
  });

  it("applies uppercase tracking to label", () => {
    render(<SectionLabel>Track</SectionLabel>);
    const label = screen.getByText("Track");
    expect(label.className).toContain("uppercase");
    expect(label.className).toContain("tracking-widest");
  });
});
