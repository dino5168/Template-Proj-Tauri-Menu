import { useEffect, useMemo, useRef, useState } from "react";
import type { YouTubeEvent, YouTubePlayer as YTPlayer } from "react-youtube";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { YouTubeUrlBar } from "@/components/youtube/youtube-url-bar";
import { YouTubePlayer } from "@/components/youtube/youtube-player";
import {
  YouTubeSubtitlePanel,
  type SubtitleStatus,
} from "@/components/youtube/youtube-subtitle-panel";
import { parseYouTubeId } from "@/lib/youtube";
import { activeCueIndex, parseSrt, type Cue } from "@/lib/srt";
import { resolveDataRoot } from "@/lib/data-root-store";
import { downloadSubtitle, readTextFile } from "@/lib/tauri";

/** YouTube 播放器「播放中」狀態碼（YT IFrame API）。 */
const PLAYING = 1;
/** 進度輪詢間隔（ms）；250ms 對字幕高亮足夠精確。 */
const POLL_MS = 250;

/**
 * 「學習 → Youtube」主視圖（orchestrator）：頂部網址列 + 可調分割（Player | 字幕）。
 *
 * 職責：解析輸入 → 觸發 yt-dlp 字幕下載/快取 → 解析 srt → 輪詢播放進度算 active
 * 字幕 → 點字幕卡 seek。原子元件（url-bar / player / subtitle-*）皆 presentational。
 */
export function YoutubeView() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [status, setStatus] = useState<SubtitleStatus>("idle");
  const [cues, setCues] = useState<Cue[]>([]);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const playerRef = useRef<YTPlayer | null>(null);
  const pollRef = useRef<number | null>(null);

  const activeIndex = useMemo(
    () => (status === "ready" ? activeCueIndex(cues, currentTime) : -1),
    [status, cues, currentTime],
  );

  function stopPolling(): void {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(): void {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      const p = playerRef.current;
      if (p) setCurrentTime(p.getCurrentTime());
    }, POLL_MS);
  }

  // 卸載時清除輪詢計時器。
  useEffect(() => stopPolling, []);

  // videoId / url 變更：重置狀態並下載解析字幕。
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    stopPolling();
    setCurrentTime(0);
    setCues([]);
    setSubtitleError(null);
    setStatus("loading");

    void (async () => {
      const dataRoot = await resolveDataRoot();
      if (cancelled) return;
      if (!dataRoot) {
        setSubtitleError("無法解析資料目錄");
        setStatus("error");
        return;
      }

      const dl = await downloadSubtitle(url, videoId, dataRoot, "en");
      if (cancelled) return;
      if (dl.error) {
        // 後端以特定訊息表示「影片本身無字幕」，與真正錯誤區分。
        if (dl.error.message.includes("無可用英文字幕")) {
          setStatus("empty");
        } else {
          setSubtitleError(dl.error.message);
          setStatus("error");
        }
        return;
      }

      const read = await readTextFile(dl.data);
      if (cancelled) return;
      if (read.error) {
        setSubtitleError(read.error.message);
        setStatus("error");
        return;
      }

      setCues(parseSrt(read.data));
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [videoId, url]);

  function handleSubmit(raw: string): void {
    const id = parseYouTubeId(raw);
    if (!id) {
      setUrlError("無法辨識的 YouTube 網址或影片 ID");
      return;
    }
    setUrlError(null);
    setUrl(raw);
    setVideoId(id);
  }

  function handleReady(e: YouTubeEvent): void {
    playerRef.current = e.target;
  }

  function handleStateChange(e: YouTubeEvent): void {
    if (e.data === PLAYING) startPolling();
    else stopPolling();
  }

  function handleSeek(seconds: number): void {
    playerRef.current?.seekTo(seconds, true);
  }

  return (
    <div className="flex h-full flex-col">
      <YouTubeUrlBar onSubmit={handleSubmit} error={urlError} />

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={65} minSize={30}>
            <div className="h-full bg-black">
              <YouTubePlayer
                videoId={videoId}
                onReady={handleReady}
                onStateChange={handleStateChange}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={35} minSize={20}>
            <YouTubeSubtitlePanel
              status={status}
              cues={cues}
              activeIndex={activeIndex}
              onSeek={handleSeek}
              error={subtitleError}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
