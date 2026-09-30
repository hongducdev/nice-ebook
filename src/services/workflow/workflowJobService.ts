import { WorkflowJob, WorkflowJobType } from "../../types/workflow";
import { useAppStore } from "../../stores/useAppStore";

export class WorkflowJobService {
  /**
   * Start or register a background job in the global store.
   */
  public static startJob(
    type: WorkflowJobType,
    label: string,
    initialDetail?: string
  ): string {
    const id = `job_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const store = useAppStore.getState();
    if (store.addWorkflowJob) {
      store.addWorkflowJob({
        id,
        type,
        label,
        status: "running",
        progress: 0,
        detail: initialDetail,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return id;
  }

  /**
   * Update progress of an existing job.
   */
  public static updateProgress(
    id: string,
    progress: number,
    detail?: string
  ): void {
    const store = useAppStore.getState();
    if (store.updateWorkflowJob) {
      store.updateWorkflowJob(id, {
        progress: Math.min(100, Math.max(0, progress)),
        detail,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Mark a job as successfully completed.
   */
  public static completeJob(id: string, result?: unknown, detail?: string): void {
    const store = useAppStore.getState();
    if (store.updateWorkflowJob) {
      store.updateWorkflowJob(id, {
        status: "completed",
        progress: 100,
        result,
        detail: detail || "Hoàn thành tác vụ thành công.",
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Mark a job as failed with error details.
   */
  public static failJob(id: string, error: string): void {
    const store = useAppStore.getState();
    if (store.updateWorkflowJob) {
      store.updateWorkflowJob(id, {
        status: "failed",
        error,
        detail: `Thất bại: ${error}`,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Get all active or recent jobs summary.
   */
  public static getActiveJobs(): WorkflowJob[] {
    const store = useAppStore.getState();
    return Object.values(store.workflowJobs || {});
  }
}
