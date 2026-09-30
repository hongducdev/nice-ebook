import { toast } from "sonner";
import { useAppStore } from "../../stores/useAppStore";
import { workflowLabel } from "../../utils/bookTypeDetector";

/**
 * Surfaces the routing decision the store just made.
 *
 * This is deliberately *presentational only*: the routing itself lives in
 * `useAppStore.routeAfterBookLoad` so it can be unit-tested. Callers just invoke
 * this after awaiting a load action.
 */
export function notifyIngestRoute(): void {
  const route = useAppStore.getState().lastIngestRoute;
  if (!route || !route.profile) return;

  const { profile, switched, reason } = route;
  const label = workflowLabel(profile);
  const headline = `${profile.languageFlag} ${profile.languageName} · ${label}`;

  if (switched) {
    toast.success(`Đã nhận diện ${headline}`, {
      id: "ingest-route",
      duration: 7000,
      description: profile.reasons[0],
      action: {
        label: "Ở lại thư viện",
        onClick: () => useAppStore.getState().setActiveTab("books"),
      },
    });
    return;
  }

  if (reason === "preference-off" || reason === "low-confidence") {
    toast.info(`${headline} — xem gợi ý để bắt đầu`, {
      id: "ingest-route",
      duration: 7000,
      description: profile.reasons[0],
    });
  }
}
