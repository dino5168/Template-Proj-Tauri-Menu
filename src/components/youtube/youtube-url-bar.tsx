import { useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, Music, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setView } from "@/lib/view-store";
import type { AudioStatus } from "@/components/youtube/youtube-view";

interface YouTubeUrlBarProps {
  /** 送出輸入字串（原始網址或 id），解析與錯誤處理交由父層。 */
  onSubmit: (raw: string) => void;
  /** 解析失敗時的錯誤訊息；有值則顯示於輸入框下方。 */
  error?: string | null;
  /** 是否可下載音訊（有作用中 videoId 才 enabled）。 */
  canDownloadAudio?: boolean;
  /** 音訊下載狀態（決定鈕的 loading / 文案）。 */
  audioStatus?: AudioStatus;
  /** 點「下載音訊」上拋（實際下載交由父層）。 */
  onDownloadAudio?: () => void;
}

/** 音訊鈕的文案（依下載狀態）。 */
const AUDIO_LABEL: Record<AudioStatus, string> = {
  idle: "下載音訊",
  downloading: "下載中…",
  done: "已下載",
  error: "重試音訊",
};

/**
 * 頂部網址輸入列：返回鈕 + URL 輸入框 + 確定鈕 + 下載音訊鈕（presentational）。
 *
 * 只負責收集輸入並上拋；不解析網址、不持有 videoId。樣式對齊 `doc-browser` 工具列。
 */
export function YouTubeUrlBar({
  onSubmit,
  error,
  canDownloadAudio = false,
  audioStatus = "idle",
  onDownloadAudio,
}: YouTubeUrlBarProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(value);
  }

  return (
    <div className="shrink-0 border-b px-3 py-1.5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setView("home")}>
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <form className="flex flex-1 items-center gap-2" onSubmit={handleSubmit}>
          <input
            className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            placeholder="貼上 YouTube 網址或影片 ID…"
            aria-label="YouTube 網址"
          />
          <Button type="submit" size="sm">
            <Play className="size-4" />
            確定
          </Button>
        </form>
        <Button
          variant="outline"
          size="sm"
          disabled={!canDownloadAudio || audioStatus === "downloading"}
          onClick={() => onDownloadAudio?.()}
          title="下載此影片音訊為 mp3"
        >
          {audioStatus === "downloading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Music className="size-4" />
          )}
          {AUDIO_LABEL[audioStatus]}
        </Button>
      </div>
      {error && <p className="mt-1 pl-[4.5rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}
