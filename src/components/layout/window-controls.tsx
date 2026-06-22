import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";

const appWindow = getCurrentWindow();

/**
 * 自訂視窗控制鈕（最小化／最大化還原／關閉）。
 *
 * 搭配 `decorations: false` 使用，取代原生標題列按鈕。
 * 視窗操作需在 capabilities 開啟 `core:window:allow-*` 權限。
 */
export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  // 視窗大小改變時同步「最大化」狀態，切換還原/最大化圖示
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const sync = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };

    void sync();
    appWindow.onResized(sync).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  return (
    <div className="flex h-full items-center">
      <ControlButton label="最小化" onClick={() => appWindow.minimize()}>
        <Minus className="h-4 w-4" />
      </ControlButton>

      <ControlButton
        label={isMaximized ? "還原" : "最大化"}
        onClick={() => appWindow.toggleMaximize()}
      >
        {isMaximized ? (
          <Copy className="h-3.5 w-3.5" />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
      </ControlButton>

      <ControlButton
        label="關閉"
        onClick={() => appWindow.close()}
        className="hover:bg-destructive hover:text-white"
      >
        <X className="h-4 w-4" />
      </ControlButton>
    </div>
  );
}

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}

function ControlButton({
  label,
  onClick,
  className,
  children,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
