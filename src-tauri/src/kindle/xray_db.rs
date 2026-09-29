use super::{XRayEntityPayload, XRayPayload};
use rusqlite::{params, Connection, Result};
use std::path::Path;

pub fn build_xray_database<P: AsRef<Path>>(
    db_path: P,
    payload: &XRayPayload,
) -> Result<u64, String> {
    let mut conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open X-Ray DB: {}", e))?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // PRAGMA user_version = 1 is strictly required by Kindle X-Ray reader
    tx.execute_batch(
        r#"
        PRAGMA user_version = 1;

        CREATE TABLE book_metadata (
            srl INTEGER,
            erl INTEGER,
            has_images TINYINT,
            has_excerpts TINYINT,
            show_spoilers_default TINYINT,
            num_people INTEGER,
            num_terms INTEGER,
            num_images INTEGER,
            preview_images TEXT
        );

        CREATE TABLE entity (
            id INTEGER PRIMARY KEY,
            label TEXT,
            loc_label INTEGER,
            type INTEGER,
            count INTEGER,
            has_info_card TINYINT
        );

        CREATE TABLE entity_description (
            text TEXT,
            source_wildcard TEXT,
            source INTEGER,
            entity INTEGER PRIMARY KEY
        );

        CREATE TABLE entity_excerpt (
            entity INTEGER,
            excerpt INTEGER
        );

        CREATE TABLE excerpt (
            id INTEGER PRIMARY KEY,
            start INTEGER,
            length INTEGER,
            image TEXT,
            related_entities TEXT,
            goto INTEGER
        );

        CREATE TABLE occurrence (
            entity INTEGER,
            start INTEGER,
            length INTEGER
        );

        CREATE TABLE source (
            id INTEGER PRIMARY KEY,
            label INTEGER,
            url INTEGER,
            license_label INTEGER,
            license_url INTEGER
        );

        CREATE TABLE string (
            id INTEGER,
            language TEXT,
            text TEXT
        );

        CREATE TABLE type (
            id INTEGER PRIMARY KEY,
            label INTEGER,
            singular_label INTEGER,
            icon INTEGER,
            top_mentioned_entities TEXT
        );

        INSERT INTO entity (id, loc_label, has_info_card) VALUES(0, 1, 0);
        INSERT INTO source (id, label, url) VALUES(0, 5, 20);
        INSERT INTO source VALUES(1, 6, 21, 7, 8);
        "#,
    )
    .map_err(|e| format!("Failed to initialize X-Ray schema: {}", e))?;

    // Standard Kindle UI strings for English / Universal Kindle Reader
    let standard_strings = [
        (0, "en", "All"),
        (1, "en", "Book"),
        (5, "en", "Kindle Store"),
        (6, "en", "Wikipedia"),
        (7, "en", "Creative Commons Attribution Share-Alike license"),
        (
            8,
            "en",
            "http://creativecommons.org/licenses/by-sa/3.0/legalcode",
        ),
        (14, "en", "People"),
        (15, "en", "Person"),
        (16, "en", "Terms"),
        (17, "en", "Term"),
        (18, "en", "Themes"),
        (19, "en", "Theme"),
        (20, "en", "store://%s"),
        (21, "en", "https://en.wikipedia.org/wiki/%s"),
    ];

    {
        let mut stmt = tx
            .prepare("INSERT INTO string (id, language, text) VALUES (?1, ?2, ?3)")
            .map_err(|e| format!("Failed to prepare string insert: {}", e))?;
        for (id, lang, text) in standard_strings {
            stmt.execute(params![id, lang, text])
                .map_err(|e| format!("Failed to insert string: {}", e))?;
        }
    }

    let mut next_id: i64 = 1;
    let mut people_ids: Vec<i64> = Vec::new();
    let mut terms_ids: Vec<i64> = Vec::new();
    let mut max_offset: i64 = 1000;

    // Helper closure to insert entity items
    let mut insert_entity_group = |entities: &[XRayEntityPayload],
                                   entity_type: i64,
                                   ids_collector: &mut Vec<i64>|
     -> Result<(), String> {
        let mut entity_stmt = tx
            .prepare("INSERT INTO entity (id, label, loc_label, type, count, has_info_card) VALUES (?1, ?2, ?3, ?4, ?5, 1)")
            .map_err(|e| format!("Failed to prepare entity stmt: {}", e))?;

        let mut desc_stmt = tx
            .prepare("INSERT INTO entity_description (text, source_wildcard, source, entity) VALUES (?1, ?2, 1, ?3)")
            .map_err(|e| format!("Failed to prepare desc stmt: {}", e))?;

        let mut occ_stmt = tx
            .prepare("INSERT INTO occurrence (entity, start, length) VALUES (?1, ?2, ?3)")
            .map_err(|e| format!("Failed to prepare occ stmt: {}", e))?;

        for item in entities {
            let eid = next_id;
            next_id += 1;
            ids_collector.push(eid);

            let count = if item.occurrences_count > 0 {
                item.occurrences_count
            } else if !item.occurrences.is_empty() {
                item.occurrences.len() as i64
            } else {
                1
            };

            entity_stmt
                .execute(params![eid, item.name, entity_type, entity_type, count])
                .map_err(|e| format!("Failed to insert entity: {}", e))?;

            desc_stmt
                .execute(params![item.description, item.name, eid])
                .map_err(|e| format!("Failed to insert description: {}", e))?;

            if !item.occurrences.is_empty() {
                for &(start, length) in &item.occurrences {
                    if start + length > max_offset {
                        max_offset = start + length;
                    }
                    occ_stmt
                        .execute(params![eid, start, length])
                        .map_err(|e| format!("Failed to insert occurrence: {}", e))?;
                }
            } else {
                // Ensure at least 1 occurrence exists for Kindle reader indexing
                occ_stmt
                    .execute(params![eid, 100, item.name.len() as i64])
                    .map_err(|e| format!("Failed to insert dummy occurrence: {}", e))?;
            }
        }

        Ok(())
    };

    insert_entity_group(&payload.people, 1, &mut people_ids)?;
    insert_entity_group(&payload.terms, 2, &mut terms_ids)?;

    // Types definition with top 10 entity IDs
    let top_people_str = people_ids
        .iter()
        .take(10)
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let top_terms_str = terms_ids
        .iter()
        .take(10)
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");

    tx.execute(
        "INSERT INTO type (id, label, singular_label, icon, top_mentioned_entities) VALUES (1, 14, 15, 1, ?1)",
        params![top_people_str],
    )
    .map_err(|e| format!("Failed to insert type 1: {}", e))?;

    tx.execute(
        "INSERT INTO type (id, label, singular_label, icon, top_mentioned_entities) VALUES (2, 16, 17, 2, ?1)",
        params![top_terms_str],
    )
    .map_err(|e| format!("Failed to insert type 2: {}", e))?;

    // Book metadata summary
    let num_people = payload.people.len() as i64;
    let num_terms = payload.terms.len() as i64;

    tx.execute(
        "INSERT INTO book_metadata VALUES (0, ?1, 0, 0, 0, ?2, ?3, 0, '')",
        params![max_offset, num_people, num_terms],
    )
    .map_err(|e| format!("Failed to insert book metadata: {}", e))?;

    // Create B-tree indexes as required by Kindle
    tx.execute_batch(
        r#"
        CREATE INDEX idx_entity_type ON entity(type ASC);
        CREATE INDEX idx_entity_excerpt ON entity_excerpt(entity ASC);
        CREATE INDEX idx_occurrence_start ON occurrence(start ASC);
        PRAGMA optimize;
        "#,
    )
    .map_err(|e| format!("Failed to create indexes: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    let file_size = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    Ok(file_size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_xray_database_schema_and_user_version() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!(
            "test_xray_{}.db",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        let payload = XRayPayload {
            asin: "B00TEST123".to_string(),
            book_title: "Test Detective Novel".to_string(),
            people: vec![
                XRayEntityPayload {
                    id: 1,
                    name: "Sherlock Holmes".to_string(),
                    aliases: vec!["Holmes".to_string()],
                    entity_type: "person".to_string(),
                    role: Some("Detective".to_string()),
                    description: "Consulting detective".to_string(),
                    occurrences_count: 5,
                    occurrences: vec![(100, 15), (250, 6)],
                },
                XRayEntityPayload {
                    id: 2,
                    name: "Dr. Watson".to_string(),
                    aliases: vec![],
                    entity_type: "person".to_string(),
                    role: None,
                    description: "Loyal companion".to_string(),
                    occurrences_count: 3,
                    occurrences: vec![(120, 10)],
                },
            ],
            terms: vec![XRayEntityPayload {
                id: 3,
                name: "Baker Street".to_string(),
                aliases: vec![],
                entity_type: "term".to_string(),
                role: Some("Location".to_string()),
                description: "Famous street in London".to_string(),
                occurrences_count: 2,
                occurrences: vec![(150, 12)],
            }],
        };

        let size = build_xray_database(&db_path, &payload).unwrap();
        assert!(size > 0);

        let conn = Connection::open(&db_path).unwrap();

        // 1. Verify PRAGMA user_version = 1
        let user_version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(user_version, 1);

        // 2. Verify book_metadata record
        let (num_people, num_terms): (i64, i64) = conn
            .query_row("SELECT num_people, num_terms FROM book_metadata", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(num_people, 2);
        assert_eq!(num_terms, 1);

        // 3. Verify entities count (including dummy entity id=0)
        let total_entities: i64 = conn
            .query_row("SELECT count(*) FROM entity", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total_entities, 4); // 0 (dummy) + 2 people + 1 term

        // 4. Verify occurrences
        let total_occurrences: i64 = conn
            .query_row("SELECT count(*) FROM occurrence", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total_occurrences, 4); // 2 + 1 + 1

        // 5. Verify string table has All and Wikipedia
        let has_wiki: bool = conn
            .query_row(
                "SELECT count(*) FROM string WHERE text = 'Wikipedia'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap()
            > 0;
        assert!(has_wiki);

        let _ = std::fs::remove_file(&db_path);
    }
}
