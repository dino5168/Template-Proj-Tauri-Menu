import { useEffect, useRef } from "react";
import { SubtitleCard } from "@/components/youtube/subtitle-card";
import type { Cue } from "@/lib/srt";

interface SubtitleListProps {
  /** 字幕 cue 陣列（依 start 遞增）。 */
  cues: Cue[];
  /** 目前播放中的 cue 索引；-1 表示無。 */
  activeIndex: number;
  /** 點擊字幕卡跳轉。 */
  onSeek: (seconds: number) => void;
}

/**
 * 字幕清單：垂直排列字幕卡，並將 active 卡自動捲入視野中央。
 *
 * 捲動只在 activeIndex 變動時觸發（隨播放進度移動），不干擾使用者手動捲動。
 */
export function SubtitleList({ cues, activeIndex, onSeek }: SubtitleListProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <div className="flex h-full flex-col gap-1 overflow-auto p-2">
      {cues.map((cue, i) => (
        <div key={cue.index} ref={i === activeIndex ? activeRef : undefined}>
          <SubtitleCard cue={cue} active={i === activeIndex} onSeek={onSeek} />
        </div>
      ))}
    </div>
  );
}
