import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Cue } from "@/lib/srt";

interface SubtitleCardProps {
  /** 此卡對應的字幕。 */
  cue: Cue;
  /** 是否為目前播放中的字幕（高亮）。 */
  active: boolean;
  /** 點擊卡片時跳轉到該句起始秒數。 */
  onSeek: (seconds: number) => void;
  /**
   * 卡片動作區（預留）。未來在此放「錄音」等逐句功能鈕，
   * 卡片布局不需重構。
   */
  actions?: ReactNode;
}

/** `秒` → `m:ss`（時間戳顯示）。 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * 單句字幕卡（atom）。
 *
 * 點整張卡跳轉到該句；active 時以主題色高亮。右上保留 `actions` 動作區供未來
 * 逐句功能（如錄音）使用。presentational——不持有播放狀態。
 */
export function SubtitleCard({ cue, active, onSeek, actions }: SubtitleCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSeek(cue.start)}
      className={cn(
        "group flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-transparent text-muted-foreground",
      )}
    >
      <span className="mt-0.5 shrink-0 font-mono text-xs tabular-nums opacity-60">
        {formatTime(cue.start)}
      </span>
      <span className="flex-1 text-sm leading-relaxed whitespace-pre-line">
        {cue.text}
      </span>
      {actions && <span className="shrink-0">{actions}</span>}
    </button>
  );
}
