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

  it("extracts standalone leaf <div> chapter titles without breaking container divs", () => {
    const htmlWithDivTitle = `<?xml version="1.0" encoding="utf-8"?>
<html>
<head><title>Original Old Title</title></head>
<body>
  <div class="chapter-wrapper">
    <div class="chapter-title">第1章 陨落的天才</div>
    <div class="content-body">
      <p>Nội dung đoạn 1...</p>
      <div class="author-note">Ghi chú tác giả ở cuối chương</div>
    </div>
  </div>
</body>
</html>`;

    const blocks = ChapterTranslator.extractTranslatableBlocks(htmlWithDivTitle);
    expect(blocks.length).toBe(3);

    // Block 0: <div class="chapter-title">
    expect(blocks[0].tag).toBe("div");
    expect(blocks[0].originalText).toBe("第1章 陨落的天才");

    // Block 1: <p>
    expect(blocks[1].tag).toBe("p");
    expect(blocks[1].originalText).toBe("Nội dung đoạn 1...");

    // Block 2: <div class="author-note">
    expect(blocks[2].tag).toBe("div");
    expect(blocks[2].originalText).toBe("Ghi chú tác giả ở cuối chương");

    // Apply translations and sync <title> in <head>
    const translated = ChapterTranslator.applyTranslations(
      htmlWithDivTitle,
      {
        p_0: "Chương 1: Thiên tài sa sút",
        p_1: "Nội dung đoạn 1 đã dịch.",
        p_2: "Ghi chú tác giả đã dịch.",
      },
      {
        mode: "replace",
        translatedTitle: "Chương 1: Thiên tài sa sút",
      }
    );

    expect(translated).toContain('<div class="chapter-title">Chương 1: Thiên tài sa sút</div>');
    expect(translated).toContain("<title>Chương 1: Thiên tài sa sút</title>");
    expect(translated).toContain("<p>Nội dung đoạn 1 đã dịch.</p>");
    expect(translated).toContain('<div class="author-note">Ghi chú tác giả đã dịch.</div>');
  });

  it("syncs <head><title> with XML entity encoding", () => {
    const rawHtml = `<html><head><title>Old</title></head><body><p>Text</p></body></html>`;
    const synced = ChapterTranslator.syncHeadTitle(rawHtml, "Chương 1: Romeo & Juliet <Bi kịch>");
    expect(synced).toContain("<title>Chương 1: Romeo &amp; Juliet &lt;Bi kịch&gt;</title>");
  });

  it("never double-emits text nodes across nested container divs", () => {
    const complexNestedHtml = `<html><body>
      <div class="grandparent">
        <div class="parent">
          <div class="leaf-title">Tiêu Đề Duy Nhất</div>
          <div class="leaf-content">Nội Dung Duy Nhất</div>
        </div>
      </div>
    </body></html>`;

    const blocks = ChapterTranslator.extractTranslatableBlocks(complexNestedHtml);
    expect(blocks.length).toBe(2);
    expect(blocks[0].originalText).toBe("Tiêu Đề Duy Nhất");
    expect(blocks[1].originalText).toBe("Nội Dung Duy Nhất");
  });

  it("extracts table cells (td, th), captions, and preformatted blocks without missing them", () => {
    const tableHtml = `<html><body>
      <table>
        <caption>Bảng thông số nhân vật</caption>
        <thead>
          <tr><th>Thuộc tính</th><th>Chỉ số</th></tr>
        </thead>
        <tbody>
          <tr><td>Cảnh giới</td><td>Luyện Khí tầng 9</td></tr>
        </tbody>
      </table>
      <pre>Bài thơ cổ phong ngũ ngôn</pre>
    </body></html>`;

    const blocks = ChapterTranslator.extractTranslatableBlocks(tableHtml);
    expect(blocks.length).toBe(6);
    expect(blocks[0].tag).toBe("caption");
    expect(blocks[0].originalText).toBe("Bảng thông số nhân vật");
    expect(blocks[1].tag).toBe("th");
    expect(blocks[1].originalText).toBe("Thuộc tính");
    expect(blocks[2].tag).toBe("th");
    expect(blocks[2].originalText).toBe("Chỉ số");
    expect(blocks[3].tag).toBe("td");
    expect(blocks[3].originalText).toBe("Cảnh giới");
    expect(blocks[4].tag).toBe("td");
    expect(blocks[4].originalText).toBe("Luyện Khí tầng 9");
    expect(blocks[5].tag).toBe("pre");
    expect(blocks[5].originalText).toBe("Bài thơ cổ phong ngũ ngôn");
  });

  it("preserves <br /> line breaks in poetry and verses when translated", () => {
    const poemHtml = `<html><body>
      <p class="poem">Dòng thơ đầu tiên<br />Dòng thơ thứ hai<br/>Dòng thơ thứ ba</p>
    </body></html>`;

    const blocks = ChapterTranslator.extractTranslatableBlocks(poemHtml);
    expect(blocks.length).toBe(1);
    expect(blocks[0].originalText).toBe("Dòng thơ đầu tiên\nDòng thơ thứ hai\nDòng thơ thứ ba");

    const translated = ChapterTranslator.applyTranslations(
      poemHtml,
      {
        p_0: "First line of verse\nSecond line of verse\nThird line of verse",
      },
      { mode: "replace" }
    );

    expect(translated).toContain("First line of verse<br />Second line of verse<br />Third line of verse");
  });

  it("handles table cells cleanly in bilingual mode without breaking table markup", () => {
    const tableHtml = `<html><body><table><tr><td>Character Realm</td></tr></table></body></html>`;
    const translated = ChapterTranslator.applyTranslations(
      tableHtml,
      { p_0: "Cảnh giới nhân vật" },
      { mode: "bilingual" }
    );

    expect(translated).toContain('<td><div class="bilingual-original">Character Realm</div><div class="bilingual-translated" data-bilingual-for="p_0">Cảnh giới nhân vật</div></td>');
  });

  describe("LinguaGacha-style Inline Markup Masking & Ruby Cleaning", () => {
    it("cleanRubyText strips Japanese furigana while keeping base Kanji intact", () => {
      const htmlWithRuby = '<p>彼の名前は<ruby>静叶<rt>しずか</rt></ruby>です。これは<ruby>魔法<rp>(</rp><rt>まほう</rt><rp>)</rp></ruby>の世界。</p>';
      const cleaned = ChapterTranslator.cleanRubyText(htmlWithRuby);
      expect(cleaned).toBe("<p>彼の名前は静叶です。これは魔法の世界。</p>");
    });

    it("maskInlineMarkup protects footnotes, anchor links, and code blocks with placeholders", () => {
      const html = 'London was foggy<span class="footnote"><a href="#fn1">[1]</a></span> and Holmes was studying <code>print("hello")</code><a href="#ref2">[ref]</a>.';
      const { maskedHtml, tagsMap } = ChapterTranslator.maskInlineMarkup(html);

      expect(maskedHtml).toContain("⟦TAG_0⟧");
      expect(maskedHtml).toContain("⟦TAG_1⟧");
      expect(maskedHtml).toContain("⟦TAG_2⟧");
      expect(tagsMap.get("⟦TAG_0⟧")).toBe('<span class="footnote"><a href="#fn1">[1]</a></span>');
      expect(tagsMap.get("⟦TAG_1⟧")).toBe('<code>print("hello")</code>');
      expect(tagsMap.get("⟦TAG_2⟧")).toBe('<a href="#ref2">[ref]</a>');
    });

    it("unmaskInlineMarkup reconstructs byte-identical original markup on happy path", () => {
      const html = 'Mr. Dursley was the director<span class="footnote"><a href="#fn1">[1]</a></span> of Grunnings.';
      const { maskedHtml, tagsMap } = ChapterTranslator.maskInlineMarkup(html);

      // Suppose the model translates while keeping the placeholder intact
      const translatedWithTag = maskedHtml
        .replace("Mr. Dursley was the director", "Ông Dursley là giám đốc")
        .replace("of Grunnings", "của công ty Grunnings");

      const { restoredText, missingPlaceholders } = ChapterTranslator.unmaskInlineMarkup(translatedWithTag, tagsMap);

      expect(missingPlaceholders.length).toBe(0);
      expect(restoredText).toBe('Ông Dursley là giám đốc<span class="footnote"><a href="#fn1">[1]</a></span> của công ty Grunnings.');
    });

    it("handles placeholder reordering and restores tags to new positions accurately", () => {
      const tagsMap = new Map([
        ["⟦TAG_0⟧", '<sup><a href="#note1">[1]</a></sup>'],
        ["⟦TAG_1⟧", '<sup><a href="#note2">[2]</a></sup>'],
      ]);
      // Sentence inversion: in English note 0 then note 1; in Vietnamese note 1 mentioned before note 0
      const translatedReordered = "Theo tài liệu thứ hai⟦TAG_1⟧, và tài liệu thứ nhất⟦TAG_0⟧ đã chỉ rõ.";
      const { restoredText, missingPlaceholders } = ChapterTranslator.unmaskInlineMarkup(translatedReordered, tagsMap);

      expect(missingPlaceholders.length).toBe(0);
      expect(restoredText).toBe('Theo tài liệu thứ hai<sup><a href="#note2">[2]</a></sup>, và tài liệu thứ nhất<sup><a href="#note1">[1]</a></sup> đã chỉ rõ.');
    });

    it("deduplicates hallucinated duplicate placeholders to prevent XHTML bloat", () => {
      const tagsMap = new Map([
        ["⟦TAG_0⟧", '<span class="footnote"><a href="#fn1">[1]</a></span>'],
      ]);
      // Model accidentally outputs ⟦TAG_0⟧ twice
      const translatedWithDuplicate = "Câu dịch có thẻ ⟦TAG_0⟧ và bị lặp lại ⟦TAG_0⟧ ở cuối.";
      const { restoredText, missingPlaceholders } = ChapterTranslator.unmaskInlineMarkup(translatedWithDuplicate, tagsMap);

      expect(missingPlaceholders.length).toBe(0);
      expect(restoredText).toBe('Câu dịch có thẻ <span class="footnote"><a href="#fn1">[1]</a></span> và bị lặp lại  ở cuối.');
      // Ensure the tag appears exactly once
      const count = (restoredText.match(/class="footnote"/g) || []).length;
      expect(count).toBe(1);
    });

    it("fails safe when placeholder is completely dropped: re-appends missing tags to prevent data loss", () => {
      const tagsMap = new Map([
        ["⟦TAG_0⟧", '<span class="footnote"><a href="#fn1">[1]</a></span>'],
      ]);
      // Model completely erased ⟦TAG_0⟧
      const translatedWithoutTag = "Bản dịch bị mô hình bỏ quên mã thẻ giữ chỗ.";
      const { restoredText, missingPlaceholders } = ChapterTranslator.unmaskInlineMarkup(translatedWithoutTag, tagsMap);

      expect(missingPlaceholders).toEqual(["⟦TAG_0⟧"]);
      // Automatically re-appends to the end
      expect(restoredText).toBe('Bản dịch bị mô hình bỏ quên mã thẻ giữ chỗ.<span class="footnote"><a href="#fn1">[1]</a></span>');
    });

    it("retains byte-identical XHTML structure when masking and unmasking multiple complex nested inline elements", () => {
      const complexHtml = 'Text before <sup><a href="#fn1" class="noteref">[1]</a></sup> middle <code>const x = "&lt;test&gt;";</code> and <span class="footnote"><a href="#fn2">[2]</a></span> end.';
      const { maskedHtml, tagsMap } = ChapterTranslator.maskInlineMarkup(complexHtml);
      const { restoredText, missingPlaceholders } = ChapterTranslator.unmaskInlineMarkup(maskedHtml, tagsMap);

      expect(missingPlaceholders.length).toBe(0);
      expect(restoredText).toBe(complexHtml);
    });

    it("handles unclosed or malformed markup safely without throwing exceptions", () => {
      const malformedHtml = '<p>Broken <ruby>Kanji without close rt<rt>reading</ruby> and <img src="test.jpg" unmatched > content.</p>';
      expect(() => {
        const { maskedHtml, tagsMap } = ChapterTranslator.maskInlineMarkup(malformedHtml);
        ChapterTranslator.unmaskInlineMarkup(maskedHtml, tagsMap);
      }).not.toThrow();
    });

    it("preserves original Drop Cap span styling onto first character of translated paragraph", () => {
      const htmlWithDropCap = '<p class="first-para"><span class="dropcap">M</span>r. and Mrs. Dursley were proud.</p>';
      const translated = ChapterTranslator.applyTranslations(
        htmlWithDropCap,
        { p_0: "Gia đình Dursley luôn tự hào." },
        { mode: "replace" }
      );

      expect(translated).toContain('<span class="dropcap">G</span>ia đình Dursley luôn tự hào.');
      expect(translated).toContain('class="first-para"');
    });

    it("preserves whole-block formatting wrappers such as <em> or <strong>", () => {
      const htmlWithEm = '<p class="quote"><em>"All children, except one, grow up."</em></p>';
      const translated = ChapterTranslator.applyTranslations(
        htmlWithEm,
        { p_0: '"Mọi đứa trẻ, trừ một đứa, đều lớn lên."' },
        { mode: "replace" }
      );

      expect(translated).toContain('<p class="quote"><em>"Mọi đứa trẻ, trừ một đứa, đều lớn lên."</em></p>');
    });

    it("preserves <br /> in split-line headings when translation provides combined chapter title", () => {
      const htmlWithBrTitle = '<h1>Chapter 1<br/>The Boy Who Lived</h1>';
      const translated = ChapterTranslator.applyTranslations(
        htmlWithBrTitle,
        { p_0: "Chương 1: Cậu bé sống sót" },
        { mode: "replace" }
      );

      expect(translated).toContain('Chương 1<br />Cậu bé sống sót');
    });

    it("preserves cross-file footnote links, cross-chapter links, external URLs, and anchor IDs byte-identically, allowing inner text to be translated", () => {
      const htmlWithAllLinks = `
        <p id="p0">
          <a id="intro-anchor"></a>
          According to research<a href="notes.xhtml#fn1">[1]</a>, readers can jump to <a href="chapter2.xhtml">Chapter 2</a> or visit <a href="https://example.com" target="_blank">our website</a>.
          Back to note <a href="../notes.xhtml#ref1" class="backlink">↩</a>.
        </p>
      `;

      const { maskedHtml, tagsMap } = ChapterTranslator.maskInlineMarkup(htmlWithAllLinks);

      // Verify text-bearing links are paired so their inner text remains visible for translation!
      expect(maskedHtml).toContain("⟦TAG_2⟧Chapter 2⟦/TAG_2⟧");
      expect(maskedHtml).toContain("⟦TAG_3⟧our website⟦/TAG_3⟧");

      // Model translates both the surrounding narrative AND the text inside the links!
      const translated = maskedHtml
        .replace("According to research", "Theo nghiên cứu")
        .replace("readers can jump to", "độc giả có thể chuyển đến")
        .replace("Chapter 2", "Chương 2") // Translated inner text of link!
        .replace("or visit", "hoặc truy cập")
        .replace("our website", "trang web của chúng tôi") // Translated inner text of link!
        .replace("Back to note", "Quay lại ghi chú");

      const { restoredText, missingPlaceholders } = ChapterTranslator.unmaskInlineMarkup(translated, tagsMap);

      expect(missingPlaceholders.length).toBe(0);
      expect(restoredText).toContain('<a id="intro-anchor"></a>');
      expect(restoredText).toContain('<a href="notes.xhtml#fn1">[1]</a>');
      // Inner text translated while href attribute is 100% preserved!
      expect(restoredText).toContain('<a href="chapter2.xhtml">Chương 2</a>');
      expect(restoredText).toContain('<a href="https://example.com" target="_blank">trang web của chúng tôi</a>');
      expect(restoredText).toContain('<a href="../notes.xhtml#ref1" class="backlink">↩</a>');
    });

    it("automatically re-appends cross-file links when model accidentally drops placeholder", () => {
      const html = '<p>Important reference<a href="endnotes.xhtml#n42">[42]</a> in the book.</p>';
      const translated = ChapterTranslator.applyTranslations(
        html,
        { p_0: "Tài liệu tham khảo quan trọng trong cuốn sách." },
        { mode: "replace" }
      );

      // Even if placeholder was dropped, the link to endnotes.xhtml MUST be salvaged at the end of the block
      expect(translated).toContain('<a href="endnotes.xhtml#n42">[42]</a>');
    });

    it("translates text inside text-bearing links and spans while keeping link markup intact", () => {
      const html = '<p>Please check <a href="chapter2.xhtml">Chapter Two: The Secret Room</a> and <span class="note">Author Warning</span> now.</p>';
      const blocks = ChapterTranslator.extractTranslatableBlocks(html);

      // Verify the extracted plain text keeps paired tokens so the inner text is accessible for translation
      expect(blocks[0].originalText).toContain("⟦TAG_0⟧Chapter Two: The Secret Room⟦/TAG_0⟧");
      expect(blocks[0].originalText).toContain("⟦TAG_1⟧Author Warning⟦/TAG_1⟧");

      // Model translates narrative AND the text inside the paired tokens
      const translations = {
        p_0: "Vui lòng xem ⟦TAG_0⟧Chương 2: Căn phòng bí mật⟦/TAG_0⟧ và ⟦TAG_1⟧Cảnh báo của tác giả⟦/TAG_1⟧ ngay bây giờ.",
      };

      const result = ChapterTranslator.applyTranslations(html, translations, { mode: "replace" });

      // Link href and span class must be preserved, while their inner text is fully translated to Vietnamese!
      expect(result).toContain('<a href="chapter2.xhtml">Chương 2: Căn phòng bí mật</a>');
      expect(result).toContain('<span class="note">Cảnh báo của tác giả</span>');
      expect(result).not.toContain("Chapter Two");
      expect(result).not.toContain("Author Warning");
    });
  });
});
