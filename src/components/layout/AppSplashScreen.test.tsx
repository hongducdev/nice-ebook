import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppSplashScreen } from "./AppSplashScreen";

describe("AppSplashScreen", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("renders brand name, logo and step message during loading", () => {
    const html = renderToStaticMarkup(
      <AppSplashScreen
        isLoading={true}
        stepMessage="Khởi tạo môi trường Studio..."
        progressPercent={45}
      />
    );

    expect(html).toContain("NiceEbook Studio");
    expect(html).toContain("v0.1.0");
    expect(html).toContain("Khởi tạo môi trường Studio...");
    expect(html).toContain("45%");
    expect(html).toContain("width:45%");
  });

  it("renders null (unmounted) when initialized with isLoading=false", () => {
    const html = renderToStaticMarkup(
      <AppSplashScreen
        isLoading={false}
        stepMessage="Hoàn tất"
        progressPercent={100}
      />
    );

    expect(html).toBe("");
  });

  it("clamps progress percentages below 0 and above 100", () => {
    const htmlBelow = renderToStaticMarkup(
      <AppSplashScreen isLoading={true} progressPercent={-20} />
    );
    expect(htmlBelow).toContain("0%");
    expect(htmlBelow).toContain("width:0%");

    const htmlAbove = renderToStaticMarkup(
      <AppSplashScreen isLoading={true} progressPercent={150} />
    );
    expect(htmlAbove).toContain("100%");
    expect(htmlAbove).toContain("width:100%");
  });
});
