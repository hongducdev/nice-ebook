import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiCoverTab } from "./AiCoverTab";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("AiCoverTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders generator engines with Pollinations as default", () => {
    const html = renderToStaticMarkup(
      <AiCoverTab
        bookTitle="Đắc Nhân Tâm"
        author="Dale Carnegie"
        genre="Tâm lý & Kỹ năng"
        description="Nghệ thuật thu phục lòng người"
        activeGateway={null}
        selectedModel="deepseek-chat"
        onApplyCover={vi.fn()}
      />
    );

    expect(html).toContain("Pollinations");
    expect(html).toContain("SiliconFlow");
    expect(html).toContain("OpenAI");
    expect(html).toContain("Miễn Phí");
  });

  it("renders 10 art style presets", () => {
    const html = renderToStaticMarkup(
      <AiCoverTab
        bookTitle="Tiên Kiếm Kỳ Hiệp"
        author="Khuyết Danh"
        genre="Tiên hiệp"
        activeGateway={null}
        selectedModel="deepseek-chat"
        onApplyCover={vi.fn()}
      />
    );

    expect(html).toContain("Sơn Dầu Cổ Điển");
    expect(html).toContain("Tiên Hiệp &amp; Huyền Huyễn");
    expect(html).toContain("Cyberpunk &amp; Viễn Tưởng");
    expect(html).toContain("Anime &amp; Light Novel");
    expect(html).toContain("Thủy Mặc Cổ Phong");
    expect(html).toContain("Trinh Thám &amp; Noir");
    expect(html).toContain("Bìa Da Mạ Vàng Cổ");
    expect(html).toContain("Màu Nước Thơ Mộng");
    expect(html).toContain("Kỳ Ảo Tây Phương");
    expect(html).toContain("Đồ Họa Tối Giản");
  });

  it("renders typography controls and title prefilled from book title", () => {
    const html = renderToStaticMarkup(
      <AiCoverTab
        bookTitle="Hoàng Hôn Sau Khói Lửa"
        author="Nguyễn Văn A"
        genre="Tiểu thuyết"
        activeGateway={null}
        selectedModel="deepseek-chat"
        onApplyCover={vi.fn()}
      />
    );

    expect(html).toContain("Studio gắn chữ");
    expect(html).toContain("Hoàng Hôn Sau Khói Lửa");
    expect(html).toContain("Nguyễn Văn A");
    expect(html).toContain("Dải gradient tối bảo vệ chữ");
    expect(html).toContain("Đổ bóng chữ nổi bật");
  });

  it("renders preview card and create cover button", () => {
    const html = renderToStaticMarkup(
      <AiCoverTab
        bookTitle="Bí Mật Rừng Sâu"
        activeGateway={null}
        selectedModel="deepseek-chat"
        onApplyCover={vi.fn()}
      />
    );

    expect(html).toContain("Xem trước tác phẩm");
    expect(html).toContain("Bắt Đầu Tạo Bìa Sách Ngay");
    expect(html).toContain("Chưa tạo ảnh bìa AI");
  });
});
