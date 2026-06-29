import { describe, expect, it } from "vitest";
import { activeCueIndex, parseSrt, type Cue } from "@/lib/srt";

const SAMPLE = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:06,000
Second line
spanning two rows
`;

describe("parseSrt", () => {
  it("解析基本兩句字幕", () => {
    const cues = parseSrt(SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual<Cue>({
      index: 1,
      start: 1,
      end: 3.5,
      text: "Hello world",
    });
  });

  it("多行字幕以 \\n 連接", () => {
    const cues = parseSrt(SAMPLE);
    expect(cues[1].text).toBe("Second line\nspanning two rows");
    expect(cues[1].start).toBe(4);
    expect(cues[1].end).toBe(6);
  });

  it("容忍 BOM 與 CRLF", () => {
    const crlf = "﻿1\r\n00:00:00,000 --> 00:00:01,000\r\nHi\r\n";
    const cues = parseSrt(crlf);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("Hi");
  });

  it("接受 . 作為毫秒分隔", () => {
    const cues = parseSrt("1\n00:00:02.250 --> 00:00:03.000\nDot ms");
    expect(cues[0].start).toBe(2.25);
  });

  it("略過時間軸畸形的區塊", () => {
    const bad = "1\nNOT A TIMECODE\ntext\n\n2\n00:00:01,000 --> 00:00:02,000\nok";
    const cues = parseSrt(bad);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("ok");
  });

  it("空字串回空陣列", () => {
    expect(parseSrt("")).toEqual([]);
  });

  it("缺序號時退回位置序號", () => {
    const noIndex = "00:00:01,000 --> 00:00:02,000\nno index line";
    const cues = parseSrt(noIndex);
    expect(cues[0].index).toBe(1);
    expect(cues[0].text).toBe("no index line");
  });
});

describe("activeCueIndex", () => {
  const cues = parseSrt(SAMPLE);

  it("命中區間內回對應索引", () => {
    expect(activeCueIndex(cues, 2)).toBe(0);
    expect(activeCueIndex(cues, 5)).toBe(1);
  });

  it("起點含、終點不含", () => {
    expect(activeCueIndex(cues, 1)).toBe(0); // start 含
    expect(activeCueIndex(cues, 3.5)).toBe(-1); // end 不含且落在間隙
  });

  it("區間外回 -1", () => {
    expect(activeCueIndex(cues, 0.5)).toBe(-1);
    expect(activeCueIndex(cues, 99)).toBe(-1);
  });
});
