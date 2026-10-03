import { describe, it, expect } from "vitest";
import { autoPaginateAndStructureChapterHtml } from "./chapterPaginator";

describe("chapterPaginator", () => {
  it("automatically recognizes book title, author, disclaimer, and chapter and pushes them to separate pages", () => {
    const rawChapterSample = `
<p>Cô Ấ y Chế t Trên QQ</p>
<p>Tác giả: Mã Bá Dung</p>
<p>Tuyên bố  miễn trừ trách nhiệm: Cuố n sách này được Kỳ Thư Võng (www.qinkan.net) sưu tâ\`m và biên tập từ Internet, chỉ dùng cho mục đích giao lưu học hỏi. Bản quyê\`n thuộc vê\` tác giả gố c và nhà xuất bản. Nếu yêu thích tác phẩm, xin hãy ủng hộ bă\`ng cách đăng ký và mua bản quyê\`n chính thức.</p>
<p>Chương 1. Tám giờ mười lăm phút sáng ngày mười bảy tháng sáu, Chủ nhật. Những vũng nước đọng bên đường ở thành phố S phản chiếu những đám mây trắng lững lờ trôi trên bầu trời, cơn mưa phùn kéo dài suốt đêm qua cuối cùng cũng đã tạnh. Không khí sau cơn mưa trong lành và dễ chịu, cả thành phố S</p>
<p>Dưới ánh nắng ban mai, khung cảnh trông thật yên bình và tĩnh lặng.</p>
<p>Tiểu Nặc đeo chéo chiếc ô màu xanh nhạt, sải bước trên phố, miệng ngân nga bài</p>
    `;

    const result = autoPaginateAndStructureChapterHtml(rawChapterSample);

    // 1. Assert title & author recognition
    expect(result.detectedTitle).toBe("Cô Ấy Chết Trên QQ");
    expect(result.detectedAuthor).toBe("Tác giả: Mã Bá Dung");

    // 2. Assert disclaimer detection
    expect(result.hasDisclaimerPage).toBe(true);

    // 3. Assert chapter title extraction
    expect(result.detectedChapterTitle).toBe("Chương 1");

    // 4. Assert page breaks were injected between sections
    expect(result.paginatedHtml).toContain("book-title-page");
    expect(result.paginatedHtml).toContain("book-disclaimer-page");
    expect(result.paginatedHtml).toContain("chapter-content-page");
    expect(result.paginatedHtml).toContain("page-break-divider");
    expect(result.paginatedHtml).toContain("page-break-before: always");
    expect(result.paginatedHtml).toContain("page-break-after: always");

    // 5. Assert Vietnamese diacritics are cleanly healed
    expect(result.paginatedHtml).toContain("Cô Ấy Chết Trên QQ");
    expect(result.paginatedHtml).toContain("Cuốn sách này");
    expect(result.paginatedHtml).toContain("sưu tầm");
    expect(result.paginatedHtml).toContain("bằng cách");
    expect(result.paginatedHtml).toContain("chiếc ô");
  });
});
