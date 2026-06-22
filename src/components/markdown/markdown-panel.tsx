import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readMarkdown } from "@/lib/tauri";
import "highlight.js/styles/github.css";

interface MarkdownPanelProps {
  /** 目前選取的 markdown 檔絕對路徑；null 表示尚未選檔。 */
  path: string | null;
  /** 點擊文件內相對 .md 連結時，導航到該檔。 */
  onNavigate: (path: string) => void;
}

/** 右側預覽：讀取並渲染 markdown（GFM + 程式碼 highlight + 本機圖片/相對連結）。 */
export function MarkdownPanel({ path, onNavigate }: MarkdownPanelProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setContent("");
      setError(null);
      return;
    }
    let cancelled = false;
    void readMarkdown(path).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message);
        setContent("");
      } else {
        setError(null);
        setContent(res.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        從左側選擇一個 Markdown 檔
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        讀取失敗：{error}
      </div>
    );
  }

  const baseDir = dirOf(path);

  return (
    <div className="prose prose-sm dark:prose-invert h-full max-w-none overflow-auto p-6">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // 本機相對圖片 → asset protocol；http/data 保持原樣
          img: ({ src, alt, title }) => {
            const resolved =
              typeof src === "string" && isRelative(src)
                ? convertFileSrc(resolvePath(baseDir, src))
                : src;
            return <img src={resolved} alt={alt} title={title} />;
          },
          // 相對 .md 連結 → 樹內導航；外部連結 → 系統瀏覽器
          a: ({ href, title, children }) => (
            <a
              href={href}
              title={title}
              onClick={(e) => {
                if (!href) return;
                e.preventDefault();
                if (isRelative(href) && isMarkdown(href)) {
                  onNavigate(resolvePath(baseDir, href));
                } else if (/^https?:|^mailto:/.test(href)) {
                  void openUrl(href);
                }
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

/** 取得檔案所在資料夾（保留原本的路徑分隔符）。 */
function dirOf(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  return idx >= 0 ? filePath.slice(0, idx) : filePath;
}

/** 是否為相對路徑（排除 http/data/絕對路徑）。 */
function isRelative(p: string): boolean {
  return !/^(https?:|data:|mailto:|[a-zA-Z]:[\\/]|[\\/])/.test(p);
}

function isMarkdown(p: string): boolean {
  return /\.(md|markdown)(#.*)?$/i.test(p);
}

/** 將相對路徑接到 baseDir 並正規化 . / .. ；輸出沿用 baseDir 的分隔符。 */
function resolvePath(baseDir: string, rel: string): string {
  const sep = baseDir.includes("\\") ? "\\" : "/";
  const cleaned = rel.split(/[#?]/)[0]; // 去掉 anchor / query
  const segments = baseDir.split(/[\\/]/).concat(cleaned.split(/[\\/]/));
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join(sep);
}
