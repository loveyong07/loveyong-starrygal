/**
 * The prompt shown when the window's close button is pressed.
 *
 * Rust intercepts `CloseRequested` and emits `close-requested` (see
 * `lib.rs`); this component answers it: a stored preference acts immediately,
 * otherwise the user chooses between hiding to the tray and quitting.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { GameControllerIcon, TrayArrowDownIcon } from "@phosphor-icons/react";
import { Modal } from "@/features/galgame/StudioDialogs";
import { settingsGet, settingsSet } from "@/lib/db";
import { CLOSE_BEHAVIOR_KEY, normalizeCloseBehavior } from "./close-behavior";

export function CloseBehaviorDialog() {
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningCount, setRunningCount] = useState(0);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let quitUnlisten: UnlistenFn | null = null;
    let cancelled = false;

    void listen("close-requested", () => {
      void (async () => {
        try {
          const behavior = normalizeCloseBehavior(
            await settingsGet(CLOSE_BEHAVIOR_KEY),
          );
          if (behavior === "tray") {
            await invoke("app_hide_to_tray");
            return;
          }
          if (behavior === "exit") {
            const count = await invoke<number>("manager_running_count");
            if (count > 0) {
              if (!cancelled) {
                setRunningCount(count);
                setRemember(false);
                setError(null);
                setOpen(true);
              }
              return;
            }
            await invoke("app_quit");
            return;
          }
        } catch (cause) {
          // Reading the setting failed: fall through to the prompt so the user
          // can still decide instead of the close button doing nothing.
          console.warn("[window] close behaviour:", cause);
        }
        if (!cancelled) {
          setRunningCount(
            await invoke<number>("manager_running_count").catch(() => 0),
          );
          setRemember(false);
          setError(null);
          setOpen(true);
        }
      })();
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((cause) => console.warn("[window] close listener:", cause));

    void listen("quit-requested", () => {
      void invoke<number>("manager_running_count")
        .then(async (count) => {
          if (cancelled) return;
          if (count === 0) {
            await invoke("app_quit");
            return;
          }
          setRunningCount(count);
          setRemember(false);
          setError(null);
          setOpen(true);
        })
        .catch((cause) => {
          if (!cancelled) {
            setError(String(cause));
            setOpen(true);
          }
        });
    })
      .then((stop) => {
        if (cancelled) stop();
        else quitUnlisten = stop;
      })
      .catch((cause) => console.warn("[window] quit listener:", cause));

    return () => {
      cancelled = true;
      unlisten?.();
      quitUnlisten?.();
    };
  }, []);

  async function choose(behavior: "tray" | "exit") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (remember) {
        // The chosen action wins even if persisting the preference fails.
        await settingsSet(CLOSE_BEHAVIOR_KEY, behavior).catch(() => {});
      }
      setOpen(false);
      await invoke(behavior === "tray" ? "app_hide_to_tray" : "app_quit");
    } catch (cause) {
      setError(typeof cause === "string" ? cause : String(cause));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      title="关闭 StarryGal"
      subtitle="选择关闭窗口时的行为；勾选「今后不再提示」后会记住本次选择。"
      close={() => {
        if (!busy) setOpen(false);
      }}
    >
      <div className="gg-glass-modal-stack">
        {runningCount > 0 && (
          <div className="gg-modal-banner is-info">
            <GameControllerIcon size={17} />
            <span>
              还有 {runningCount}{" "}
              款游戏正在运行。缩小至托盘可以继续计时；结算并退出会保存截至此刻的时长，游戏继续运行，退出后的时间不再记录。
            </span>
          </div>
        )}
        <div className="gg-close-options">
          <div className="gg-close-option-item">
            <strong>缩小至托盘</strong>
            <p>
              窗口隐藏，应用继续在系统托盘运行；点击托盘图标或菜单「显示
              StarryGal」即可恢复。
            </p>
          </div>
          <div className="gg-close-option-item">
            <strong>直接关闭</strong>
            <p>
              退出 StarryGal 进程。托盘菜单里的「退出 StarryGal」也会直接退出。
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="gg-form-error">
            {error}
          </p>
        )}
        <div className="gg-dialog-footer gg-close-footer">
          <label className="gg-check-field gg-close-remember">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy}
              onChange={(event) => setRemember(event.target.checked)}
            />
            今后不再提示
          </label>
          <button
            type="button"
            className="gg-button gg-secondary"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            取消
          </button>
          <button
            type="button"
            className="gg-button gg-secondary"
            disabled={busy}
            onClick={() => void choose("exit")}
          >
            {runningCount ? "结算并退出" : "直接关闭"}
          </button>
          <button
            type="button"
            className="gg-button gg-primary"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void choose("tray")}
          >
            <TrayArrowDownIcon size={16} />
            缩小至托盘
          </button>
        </div>
      </div>
    </Modal>
  );
}
