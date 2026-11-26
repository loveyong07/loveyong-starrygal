import {
  ArrowClockwiseIcon,
  GameControllerIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import { useAppStore } from "@/store/app";
import type { LibraryGame } from "./model";

export default function GameLaunchButton({
  game,
  launch,
  pending = false,
  steamRunning = false,
  compact = false,
  iconOnly = false,
  label = "开始游戏",
  className = "",
}: {
  game: LibraryGame;
  launch: () => void;
  pending?: boolean;
  steamRunning?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
  label?: string;
  className?: string;
}) {
  const starting = useAppStore((state) => Boolean(state.launching[game.id]));
  const localRunning = useAppStore(
    (state) => state.gameProcesses[game.id]?.status === "running",
  );
  const running = localRunning || steamRunning;
  const busy = pending || starting;
  const text = busy ? "启动中…" : running ? "正在运行" : label;
  return (
    <button
      type="button"
      className={`gg-button gg-primary gg-play-button ${compact ? "is-compact" : ""} ${iconOnly ? "is-icon-only" : ""} ${running ? "is-running" : ""} ${className}`}
      disabled={busy}
      aria-busy={busy}
      aria-label={`${running ? "查看运行中的" : label} ${game.title}`}
      title={running ? "正在运行" : `${label} · ${game.title}`}
      onClick={launch}
    >
      {busy ? (
        <ArrowClockwiseIcon className="gg-spin" size={16} />
      ) : running ? (
        <GameControllerIcon size={17} />
      ) : (
        <PlayIcon size={15} weight="fill" />
      )}
      {!iconOnly && <span>{text}</span>}
    </button>
  );
}
