import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanSearchQuery, BookMetadataService, normalizeAuthor } from "./bookMetadataService";

describe("normalizeAuthor", () => {
  it("normalizes string authors", () => {
    expect(normalizeAuthor("Keigo Higashino")).toBe("Keigo Higashino");
    expect(normalizeAuthor("  Higashino Keigo  ")).toBe("Higashino Keigo");
  });

  it("normalizes array of strings", () => {
    expect(normalizeAuthor(["Dale Carnegie", "J.K. Rowling"])).toBe("Dale Carnegie, J.K. Rowling");
  });

  it("normalizes Fable-style array of author objects without returning [object Object]", () => {
    const fableAuthors = [
      { name: "Keigo Higashino", biography: "Japanese author", slug: "keigo-higashino" },
    ];
    expect(normalizeAuthor(fableAuthors)).toBe("Keigo Higashino");
  });

  it("normalizes Goodreads-style author object", () => {
    expect(normalizeAuthor({ name: "Keigo Higashino", id: 117366 })).toBe("Keigo Higashino");
  });

  it("filters out literal [object Object] and falls back to Khuyết Danh", () => {
    expect(normalizeAuthor("[object Object]")).toBe("Khuyết Danh");
    expect(normalizeAuthor(null)).toBe("Khuyết Danh");
    expect(normalizeAuthor(undefined)).toBe("Khuyết Danh");
    expect(normalizeAuthor("")).toBe("Khuyết Danh");
  });
});

describe("cleanSearchQuery", () => {
  it("removes .epub and other file extensions", () => {
    expect(cleanSearchQuery("Mat_Biec.epub")).toBe("Mat Biec");
    expect(cleanSearchQuery("dac_nhan_tam.pdf")).toBe("dac nhan tam");
  });

  it("strips common ebook site watermark tags in brackets and parentheses", () => {
    expect(cleanSearchQuery("[dtv-ebook.com] Dac Nhan Tam (Full).epub")).toBe("Dac Nhan Tam");
    expect(cleanSearchQuery("[sachvui.com] So Do - Vu Trong Phung.epub")).toBe("So Do Vu Trong Phung");
    expect(cleanSearchQuery("[tve-4u.org] Harry Potter 1 (Dich).mobi")).toBe("Harry Potter 1");
  });

  it("strips leading chapter or track numbers", () => {
    expect(cleanSearchQuery("01. Tuoi Tho Du Doi.epub")).toBe("Tuoi Tho Du Doi");
    expect(cleanSearchQuery("Chương 1 - De Men Phieu Luu Ky")).toBe("De Men Phieu Luu Ky");
  });

  it("handles empty or whitespace strings gracefully", () => {
    expect(cleanSearchQuery("")).toBe("");
    expect(cleanSearchQuery("   ")).toBe("");
  });
});

describe("BookMetadataService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses Google Books API volume items correctly", async () => {
    const mockGoogleResponse = {
      items: [
        {
          id: "test-id-1",
          volumeInfo: {
            title: "Đắc Nhân Tâm",
            authors: ["Dale Carnegie"],
            publisher: "NXB Tổng Hợp TP.HCM",
            publishedDate: "2020-01-01",
            description: "Nghệ thuật thu phục lòng người.",
            categories: ["Tâm lý", "Kỹ năng sống"],
            language: "vi",
            industryIdentifiers: [
              { type: "ISBN_13", identifier: "9786045890123" }
            ],
            imageLinks: {
              thumbnail: "http://books.google.com/books/thumbnail.jpg?id=1&zoom=1&edge=curl",
              large: "http://books.google.com/books/large.jpg?id=1&zoom=3&edge=curl",
            },
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGoogleResponse,
    } as Response);

    const results = await BookMetadataService.searchGoogleBooks("Đắc Nhân Tâm");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Đắc Nhân Tâm");
    expect(results[0].author).toBe("Dale Carnegie");
    expect(results[0].publisher).toBe("NXB Tổng Hợp TP.HCM");
    expect(results[0].publishedYear).toBe("2020");
    expect(results[0].isbn).toBe("9786045890123");
    expect(results[0].coverUrl).toContain("https://");
    expect(results[0].coverUrl).not.toContain("&edge=curl");
    expect(results[0].coverOptions.length).toBeGreaterThan(0);
  });

  it("parses Open Library API docs correctly", async () => {
    const mockOlResponse = {
      docs: [
        {
          key: "/works/OL123W",
          title: "The Great Gatsby",
          author_name: ["F. Scott Fitzgerald"],
          first_publish_year: 1925,
          publisher: ["Scribner"],
          language: ["eng"],
          cover_i: 10524474,
          isbn: ["9780743273565"],
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockOlResponse,
    } as Response);

    const results = await BookMetadataService.searchOpenLibrary("The Great Gatsby");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("The Great Gatsby");
    expect(results[0].author).toBe("F. Scott Fitzgerald");
    expect(results[0].publishedYear).toBe("1925");
    expect(results[0].coverUrl).toBe("https://covers.openlibrary.org/b/id/10524474-L.jpg");
  });

  it("parses Wattpad API stories correctly with 1024px high-res covers", async () => {
    const mockWattpadResponse = {
      stories: [
        {
          id: "123456",
          title: "Hôn Trộm 55 Lần",
          description: "Văn án: Câu chuyện tình yêu đầy trắc trở.",
          user: { fullname: "Diệp Phi Dạ", name: "diepphida" },
          createDate: "2018-05-01T00:00:00Z",
          completed: true,
          tags: "ngontinh tongtai sung",
          cover: "https://img.wattpad.com/cover/123456-256-k123.jpg",
          language: { name: "Vietnamese" },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockWattpadResponse,
    } as Response);

    const results = await BookMetadataService.searchWattpad("Hôn Trộm 55 Lần");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Hôn Trộm 55 Lần");
    expect(results[0].author).toBe("Diệp Phi Dạ");
    expect(results[0].source).toBe("wattpad");
    expect(results[0].publisher).toContain("Wattpad (Hoàn thành)");
    expect(results[0].coverUrl).toBe("https://img.wattpad.com/cover/123456-1024-k123.jpg");
    expect(results[0].coverOptions).toHaveLength(3);
    expect(results[0].categories).toContain("ngontinh");
  });

  it("parses Goodreads response correctly with stripped high-res cover", async () => {
    const mockGrResponse = [
      {
        bookId: "252138809",
        title: "Án mạng bạn cùng lớp",
        author: { name: "Keigo Higashino" },
        avgRating: "3.49",
        description: { html: "<p>Án mạng bạn cùng lớp là một cuốn tiểu thuyết trinh thám...</p>" },
        imageUrl: "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1778596306i/252138809._SY75_.jpg",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGrResponse,
    } as Response);

    const results = await BookMetadataService.searchGoodreads("Án Mạng Bạn Cùng Lớp");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Án mạng bạn cùng lớp");
    expect(results[0].author).toBe("Keigo Higashino");
    expect(results[0].source).toBe("goodreads");
    expect(results[0].description).toBe("Án mạng bạn cùng lớp là một cuốn tiểu thuyết trinh thám...");
    expect(results[0].coverUrl).toBe("https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1778596306i/252138809.jpg");
  });

  it("parses Fable API response correctly and extracts author name from object array", async () => {
    const mockFableResponse = {
      response: {
        books: [
          {
            id: "fb-1",
            title: "Nghịch lý 13",
            authors: [
              {
                name: "Keigo Higashino",
                biography: "Japanese author",
                slug: "keigo-higashino",
              },
            ],
            cover_image: "https://cdn.fable.co/covers/123.jpg",
            cover_image_small: "https://img.fablecdn.net/images/123.jpg",
            description: "13 giờ 13 phút 13 giây...",
            published_date: "2009-01-01",
            isbn: "9781234567890",
          },
        ],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockFableResponse,
    } as Response);

    const results = await BookMetadataService.searchFable("Nghịch lý 13");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Nghịch lý 13");
    // Author MUST be a clean string, never "[object Object]"
    expect(results[0].author).toBe("Keigo Higashino");
    expect(results[0].author).not.toBe("[object Object]");
    expect(results[0].source).toBe("fable");
    expect(results[0].isbn).toBe("9781234567890");
    expect(results[0].coverUrl).toBe("https://cdn.fable.co/covers/123.jpg");
  });

  it("handles network failure gracefully without throwing unhandled exceptions", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));

    const googleRes = await BookMetadataService.searchGoogleBooks("Tuoi Tho Du Doi");
    expect(googleRes).toEqual([]);

    const olRes = await BookMetadataService.searchOpenLibrary("Tuoi Tho Du Doi");
    expect(olRes).toEqual([]);

    const combined = await BookMetadataService.searchBookMetadata("Tuoi Tho Du Doi");
    expect(combined).toEqual([]);
  });

  it("deduplicates results with similar title and author", async () => {
    const mockGoogle = {
      items: [
        {
          id: "g1",
          volumeInfo: {
            title: "Mắt Biếc",
            authors: ["Nguyễn Nhật Ánh"],
            description: "Chuyện tình buồn của Ngạn và Hà Lan.",
          },
        },
      ],
    };

    const mockOl = {
      docs: [
        {
          title: "Mắt Biếc",
          author_name: ["Nguyễn Nhật Ánh"],
          first_publish_year: 1990,
          cover_i: 9999,
        },
      ],
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("googleapis.com")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockGoogle,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockOl,
      } as Response);
    });

    const combined = await BookMetadataService.searchBookMetadata("Mắt Biếc");
    expect(combined).toHaveLength(1);
    expect(combined[0].title).toBe("Mắt Biếc");
    expect(combined[0].author).toBe("Nguyễn Nhật Ánh");
    expect(combined[0].description).toBe("Chuyện tình buồn của Ngạn và Hà Lan.");
    expect(combined[0].coverUrl).toBe("https://covers.openlibrary.org/b/id/9999-L.jpg");
  });
});
