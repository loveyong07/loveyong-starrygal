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
  compact = false,
  className = "",
}: {
  game: LibraryGame;
  launch: () => void;
  pending?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const starting = useAppStore((state) => Boolean(state.launching[game.id]));
  const running = useAppStore(
    (state) => state.gameProcesses[game.id]?.status === "running",
  );
  const busy = pending || starting;
  const text = busy ? "启动中…" : running ? "正在运行" : "开始游戏";
  return (
    <button
      type="button"
      className={`gg-button gg-primary gg-play-button ${compact ? "is-compact" : ""} ${className}`}
      disabled={busy}
      aria-busy={busy}
      aria-label={`${running ? "查看运行中的" : "启动"} ${game.title}`}
      title={running ? "查看运行状态" : `启动 ${game.title}`}
      onClick={launch}
    >
      {busy ? (
        <ArrowClockwiseIcon className="gg-spin" size={17} />
      ) : running ? (
        <GameControllerIcon size={18} />
      ) : (
        <PlayIcon size={16} weight="fill" />
      )}
      <span>{text}</span>
    </button>
  );
}
