import { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Badge } from "../ui/badge";
export interface AppSplashScreenProps {
  isLoading: boolean;
  stepMessage?: string;
  progressPercent?: number;
  onFinishedTransition?: () => void;
}

export function AppSplashScreen({
  isLoading,
  stepMessage = "Đang khởi tạo môi trường Studio...",
  progressPercent = 30,
  onFinishedTransition,
}: AppSplashScreenProps) {
  const [shouldRender, setShouldRender] = useState(isLoading);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        setShouldRender(false);
        onFinishedTransition?.();
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setShouldRender(true);
    }
  }, [isLoading, onFinishedTransition]);

  if (!shouldRender) {
    return null;
  }

  const clampedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));

  return (
    <div
      role="status"
      aria-label="Màn hình khởi động ứng dụng"
      aria-live="polite"
      className={`fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 select-none transition-opacity duration-300 ease-out ${
        isLoading ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Brand Icon & Glow */}
      <div className="relative mb-6">
        <div className="absolute -inset-2 rounded-3xl bg-primary/20 blur-xl animate-pulse" />
        <div className="relative w-20 h-20 rounded-2xl bg-card border border-primary/40 flex items-center justify-center p-3 shadow-2xl">
          <img
            src="/app-icon.png"
            alt="NiceEbook Studio"
            className="w-full h-full object-contain filter drop-shadow-sm"
          />
        </div>
      </div>

      {/* Brand Name & Tagline */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            NiceEbook Studio
          </h1>
          <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5 border-primary/40 text-primary">
            v0.1.0
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          <Sparkles size={12} className="text-primary" />
          <span>Thiết Kế &amp; Làm Đẹp Sách Điện Tử AI</span>
        </p>
      </div>

      {/* Progress Bar & Status Text */}
      <div className="w-64 max-w-full flex flex-col items-center gap-2.5">
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>

        <div className="flex items-center justify-between w-full text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 min-w-0">
            {isLoading && <Loader2 size={11} className="animate-spin text-primary shrink-0" />}
            <span className="truncate">{stepMessage}</span>
          </div>
          <span className="font-mono text-[10px] shrink-0 font-medium text-foreground">
            {clampedProgress}%
          </span>
        </div>
      </div>
    </div>
  );
}
