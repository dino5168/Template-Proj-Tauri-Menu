import { Captions, Loader2 } from "lucide-react";
import { SubtitleList } from "@/components/youtube/subtitle-list";
import type { Cue } from "@/lib/srt";

/** 字幕載入狀態機。 */
export type SubtitleStatus = "idle" | "loading" | "ready" | "empty" | "error";

interface YouTubeSubtitlePanelProps {
  status: SubtitleStatus;
  /** status 為 "ready" 時的字幕。 */
  cues: Cue[];
  /** 目前播放中的 cue 索引（-1 表示無）。 */
  activeIndex: number;
  /** 點擊字幕卡跳轉。 */
  onSeek: (seconds: number) => void;
  /** status 為 "error" 時的訊息。 */
  error?: string | null;
}

/** 置中提示（idle / empty / error / loading 共用版型）。 */
function Hint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      {icon}
      <p className="text-sm">{children}</p>
    </div>
  );
}

/**
 * 右側字幕面板：依載入狀態渲染提示或字幕清單。
 *
 * 字幕由 `youtube-view`（orchestrator）下載解析後以 props 注入，本元件 presentational。
 */
export function YouTubeSubtitlePanel({
  status,
  cues,
  activeIndex,
  onSeek,
  error,
}: YouTubeSubtitlePanelProps) {
  switch (status) {
    case "loading":
      return (
        <Hint icon={<Loader2 className="size-8 animate-spin opacity-50" />}>
          下載字幕中…
        </Hint>
      );
    case "ready":
      return <SubtitleList cues={cues} activeIndex={activeIndex} onSeek={onSeek} />;
    case "empty":
      return (
        <Hint icon={<Captions className="size-10 opacity-40" />}>
          此影片無可用英文字幕
        </Hint>
      );
    case "error":
      return (
        <Hint icon={<Captions className="size-10 opacity-40" />}>
          {error ?? "字幕載入失敗"}
        </Hint>
      );
    default:
      return (
        <Hint icon={<Captions className="size-10 opacity-40" />}>
          輸入網址後將在此顯示字幕
        </Hint>
      );
  }
}
