import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "@/components/layout/title-bar";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { HtmlView } from "@/components/html/html-view";
import { MarkdownEditorView } from "@/components/editor/markdown-editor-view";
import { YoutubeView } from "@/components/youtube/youtube-view";
import { DatabaseView } from "@/components/database/database-view";
import { Button } from "@/components/ui/button";
import { useView } from "@/lib/view-store";

function App() {
  const view = useView();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />

      <main className="min-h-0 flex-1">
        {view === "markdown" ? (
          <MarkdownView />
        ) : view === "html" ? (
          <HtmlView />
        ) : view === "editor" ? (
          <MarkdownEditorView />
        ) : view === "youtube" ? (
          <YoutubeView />
        ) : view === "database" ? (
          <DatabaseView />
        ) : (
          <HomeView />
        )}
      </main>
    </div>
  );
}

/** 預設首頁（greet 示範）。 */
function HomeView() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke<string>("greet", { name }));
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Tauri + React + shadcn/ui</h1>
      <p className="text-sm text-muted-foreground">自訂標題列 · decorations: false</p>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void greet();
        }}
      >
        <input
          className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="輸入名稱…"
        />
        <Button type="submit">Greet</Button>
      </form>

      {greetMsg && <p className="text-sm">{greetMsg}</p>}
    </div>
  );
}

export default App;
