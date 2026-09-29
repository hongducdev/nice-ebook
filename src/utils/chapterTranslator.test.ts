import { describe, it, expect } from "vitest";
import { ChapterTranslator } from "./chapterTranslator";

const SAMPLE_REALISTIC_XHTML = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <title>Chapter 1: The Boy Who Lived</title>
  <link rel="stylesheet" type="text/css" href="../styles.css"/>
</head>
<body class="chapter-body">
  <div class="chapter-header">
    <h1 id="ch1" class="title">Chapter 1: The Boy Who Lived</h1>
    <p class="subtitle">A strange day in Little Whinging</p>
  </div>
  <div class="illustration">
    <img src="../images/cover.jpg" alt="Chapter illustration" />
  </div>
  <p id="p-first" class="dropcap">Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.</p>
  <p>They were the last people you'd expect to be involved in anything strange or mysterious, because they just didn't hold with such nonsense.</p>
  <blockquote class="quote">
    "There's no such thing as magic!" shouted Uncle Vernon.
  </blockquote>
  <p class="empty-spacer"></p>
  <p>Mr. Dursley was the director of a firm called Grunnings, which made drills.<span class="footnote"><a href="#fn1">[1]</a></span></p>
</body>
</html>`;

describe("ChapterTranslator", () => {
  it("extracts text-bearing block elements while skipping images and empty spacers", () => {
    const blocks = ChapterTranslator.extractTranslatableBlocks(SAMPLE_REALISTIC_XHTML);
    expect(blocks.length).toBe(6);

    expect(blocks[0].id).toBe("p_0");
    expect(blocks[0].tag).toBe("h1");
    expect(blocks[0].originalText).toBe("Chapter 1: The Boy Who Lived");

    expect(blocks[1].id).toBe("p_1");
    expect(blocks[1].tag).toBe("p");
    expect(blocks[1].originalText).toBe("A strange day in Little Whinging");

    expect(blocks[2].id).toBe("p_2");
    expect(blocks[2].tag).toBe("p");
    expect(blocks[2].originalText).toContain("Mr. and Mrs. Dursley");

    expect(blocks[4].id).toBe("p_4");
    expect(blocks[4].tag).toBe("blockquote");
    expect(blocks[4].originalText).toContain("There's no such thing as magic!");
  });

  it("chunks blocks correctly without exceeding limits", () => {
    const blocks = ChapterTranslator.extractTranslatableBlocks(SAMPLE_REALISTIC_XHTML);
    const chunks = ChapterTranslator.chunkBlocks(blocks, { maxBlocks: 2, maxChars: 5000 });

    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(2);
    expect(chunks[1].length).toBe(2);
    expect(chunks[2].length).toBe(2);

    expect(chunks[0][0].id).toBe("p_0");
    expect(chunks[0][1].id).toBe("p_1");
    expect(chunks[1][0].id).toBe("p_2");
  });

  it("surgically replaces text in replace mode while preserving doctype, head, and image tags", () => {
    const translations: Record<string, string> = {
      p_0: "Chương 1: Cậu bé sống sót",
      p_1: "Một ngày kỳ lạ ở Little Whinging",
      p_2: "Gia đình Dursley ở số bốn đường Privet Drive luôn tự hào rằng họ hoàn toàn bình thường.",
      p_3: "Họ là những người cuối cùng bạn có thể ngờ rằng sẽ dính dáng vào bất kỳ điều kỳ lạ nào.",
      p_4: '"Làm gì có thứ gọi là phép thuật!" Bác Vernon hét lên.',
      p_5: 'Ông Dursley là giám đốc một công ty tên là Grunnings, chuyên sản xuất máy khoan.<span class="footnote"><a href="#fn1">[1]</a></span>',
    };

    const result = ChapterTranslator.applyTranslations(SAMPLE_REALISTIC_XHTML, translations, {
      mode: "replace",
    });

    // Outer and XML structure preserved exactly
    expect(result).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(result).toContain('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN"');
    expect(result).toContain('<title>Chapter 1: The Boy Who Lived</title>');
    expect(result).toContain('<link rel="stylesheet" type="text/css" href="../styles.css"/>');
    expect(result).toContain('<img src="../images/cover.jpg" alt="Chapter illustration" />');

    // Tag classes and IDs preserved
    expect(result).toContain('<h1 id="ch1" class="title">Chương 1: Cậu bé sống sót</h1>');
    expect(result).toContain('<p id="p-first" class="dropcap">Gia đình Dursley');
    expect(result).toContain('<blockquote class="quote">"Làm gì có thứ gọi là phép thuật!" Bác Vernon hét lên.</blockquote>');
    expect(result).toContain('href="#fn1">[1]</a></span>');
  });

  it("generates interlinear bilingual sibling paragraphs in bilingual mode", () => {
    const translations: Record<string, string> = {
      p_0: "Chương 1: Cậu bé sống sót",
      p_2: "Gia đình Dursley ở số bốn đường Privet Drive...",
    };

    const result = ChapterTranslator.applyTranslations(SAMPLE_REALISTIC_XHTML, translations, {
      mode: "bilingual",
    });

    // Check h1 bilingual
    expect(result).toContain('<h1 id="ch1" class="title bilingual-original">Chapter 1: The Boy Who Lived</h1>');
    expect(result).toContain('<p class="bilingual-translated" data-bilingual-for="p_0">Chương 1: Cậu bé sống sót</p>');

    // Check p bilingual with original attributes
    expect(result).toContain('bilingual-original');
    expect(result).toContain('data-bilingual-for="p_2"');
  });

  it("applies glossary substitutions accurately", () => {
    const glossary: Record<string, string> = {
      "Little Whinging": "Thị trấn Whinging nhỏ",
      "Uncle Vernon": "Dượng Vernon",
      "magic": "phép thuật",
    };

    const text = "Uncle Vernon lived in Little Whinging and hated magic.";
    const replaced = ChapterTranslator.applyGlossary(text, glossary);

    expect(replaced).toBe("Dượng Vernon lived in Thị trấn Whinging nhỏ and hated phép thuật.");
  });

  it("falls back to original text safely when a block translation is missing or dropped", () => {
    const partialTranslations: Record<string, string> = {
      p_0: "Chương 1: Cậu bé sống sót",
      // p_2 intentionally omitted by model
    };

    const result = ChapterTranslator.applyTranslations(SAMPLE_REALISTIC_XHTML, partialTranslations, {
      mode: "replace",
    });

    expect(result).toContain("Chương 1: Cậu bé sống sót");
    // p_2 stays original
    expect(result).toContain("Mr. and Mrs. Dursley, of number four, Privet Drive");
  });

  it("preserves ordering across chunk boundaries when chunking multiple blocks", () => {
    // Generate 30 dummy paragraphs
    const paragraphsHtml = Array.from({ length: 30 }, (_, i) => `<p id="p_${i}">Paragraph content number ${i}</p>`).join("\n");
    const fullHtml = `<html><body>${paragraphsHtml}</body></html>`;

    const blocks = ChapterTranslator.extractTranslatableBlocks(fullHtml);
    expect(blocks.length).toBe(30);

    const chunks = ChapterTranslator.chunkBlocks(blocks, { maxBlocks: 10 });
    expect(chunks.length).toBe(3);

    // Verify all 30 blocks are accounted for in exact sequence
    let count = 0;
    for (let c = 0; c < chunks.length; c++) {
      for (let b = 0; b < chunks[c].length; b++) {
        expect(chunks[c][b].id).toBe(`p_${count}`);
        expect(chunks[c][b].index).toBe(count);
        count++;
      }
    }
    expect(count).toBe(30);
  });

  it("automatically retains footnote anchor if translation omitted it", () => {
    const htmlWithFootnote = `<html><body><p id="p_0">Original text with note.<span class="footnote"><a href="#fn1">[1]</a></span></p></body></html>`;
    // Translation omitted the footnote tag
    const translations = {
      p_0: "Văn bản dịch thuần túy không có thẻ chú thích.",
    };

    const result = ChapterTranslator.applyTranslations(htmlWithFootnote, translations, {
      mode: "replace",
    });

    expect(result).toContain("Văn bản dịch thuần túy không có thẻ chú thích.");
    expect(result).toContain('<span class="footnote"><a href="#fn1">[1]</a></span>');
  });

  it("handles complex entities and quotes cleanly", () => {
    const htmlWithEntities = `<html><body><p id="p_0">Tom &amp; Jerry &#8212; "Best &lt;Friends&gt;"</p></body></html>`;
    const blocks = ChapterTranslator.extractTranslatableBlocks(htmlWithEntities);
    expect(blocks[0].originalText).toContain("Tom & Jerry");

    const result = ChapterTranslator.applyTranslations(
      htmlWithEntities,
      { p_0: 'Tom &amp; Jerry &#8212; "Bạn tốt nhất"' },
      { mode: "replace" }
    );
    expect(result).toContain('Tom &amp; Jerry &#8212; "Bạn tốt nhất"');
  });
});
