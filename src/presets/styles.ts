export interface StylePreset {
  id: string;
  name: string;
  genre: string;
  genreLabel: string;
  description: string;
  fontFamily: string;
  lineHeight: number;
  firstLineIndent: string;
  dropCaps: boolean;
  sceneDivider: string;
  colors: {
    bg: string;
    text: string;
    accent: string;
    border: string;
    cardBg: string;
  };
  cssTemplate: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "wuxia-ancient",
    name: "Cổ Phong / Tiên Hiệp",
    genre: "wuxia",
    genreLabel: "Tiên Hiệp",
    description: "Đậm nét cổ trang phương Đông, tiêu đề ấn triện đỏ, mây cuộn phân cảnh, font chữ thư pháp thanh nhã.",
    fontFamily: "'Noto Serif', 'Times New Roman', serif",
    lineHeight: 1.8,
    firstLineIndent: "2em",
    dropCaps: true,
    sceneDivider: "☁ ☁ ☁",
    colors: {
      bg: "#181412",
      text: "#e8dcce",
      accent: "#dc2626",
      border: "#382923",
      cardBg: "#221c19",
    },
    cssTemplate: `
body {
  background-color: #181412;
  color: #e8dcce;
  font-family: 'Noto Serif', 'Times New Roman', serif;
  line-height: 1.8;
  padding: 1.5rem;
}
h1, h2, h3 {
  color: #dc2626;
  text-align: center;
  font-weight: bold;
  letter-spacing: 0.1em;
  border-bottom: 1px solid #382923;
  padding-bottom: 0.5em;
  margin-top: 1.5em;
}
p {
  text-indent: 2em;
  text-align: justify;
  margin-bottom: 0.5em;
}
.drop-cap {
  float: left;
  font-size: 3.2em;
  line-height: 0.8;
  padding-right: 0.15em;
  color: #dc2626;
  font-family: serif;
}
.scene-divider {
  text-align: center;
  color: #dc2626;
  margin: 1.5em 0;
  letter-spacing: 0.4em;
  font-size: 1.1em;
}
`,
  },
  {
    id: "lightnovel-clean",
    name: "Light Novel / Anime",
    genre: "light_novel",
    genreLabel: "Light Novel",
    description: "Khoảng cách dòng thoáng đãng, font không chân hiện đại, khối hội thoại nổi bật, dấu hoa anh đào dịu mắt.",
    fontFamily: "'Inter', -apple-system, sans-serif",
    lineHeight: 1.75,
    firstLineIndent: "1.5em",
    dropCaps: false,
    sceneDivider: "✦ ✦ ✦",
    colors: {
      bg: "#0f1117",
      text: "#e2e8f0",
      accent: "#818cf8",
      border: "#1e2433",
      cardBg: "#161b26",
    },
    cssTemplate: `
body {
  background-color: #0f1117;
  color: #e2e8f0;
  font-family: 'Inter', -apple-system, sans-serif;
  line-height: 1.75;
  padding: 1.5rem;
}
h1, h2, h3 {
  color: #818cf8;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-top: 1.5em;
}
p {
  text-indent: 1.5em;
  margin-bottom: 0.6em;
}
.scene-divider {
  text-align: center;
  color: #818cf8;
  margin: 2em 0;
  letter-spacing: 0.5em;
  font-size: 0.9em;
  opacity: 0.85;
}
`,
  },
  {
    id: "scifi-neon",
    name: "Khoa Học Viễn Tưởng",
    genre: "scifi",
    genreLabel: "Sci-Fi",
    description: "Tông nền OLED sâu thẳm, điểm nhấn xanh Cyan huỳnh quang, font monospaced kỹ thuật số, đường chia sắc nét.",
    fontFamily: "'JetBrains Mono', 'Segoe UI', monospace",
    lineHeight: 1.65,
    firstLineIndent: "1em",
    dropCaps: false,
    sceneDivider: "— ❖ —",
    colors: {
      bg: "#08080a",
      text: "#f1f5f9",
      accent: "#06b6d4",
      border: "#1e293b",
      cardBg: "#111217",
    },
    cssTemplate: `
body {
  background-color: #08080a;
  color: #f1f5f9;
  font-family: 'JetBrains Mono', 'Segoe UI', monospace;
  line-height: 1.65;
  padding: 1.5rem;
}
h1, h2, h3 {
  color: #06b6d4;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  border-left: 3px solid #06b6d4;
  padding-left: 0.75em;
}
p {
  text-indent: 1em;
  margin-bottom: 0.7em;
}
.scene-divider {
  text-align: center;
  color: #06b6d4;
  margin: 1.8em 0;
  letter-spacing: 0.3em;
  font-size: 0.85em;
}
`,
  },
  {
    id: "classic-hardcover",
    name: "Văn Học Bìa Cứng",
    genre: "classic",
    genreLabel: "Kinh Điển",
    description: "Đẳng cấp sách in bìa cứng châu Âu, font có chân Lora trang trọng, chữ cái đầu chương Drop-cap quý phái.",
    fontFamily: "'Lora', 'Georgia', serif",
    lineHeight: 1.75,
    firstLineIndent: "2em",
    dropCaps: true,
    sceneDivider: "♦ ♦ ♦",
    colors: {
      bg: "#161618",
      text: "#f4f4f5",
      accent: "#eab308",
      border: "#2e2e33",
      cardBg: "#1c1c20",
    },
    cssTemplate: `
body {
  background-color: #161618;
  color: #f4f4f5;
  font-family: 'Lora', 'Georgia', serif;
  line-height: 1.75;
  padding: 1.5rem;
}
h1, h2, h3 {
  color: #eab308;
  text-align: center;
  font-style: italic;
  margin-top: 2em;
}
p {
  text-indent: 2em;
  text-align: justify;
  margin-bottom: 0.5em;
}
.drop-cap {
  float: left;
  font-size: 3.5em;
  line-height: 0.8;
  padding-right: 0.12em;
  color: #eab308;
}
.scene-divider {
  text-align: center;
  color: #eab308;
  margin: 1.5em 0;
  letter-spacing: 0.5em;
}
`,
  },
  {
    id: "mystery-dark",
    name: "Trinh Thám / Huyền Bí",
    genre: "mystery",
    genreLabel: "Trinh Thám",
    description: "Bầu không khí hồi hộp, tím thẫm ma mị, chữ cái đầu chương nổi bật, nhịp điệu ngắt cảnh dứt khoát.",
    fontFamily: "'Merriweather', Georgia, serif",
    lineHeight: 1.7,
    firstLineIndent: "1.75em",
    dropCaps: true,
    sceneDivider: "❖",
    colors: {
      bg: "#101012",
      text: "#d4d4d8",
      accent: "#a855f7",
      border: "#27272a",
      cardBg: "#18181c",
    },
    cssTemplate: `
body {
  background-color: #101012;
  color: #d4d4d8;
  font-family: 'Merriweather', Georgia, serif;
  line-height: 1.7;
  padding: 1.5rem;
}
h1, h2, h3 {
  color: #a855f7;
  letter-spacing: 0.08em;
  margin-top: 1.5em;
}
p {
  text-indent: 1.75em;
  margin-bottom: 0.5em;
}
.drop-cap {
  float: left;
  font-size: 3em;
  line-height: 0.85;
  padding-right: 0.15em;
  color: #a855f7;
}
.scene-divider {
  text-align: center;
  color: #a855f7;
  margin: 1.5em 0;
  font-size: 1.2em;
}
`,
  },
];
