import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "@/components/layout/title-bar";
import { Button } from "@/components/ui/button";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke<string>("greet", { name }));
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />

      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">Tauri + React + shadcn/ui</h1>
        <p className="text-sm text-muted-foreground">
          自訂標題列 · decorations: false
        </p>

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
      </main>
    </div>
  );
}

export default App;
