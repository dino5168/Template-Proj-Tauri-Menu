import { useState, type FormEvent } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setView } from "@/lib/view-store";

interface YouTubeUrlBarProps {
  /** 送出輸入字串（原始網址或 id），解析與錯誤處理交由父層。 */
  onSubmit: (raw: string) => void;
  /** 解析失敗時的錯誤訊息；有值則顯示於輸入框下方。 */
  error?: string | null;
}

/**
 * 頂部網址輸入列：返回鈕 + URL 輸入框 + 確定鈕（presentational）。
 *
 * 只負責收集輸入並上拋；不解析網址、不持有 videoId。樣式對齊 `doc-browser` 工具列。
 */
export function YouTubeUrlBar({ onSubmit, error }: YouTubeUrlBarProps) {
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
      </div>
      {error && <p className="mt-1 pl-[4.5rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}
