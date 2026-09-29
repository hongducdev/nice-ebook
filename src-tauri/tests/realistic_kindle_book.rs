//! Manual, evidence-producing gate for the Kindle conversion core.
//!
//! These tests are `#[ignore]`d by default so CI never depends on a local Calibre installation or
//! on a fixture living outside the repository. They exist to produce on-demand evidence that our
//! own converter module handles a realistic, large book — the class of input a single-chapter
//! fixture cannot represent.
//!
//! Run them explicitly:
//!
//! ```text
//! # 1. Convert a realistic book with our own core.
//! set NICEBOOK_REALISTIC_EPUB=C:\path\to\realistic.epub
//! cargo test --test realistic_kindle_book -- --ignored --nocapture
//!
//! # 2. Optionally verify the result with an independent reader (Calibre used as an ORACLE only,
//! #    never as part of the product):
//! #    ebook-convert out.azw3 back.epub  and inspect for <ruby>/<rt> and the appendix chapter.
//! ```

use std::path::PathBuf;

/// Reads the fixture path from the environment; returns `None` when the gate is not configured.
fn fixture_path() -> Option<PathBuf> {
    let raw = std::env::var("NICEBOOK_REALISTIC_EPUB").ok()?;
    let path = PathBuf::from(raw);
    if path.is_file() {
        Some(path)
    } else {
        eprintln!(
            "NICEBOOK_REALISTIC_EPUB points at a missing file: {}",
            path.display()
        );
        None
    }
}

#[test]
#[ignore = "manual gate: requires a realistic EPUB via NICEBOOK_REALISTIC_EPUB"]
fn realistic_book_converts_with_the_built_in_core() {
    let Some(input) = fixture_path() else {
        eprintln!("skipped: set NICEBOOK_REALISTIC_EPUB to a realistic .epub file");
        return;
    };

    let out_dir = std::env::temp_dir().join(format!(
        "niceebook_realistic_gate_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&out_dir).unwrap();
    let output = out_dir.join("realistic.azw3");

    let started = std::time::Instant::now();
    // Exercises the real user path, including the dangling-link repair stage.
    let result = tauri_app_lib::kindle::converter::build_kindle_ready_epub_and_convert(
        Some(input.to_str().unwrap()),
        None,
        output.to_str().unwrap(),
        "body { margin: 0; }",
        None,
        None,
        None,
    )
    .expect("conversion of a realistic book must succeed");
    let elapsed = started.elapsed();

    let input_bytes = std::fs::metadata(&input).map(|m| m.len()).unwrap_or(0);

    println!("input : {} ({} bytes)", input.display(), input_bytes);
    println!("output: {}", result.output_path);
    println!(
        "format: {:?} | {} bytes | {:.2}s",
        result.format,
        result.output_bytes,
        elapsed.as_secs_f64()
    );
    println!("warnings: {}", result.warnings.len());
    for warning in &result.warnings {
        println!("  - {}", warning);
    }
    if let Some(link_repair) = &result.link_repair {
        println!(
            "link repair: scanned {} docs, removed {} dangling links, stripped {} fragments",
            link_repair.documents_scanned,
            link_repair.dangling_links_removed,
            link_repair.fragments_stripped
        );
        for target in &link_repair.missing_targets {
            println!("  missing target: {}", target);
        }
    }
    if let Some(toc) = &result.toc_repair {
        println!(
            "toc repair: had_ncx={} had_nav={} added_ncx={} added_nav={} entries={}",
            toc.had_ncx, toc.had_nav, toc.added_ncx, toc.added_nav, toc.entry_count
        );
    }

    // The container must be a real PalmDB/MOBI file.
    let bytes = std::fs::read(&output).unwrap();
    assert!(bytes.len() > 68);
    assert_eq!(
        &bytes[60..68],
        b"BOOKMOBI",
        "output is not a MOBI container"
    );

    assert!(
        result.output_bytes > input_bytes / 4,
        "suspiciously small output for a full book"
    );

    // Leave the artifact in place so it can be fed to an independent reader as an oracle.
    println!("artifact kept at: {}", output.display());
}
