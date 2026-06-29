import { describe, expect, it } from "vitest";
import { parseYouTubeId } from "@/lib/youtube";

const ID = "dQw4w9WgXcQ"; // 11 碼示範 id

describe("parseYouTubeId", () => {
  it("解析 watch?v= 形態", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it("解析含額外 query 的 watch 形態", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}&t=42s&list=abc`)).toBe(ID);
  });

  it("解析 youtu.be 短網址", () => {
    expect(parseYouTubeId(`https://youtu.be/${ID}`)).toBe(ID);
  });

  it("解析 youtu.be 短網址（缺 protocol）", () => {
    expect(parseYouTubeId(`youtu.be/${ID}`)).toBe(ID);
  });

  it("解析 embed 形態", () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
  });

  it("解析 shorts 形態", () => {
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
  });

  it("接受直接貼上的 11 碼 id", () => {
    expect(parseYouTubeId(ID)).toBe(ID);
  });

  it("去除前後空白", () => {
    expect(parseYouTubeId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it("空字串回 null", () => {
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
  });

  it("非 YouTube 網址回 null", () => {
    expect(parseYouTubeId("https://vimeo.com/123456")).toBeNull();
  });

  it("長度不符的 id 回 null", () => {
    expect(parseYouTubeId("https://youtu.be/tooShort")).toBeNull();
    expect(parseYouTubeId("toolongvideoid123")).toBeNull();
  });
});
