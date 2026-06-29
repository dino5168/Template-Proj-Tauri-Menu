//! YouTube 影片資料準備（yt-dlp + ffmpeg）。
//!
//! 每影片一資料夾 `<data_root>/videos/<id>/`，含字幕（en.srt）、封面（cover.jpg）、
//! metadata（info.json）、（按鈕後）音訊（audio.mp3）。為外部 CLI + 網路 IO，
//! command 以 `spawn_blocking` 包裝避免阻塞 async runtime。需 PATH 上 yt-dlp 與 ffmpeg。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::paths::clean_path;

/// 在 `dir` 內尋找該影片的字幕 srt。
///
/// yt-dlp 可能同時輸出多條英文軌（`<id>.en.srt`、`<id>.en-orig.srt`…），故先取
/// 精確的 `<id>.<lang>.srt`（通常較乾淨），找不到再退而求任一 `<id>*.srt`。
fn find_srt(dir: &Path, video_id: &str, lang: &str) -> Option<PathBuf> {
    let exact = dir.join(format!("{video_id}.{lang}.srt"));
    if exact.is_file() {
        return Some(exact);
    }
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("srt")
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with(video_id))
        })
}

/// 在 `dir` 內找該影片的封面圖（`<id>.jpg`，`--convert-thumbnails jpg` 後）。
fn find_thumbnail(dir: &Path, video_id: &str) -> Option<PathBuf> {
    let exact = dir.join(format!("{video_id}.jpg"));
    if exact.is_file() {
        return Some(exact);
    }
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("jpg")
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with(video_id))
        })
}

/// 影片資料夾的內容與 metadata（對應前端 `VideoInfo`，camelCase）。
///
/// 同時供 `prepare_video` 回傳與 `db::videos_upsert` 收參，故 derive 兩向序列化。
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VideoInfo {
    pub(crate) id: String,
    pub(crate) url: String,
    pub(crate) title: Option<String>,
    pub(crate) channel: Option<String>,
    pub(crate) duration: Option<i64>,
    pub(crate) upload_date: Option<String>,
    pub(crate) folder_path: String,
    pub(crate) subtitle_path: Option<String>,
    pub(crate) thumbnail_path: Option<String>,
    pub(crate) audio_path: Option<String>,
}

/// 在 `<data_root>/videos/<id>/` 準備影片資料：字幕（en.srt）、封面（cover.jpg）、
/// metadata（info.json），回傳 `VideoInfo`。
///
/// 一次 yt-dlp 抓字幕+封面+info.json（不下載影片），下載後統一檔名；讀 info.json 取
/// metadata。已快取（en.srt 與 info.json 都在）則跳過 yt-dlp。無字幕時 `subtitle_path`
/// 為 `None`（**非** error，前端據此顯示 empty）。需 PATH 上的 yt-dlp 與 ffmpeg
/// （封面轉 jpg）。為外部 CLI + 網路 IO，以 `spawn_blocking` 包裝。
#[tauri::command]
pub async fn prepare_video(
    url: String,
    video_id: String,
    data_root: String,
) -> Result<VideoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = Path::new(&data_root).join("videos").join(&video_id);
        std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;

        let srt = folder.join("en.srt");
        let cover = folder.join("cover.jpg");
        let info = folder.join("info.json");

        // 快取：字幕與 info 都在就不再呼叫 yt-dlp。
        if !(srt.is_file() && info.is_file()) {
            let lang = "en";
            // 有界的英文優先清單：涵蓋手動 `en` 與自動原文 `en-orig` 等常見軌，
            // 但**不**用 `en.*`（會匹配上百條自動翻譯軌→YouTube 回 HTTP 429 限流）。
            let sub_langs = format!("{lang}-orig,{lang},{lang}-US,{lang}-GB");
            let out_tmpl = folder.join("%(id)s.%(ext)s");

            let output = std::process::Command::new("yt-dlp")
                .arg("--skip-download")
                .arg("--write-subs")
                .arg("--write-auto-subs")
                .arg("--sub-langs")
                .arg(&sub_langs)
                .arg("--convert-subs")
                .arg("srt")
                .arg("--write-thumbnail")
                .arg("--convert-thumbnails")
                .arg("jpg")
                .arg("--write-info-json")
                .arg("-o")
                .arg(&out_tmpl)
                .arg(&url)
                .output()
                .map_err(|e| match e.kind() {
                    std::io::ErrorKind::NotFound => {
                        "找不到 yt-dlp，請確認已安裝並加入 PATH".to_string()
                    }
                    _ => e.to_string(),
                })?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("yt-dlp 失敗：{}", stderr.trim()));
            }

            // 統一檔名：yt-dlp 原生輸出 <id>.en.srt / <id>.jpg / <id>.info.json。
            if let Some(p) = find_srt(&folder, &video_id, lang) {
                let _ = std::fs::rename(&p, &srt);
            }
            if let Some(p) = find_thumbnail(&folder, &video_id) {
                let _ = std::fs::rename(&p, &cover);
            }
            let raw_info = folder.join(format!("{video_id}.info.json"));
            if raw_info.is_file() {
                let _ = std::fs::rename(&raw_info, &info);
            }

            // 清掉 yt-dlp 其餘原始輸出：多語字幕軌（手動 en 與自動 en-orig 並存時會剩一條）、
            // 轉檔前的原始縮圖（.webp）等，皆以 `<id>.` 開頭；正規檔已改名（無此前綴）故不受影響。
            if let Ok(entries) = std::fs::read_dir(&folder) {
                let prefix = format!("{video_id}.");
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|n| n.starts_with(&prefix))
                    {
                        let _ = std::fs::remove_file(&p);
                    }
                }
            }
        }

        // 解析 info.json metadata（缺檔/缺欄皆回 None）。
        let meta = std::fs::read_to_string(&info)
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
        let get_str = |key: &str| -> Option<String> {
            meta.as_ref()
                .and_then(|m| m.get(key))
                .and_then(|v| v.as_str())
                .map(str::to_owned)
        };
        let title = get_str("title");
        let channel = get_str("channel").or_else(|| get_str("uploader"));
        let upload_date = get_str("upload_date");
        let duration = meta
            .as_ref()
            .and_then(|m| m.get("duration"))
            .and_then(serde_json::Value::as_i64);

        let mp3 = folder.join("audio.mp3");
        Ok(VideoInfo {
            id: video_id,
            url,
            title,
            channel,
            duration,
            upload_date,
            folder_path: clean_path(&folder),
            subtitle_path: srt.is_file().then(|| clean_path(&srt)),
            thumbnail_path: cover.is_file().then(|| clean_path(&cover)),
            audio_path: mp3.is_file().then(|| clean_path(&mp3)),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 下載並轉檔影片音訊為 `<data_root>/videos/<id>/audio.mp3`，回傳絕對路徑。
///
/// 已下載則直接回（快取）。需 PATH 上的 yt-dlp 與 ffmpeg。由「下載音訊」鈕觸發
/// （非每次換片自動下載，避免耗時/頻寬）。
#[tauri::command]
pub async fn download_audio(
    url: String,
    video_id: String,
    data_root: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = Path::new(&data_root).join("videos").join(&video_id);
        std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;

        let mp3 = folder.join("audio.mp3");
        if mp3.is_file() {
            return Ok(clean_path(&mp3));
        }

        let out_tmpl = folder.join("%(id)s.%(ext)s");
        let output = std::process::Command::new("yt-dlp")
            .arg("-f")
            .arg("bestaudio")
            .arg("--extract-audio")
            .arg("--audio-format")
            .arg("mp3")
            .arg("-o")
            .arg(&out_tmpl)
            .arg(&url)
            .output()
            .map_err(|e| match e.kind() {
                std::io::ErrorKind::NotFound => {
                    "找不到 yt-dlp，請確認已安裝並加入 PATH".to_string()
                }
                _ => e.to_string(),
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("yt-dlp 失敗：{}", stderr.trim()));
        }

        // yt-dlp 產出 <id>.mp3 → 統一成 audio.mp3。
        let raw = folder.join(format!("{video_id}.mp3"));
        if raw.is_file() {
            std::fs::rename(&raw, &mp3).map_err(|e| e.to_string())?;
        }
        if mp3.is_file() {
            Ok(clean_path(&mp3))
        } else {
            Err("音訊下載完成但找不到 mp3".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
