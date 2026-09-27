import { invoke } from "@tauri-apps/api/core";

export interface BookMetadataItem {
  id: string;
  source: "google" | "openlibrary" | "goodreads" | "fable" | "wattpad" | "manual";
  title: string;
  author: string;
  publisher?: string;
  publishedYear?: string;
  language?: string;
  description?: string;
  categories?: string[];
  isbn?: string;
  coverUrl?: string;
  coverOptions: CoverOption[];
}

export interface CoverOption {
  url: string;
  source: string;
  label: string;
  quality: "high" | "medium" | "standard";
  dimensions?: { width: number; height: number };
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Normalizes author representations across different providers
 * (e.g. string, string[], or object arrays like Fable's [{ name: "Keigo Higashino" }])
 */
export function normalizeAuthor(raw: any): string {
  if (!raw) return "Khuyết Danh";

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[object Object]") return "Khuyết Danh";
    return trimmed;
  }

  if (Array.isArray(raw)) {
    const names = raw
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item.trim();
        if (typeof item === "object") {
          return item.name || item.fullname || item.author || "";
        }
        return String(item);
      })
      .filter((n) => Boolean(n) && n !== "[object Object]");

    return names.length > 0 ? names.join(", ") : "Khuyết Danh";
  }

  if (typeof raw === "object") {
    const name = raw.name || raw.fullname || raw.author;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }

  return "Khuyết Danh";
}

/**
 * Clean dirty book titles, file names, watermark tokens
 * (e.g. "[dtv-ebook.com] Dac Nhan Tam (Full).epub" -> "Dac Nhan Tam")
 */
export function cleanSearchQuery(raw: string): string {
  if (!raw) return "";

  let cleaned = raw.trim();

  // Strip common file extensions
  cleaned = cleaned.replace(/\.(epub|pdf|mobi|azw3?|txt|docx?)$/i, "");

  // Strip typical download site watermarks in brackets or parentheses
  cleaned = cleaned.replace(/\[\s*(dtv-ebook(\.com)?|sachvui(\.com)?|tve-4u(\.org)?|isach(\.info)?|gacsach(\.com)?|downloadsach(\.com)?|waka(\.vn)?|truyenfull(\.vn)?)\s*\]/gi, "");
  cleaned = cleaned.replace(/\(\s*(dtv-ebook(\.com)?|sachvui(\.com)?|tve-4u(\.org)?|isach(\.info)?|gacsach(\.com)?|waka(\.vn)?)\s*\)/gi, "");

  // Strip generic noise tags like [Full], (Full), [Dịch], [Bản chuẩn], [Audio], [Tập 1], etc.
  cleaned = cleaned.replace(/\[\s*(?:full|hoàn|hoan|dịch|dich|bản đẹp|ban dep|bản chuẩn|ban chuan|audio|scan|raw|pdf|epub|tập\s*\d+|tap\s*\d+)\s*\]/gi, "");
  cleaned = cleaned.replace(/\(\s*(?:full|hoàn|hoan|dịch|dich|bản đẹp|ban dep|bản chuẩn|ban chuan|audio|scan|raw|pdf|epub|tập\s*\d+|tap\s*\d+)\s*\)/gi, "");

  // Strip leading track or index numbers like "01. ", "01 - ", "1. ", "Chương 1 - "
  cleaned = cleaned.replace(/^(chương\s+\d+|chapter\s+\d+|\d+[\.\-\_\s]+)/i, "");

  // Replace underscores and multiple hyphens with spaces
  cleaned = cleaned.replace(/[_\-]+/g, " ");

  // Collapse multiple whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export class BookMetadataService {
  /**
   * Safe JSON fetcher using Tauri invoke to bypass CORS when running in desktop app,
   * or standard fetch with error handling when in web / test environment.
   */
  public static async fetchJsonSafe<T = any>(url: string): Promise<T | null> {
    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
    if (isTauri) {
      try {
        const raw = await invoke<string>("fetch_external_json", { url });
        return JSON.parse(raw);
      } catch (err) {
        console.warn("Tauri fetch_external_json error, falling back to fetch:", err);
      }
    }

    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      console.warn("fetchJsonSafe network error:", err);
      return null;
    }
  }

  /**
   * Search Goodreads for rich book metadata, synopses, and original high-res covers.
   */
  public static async searchGoodreads(query: string, author?: string): Promise<BookMetadataItem[]> {
    const cleanQ = cleanSearchQuery(query);
    if (!cleanQ) return [];

    let qParam = cleanQ;
    if (author && author.trim()) {
      qParam = `${cleanQ} ${author.trim()}`;
    }

    const url = `https://www.goodreads.com/book/auto_complete?format=json&q=${encodeURIComponent(qParam)}`;

    try {
      const items = await this.fetchJsonSafe<any[]>(url);
      if (!Array.isArray(items)) return [];

      return items.slice(0, 8).map((item: any) => {
        const title = item.title || item.bookTitleBare || cleanQ;
        const authors = normalizeAuthor(item.author);
        const publishedYear = item.first_publish_year || item.publication_year ? String(item.first_publish_year || item.publication_year) : undefined;
        const rawDesc = item.description?.html || item.description?.text;
        const description = rawDesc ? stripHtml(rawDesc) : undefined;
        const rating = item.avgRating ? `Goodreads ★ ${item.avgRating}` : "Goodreads";

        const coverOptions: CoverOption[] = [];
        if (item.imageUrl) {
          // Stripping Goodreads thumbnail suffix (._SY75_.jpg or ._SX50_.jpg) yields original HD cover
          const highRes = item.imageUrl.replace(/\._S[YX]\d+_/, "");
          coverOptions.push({
            url: highRes,
            source: "Goodreads",
            label: "Goodreads HD (Bìa Gốc)",
            quality: "high",
          });
          coverOptions.push({
            url: item.imageUrl,
            source: "Goodreads",
            label: "Goodreads Thumbnail",
            quality: "standard",
          });
        }

        const bestCover = coverOptions.length > 0 ? coverOptions[0].url : undefined;

        return {
          id: `goodreads-${item.bookId || Math.random()}`,
          source: "goodreads" as const,
          title,
          author: authors,
          publisher: rating,
          publishedYear,
          description,
          coverUrl: bestCover,
          coverOptions,
        };
      });
    } catch (err) {
      console.warn("Failed to search Goodreads:", err);
      return [];
    }
  }

  /**
   * Search Fable for book metadata, publisher details, and covers.
   */
  public static async searchFable(query: string, author?: string): Promise<BookMetadataItem[]> {
    const cleanQ = cleanSearchQuery(query);
    if (!cleanQ) return [];

    let qParam = cleanQ;
    if (author && author.trim()) {
      qParam = `${cleanQ} ${author.trim()}`;
    }

    const url = `https://api.fable.co/api/search?auto=${encodeURIComponent(qParam)}&type=book&limit=8&offset=0`;

    try {
      const data = await this.fetchJsonSafe<any>(url);
      const books = data?.response?.books;
      if (!Array.isArray(books)) return [];

      return books.slice(0, 8).map((b: any) => {
        const title = b.title || cleanQ;
        const authors = normalizeAuthor(b.authors);
        const publishedYear = b.published_date ? String(b.published_date).slice(0, 4) : undefined;
        const publisher = b.imprint || "Fable";
        const rawDesc = b.description || b.subtitle;
        const description = rawDesc ? stripHtml(rawDesc) : undefined;

        const coverOptions: CoverOption[] = [];
        if (b.cover_image) {
          coverOptions.push({
            url: b.cover_image,
            source: "Fable",
            label: "Fable HD",
            quality: "high",
          });
        }
        if (b.cover_image_small) {
          coverOptions.push({
            url: b.cover_image_small,
            source: "Fable",
            label: "Fable Medium",
            quality: "medium",
          });
        }

        const bestCover = coverOptions.length > 0 ? coverOptions[0].url : undefined;

        return {
          id: `fable-${b.id || Math.random()}`,
          source: "fable" as const,
          title,
          author: authors,
          publisher,
          publishedYear,
          isbn: b.isbn,
          description,
          coverUrl: bestCover,
          coverOptions,
        };
      });
    } catch (err) {
      console.warn("Failed to search Fable:", err);
      return [];
    }
  }

  /**
   * Search Google Books API for rich book metadata and multi-resolution covers.
   */
  public static async searchGoogleBooks(query: string, author?: string): Promise<BookMetadataItem[]> {
    const cleanQ = cleanSearchQuery(query);
    if (!cleanQ) return [];

    let qParam = cleanQ;
    if (author && author.trim()) {
      qParam = `${cleanQ} ${author.trim()}`;
    }

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(qParam)}&maxResults=8&printType=books`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn("Google Books API error:", resp.status, resp.statusText);
        return [];
      }

      const data = await resp.json();
      if (!data.items || !Array.isArray(data.items)) {
        return [];
      }

      return data.items.map((item: any) => {
        const info = item.volumeInfo || {};
        const title = info.title || cleanQ;
        const authors = normalizeAuthor(info.authors);
        const publishedYear = info.publishedDate ? info.publishedDate.slice(0, 4) : undefined;
        const publisher = info.publisher;
        const description = info.description;
        const categories = info.categories;
        const language = info.language;

        // Find ISBN
        let isbn: string | undefined;
        if (Array.isArray(info.industryIdentifiers)) {
          const isbn13 = info.industryIdentifiers.find((id: any) => id.type === "ISBN_13");
          const isbn10 = info.industryIdentifiers.find((id: any) => id.type === "ISBN_10");
          isbn = (isbn13 || isbn10)?.identifier;
        }

        // Generate multiple resolution cover options from imageLinks
        const coverOptions: CoverOption[] = [];
        const imgs = info.imageLinks || {};

        const cleanImgUrl = (rawUrl?: string): string | undefined => {
          if (!rawUrl) return undefined;
          let u = rawUrl.replace(/^http:\/\//i, "https://");
          // Remove curl edge effect for clean rectangular book cover
          u = u.replace(/&edge=curl/gi, "");
          return u;
        };

        if (imgs.extraLarge) {
          coverOptions.push({
            url: cleanImgUrl(imgs.extraLarge)!,
            source: "Google Books",
            label: "Cực Lớn (Extra Large)",
            quality: "high",
          });
        }
        if (imgs.large) {
          coverOptions.push({
            url: cleanImgUrl(imgs.large)!,
            source: "Google Books",
            label: "Lớn (Large)",
            quality: "high",
          });
        }
        if (imgs.medium) {
          coverOptions.push({
            url: cleanImgUrl(imgs.medium)!,
            source: "Google Books",
            label: "Trung Bình (Medium)",
            quality: "medium",
          });
        }
        if (imgs.thumbnail) {
          const highRes = cleanImgUrl(imgs.thumbnail)!.replace(/zoom=\d+/i, "zoom=2");
          coverOptions.push({
            url: highRes,
            source: "Google Books",
            label: "Tiêu Chuẩn 2x (High Res)",
            quality: "high",
          });
          coverOptions.push({
            url: cleanImgUrl(imgs.thumbnail)!,
            source: "Google Books",
            label: "Thumbnail",
            quality: "standard",
          });
        }

        const bestCover = coverOptions.length > 0 ? coverOptions[0].url : undefined;

        return {
          id: `google-${item.id}`,
          source: "google" as const,
          title,
          author: authors,
          publisher,
          publishedYear,
          language,
          description,
          categories,
          isbn,
          coverUrl: bestCover,
          coverOptions,
        };
      });
    } catch (err) {
      console.warn("Failed to fetch Google Books:", err);
      return [];
    }
  }

  /**
   * Search Open Library API for book editions, ISBNs and high-res cover archives.
   */
  public static async searchOpenLibrary(query: string, author?: string): Promise<BookMetadataItem[]> {
    const cleanQ = cleanSearchQuery(query);
    if (!cleanQ) return [];

    let qParam = cleanQ;
    if (author && author.trim()) {
      qParam = `${cleanQ} ${author.trim()}`;
    }

    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(qParam)}&limit=8`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn("Open Library API error:", resp.status, resp.statusText);
        return [];
      }

      const data = await resp.json();
      if (!data.docs || !Array.isArray(data.docs)) {
        return [];
      }

      return data.docs
        .filter((doc: any) => doc.title)
        .slice(0, 6)
        .map((doc: any) => {
          const title = doc.title;
          const authors = normalizeAuthor(doc.author_name);
          const publishedYear = doc.first_publish_year ? String(doc.first_publish_year) : undefined;
          const publisher = Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher;
          const language = Array.isArray(doc.language) ? doc.language[0] : doc.language;
          const isbn = Array.isArray(doc.isbn) ? doc.isbn[0] : doc.isbn;

          const coverOptions: CoverOption[] = [];
          if (doc.cover_i) {
            coverOptions.push({
              url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
              source: "Open Library",
              label: "Bìa Lớn (High Res)",
              quality: "high",
            });
            coverOptions.push({
              url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
              source: "Open Library",
              label: "Bìa Vừa (Medium)",
              quality: "medium",
            });
          } else if (isbn) {
            coverOptions.push({
              url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
              source: "Open Library",
              label: "Theo ISBN (High Res)",
              quality: "high",
            });
          }

          const bestCover = coverOptions.length > 0 ? coverOptions[0].url : undefined;

          return {
            id: `ol-${doc.key || Math.random()}`,
            source: "openlibrary" as const,
            title,
            author: authors,
            publisher,
            publishedYear,
            language,
            description: undefined, // Open library search.json does not return full description
            categories: Array.isArray(doc.subject) ? doc.subject.slice(0, 4) : undefined,
            isbn,
            coverUrl: bestCover,
            coverOptions,
          };
        });
    } catch (err) {
      console.warn("Failed to fetch Open Library:", err);
      return [];
    }
  }

  /**
   * Search Wattpad API for webnovels, light novels, and community stories.
   */
  public static async searchWattpad(query: string, author?: string): Promise<BookMetadataItem[]> {
    const cleanQ = cleanSearchQuery(query);
    if (!cleanQ) return [];

    let qParam = cleanQ;
    if (author && author.trim()) {
      qParam = `${cleanQ} ${author.trim()}`;
    }

    const url = `https://www.wattpad.com/api/v3/stories?query=${encodeURIComponent(qParam)}&limit=8`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn("Wattpad API error:", resp.status, resp.statusText);
        return [];
      }

      const data = await resp.json();
      if (!data.stories || !Array.isArray(data.stories)) {
        return [];
      }

      return data.stories.map((story: any) => {
        const title = story.title || cleanQ;
        const authors = normalizeAuthor(story.user?.fullname || story.user?.name);
        const publishedYear = story.createDate ? String(story.createDate).slice(0, 4) : undefined;
        const description = story.description || undefined;
        const tags = typeof story.tags === "string" ? story.tags.split(/\s+/).filter(Boolean) : [];
        const isCompleted = story.completed ? "Hoàn thành" : "Đang ra";
        const categories = tags.length > 0 ? tags.slice(0, 6) : ["Truyện mạng", "Wattpad"];

        const coverOptions: CoverOption[] = [];
        if (story.cover) {
          const rawCover = story.cover;
          const highRes = rawCover.replace(/-\d+-k/, "-1024-k");
          const midRes = rawCover.replace(/-\d+-k/, "-512-k");

          coverOptions.push({
            url: highRes,
            source: "Wattpad",
            label: "Wattpad HD (1024px)",
            quality: "high",
          });
          coverOptions.push({
            url: midRes,
            source: "Wattpad",
            label: "Wattpad Chuẩn (512px)",
            quality: "medium",
          });
          coverOptions.push({
            url: rawCover,
            source: "Wattpad",
            label: "Wattpad Gốc",
            quality: "standard",
          });
        }

        const bestCover = coverOptions.length > 0 ? coverOptions[0].url : undefined;

        return {
          id: `wattpad-${story.id}`,
          source: "wattpad" as const,
          title,
          author: authors,
          publisher: `Wattpad (${isCompleted})`,
          publishedYear,
          language: story.language?.name === "Vietnamese" ? "vi" : (story.language?.name?.slice(0, 2).toLowerCase() || "vi"),
          description,
          categories,
          coverUrl: bestCover,
          coverOptions,
        };
      });
    } catch (err) {
      console.warn("Failed to fetch Wattpad stories:", err);
      return [];
    }
  }

  /**
   * Search across metadata providers with source mode filtering.
   */
  public static async searchBookMetadata(
    query: string,
    author?: string,
    sourceMode: "all" | "wattpad" | "published" = "all"
  ): Promise<BookMetadataItem[]> {
    const cleanQ = cleanSearchQuery(query);
    if (!cleanQ) return [];

    const promises: Promise<BookMetadataItem[]>[] = [];

    if (sourceMode === "all" || sourceMode === "published") {
      promises.push(this.searchGoodreads(cleanQ, author));
      promises.push(this.searchFable(cleanQ, author));
      promises.push(this.searchGoogleBooks(cleanQ, author));
      promises.push(this.searchOpenLibrary(cleanQ, author));
    }

    if (sourceMode === "all" || sourceMode === "wattpad") {
      promises.push(this.searchWattpad(cleanQ, author));
    }

    const settled = await Promise.allSettled(promises);
    const combined: BookMetadataItem[] = [];

    for (const res of settled) {
      if (res.status === "fulfilled") {
        combined.push(...res.value);
      }
    }

    // Deduplicate by similar title and author
    const deduped: BookMetadataItem[] = [];
    const seen = new Set<string>();

    for (const item of combined) {
      const key = `${item.title.toLowerCase().trim()}-${item.author.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      } else {
        // If existing item lacks description or cover, enrich it from the duplicate
        const existing = deduped.find(
          (d) => `${d.title.toLowerCase().trim()}-${d.author.toLowerCase().trim()}` === key
        );
        if (existing) {
          if (!existing.description && item.description) {
            existing.description = item.description;
          }
          if (!existing.coverUrl && item.coverUrl) {
            existing.coverUrl = item.coverUrl;
          }
          if (item.coverOptions.length > 0) {
            existing.coverOptions = [...existing.coverOptions, ...item.coverOptions];
          }
        }
      }
    }

    return deduped;
  }

  /**
   * Aggregate all available online cover options from multiple editions and sources.
   */
  public static async searchOnlineCovers(
    query: string,
    author?: string,
    sourceMode: "all" | "wattpad" | "published" = "all"
  ): Promise<CoverOption[]> {
    const cleanQ = cleanSearchQuery(query);
    if (!cleanQ) return [];

    const metadataList = await this.searchBookMetadata(cleanQ, author, sourceMode);
    const covers: CoverOption[] = [];
    const seenUrls = new Set<string>();

    for (const meta of metadataList) {
      for (const cov of meta.coverOptions) {
        if (!seenUrls.has(cov.url)) {
          seenUrls.add(cov.url);
          covers.push({
            ...cov,
            label: `${cov.label} • ${meta.title} (${meta.author})`,
          });
        }
      }
    }

    return covers;
  }

  /**
   * Fetch an external image and convert to data URL safely.
   * Uses Tauri's Rust command `fetch_image_as_data_url` when available (bypassing CORS),
   * or standard browser fetch as web fallback.
   */
  public static async fetchCoverDataUrl(url: string): Promise<string> {
    if (!url) throw new Error("URL ảnh rỗng");

    // If already a data URL, return directly
    if (url.startsWith("data:")) {
      return url;
    }

    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

    if (isTauri) {
      try {
        return await invoke<string>("fetch_image_as_data_url", { url });
      } catch (err) {
        console.warn("Tauri fetch_image_as_data_url failed, trying browser fetch fallback:", err);
      }
    }

    // Browser fallback
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) {
      throw new Error(`Không thể tải ảnh: HTTP ${res.status}`);
    }

    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Lỗi chuyển đổi dữ liệu ảnh sang Data URL"));
        }
      };
      reader.onerror = () => reject(new Error("Lỗi đọc file ảnh"));
      reader.readAsDataURL(blob);
    });
  }
}
