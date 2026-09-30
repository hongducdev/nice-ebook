import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowJobService } from "./workflowJobService";
import { useAppStore } from "../../stores/useAppStore";

describe("WorkflowJobService", () => {
  beforeEach(() => {
    useAppStore.setState({ workflowJobs: {} });
  });

  it("registers and starts a background job in global store", () => {
    const jobId = WorkflowJobService.startJob("translation", "Dịch chương 1 sang tiếng Việt", "Đang kết nối AI gateway...");
    expect(jobId).toMatch(/^job_translation_/);

    const jobs = WorkflowJobService.getActiveJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].id).toBe(jobId);
    expect(jobs[0].type).toBe("translation");
    expect(jobs[0].status).toBe("running");
    expect(jobs[0].progress).toBe(0);
    expect(jobs[0].detail).toContain("Đang kết nối");
  });

  it("updates progress and clamps between 0 and 100", () => {
    const jobId = WorkflowJobService.startJob("enhancement", "Tối ưu định dạng chương");
    WorkflowJobService.updateProgress(jobId, 45, "Đang chuẩn hóa thẻ H1");

    let jobs = WorkflowJobService.getActiveJobs();
    expect(jobs[0].progress).toBe(45);
    expect(jobs[0].detail).toBe("Đang chuẩn hóa thẻ H1");

    // Clamping > 100
    WorkflowJobService.updateProgress(jobId, 150);
    jobs = WorkflowJobService.getActiveJobs();
    expect(jobs[0].progress).toBe(100);
  });

  it("marks a job as completed with result data", () => {
    const jobId = WorkflowJobService.startJob("kindle_xray", "Trích xuất X-Ray");
    WorkflowJobService.completeJob(jobId, { people: 12, terms: 5 });

    const jobs = WorkflowJobService.getActiveJobs();
    expect(jobs[0].status).toBe("completed");
    expect(jobs[0].progress).toBe(100);
    expect(jobs[0].result).toEqual({ people: 12, terms: 5 });
  });

  it("marks a job as failed with error message", () => {
    const jobId = WorkflowJobService.startJob("export", "Xuất file EPUB");
    WorkflowJobService.failJob(jobId, "Disk full");

    const jobs = WorkflowJobService.getActiveJobs();
    expect(jobs[0].status).toBe("failed");
    expect(jobs[0].error).toBe("Disk full");
    expect(jobs[0].detail).toContain("Thất bại");
  });
});
