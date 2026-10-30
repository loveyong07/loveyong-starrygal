import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "@phosphor-icons/react";

/** Native frame actions share the existing top bar; close still uses the
 * application's tray/quit preference through Rust's CloseRequested handler. */
export default function WindowControls({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const window = getCurrentWindow();
    let active = true;
    let unlisten: (() => void) | undefined;
    const refresh = () => {
      void window
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch(() => {});
    };
    refresh();
    void window
      .onResized(refresh)
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => {});
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  function run(action: "minimize" | "toggleMaximize" | "close") {
    void getCurrentWindow()
      [action]()
      .catch(() => onError("窗口操作未能完成，请重试。"));
  }
  return (
    <div className="gg-window-controls" role="group" aria-label="窗口控制">
      <button
        type="button"
        aria-label="最小化窗口"
        title="最小化"
        onClick={() => run("minimize")}
      >
        <MinusIcon size={17} />
      </button>
      <button
        type="button"
        aria-label={maximized ? "还原窗口" : "最大化窗口"}
        title={maximized ? "还原" : "最大化"}
        onClick={() => run("toggleMaximize")}
      >
        {maximized ? <CopyIcon size={16} /> : <SquareIcon size={16} />}
      </button>
      <button
        type="button"
        className="gg-window-close"
        aria-label="关闭窗口"
        title="关闭"
        onClick={() => run("close")}
      >
        <XIcon size={18} />
      </button>
    </div>
  );
}
