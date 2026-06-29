import { MonitorPlay } from "lucide-react";
import YouTube, { type YouTubeEvent, type YouTubeProps } from "react-youtube";

interface YouTubePlayerProps {
  /** 11 碼 video id；null 時顯示空狀態提示。 */
  videoId: string | null;
  /** 播放器就緒（event.target 為 player 實例，未來字幕同步可取 getCurrentTime）。 */
  onReady?: (event: YouTubeEvent) => void;
  /** 播放狀態變更（未來字幕同步的接點）。 */
  onStateChange?: (event: YouTubeEvent) => void;
}

/** 讓 iframe 填滿容器；尺寸交由外層 CSS 控制。 */
const PLAYER_OPTS: YouTubeProps["opts"] = {
  width: "100%",
  height: "100%",
  playerVars: { rel: 0 }, // 不顯示無關影片
};

/**
 * 封裝 react-youtube（IFrame Player API）。
 *
 * 無 videoId 時渲染置中提示；有則填滿容器播放。`onReady` / `onStateChange`
 * 預先透傳，作為未來右側字幕「隨播放進度高亮」的接點。
 */
export function YouTubePlayer({ videoId, onReady, onStateChange }: YouTubePlayerProps) {
  if (!videoId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
        <MonitorPlay className="size-12 opacity-40" />
        <p className="text-sm">請在上方輸入 YouTube 網址或影片 ID</p>
      </div>
    );
  }

  return (
    <YouTube
      key={videoId} // 換片強制重建，確保載入新影片
      videoId={videoId}
      opts={PLAYER_OPTS}
      onReady={onReady}
      onStateChange={onStateChange}
      className="h-full w-full"
      iframeClassName="h-full w-full"
    />
  );
}
