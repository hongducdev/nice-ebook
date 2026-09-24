use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaletteInfo {
    pub name: String,
    pub bg_color: String,
    pub text_color: String,
    pub accent_color: String,
    pub border_color: String,
    pub font_family: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypographySettings {
    pub drop_caps: bool,
    pub first_line_indent: String,
    pub line_height: f32,
    pub scene_divider: String,
    pub palette: PaletteInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JevDecision {
    pub genre: String,
    pub genre_label: String,
    pub confidence: f32,
    pub dialogue_ratio: f32,
    pub recommended_preset: String,
    pub typography: TypographySettings,
    pub explanation: String,
    pub is_vietnamese: bool,
}

pub struct JevClassifier;

impl JevClassifier {
    pub fn classify(text: &str) -> JevDecision {
        if text.trim().is_empty() {
            return Self::fallback_decision("Không có đủ nội dung văn bản để phân tích");
        }

        let total_chars = text.chars().count();
        if total_chars < 50 {
            return Self::fallback_decision("Văn bản quá ngắn");
        }

        let is_vietnamese = Self::is_vietnamese_text(text);

        // 1. Calculate dialogue ratio
        let mut dialogue_chars = 0;
        let mut in_quote = false;

        for c in text.chars() {
            if c == '“' || c == '「' || c == '"' {
                in_quote = true;
            } else if c == '”' || c == '」' || c == '"' {
                in_quote = false;
                dialogue_chars += 1;
            } else if in_quote {
                dialogue_chars += 1;
            }
        }

        // Check for dialogue dash format (e.g. "- Anh có đó không?")
        let mut dash_dialogue_chars = 0;
        for line in text.lines() {
            let trimmed = line.trim_start();
            if trimmed.starts_with('-') || trimmed.starts_with('–') || trimmed.starts_with('—')
            {
                dash_dialogue_chars += trimmed.chars().count();
            }
        }

        let effective_dialogue_chars = dialogue_chars.max(dash_dialogue_chars);
        let dialogue_ratio = (effective_dialogue_chars as f32 / total_chars as f32).min(1.0);

        // 2. Lexical keyword scoring
        let lower = text.to_lowercase();
        let mut scores: HashMap<&str, usize> = HashMap::new();

        let wuxia_words = [
            "tu tiên",
            "kiếm pháp",
            "chưởng",
            "linh khí",
            "tông môn",
            "chân nhân",
            "đan dược",
            "đạo hữu",
            "thiếu hiệp",
            "công lực",
            "tu vi",
            "thiên địa",
            "bổn tọa",
            "trảm",
            "huyền huyễn",
            "phi kiếm",
            "ngự kiếm",
            "yêu thú",
            "thần hồn",
            "độ kiếp",
            "trúc cơ",
            "nguyên anh",
            "pháp bảo",
            "trận pháp",
        ];

        let light_novel_words = [
            "senpai",
            "trường học",
            "ma vương",
            "dũng giả",
            "hệ thống",
            "thăng cấp",
            "kỹ năng",
            "thế giới khác",
            "isekai",
            "bang hội",
            "dungeon",
            "huyễn tưởng",
            "nữ chính",
            "nam chính",
            "nữ thần",
            "tinh linh",
            "rank",
            "level",
            "guild",
            "triệu hồi",
            "dị giới",
            "mana",
            "ma thuật",
            "tiệc mừng",
        ];

        let scifi_words = [
            "vũ trụ",
            "tinh cầu",
            "phi thuyền",
            "hệ thống",
            "trí tuệ nhân tạo",
            "mạng lưới",
            "robot",
            "laser",
            "công nghệ",
            "lượng tử",
            "cyber",
            "neural",
            "thiên hà",
            "ngoài hành tinh",
            "không gian",
            "trọng lực",
            "khoa học",
            "khoang lái",
            "hạm đội",
            "trạm không gian",
            "vận tốc ánh sáng",
        ];

        let mystery_words = [
            "thám tử",
            "vụ án",
            "hiện trường",
            "hung thủ",
            "bóng tối",
            "máu",
            "rùng mình",
            "thi thể",
            "bí ẩn",
            "âm thanh",
            "kinh hoàng",
            "sát nhân",
            "nguy hiểm",
            "manh mối",
            "chứng cứ",
            "điều tra",
            "nạn nhân",
            "dấu vết",
            "khám nghiệm",
        ];

        let classic_words = [
            "nàng",
            "chàng",
            "thời gian",
            "ký ức",
            "mùa thu",
            "cuộc đời",
            "linh hồn",
            "triết lý",
            "xã hội",
            "nhân loại",
            "tình yêu",
            "nỗi buồn",
            "hoàng hôn",
            "ánh trăng",
            "vẻ đẹp",
            "suy tư",
            "phố phường",
            "dĩ vãng",
            "khắc khoải",
        ];

        scores.insert("wuxia", Self::count_keywords(&lower, &wuxia_words));
        scores.insert(
            "light_novel",
            Self::count_keywords(&lower, &light_novel_words),
        );
        scores.insert("scifi", Self::count_keywords(&lower, &scifi_words));
        scores.insert("mystery", Self::count_keywords(&lower, &mystery_words));
        scores.insert("classic", Self::count_keywords(&lower, &classic_words));

        // Find highest scoring genre
        let mut top_genre = "classic";
        let mut max_score = 0;
        let mut total_score = 0;

        for (genre, &score) in &scores {
            total_score += score;
            if score > max_score {
                max_score = score;
                top_genre = genre;
            }
        }

        // Adjust for light novel if dialogue ratio is very high
        if dialogue_ratio > 0.45 && max_score == 0 {
            top_genre = "light_novel";
        }

        let confidence = if total_score > 0 {
            (max_score as f32 / total_score as f32).clamp(0.40, 0.95)
        } else {
            0.50
        };

        let vi_note = if is_vietnamese {
            " [Đã tối ưu bộ font tiếng Việt: Literata / Be Vietnam Pro / Noto Serif chống lỗi dấu]"
        } else {
            ""
        };

        match top_genre {
            "wuxia" => JevDecision {
                genre: "wuxia".to_string(),
                genre_label: "Tiên Hiệp / Cổ Phong".to_string(),
                confidence,
                dialogue_ratio,
                recommended_preset: "wuxia-ancient".to_string(),
                is_vietnamese,
                typography: TypographySettings {
                    drop_caps: true,
                    first_line_indent: "2em".to_string(),
                    line_height: 1.80,
                    scene_divider: "☁ ☁ ☁".to_string(),
                    palette: PaletteInfo {
                        name: "Giấy Dó Hoàng Gia".to_string(),
                        bg_color: "#181412".to_string(),
                        text_color: "#e8dcce".to_string(),
                        accent_color: "#dc2626".to_string(),
                        border_color: "#382923".to_string(),
                        font_family: if is_vietnamese {
                            "'Literata', 'Noto Serif', 'Times New Roman', serif".to_string()
                        } else {
                            "'Noto Serif', 'Times New Roman', serif".to_string()
                        },
                    },
                },
                explanation: format!(
                    "Nhận diện {} từ khóa Tiên hiệp/Cổ phong, tỷ lệ thoại {:.1}%. Đề xuất font có chân truyền thống kèm ấn triện.{}",
                    max_score, dialogue_ratio * 100.0, vi_note
                ),
            },
            "light_novel" => JevDecision {
                genre: "light_novel".to_string(),
                genre_label: "Light Novel / Hiện Đại".to_string(),
                confidence,
                dialogue_ratio,
                recommended_preset: "lightnovel-clean".to_string(),
                is_vietnamese,
                typography: TypographySettings {
                    drop_caps: false,
                    first_line_indent: "1.5em".to_string(),
                    line_height: 1.75,
                    scene_divider: "✦ ✦ ✦".to_string(),
                    palette: PaletteInfo {
                        name: "Anime Night Canvas".to_string(),
                        bg_color: "#0f1117".to_string(),
                        text_color: "#e2e8f0".to_string(),
                        accent_color: "#818cf8".to_string(),
                        border_color: "#1e2433".to_string(),
                        font_family: if is_vietnamese {
                            "'Be Vietnam Pro', 'Inter', -apple-system, sans-serif".to_string()
                        } else {
                            "'Inter', -apple-system, sans-serif".to_string()
                        },
                    },
                },
                explanation: format!(
                    "Tỷ lệ hội thoại cao ({:.1}%), văn phong trẻ trung. Đề xuất font Sans-serif thoáng và phân cách rõ ràng.{}",
                    dialogue_ratio * 100.0, vi_note
                ),
            },
            "scifi" => JevDecision {
                genre: "scifi".to_string(),
                genre_label: "Khoa Học Viễn Tưởng (Sci-Fi)".to_string(),
                confidence,
                dialogue_ratio,
                recommended_preset: "scifi-neon".to_string(),
                is_vietnamese,
                typography: TypographySettings {
                    drop_caps: false,
                    first_line_indent: "1em".to_string(),
                    line_height: 1.65,
                    scene_divider: "— ❖ —".to_string(),
                    palette: PaletteInfo {
                        name: "OLED Cyberpunk".to_string(),
                        bg_color: "#08080a".to_string(),
                        text_color: "#f1f5f9".to_string(),
                        accent_color: "#06b6d4".to_string(),
                        border_color: "#1e293b".to_string(),
                        font_family: "'JetBrains Mono', 'Segoe UI', monospace".to_string(),
                    },
                },
                explanation: format!(
                    "Phát hiện {} thuật ngữ công nghệ/vũ trụ. Đề xuất tông nền OLED đen sâu điểm nhấn Neon Cyan.{}",
                    max_score, vi_note
                ),
            },
            "mystery" => JevDecision {
                genre: "mystery".to_string(),
                genre_label: "Trinh Thám / Huyền Bí".to_string(),
                confidence,
                dialogue_ratio,
                recommended_preset: "mystery-dark".to_string(),
                is_vietnamese,
                typography: TypographySettings {
                    drop_caps: true,
                    first_line_indent: "1.75em".to_string(),
                    line_height: 1.70,
                    scene_divider: "❖".to_string(),
                    palette: PaletteInfo {
                        name: "Bóng Đêm Thám Tử".to_string(),
                        bg_color: "#101012".to_string(),
                        text_color: "#d4d4d8".to_string(),
                        accent_color: "#a855f7".to_string(),
                        border_color: "#27272a".to_string(),
                        font_family: if is_vietnamese {
                            "'Merriweather', 'Literata', 'Lora', 'Noto Serif', 'Palatino Linotype', 'Georgia', serif".to_string()
                        } else {
                            "'Merriweather', 'Lora', Georgia, serif".to_string()
                        },
                    },
                },
                explanation: format!(
                    "Nhận diện phong cách bí ẩn/trinh thám ({} từ khóa). Đề xuất màu tím thẫm thanh lịch và chữ cái đầu chương nổi bật.{}",
                    max_score, vi_note
                ),
            },
            _ => JevDecision {
                genre: "classic".to_string(),
                genre_label: "Văn Học Kinh Điển / Tổng Hợp".to_string(),
                confidence,
                dialogue_ratio,
                recommended_preset: "classic-hardcover".to_string(),
                is_vietnamese,
                typography: TypographySettings {
                    drop_caps: true,
                    first_line_indent: "2em".to_string(),
                    line_height: 1.75,
                    scene_divider: "♦ ♦ ♦".to_string(),
                    palette: PaletteInfo {
                        name: "Ấn Bản Bìa Cứng".to_string(),
                        bg_color: "#161618".to_string(),
                        text_color: "#f4f4f5".to_string(),
                        accent_color: "#eab308".to_string(),
                        border_color: "#2e2e33".to_string(),
                        font_family: if is_vietnamese {
                            "'Literata', 'Lora', 'Merriweather', 'Noto Serif', 'Palatino Linotype', 'Georgia', serif".to_string()
                        } else {
                            "'Lora', 'Georgia', serif".to_string()
                        },
                    },
                },
                explanation: format!(
                    "Văn phong văn học chuẩn mực, tỷ lệ hội thoại {:.1}%. Đề xuất layout sách giấy kinh điển có Drop-caps.{}",
                    dialogue_ratio * 100.0, vi_note
                ),
            },
        }
    }

    pub fn is_vietnamese_text(text: &str) -> bool {
        const VI_STRICT_CHARS: &[char] = &[
            'ơ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ', 'ư', 'ứ', 'ừ', 'ử', 'ữ', 'ự', 'đ', 'Đ', 'ạ', 'ẹ', 'ị',
            'ọ', 'ụ', 'ỵ', 'ả', 'ẻ', 'ỉ', 'ỏ', 'ủ', 'ỷ', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ', 'ế', 'ề', 'ể',
            'ễ', 'ệ', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ', 'ứ', 'ừ', 'ử', 'ữ', 'ự',
            'Ơ', 'Ớ', 'Ờ', 'Ở', 'Ỡ', 'Ợ', 'Ư', 'Ứ', 'Ừ', 'Ử', 'Ữ', 'Ự', 'Ạ', 'Ẹ', 'Ị', 'Ọ', 'Ụ',
            'Ỵ', 'Ả', 'Ẻ', 'Ỉ', 'Ỏ', 'Ủ', 'Ỷ', 'Ấ', 'Ầ', 'Ẩ', 'Ẫ', 'Ậ', 'Ế', 'Ề', 'Ể', 'Ễ', 'Ệ',
            'Ố', 'Ồ', 'Ổ', 'Ỗ', 'Ộ', 'Ắ', 'Ằ', 'Ẳ', 'Ẵ', 'Ặ', 'Ứ', 'Ừ', 'Ử', 'Ữ', 'Ự',
        ];
        let mut count = 0;
        for c in text.chars() {
            if VI_STRICT_CHARS.contains(&c) {
                count += 1;
                if count >= 2 {
                    return true;
                }
            }
        }
        false
    }

    fn count_keywords(text: &str, keywords: &[&str]) -> usize {
        let mut count = 0;
        for &kw in keywords {
            if text.contains(kw) {
                count += 1;
            }
        }
        count
    }

    fn fallback_decision(reason: &str) -> JevDecision {
        JevDecision {
            genre: "classic".to_string(),
            genre_label: "Văn Học Chuẩn Mực".to_string(),
            confidence: 0.5,
            dialogue_ratio: 0.25,
            recommended_preset: "classic-hardcover".to_string(),
            is_vietnamese: false,
            typography: TypographySettings {
                drop_caps: true,
                first_line_indent: "2em".to_string(),
                line_height: 1.75,
                scene_divider: "♦ ♦ ♦".to_string(),
                palette: PaletteInfo {
                    name: "Ấn Bản Bìa Cứng".to_string(),
                    bg_color: "#161618".to_string(),
                    text_color: "#f4f4f5".to_string(),
                    accent_color: "#eab308".to_string(),
                    border_color: "#2e2e33".to_string(),
                    font_family: "'Lora', 'Georgia', serif".to_string(),
                },
            },
            explanation: format!("Áp dụng kiểu mặc định ({})", reason),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wuxia_classification() {
        let text = "Trần Phong vận chuyển linh khí, ngự kiếm bay vút lên trời. Chân nhân tông môn mỉm cười nhìn vị thiếu hiệp tu vi tiến triển thần tốc. Đan dược này giúp ngươi độ kiếp.";
        let decision = JevClassifier::classify(text);
        assert_eq!(decision.genre, "wuxia");
        assert!(decision.confidence >= 0.4);
    }

    #[test]
    fn test_light_novel_dialogue_classification() {
        let text = "“Senpai, hôm nay chúng ta có đi thám hiểm dungeon không?”\n“Tất nhiên rồi, dũng giả cần thăng cấp kỹ năng trước khi đối đầu ma vương ở thế giới khác.”";
        let decision = JevClassifier::classify(text);
        assert_eq!(decision.genre, "light_novel");
        assert!(decision.dialogue_ratio > 0.3);
    }

    #[test]
    fn test_scifi_classification() {
        let text = "Hạm đội phi thuyền tiến vào quỹ đạo tinh cầu. Trí tuệ nhân tạo cảnh báo mạng lưới radar lượng tử của địch đang khóa mục tiêu. Khoang lái rung chuyển dữ dội.";
        let decision = JevClassifier::classify(text);
        assert_eq!(decision.genre, "scifi");
        assert!(decision.is_vietnamese);
    }

    #[test]
    fn test_vietnamese_detection_positive() {
        let text = "Truyện Kiều là một tác phẩm văn học kinh điển của đại thi hào Nguyễn Du.";
        assert!(JevClassifier::is_vietnamese_text(text));
        let decision = JevClassifier::classify(text);
        assert!(decision.is_vietnamese);
        assert!(decision.typography.palette.font_family.contains("Literata"));
    }

    #[test]
    fn test_vietnamese_detection_negative() {
        let text =
            "The quick brown fox jumps over the lazy dog. A classic English sample sentence.";
        assert!(!JevClassifier::is_vietnamese_text(text));
        let decision = JevClassifier::classify(text);
        assert!(!decision.is_vietnamese);
    }

    #[test]
    fn test_vietnamese_detection_negative_foreign_languages_with_accents() {
        // French with accents (é, è, â, à) should NOT false positive as Vietnamese
        let french = "Les Misérables par Victor Hugo. Le château et le café à Paris.";
        assert!(!JevClassifier::is_vietnamese_text(french));

        // Spanish with accents (ñ, á, í) should NOT false positive as Vietnamese
        let spanish = "Cien años de soledad por Gabriel García Márquez en España.";
        assert!(!JevClassifier::is_vietnamese_text(spanish));

        // German with umlauts (ü, ö, ä) should NOT false positive as Vietnamese
        let german = "Faust von Johann Wolfgang von Goethe. Über allen Gipfeln ist Ruh.";
        assert!(!JevClassifier::is_vietnamese_text(german));
    }
}
