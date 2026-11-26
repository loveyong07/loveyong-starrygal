/**
 * 「启动窗口」 — the launch panel for one game, rendered with StarryGal's
 * unified frosted-glass modal system.
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  FolderOpenIcon,
  GameControllerIcon,
  PlayIcon,
  StopCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Modal } from "@/features/galgame/StudioDialogs";
import { errorMessage } from "@/features/io/io";
import { magpieQuit, magpieStatus } from "@/features/tools/io";
import { formatPlayTime } from "@/types/game";
import type { Game } from "@/types/game";
import { gameProcesses } from "./game-process";
import { launchProfileGet, type EffectiveLaunchProfile } from "./profile-api";
import { useGameProcess } from "./useGameProcess";

export interface LaunchDialogProps {
  open: boolean;
  game: Game;
  onClose: () => void;
  /** Fired after a successful launch or a stop, so the caller can refresh. */
  onLaunched?: () => void;
}

function LaunchRow({ label, value }: { label: string; value: string | null }) {
  const missing = !value || value.trim() === "";
  return (
    <div className="gg-launch-row">
      <dt>{label}</dt>
      <dd className={missing ? "is-empty" : ""}>{missing ? "未设置" : value}</dd>
    </div>
  );
}

export default function LaunchDialog({
  open,
  game,
  onClose,
  onLaunched,
}: LaunchDialogProps) {
  const process = useGameProcess(game.id, open);
  const launching = process.status === "starting";
  const running = process.status === "running";
  const pid = process.pid;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [effective, setEffective] = useState<EffectiveLaunchProfile | null>(
    null,
  );
  const [restartMagpie, setRestartMagpie] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const exePath = game.exePath?.trim() ?? "";
  const canLaunch = exePath !== "";

  useEffect(() => {
    if (!open) return;
    setError(null);
    let alive = true;
    setRestartMagpie(false);
    void launchProfileGet(game.id)
      .then(async (value) => {
        const restart =
          value.magpie &&
          Boolean(value.profile.scalingMode) &&
          (await magpieStatus()).running;
        if (alive) {
          setEffective(value);
          setRestartMagpie(restart);
        }
      })
      .catch((cause) => {
        if (alive) setError(errorMessage(cause));
      });
    return () => {
      alive = false;
    };
  }, [open, game.id]);

  async function start() {
    if (!canLaunch || running || launching || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (restartMagpie) {
        await magpieQuit();
        if ((await magpieStatus()).running) {
          throw new Error(
            "Magpie 尚未退出，请先在系统托盘退出 Magpie 后重试。",
          );
        }
        if (mounted.current) setRestartMagpie(false);
      }
      const outcome = await gameProcesses.start(game.id);
      if (mounted.current && outcome.kind === "started") onLaunched?.();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function stop() {
    if (pending.current || launching) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const stopped = await gameProcesses.stop(game.id);
      if (!mounted.current) return;
      if (!stopped) {
        setError("没有找到正在运行的进程（可能已经退出）。");
      }
      onLaunched?.();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      title="启动游戏"
      subtitle={game.title}
      close={() => {
        if (!busy) onClose();
      }}
    >
      <div className="gg-glass-modal-stack">
        {restartMagpie && (
          <div className="gg-modal-banner is-info">
            <WarningCircleIcon size={17} />
            <span>
              Magpie 已在运行，应用本款缩放模式需要重新启动它。确认启动会先退出当前
              Magpie，再按本款配置启动；其他游戏正在使用的缩放也会结束。
            </span>
          </div>
        )}
        {!canLaunch && (
          <div className="gg-modal-banner is-error" role="alert">
            <FolderOpenIcon size={17} />
            <span>
              还没有设置 exe 路径，无法启动。请在作品详情页点击「启动与辅助」选择
              EXE 并保存。
            </span>
          </div>
        )}
        {error && (
          <p className="gg-form-error" role="alert">
            {error}
          </p>
        )}
        {running && (
          <div className="gg-modal-banner is-running" role="status">
            <GameControllerIcon size={17} />
            <strong>正在运行</strong>
            {pid !== null && <span>PID {pid}</span>}
          </div>
        )}

        <dl className="gg-launch-summary">
          {effective && (
            <LaunchRow
              label="运行辅助"
              value={`日区转区 ${effective.locale ? "开启" : "关闭"} · Magpie ${effective.magpie ? "开启" : "关闭"}${effective.scalingMode ? `（${effective.scalingMode}）` : ""}`}
            />
          )}
          <LaunchRow label="可执行文件" value={game.exePath} />
          <LaunchRow label="工作目录" value={game.workdir} />
          <LaunchRow label="启动参数" value={game.launchArgs} />
          <LaunchRow label="存档路径" value={game.savePath} />
          <LaunchRow
            label="已记录游玩时长"
            value={formatPlayTime(game.playTimeSeconds)}
          />
        </dl>

        <p className="gg-field-note">
          可在作品详情页点击「启动与辅助」修改启动程序、参数、转区或 Magpie
          超分设置。
        </p>

        <div className="gg-dialog-footer">
          {running && (
            <button
              type="button"
              className="gg-button gg-secondary"
              disabled={busy}
              onClick={() => void stop()}
            >
              <StopCircleIcon size={16} />
              停止游戏
            </button>
          )}
          <button
            type="button"
            className="gg-button gg-secondary"
            disabled={busy}
            onClick={onClose}
          >
            关闭
          </button>
          <button
            type="button"
            className="gg-button gg-primary"
            disabled={!canLaunch || running || busy || launching}
            aria-busy={busy || launching}
            title={canLaunch ? undefined : "未设置 exe 路径"}
            onClick={() => void start()}
          >
            {busy || launching ? (
              <ArrowClockwiseIcon className="gg-spin" size={16} />
            ) : running ? (
              <GameControllerIcon size={16} />
            ) : (
              <PlayIcon size={15} weight="fill" />
            )}
            {launching
              ? "启动中…"
              : running
                ? "运行中"
                : restartMagpie
                  ? "退出 Magpie 并启动"
                  : "启动游戏"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
