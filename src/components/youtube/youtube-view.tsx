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
import { joinPath } from "@/lib/path";
import {
  DB_FILE_NAME,
  downloadAudio,
  prepareVideo,
  readTextFile,
  videosUpsert,
  type VideoInfo,
} from "@/lib/tauri";

/** 音訊下載狀態（「下載音訊」鈕）。 */
export type AudioStatus = "idle" | "downloading" | "done" | "error";

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

  // 影片記錄與音訊下載狀態（mp3 由「下載音訊」鈕觸發）。
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");

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

  // videoId / url 變更：重置狀態 → prepareVideo（字幕+封面+metadata）→ 入庫 → 解析字幕。
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    stopPolling();
    setCurrentTime(0);
    setCues([]);
    setSubtitleError(null);
    setVideoInfo(null);
    setAudioStatus("idle");
    setStatus("loading");

    void (async () => {
      const dataRoot = await resolveDataRoot();
      if (cancelled) return;
      if (!dataRoot) {
        setSubtitleError("無法解析資料目錄");
        setStatus("error");
        return;
      }

      const res = await prepareVideo(url, videoId, dataRoot);
      if (cancelled) return;
      if (res.error) {
        setSubtitleError(res.error.message);
        setStatus("error");
        return;
      }
      const info = res.data;
      setVideoInfo(info);
      // mp3 可能先前已下載過（快取），同步音訊鈕狀態。
      if (info.audioPath) setAudioStatus("done");

      // 寫入 videos 表（失敗不阻斷播放，僅記 log）。
      const dbPath = joinPath(dataRoot, DB_FILE_NAME);
      const up = await videosUpsert(dbPath, info);
      if (up.error) console.error("videos 入庫失敗：", up.error);

      // 無字幕 → empty（仍可播放）。
      if (!info.subtitlePath) {
        if (!cancelled) setStatus("empty");
        return;
      }

      const read = await readTextFile(info.subtitlePath);
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

  /** 「下載音訊」：拉 mp3 → 回填 audio_path 入庫。 */
  async function handleDownloadAudio(): Promise<void> {
    if (!videoId || audioStatus === "downloading") return;
    setAudioStatus("downloading");
    const dataRoot = await resolveDataRoot();
    if (!dataRoot) {
      setAudioStatus("error");
      return;
    }
    const res = await downloadAudio(url, videoId, dataRoot);
    if (res.error) {
      console.error("音訊下載失敗：", res.error);
      setAudioStatus("error");
      return;
    }
    setAudioStatus("done");
    // 回填 audio_path（COALESCE 保護，後續 prepare 不會清掉）。
    if (videoInfo) {
      const next = { ...videoInfo, audioPath: res.data };
      setVideoInfo(next);
      const up = await videosUpsert(joinPath(dataRoot, DB_FILE_NAME), next);
      if (up.error) console.error("videos 更新 audio_path 失敗：", up.error);
    }
  }

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
      <YouTubeUrlBar
        onSubmit={handleSubmit}
        error={urlError}
        canDownloadAudio={!!videoId}
        audioStatus={audioStatus}
        onDownloadAudio={() => void handleDownloadAudio()}
      />

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
