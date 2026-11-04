import { useMemo } from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  BooksIcon,
  CaretDownIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  CloudSlashIcon,
  FolderOpenIcon,
  HeartIcon,
  ListIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import {
  GAME_STATUS_LABELS,
  formatPlayTime,
  type GameStatus,
} from "@/types/game";
import type { LibraryGame } from "./model";
import GameArtwork from "./GameArtwork";
import GameLaunchButton from "./GameLaunchButton";

export type LibraryDensity = "compact" | "comfortable" | "large";
export type LibrarySort = "added" | "recent" | "name" | "time";
export type LibraryFilter = "all" | GameStatus;
export type LibraryRoute = "library" | "favorites" | "recent" | "completed";

function recentLabel(game: LibraryGame): string {
  const date = new Date(game.visitedAt || game.lastPlayedAt || "");
  return Number.isFinite(date.getTime())
    ? `${date.getMonth() + 1} 月 ${date.getDate()} 日打开`
    : "最近打开";
}

export default function LibraryView({
  games,
  routeGames,
  displayed,
  route,
  query,
  filter,
  view,
  sort,
  density,
  ready,
  loading,
  error,
  busy,
  sourceReady,
  metadataBatch,
  steamLaunching,
  setFilter,
  setView,
  setSort,
  setDensity,
  clearSearch,
  openGame,
  launch,
  favorite,
  add,
  scan,
  scanFolder,
  completeMetadata,
  refresh,
}: {
  games: LibraryGame[];
  routeGames: LibraryGame[];
  displayed: LibraryGame[];
  route: LibraryRoute;
  query: string;
  filter: LibraryFilter;
  view: "grid" | "list";
  sort: LibrarySort;
  density: LibraryDensity;
  ready: boolean;
  loading: boolean;
  error: string;
  busy: boolean;
  sourceReady: boolean;
  metadataBatch: boolean;
  steamLaunching: number[];
  setFilter: (value: LibraryFilter) => void;
  setView: (value: "grid" | "list") => void;
  setSort: (value: LibrarySort) => void;
  setDensity: (value: LibraryDensity) => void;
  clearSearch: () => void;
  openGame: (game: LibraryGame) => void;
  launch: (game: LibraryGame) => void;
  favorite: (game: LibraryGame) => void;
  add: () => void;
  scan: () => void;
  scanFolder: () => void;
  completeMetadata: () => void;
  refresh: () => void;
}) {
  const recent = useMemo(
    () =>
      games
        .filter((game) => game.visitedAt || game.lastPlayedAt)
        .sort((a, b) =>
          (b.visitedAt || b.lastPlayedAt || "").localeCompare(
            a.visitedAt || a.lastPlayedAt || "",
          ),
        )
        .slice(0, 3),
    [games],
  );
  const titles = {
    library: "收藏每一场心动",
    favorites: "把喜欢，留在这里",
    recent: "接着上次的故事",
    completed: "那些走完的旅程",
  };
  const descriptions = {
    library: "你的游戏，你的节奏。下一段故事，就在这里。",
    favorites: "那些让你舍不得忘记的世界。",
    recent: "熟悉的故事，随时可以再出发。",
    completed: "每一段走过的旅程，都值得好好收藏。",
  };
  const showRecent =
    route === "library" &&
    !query &&
    filter === "all" &&
    recent.length > 0 &&
    !loading;
  return (
    <div className="gg-library-view" data-density={density}>
      <section className="gg-collection-heading">
        <div>
          <span className="gg-section-kicker">YOUR STORY COLLECTION</span>
          <h1>
            {titles[route]}
            <span>。</span>
          </h1>
          <p>{descriptions[route]}</p>
        </div>
        <div className="gg-collection-actions">
          <details className="gg-import-menu">
            <summary className="gg-button gg-secondary">
              <FolderOpenIcon size={18} />
              导入游戏
              <CaretDownIcon size={13} />
            </summary>
            <div className="gg-dropdown gg-glass">
              <button
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  scan();
                }}
              >
                <SparkleIcon size={18} />
                <span>
                  自动查找<small>发现本地与 Steam 游戏</small>
                </span>
              </button>
              <button
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  scanFolder();
                }}
              >
                <FolderOpenIcon size={18} />
                <span>
                  扫描文件夹<small>选择自己的游戏目录</small>
                </span>
              </button>
            </div>
          </details>
          <button className="gg-button gg-primary" onClick={add}>
            <PlusIcon size={18} weight="bold" />
            添加游戏
          </button>
        </div>
      </section>

      {showRecent && (
        <section className="gg-recent-section" aria-label="最近打开">
          <div className="gg-section-title">
            <h2>
              <ClockCounterClockwiseIcon size={18} />
              最近打开
            </h2>
            <span>熟悉的故事，一键出发</span>
          </div>
          <div className="gg-recent-grid">
            {recent.map((game) => (
              <article key={game.id} className="gg-recent-card gg-glass">
                <button
                  className="gg-recent-open"
                  onClick={() => openGame(game)}
                  aria-label={`查看最近打开的 ${game.title}`}
                >
                  <GameArtwork game={game} />
                </button>
                <div className="gg-recent-copy">
                  <button
                    className="gg-recent-name"
                    onClick={() => openGame(game)}
                    title={game.title}
                  >
                    {game.title}
                  </button>
                  <span>{recentLabel(game)}</span>
                  <GameLaunchButton
                    game={game}
                    launch={() => launch(game)}
                    pending={steamLaunching.includes(game.id)}
                    compact
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="gg-shelf gg-glass" aria-label="游戏库">
        <header className="gg-shelf-header">
          <div className="gg-section-title">
            <h2>
              <BooksIcon size={20} />
              {route === "library"
                ? "我的游戏"
                : route === "favorites"
                  ? "心动收藏"
                  : route === "recent"
                    ? "最近游玩"
                    : "已通关"}
              <span className="gg-count">{routeGames.length}</span>
            </h2>
          </div>
          <button
            className="gg-text-button gg-metadata-action"
            disabled={!sourceReady || !games.length}
            onClick={completeMetadata}
          >
            <SparkleIcon size={16} />
            {metadataBatch ? "停止补全" : "补全资料"}
          </button>
        </header>
        <div className="gg-shelf-controls">
          <div
            className="gg-filter-pills"
            role="group"
            aria-label="游玩状态筛选"
          >
            {(
              [
                ["all", "全部"],
                ["playing", "游玩中"],
                ["unplayed", "待开始"],
                ["completed", "已通关"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? "selected" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
                <span>
                  {value === "all"
                    ? routeGames.length
                    : routeGames.filter((game) => game.status === value).length}
                </span>
              </button>
            ))}
          </div>
          <div className="gg-shelf-options">
            <label className="gg-sort">
              <SlidersHorizontalIcon size={16} />
              <select
                aria-label="游戏排序"
                disabled={!ready}
                value={sort}
                onChange={(event) => setSort(event.target.value as LibrarySort)}
              >
                <option value="added">最近添加</option>
                <option value="recent">最近打开</option>
                <option value="name">名称排序</option>
                <option value="time">游玩时长</option>
              </select>
              <CaretDownIcon size={12} />
            </label>
            {view === "grid" && (
              <label className="gg-density-control">
                <select
                  aria-label="封面大小"
                  value={density}
                  disabled={!ready}
                  onChange={(event) =>
                    setDensity(event.target.value as LibraryDensity)
                  }
                >
                  <option value="compact">小封面</option>
                  <option value="comfortable">中封面</option>
                  <option value="large">大封面</option>
                </select>
              </label>
            )}
            <div className="gg-view-toggle" role="group" aria-label="展示方式">
              <button
                aria-label="封面网格"
                aria-pressed={view === "grid"}
                className={view === "grid" ? "selected" : ""}
                disabled={!ready}
                onClick={() => setView("grid")}
              >
                <SquaresFourIcon size={18} />
              </button>
              <button
                aria-label="列表视图"
                aria-pressed={view === "list"}
                className={view === "list" ? "selected" : ""}
                disabled={!ready}
                onClick={() => setView("list")}
              >
                <ListIcon size={19} />
              </button>
            </div>
          </div>
        </div>
        {query && (
          <div className="gg-search-summary" role="status">
            “{query}” 的搜索结果 · {displayed.length} 部
            <button className="gg-text-button" onClick={clearSearch}>
              清空搜索
            </button>
          </div>
        )}
        {error ? (
          <div className="gg-empty">
            <CloudSlashIcon size={40} weight="light" />
            <h3>{error}</h3>
            <button className="gg-button gg-secondary" onClick={refresh}>
              <ArrowClockwiseIcon size={17} />
              重新读取
            </button>
          </div>
        ) : loading ? (
          <div
            className="gg-loading-library"
            aria-label="正在读取游戏库"
            role="status"
          >
            <ArrowClockwiseIcon size={22} className="gg-spin" />
            正在整理你的故事…
          </div>
        ) : !displayed.length ? (
          <div className="gg-empty">
            <div className="gg-empty-icon">
              <BooksIcon size={48} weight="duotone" />
              <SparkleIcon size={16} />
            </div>
            <h3>
              {query || filter !== "all"
                ? "暂时没有找到这段故事"
                : route === "favorites"
                  ? "为喜欢的故事，留一个位置"
                  : route === "recent"
                    ? "下一次相遇，值得期待"
                    : route === "completed"
                      ? "每一个结局，都值得收藏"
                      : "第一段故事，从这里开始"}
            </h3>
            <p>
              {query || filter !== "all"
                ? "换个关键词，或看看其他游玩状态。"
                : route === "favorites"
                  ? "点击游戏上的爱心，就能在这里找到它。"
                  : route === "recent"
                    ? "打开过的故事，会在这里等你回来。"
                    : route === "completed"
                      ? "在游戏详情中，自行标记已通关的作品。"
                      : "添加本地游戏，让喜欢的世界触手可及。"}
            </p>
            {query || filter !== "all" ? (
              <button
                className="gg-button gg-secondary"
                onClick={() => {
                  clearSearch();
                  setFilter("all");
                }}
              >
                查看全部游戏
                <ArrowRightIcon size={17} />
              </button>
            ) : (
              route === "library" && (
                <div className="gg-empty-actions">
                  <button className="gg-button gg-primary" onClick={add}>
                    <PlusIcon size={17} />
                    添加第一部游戏
                  </button>
                  <button
                    className="gg-button gg-secondary"
                    onClick={scanFolder}
                    disabled={busy}
                  >
                    <FolderOpenIcon size={18} />
                    扫描文件夹
                  </button>
                </div>
              )
            )}
          </div>
        ) : (
          <div
            className={`gg-collection-grid ${view === "list" ? "is-list" : ""}`}
          >
            {displayed.map((game) => (
              <article key={game.id} className="gg-collection-card">
                <button
                  className="gg-card-open"
                  onClick={() => openGame(game)}
                  aria-label={`查看 ${game.title}`}
                >
                  <GameArtwork game={game} />
                  <span className="gg-card-description">
                    <strong title={game.title}>{game.title}</strong>
                    <span className="gg-card-meta">
                      <span className={`gg-game-state is-${game.status}`}>
                        {game.status === "completed" && (
                          <CheckCircleIcon size={12} />
                        )}
                        {GAME_STATUS_LABELS[game.status]}
                      </span>
                      <span>
                        {game.source === "steam"
                          ? "Steam"
                          : formatPlayTime(game.playTimeSeconds)}
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  className={`gg-card-favorite ${game.favorite ? "is-favorite" : ""}`}
                  aria-label={`${game.favorite ? "取消收藏" : "收藏"} ${game.title}`}
                  aria-pressed={Boolean(game.favorite)}
                  title={game.favorite ? "取消收藏" : "收藏"}
                  onClick={() => favorite(game)}
                >
                  <HeartIcon
                    size={17}
                    weight={game.favorite ? "fill" : "regular"}
                  />
                </button>
                <div className="gg-card-launch">
                  <GameLaunchButton
                    game={game}
                    launch={() => launch(game)}
                    pending={steamLaunching.includes(game.id)}
                    compact
                  />
                </div>
              </article>
            ))}
          </div>
        )}
        <footer className="gg-shelf-footer">
          <span>
            <span className="gg-status-dot" />
            打开即记为游玩中，通关由你决定。
          </span>
          <span>{displayed.length} 部作品</span>
        </footer>
      </section>
    </div>
  );
}
