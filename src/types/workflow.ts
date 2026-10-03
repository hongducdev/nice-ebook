export type WorkflowJobType =
  | "translation"
  | "enhancement"
  | "ocr"
  | "export"
  | "custom";

export type WorkflowJobStatus = "idle" | "running" | "completed" | "failed";

export interface WorkflowJob {
  id: string;
  type: WorkflowJobType;
  label: string;
  status: WorkflowJobStatus;
  progress: number; // 0 to 100
  detail?: string;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
