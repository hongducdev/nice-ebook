import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ChatMessageContent } from "./ChatMessageContent";

describe("ChatMessageContent Component", () => {
  it("renders markdown headings properly", () => {
    const html = renderToString(
      <ChatMessageContent content={"# Heading 1\n\n## Heading 2\n\n### Heading 3"} role="assistant" />
    );

    expect(html).toContain("<h1");
    expect(html).toContain("Heading 1");
    expect(html).toContain("<h2");
    expect(html).toContain("Heading 2");
    expect(html).toContain("<h3");
    expect(html).toContain("Heading 3");
  });

  it("renders bold, italic, and inline code formatting", () => {
    const html = renderToString(
      <ChatMessageContent
        content="Đây là **in đậm**, *in nghiêng*, và `mã code inline`."
        role="assistant"
      />
    );

    expect(html).toContain("<strong");
    expect(html).toContain("in đậm");
    expect(html).toContain("<em");
    expect(html).toContain("in nghiêng");
    expect(html).toContain("<code");
    expect(html).toContain("mã code inline");
  });

  it("renders markdown unordered and ordered lists", () => {
    const html = renderToString(
      <ChatMessageContent
        content={"- Mục thứ nhất\n- Mục thứ hai\n\n1. Bước một\n2. Bước hai"}
        role="assistant"
      />
    );

    expect(html).toContain("<ul");
    expect(html).toContain("Mục thứ nhất");
    expect(html).toContain("Mục thứ hai");
    expect(html).toContain("<ol");
    expect(html).toContain("Bước một");
    expect(html).toContain("Bước hai");
  });

  it("renders markdown tables properly", () => {
    const tableMd = `
| Tên chương | Trạng thái |
|------------|------------|
| Chương 1   | Đã dịch    |
| Chương 2   | Đang chờ   |
`;
    const html = renderToString(
      <ChatMessageContent content={tableMd} role="assistant" />
    );

    expect(html).toContain("<table");
    expect(html).toContain("Tên chương");
    expect(html).toContain("Trạng thái");
    expect(html).toContain("Chương 1");
    expect(html).toContain("Đã dịch");
  });

  it("renders blockquotes with citation styling", () => {
    const html = renderToString(
      <ChatMessageContent content={"> Một cuốn sách hay mở ra cả chân trời mới."} role="assistant" />
    );

    expect(html).toContain("<blockquote");
    expect(html).toContain("Một cuốn sách hay");
  });

  it("renders code blocks with code language badge", () => {
    const codeMd = "```json\n{\n  \"presetId\": \"wuxia-ancient\"\n}\n```";
    const html = renderToString(
      <ChatMessageContent content={codeMd} role="assistant" />
    );

    expect(html).toContain("<pre");
    expect(html).toContain("wuxia-ancient");
    expect(html).toContain("json");
  });

  it("neutralizes dangerous script tags so they never execute", () => {
    const unsafeContent = `
Đây là nội dung văn bản.
<script>alert('xss')</script>
`;
    const html = renderToString(
      <ChatMessageContent content={unsafeContent} role="assistant" />
    );

    // Verify raw executable script tag is never in the DOM
    expect(html).not.toContain("<script>alert('xss')</script>");
  });
});
