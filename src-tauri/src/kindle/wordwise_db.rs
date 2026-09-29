use super::WordWisePayload;
use rusqlite::{params, Connection, Result};
use std::path::Path;

pub fn build_wordwise_database<P: AsRef<Path>>(
    db_path: P,
    payload: &WordWisePayload,
) -> Result<u64, String> {
    let mut conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open Word Wise DB: {}", e))?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute_batch(
        r#"
        CREATE TABLE metadata (
            key TEXT,
            value TEXT
        );

        CREATE TABLE glosses (
            start INTEGER PRIMARY KEY,
            end INTEGER,
            difficulty INTEGER,
            sense_id INTEGER,
            low_confidence BOOLEAN
        );
        "#,
    )
    .map_err(|e| format!("Failed to create Word Wise tables: {}", e))?;

    let acr_val = payload.acr.as_deref().unwrap_or(&payload.asin);
    let rev_val = payload.revision.as_deref().unwrap_or("8d271dc3");

    let metadata_entries = [
        ("acr", acr_val),
        ("targetLanguages", "en"),
        ("sidecarRevision", "9"),
        ("bookRevision", rev_val),
        ("sourceLanguage", "en"),
        ("enDictionaryVersion", "2016-09-14"),
        ("enDictionaryRevision", "57"),
        ("enDictionaryId", "kll.en.en"),
        ("sidecarFormat", "1.0"),
    ];

    {
        let mut meta_stmt = tx
            .prepare("INSERT INTO metadata (key, value) VALUES (?1, ?2)")
            .map_err(|e| format!("Failed to prepare metadata stmt: {}", e))?;

        for (k, v) in metadata_entries {
            meta_stmt
                .execute(params![k, v])
                .map_err(|e| format!("Failed to insert metadata entry: {}", e))?;
        }
    }

    {
        let mut gloss_stmt = tx
            .prepare("INSERT OR REPLACE INTO glosses (start, end, difficulty, sense_id, low_confidence) VALUES (?1, ?2, ?3, ?4, 0)")
            .map_err(|e| format!("Failed to prepare gloss stmt: {}", e))?;

        for gloss in &payload.glosses {
            gloss_stmt
                .execute(params![
                    gloss.start,
                    gloss.end,
                    gloss.difficulty,
                    gloss.sense_id
                ])
                .map_err(|e| format!("Failed to insert gloss: {}", e))?;
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit Word Wise transaction: {}", e))?;

    let file_size = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    Ok(file_size)
}

#[cfg(test)]
mod tests {
    use super::super::WordWiseGlossPayload;
    use super::*;

    #[test]
    fn test_build_wordwise_database_schema_and_records() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "test_ww_{}.db",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        let payload = WordWisePayload {
            asin: "B00TEST888".to_string(),
            acr: Some("MyBook_PalmDB".to_string()),
            revision: Some("rev_abc123".to_string()),
            glosses: vec![
                WordWiseGlossPayload {
                    start: 1250,
                    end: 1259,
                    difficulty: 2,
                    sense_id: 10542,
                },
                WordWiseGlossPayload {
                    start: 1420,
                    end: 1430,
                    difficulty: 3,
                    sense_id: 20411,
                },
            ],
        };

        let size = build_wordwise_database(&db_path, &payload).unwrap();
        assert!(size > 0);

        let conn = Connection::open(&db_path).unwrap();

        // 1. Verify metadata
        let acr_read: String = conn
            .query_row("SELECT value FROM metadata WHERE key = 'acr'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(acr_read, "MyBook_PalmDB");

        let sidecar_format: String = conn
            .query_row(
                "SELECT value FROM metadata WHERE key = 'sidecarFormat'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(sidecar_format, "1.0");

        // 2. Verify glosses
        let total_glosses: i64 = conn
            .query_row("SELECT count(*) FROM glosses", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total_glosses, 2);

        let first_diff: i64 = conn
            .query_row(
                "SELECT difficulty FROM glosses WHERE start = 1250",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(first_diff, 2);

        let _ = std::fs::remove_file(&db_path);
    }
}
