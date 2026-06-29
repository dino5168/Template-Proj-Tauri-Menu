/** YouTube video id 固定為 11 碼（英數、`-`、`_`）。 */
const VIDEO_ID = /^[\w-]{11}$/;

/**
 * 從使用者輸入解析出 YouTube video id。
 *
 * 接受常見網址形態與直接貼上的 11 碼 id：
 * - `https://www.youtube.com/watch?v=VIDEOID`（含其他 query 參數）
 * - `https://youtu.be/VIDEOID`
 * - `https://www.youtube.com/embed/VIDEOID`
 * - `https://www.youtube.com/shorts/VIDEOID`
 * - 純 `VIDEOID`（11 碼）
 *
 * 設計成「解析失敗回 null」而非丟例外，呼叫端據此顯示錯誤提示。
 *
 * @param input - 使用者輸入的網址或 video id。
 * @returns 11 碼 video id；無法解析時回 null。
 */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // 直接是 11 碼 id。
  if (VIDEO_ID.test(raw)) return raw;

  // 缺 protocol 時補上，讓 URL 能解析（例：貼 youtu.be/xxx）。
  const url = tryParseUrl(raw) ?? tryParseUrl(`https://${raw}`);
  if (!url) return null;

  const host = url.hostname.replace(/^www\./, "");

  // youtu.be/VIDEOID — id 在路徑第一段。
  if (host === "youtu.be") {
    return validId(url.pathname.split("/")[1]);
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    // watch?v=VIDEOID
    const v = url.searchParams.get("v");
    if (v) return validId(v);

    // /embed/VIDEOID 或 /shorts/VIDEOID — id 在路徑第二段。
    const seg = url.pathname.split("/");
    if (seg[1] === "embed" || seg[1] === "shorts") {
      return validId(seg[2]);
    }
  }

  return null;
}

/**
 * 嘗試建構 URL；失敗回 null（取代會丟例外的 `new URL`）。
 *
 * @param value - 待解析字串。
 */
function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * 驗證候選字串是否為合法 11 碼 video id。
 *
 * @param candidate - 從路徑或 query 取出的候選 id（可能為 undefined）。
 * @returns 合法則回原值，否則 null。
 */
function validId(candidate: string | undefined): string | null {
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}
