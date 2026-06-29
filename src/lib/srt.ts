/** 一句字幕（時間以秒為單位的浮點數）。 */
export interface Cue {
  /** 原始序號（1-based；解析失敗時退回陣列位置）。 */
  index: number;
  /** 起始秒數。 */
  start: number;
  /** 結束秒數。 */
  end: number;
  /** 字幕文字（多行以 `\n` 連接）。 */
  text: string;
}

/** `HH:MM:SS,mmm`（或以 `.` 為毫秒分隔）→ 秒。無法解析回 NaN。 */
function timecodeToSeconds(tc: string): number {
  const m = tc.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  const [, h, min, s, ms] = m;
  return (
    Number(h) * 3600 +
    Number(min) * 60 +
    Number(s) +
    Number(ms.padEnd(3, "0")) / 1000
  );
}

/**
 * 解析 SRT 字幕字串為 cue 陣列。
 *
 * 容忍 BOM、CRLF、區塊間多餘空行與缺序號；時間碼接受 `,` 或 `.` 毫秒分隔。
 * 時間軸無法解析的區塊會被略過（不丟例外）。
 *
 * @param text - SRT 檔內容。
 * @returns 依出現順序排列的 cue 陣列。
 */
export function parseSrt(text: string): Cue[] {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const cues: Cue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    // 第一行可能是序號；找出含 `-->` 的時間軸行。
    const arrowIdx = lines.findIndex((l) => l.includes("-->"));
    if (arrowIdx === -1) continue;

    const [startRaw, endRaw] = lines[arrowIdx].split("-->");
    const start = timecodeToSeconds(startRaw ?? "");
    const end = timecodeToSeconds(endRaw ?? "");
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const text = lines.slice(arrowIdx + 1).join("\n").trim();
    if (!text) continue;

    const parsedIndex = Number(lines[0]?.trim());
    cues.push({
      index: Number.isInteger(parsedIndex) ? parsedIndex : cues.length + 1,
      start,
      end,
      text,
    });
  }

  return cues;
}

/**
 * 以二分搜尋找出目前時間對應的 cue 索引（`start ≤ t < end`）。
 *
 * 假設 cues 依 start 遞增排列（SRT 慣例）。找不到回 -1。
 *
 * @param cues - 已排序的 cue 陣列。
 * @param t - 目前播放秒數。
 */
export function activeCueIndex(cues: Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid];
    if (t < cue.start) hi = mid - 1;
    else if (t >= cue.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
