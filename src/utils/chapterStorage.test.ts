import { describe, it, expect } from "vitest";
import { saveCoverToDb, loadCoverFromDb, deleteCoverFromDb } from "./chapterStorage";

describe("chapterStorage cover persistence", () => {
  it("handles non-browser or mock environments gracefully", async () => {
    // When indexedDB is not available or mocked
    const res = await loadCoverFromDb("test-project");
    expect(res).toBeNull();

    await expect(saveCoverToDb("test-project", "data:image/png;base64,mock")).resolves.toBeUndefined();
    await expect(deleteCoverFromDb("test-project")).resolves.toBeUndefined();
  });
});
