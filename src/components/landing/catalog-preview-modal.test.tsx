// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CatalogPreviewModal } from "./catalog-preview-modal";

describe("CatalogPreviewModal (ticket 17)", () => {
  it("shows the card gallery image when open", () => {
    const image = "https://cdn.example.com/style.webp";
    render(
      <CatalogPreviewModal
        image={image}
        title="Modern Warm"
        open
        onClose={() => {}}
      />
    );

    const img = screen.getByTestId("catalog-preview-image");
    expect(img.getAttribute("src")).toBe(image);
    expect(img.getAttribute("alt")).toBe("Modern Warm");
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <CatalogPreviewModal
        image="https://cdn.example.com/style.webp"
        title="Modern Warm"
        open={false}
        onClose={() => {}}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
