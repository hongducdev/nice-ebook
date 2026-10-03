/**
 * Single source of truth for the workspace navigation tabs.
 *
 * Previously this union was duplicated inline in `useAppStore.ts` and
 * `components/layout/Sidebar.tsx`, which allowed the two lists to drift apart.
 */

export type ActiveTab =
  | "books"
  | "presets"
  | "editor"
  | "reader"
  | "ai"
  | "settings"
  | "ai-editor"
  | "converter"
  | "translator"
  | "agent";
