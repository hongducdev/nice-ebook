import { describe, it, expect } from "vitest";
import { buildNavigationGroups } from "./Sidebar";
import type { ActiveTab } from "../../types/navigation";

const ALL_EXPECTED_TABS: ActiveTab[] = [
  "books",
  "editor",
  "reader",
  "ai",
  "settings",
  "ai-editor",
  "converter",
  "translator",
  "agent",
];

describe("Sidebar Navigation Exhaustiveness", () => {
  it("contains every ActiveTab value plus the special agent action item", () => {
    const groups = buildNavigationGroups({
      currentBook: { chapter_count: 12 },
      activeGateway: { name: "DeepSeek API" },
      modifiedCount: 2,
      pendingConverterFile: null,
      translationBadge: "2 ch.",
      bilingualActive: true,
    });

    const allItemIds = groups.flatMap((g) => g.items.map((i) => i.id));

    // 1. Assert all 9 expected tabs are present
    for (const expectedTab of ALL_EXPECTED_TABS) {
      expect(allItemIds).toContain(expectedTab);
    }

    // 2. Assert the special agent drawer item is present
    expect(allItemIds).toContain("agent");

    // 3. Assert no duplicate IDs exist across groups
    const uniqueIds = new Set(allItemIds);
    expect(uniqueIds.size).toBe(allItemIds.length);

    // 4. Assert total items count is exactly 9 (8 tabs + 1 agent)
    expect(allItemIds.length).toBe(9);
  });

  it("organizes items into pipeline and workspace groups", () => {
    const groups = buildNavigationGroups({});
    expect(groups.length).toBe(2);
    expect(groups[0].id).toBe("pipeline");
    expect(groups[0].title).toBe("Quy trình Ebook");
    expect(groups[1].id).toBe("workspace");
    expect(groups[1].title).toBe("Dự án & Hệ thống");
  });
});
