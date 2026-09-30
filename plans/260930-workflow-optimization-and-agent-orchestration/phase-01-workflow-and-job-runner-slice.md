# Phase 01: Unified Workflow & Job Runner Slice

## Mục tiêu
Tập trung hóa trạng thái các tác vụ dài (Translation, Enhancement, X-Ray extraction, Conversion) vào Zustand store dưới dạng Background Jobs, giúp Chat Agent và UI có thể theo dõi tiến độ một cách mượt mà và không bị ngắt quãng khi người dùng chuyển đổi giữa các màn hình (tabs).

## Chi tiết công việc
- [ ] Định nghĩa kiểu dữ liệu `WorkflowJob` trong `src/types/` hoặc `src/stores/useAppStore.ts` (id, type, status: 'idle' | 'running' | 'completed' | 'failed', progress: number, label: string, result?: any, error?: string, createdAt: number).
- [ ] Thêm Workflow Slice vào `useAppStore.ts`:
  - `activeJobs: Record<string, WorkflowJob>`
  - `addJob: (job: Omit<WorkflowJob, 'createdAt'>) => string`
  - `updateJobProgress: (id: string, progress: number, label?: string) => void`
  - `completeJob: (id: string, result?: any) => void`
  - `failJob: (id: string, error: string) => void`
  - `clearJob: (id: string) => void`
- [ ] Viết `src/services/workflow/workflowJobService.ts` làm helper điều phối các tác vụ nền an toàn và cung cấp API tra cứu trạng thái cho Agent Tools.
- [ ] Viết unit tests cho Workflow Slice và Job Service.
