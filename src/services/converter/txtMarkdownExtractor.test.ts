import { describe, it, expect } from "vitest";
import { parseTxtOrMarkdown } from "./txtMarkdownExtractor";

describe("txtMarkdownExtractor", () => {
  it("parses YAML frontmatter if present", () => {
    const raw = `---
title: Tiên Nghịch
author: Nhĩ Căn
description: Hành trình tu tiên nghịch mệnh của Vương Lâm.
---

Chương 1: Thiếu niên sơn thôn
Vương Lâm ngẩng đầu nhìn đỉnh núi mây mù.

Chương 2: Tứ thúc tiến cử
Gia tộc tụ họp.
`;

    const doc = parseTxtOrMarkdown(raw, "tien-nghich.md");
    expect(doc.title).toBe("Tiên Nghịch");
    expect(doc.author).toBe("Nhĩ Căn");
    expect(doc.description).toBe("Hành trình tu tiên nghịch mệnh của Vương Lâm.");
    expect(doc.language).toBe("vi");
    expect(doc.chapters.length).toBe(2);
    expect(doc.chapters[0].title).toBe("Chương 1: Thiếu niên sơn thôn");
  });

  it("extracts title and author from top conventions if frontmatter is absent", () => {
    const raw = `Tên truyện: Phàm Nhân Tu Tiên
Tác giả: Vong Ngữ

Chương 1: Thất Huyền Môn
Hàn Lập tiến vào Thất Huyền Môn.
`;

    const doc = parseTxtOrMarkdown(raw, "sample.txt");
    expect(doc.title).toBe("Phàm Nhân Tu Tiên");
    expect(doc.author).toBe("Vong Ngữ");
    expect(doc.chapters.length).toBe(1);
    expect(doc.chapters[0].title).toBe("Chương 1: Thất Huyền Môn");
  });
});
