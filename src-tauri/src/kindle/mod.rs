pub mod converter;
pub mod epub_rewrite;
pub mod link_repair;
pub mod sdr_packager;
pub mod toc_repair;
pub mod wordwise_db;
pub mod xray_db;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XRayEntityPayload {
    pub id: i64,
    pub name: String,
    pub aliases: Vec<String>,
    pub entity_type: String, // "person" or "term"
    pub role: Option<String>,
    pub description: String,
    pub occurrences_count: i64,
    pub occurrences: Vec<(i64, i64)>, // (start_offset, length)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XRayPayload {
    pub asin: String,
    pub book_title: String,
    pub people: Vec<XRayEntityPayload>,
    pub terms: Vec<XRayEntityPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordWiseGlossPayload {
    pub start: i64,
    pub end: i64,
    pub difficulty: i64,
    pub sense_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordWisePayload {
    pub asin: String,
    pub acr: Option<String>,
    pub revision: Option<String>,
    pub glosses: Vec<WordWiseGlossPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdrExportResult {
    pub sdr_dir_path: String,
    pub xray_file_path: Option<String>,
    pub wordwise_file_path: Option<String>,
    /// Name of the book file this sidecar was paired with, when one was found in the target folder.
    pub paired_book_file: Option<String>,
    pub total_bytes: u64,
}
