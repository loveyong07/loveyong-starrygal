import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BooksIcon,
  CaretDownIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  CloudSlashIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  GameControllerIcon,
  HeartIcon,
  InfoIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";
import { BRAND } from "@/lib/brand";
import { coverSrc } from "@/lib/asset";
import {
  GAME_STATUS_LABELS,
  formatPlayTime,
  type GameStatus,
} from "@/types/game";
import { useAppStore } from "@/store/app";
import { useGameLauncher } from "@/features/launch/useGameLauncher";
import { useGameProcessSync } from "@/features/launch/useGameProcess";
import LaunchDialog from "@/features/launch/LaunchDialog";
import { CloseBehaviorDialog } from "@/features/window/CloseBehaviorDialog";
import {
  addGame,
  desktop,
  folderFromPath,
  isGameExecutable,
  listGames,
  loadAppearance,
  loadAppearanceWallpaper,
  readPreference,
  clearPreviewCover,
  clearPreviewWallpaper,
  removeGame,
  savePreviewWallpaper,
  saveAppearance,
  titleFromPath,
  updateGame,
  writePreference,
  type Appearance,
} from "./library";
import {
  CONTACT_URL,
  NOTICE_VERSION,
  REPOSITORY_URL,
  completionPatch,
  normalizedPath,
  noticeNeeded,
  visitPatch,
  type LibraryGame,
} from "./model";
import {
  compareVersions,
  fetchLatestRelease,
  type LatestRelease,
} from "./update-check";
import {
  cancelDiscovery,
  discoverInstalledGames,
  launchSteamGame,
  type DiscoveredGame,
} from "./discovery";
import {
  lookupGameByName,
  registerMetadataProvider,
  type GameMetadata,
} from "./metadata";
import {
  createTouchGalClient,
  DEFAULT_TOUCHGAL_ENDPOINT,
  metadataPatch,
  validateEndpoint,
} from "./touchgal";
import { touchgalTransport } from "./touchgal-transport";
import { TouchGalSourceDialog } from "./TouchGalDialogs";
import {
  AboutDialog,
  AddGameDialog,
  AppearanceDialog,
  Modal,
  NoticeDialog,
  ScanResultsDialog,
} from "./StudioDialogs";
import GamePage from "./GamePage";
import "./galgame.css";

type ModalKind =
  "add" | "appearance" | "source" | "about" | "notice" | "scan" | null;
type Filter = "all" | GameStatus;
type UpdateCheckStatus =
  "idle" | "checking" | "current" | "available" | "no-release" | "error";

function DesktopSync() {
  useGameProcessSync();
  return <CloseBehaviorDialog />;
}

function ExternalLink({
  href,
  label,
  children,
  className = "",
  onClick,
}: {
  href: string;
  label: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      className={className}
      aria-label={label}
      title={label}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        onClick?.();
        if (!desktop) return;
        event.preventDefault();
        void import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(href))
          .catch(() => {
            window.alert("未能打开浏览器，请访问：" + href);
          });
      }}
    >
      {children}
    </a>
  );
}

function Cover({ game }: { game: LibraryGame }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = coverSrc(game.customCoverPath || game.coverPath);
  const coverBadge = game.releaseDate?.trim();
  return (
    <div className="gg-game-cover">
      {src && failed !== src ? (
        <img
          src={src}
          alt={game.title + "封面"}
          loading="lazy"
          onError={() => setFailed(src)}
        />
      ) : (
        <>
          <BooksIcon size={36} weight="light" />
          <span>封面待补充</span>
        </>
      )}
      {coverBadge && <span className="gg-cover-date">{coverBadge}</span>}
    </div>
  );
}

export default function GalgameApp() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState("added");
  const [modal, setModal] = useState<ModalKind>(null);
  const [noticeReady, setNoticeReady] = useState(false);
  const [utilitiesExpanded, setUtilitiesExpanded] = useState(false);
  const [latestRelease, setLatestRelease] = useState<LatestRelease | null>(
    null,
  );
  const [updateCheckStatus, setUpdateCheckStatus] =
    useState<UpdateCheckStatus>("idle");
  const [appearance, setAppearance] = useState(loadAppearance);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanPath, setScanPath] = useState("");
  const [candidates, setCandidates] = useState<DiscoveredGame[]>([]);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [sourceUrl, setSourceUrl] = useState(DEFAULT_TOUCHGAL_ENDPOINT);
  const [allowNsfw, setAllowNsfw] = useState(false);
  const [sourceReady, setSourceReady] = useState(false);
  const metadataClient = useMemo(
    () => createTouchGalClient(sourceUrl, allowNsfw, touchgalTransport),
    [sourceUrl, allowNsfw],
  );
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState("");
  const [metadataBatch, setMetadataBatch] = useState(false);
  const metadataBatchController = useRef<AbortController | null>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const wallpaperPicker = useRef<HTMLInputElement>(null);
  const firstScanStarted = useRef(false);
  const metadataKeys = useRef(new Set<string>());
  const updateCheckRequest = useRef<Promise<LatestRelease | null> | null>(null);
  const updateCheckController = useRef<AbortController | null>(null);
  const revision = useAppStore((state) => state.playTimeRevision);
  const launcher = useGameLauncher(() => {
    void refresh();
  });
  const match = /^\/library\/([1-9]\d*)$/.exec(pathname);
  const detailId = match ? Number(match[1]) : null;
  const game = games.find((item) => item.id === detailId) || null;
  const route =
    pathname === "/favorites"
      ? "favorites"
      : pathname === "/recent"
        ? "recent"
        : pathname === "/completed"
          ? "completed"
          : "library";

  async function refresh() {
    try {
      setGames(await listGames());
      setLoadError("");
    } catch {
      setLoadError("游戏库暂时无法读取，请重试。");
    } finally {
      setLoading(false);
    }
  }
  function replaceGame(updated: LibraryGame) {
    setGames((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
  async function checkForUpdates(manual = true) {
    setUpdateCheckStatus("checking");
    let request = updateCheckRequest.current;
    if (!request) {
      const controller = new AbortController();
      updateCheckController.current = controller;
      request = fetchLatestRelease(controller.signal);
      updateCheckRequest.current = request;
    }
    try {
      const release = await request;
      if (updateCheckController.current?.signal.aborted) return;
      if (!release) {
        setLatestRelease(null);
        setUpdateCheckStatus("no-release");
        if (manual) setToast("GitHub 还没有正式发布版本，应用会定期自动检查。");
        return;
      }
      if (compareVersions(release.version, BRAND.version) > 0) {
        setLatestRelease(release);
        setUpdateCheckStatus("available");
        setToast(`发现新版本 v${release.version}，可从发布页查看。`);
      } else {
        setLatestRelease(null);
        setUpdateCheckStatus("current");
        if (manual) setToast(`当前已是最新版本 v${BRAND.version}。`);
      }
    } catch {
      if (updateCheckController.current?.signal.aborted) return;
      setUpdateCheckStatus("error");
      if (manual) setToast("检查更新失败，请检查网络后重试。");
    } finally {
      if (updateCheckRequest.current === request)
        updateCheckRequest.current = null;
    }
  }

  useEffect(() => {
    void refresh();
  }, [revision]);
  useEffect(() => {
    const timer = window.setTimeout(() => void checkForUpdates(false), 1800);
    const interval = window.setInterval(
      () => void checkForUpdates(false),
      6 * 60 * 60 * 1000,
    );
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      updateCheckController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (pathname === "/" || pathname === "/home")
      navigate("/library", { replace: true });
  }, [pathname, navigate]);
  useEffect(() => {
    setQuery("");
    setFilter("all");
  }, [route]);
  useEffect(() => {
    document.documentElement.className = "galgame-theme";
    document.title = BRAND.title;
    let active = true;
    void readPreference("noticeSeen")
      .then((seen) => {
        if (!active) return;
        if (noticeNeeded(seen)) setModal("notice");
        else setNoticeReady(true);
      })
      .catch(() => {
        if (active) setModal("notice");
      });
    void Promise.all([
      readPreference("touchgal.endpoint"),
      readPreference("touchgal.allowNsfw"),
    ])
      .then(([url, allow]) => {
        if (!active) return;
        try {
          setSourceUrl(validateEndpoint(url || DEFAULT_TOUCHGAL_ENDPOINT));
        } catch {
          setSourceUrl(DEFAULT_TOUCHGAL_ENDPOINT);
        }
        setAllowNsfw(allow === "true");
        setSourceReady(true);
      })
      .catch(() => {
        if (active) setSourceReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void loadAppearanceWallpaper().then((wallpaper) => {
      if (active && wallpaper) {
        setAppearance((current) =>
          current.wallpaper.startsWith("blob:")
            ? current
            : { ...current, wallpaper },
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4600);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (launcher.error || launcher.notice)
      setToast(launcher.error || launcher.notice || "");
  }, [launcher.error, launcher.notice]);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<string>("game-discovery-progress", (event) => {
          if (active) setScanPath(event.payload);
        }),
      )
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      });
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  useEffect(() => {
    if (!desktop || !noticeReady || firstScanStarted.current) return;
    firstScanStarted.current = true;
    void readPreference("firstScan")
      .then((value) => {
        if (value !== "done") void automaticScan(true);
      })
      .catch(() => setToast("首次扫描设置未能读取，可点击“自动查找”重试。"));
  }, [noticeReady]);
  useEffect(() => {
    registerMetadataProvider(sourceReady ? metadataClient.provider : null);
    metadataKeys.current.clear();
    metadataBatchController.current?.abort();
    return () => {
      registerMetadataProvider(null);
      metadataBatchController.current?.abort();
    };
  }, [metadataClient, sourceReady]);
  useEffect(() => {
    setMetadataMessage("");
    if (!game || !sourceReady || game.touchgalId) return;
    const target = game;
    const key = target.id + "|" + target.title;
    if (metadataKeys.current.has(key)) return;
    metadataKeys.current.add(key);
    const controller = new AbortController();
    let completed = false;
    setMetadataBusy(true);
    void lookupGameByName(target.title, controller.signal)
      .then(async (result) => {
        if (controller.signal.aborted) return;
        if (!result) {
          setMetadataMessage("未能自动确认条目，请点击“匹配资料”搜索并选择。");
          completed = true;
          return;
        }
        const current = (await listGames()).find(
          (item) => item.id === target.id,
        );
        if (
          controller.signal.aborted ||
          !current ||
          current.title !== target.title
        )
          return;
        const updated = await updateGame(
          current.id,
          metadataPatch(current, result),
        );
        completed = true;
        metadataKeys.current.add(updated.id + "|" + updated.title);
        if (!controller.signal.aborted) replaceGame(updated);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          metadataKeys.current.delete(key);
          setMetadataMessage(
            cause instanceof Error ? cause.message : String(cause),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMetadataBusy(false);
      });
    return () => {
      if (!completed) metadataKeys.current.delete(key);
      controller.abort();
      setMetadataBusy(false);
    };
  }, [game?.id, game?.title, metadataClient, sourceReady]);

  async function applyMetadata(
    id: number,
    title: string,
    result: GameMetadata,
    replace = false,
  ) {
    const current = (await listGames()).find((item) => item.id === id);
    if (!current || current.title !== title)
      throw new Error("游戏名称已改变，请重新打开匹配窗口。");
    replaceGame(await updateGame(id, metadataPatch(current, result, replace)));
    setMetadataMessage("资料已保存。");
  }
  async function completeLibraryMetadata() {
    if (metadataBatch) {
      metadataBatchController.current?.abort();
      return;
    }
    const controller = new AbortController();
    metadataBatchController.current = controller;
    setMetadataBatch(true);
    let matched = 0;
    let checked = 0;
    try {
      const pending = (await listGames()).filter((item) => !item.touchgalId);
      for (const item of pending) {
        if (controller.signal.aborted) break;
        if ([...item.title.trim()].length < 3) {
          checked++;
          continue;
        }
        const result = await metadataClient.provider.searchByName(
          item.title,
          controller.signal,
        );
        if (controller.signal.aborted) break;
        if (result) {
          await applyMetadata(item.id, item.title, result);
          matched++;
        }
        checked++;
        setToast(
          `正在补全资料 ${checked}/${pending.length} · 已匹配 ${matched} 部`,
        );
      }
      setToast(
        `${controller.signal.aborted ? "已停止补全" : "资料补全结束"}，已匹配 ${matched} 部；未匹配作品可进入详情手动选择。`,
      );
    } catch (cause) {
      if (!controller.signal.aborted)
        setToast(
          (cause instanceof Error ? cause.message : String(cause)) +
            ` 已保存 ${matched} 部。`,
        );
    } finally {
      setMetadataBatch(false);
    }
  }

  async function acknowledgeNotice() {
    try {
      await writePreference("noticeSeen", NOTICE_VERSION);
    } catch {
      setToast("本次已读公告；本地存储暂不可用，下次启动可能再次显示。");
    }
    setModal(null);
    setNoticeReady(true);
  }
  function adjustAppearance(patch: Partial<Appearance>) {
    const next = { ...appearance, ...patch };
    try {
      saveAppearance(next);
      setAppearance(next);
      if (patch.wallpaper === "") void clearPreviewWallpaper().catch(() => {});
    } catch {
      setToast("设置未能保存，请重试。");
    }
  }
  async function openGame(item: LibraryGame) {
    try {
      const updated = await updateGame(
        item.id,
        visitPatch(item, new Date().toISOString()),
      );
      replaceGame(updated);
      navigate("/library/" + item.id);
    } catch {
      setToast("未能打开这部游戏，请重试。");
    }
  }
  async function toggleFavorite(item: LibraryGame) {
    try {
      replaceGame(
        await updateGame(item.id, { favorite: item.favorite ? 0 : 1 }),
      );
    } catch {
      setToast("收藏未能保存，请重试。");
    }
  }
  async function setComplete(item: LibraryGame, complete: boolean) {
    try {
      replaceGame(await updateGame(item.id, completionPatch(item, complete)));
      setToast(complete ? "这段旅程，已经好好收藏。" : "已取消通关标记。");
    } catch {
      setToast("通关状态未能保存。");
    }
  }
  async function startGame(item: LibraryGame) {
    if (!desktop) {
      setToast("网页预览不能运行本地程序，请在桌面版中开始游戏。");
      return;
    }
    if (item.source === "steam" && item.steamAppId) {
      try {
        await launchSteamGame(item.steamAppId);
        setToast("已向 Steam 发送启动请求。");
      } catch (cause) {
        setToast(cause instanceof Error ? cause.message : String(cause));
      }
    } else await launcher.launch(item);
  }

  async function importCandidates(items: DiscoveredGame[]) {
    let imported = 0;
    const failed: DiscoveredGame[] = [];
    for (const item of items) {
      try {
        await addGame({
          title: item.title.trim(),
          installPath: item.installPath,
          exePath: item.exePath,
          source: item.source,
          steamAppId: item.steamAppId,
        });
        imported++;
      } catch {
        const current = await listGames();
        if (
          !current.some(
            (game) =>
              normalizedPath(game.installPath) ===
              normalizedPath(item.installPath),
          )
        )
          failed.push(item);
      }
    }
    await refresh();
    if (failed.length) {
      setCandidates(failed);
      setModal("scan");
      throw new Error(
        "部分游戏未能导入，请检查名称与目录后重试。已成功导入 " +
          imported +
          " 部。",
      );
    }
    setModal(null);
    setToast(
      imported
        ? "已收录 " + imported + " 部本地游戏。"
        : "这些游戏已经在你的收藏中了。",
    );
  }

  async function automaticScan(first = false) {
    if (!desktop) {
      setToast("自动查找本地目录和 Steam 游戏，需要运行桌面版。");
      return;
    }
    if (busy) return;
    setBusy(true);
    setScanPath("");
    try {
      const report = await discoverInstalledGames();
      if (report.cancelled) {
        setToast("扫描已取消，已有游戏记录保留。");
        return;
      }
      const certain = report.games.filter((item) => item.recognized);
      const uncertain = report.games.filter((item) => !item.recognized);
      let count = 0;
      const failed: DiscoveredGame[] = [];
      for (const item of certain) {
        try {
          await addGame({
            title: item.title,
            installPath: item.installPath,
            exePath: item.exePath,
            source: item.source,
            steamAppId: item.steamAppId,
          });
          count++;
        } catch {
          failed.push(item);
        }
      }
      await refresh();
      if (first) await writePreference("firstScan", "done");
      const pending = [...failed, ...uncertain];
      if (pending.length) {
        setCandidates(pending);
        setModal("scan");
      }
      setToast(
        count
          ? "自动收录了 " + count + " 部游戏，其余候选可继续确认。"
          : pending.length
            ? "扫描完成，请确认这些游戏是否属于你的 Galgame 收藏。"
            : "没有发现新的游戏，可指定文件夹继续扫描。",
      );
      if (report.warnings.length) setToast(report.warnings.join(" "));
    } catch (cause) {
      setToast(
        "扫描未完成：" +
          (cause instanceof Error ? cause.message : String(cause)),
      );
    } finally {
      setBusy(false);
      setScanPath("");
    }
  }

  async function importFolder() {
    if (!desktop) {
      folderPicker.current?.click();
      return;
    }
    if (busy) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        directory: true,
        multiple: false,
        title: "选择游戏目录",
      });
      if (typeof path !== "string") return;
      setBusy(true);
      const { scanDirectory } = await import("@/features/scan/types");
      const result = await scanDirectory(path, 8);
      const items: DiscoveredGame[] = result
        .filter((item) => !item.alreadyImported && item.suggestedExe)
        .map((item) => ({
          title: item.suggestedTitle || item.folderName,
          installPath: item.folderPath,
          exePath: item.suggestedExe,
          source: "local",
          steamAppId: null,
          recognized: true,
        }));
      if (items.length) {
        setCandidates(items);
        setModal("scan");
      } else setToast("这个目录没有可添加的新游戏。");
    } catch {
      setToast("扫描未完成，请检查目录是否可访问。");
    } finally {
      setBusy(false);
    }
  }

  async function browserFolder(files: FileList | null) {
    if (!files) return;
    const seen = new Set(games.map((item) => normalizedPath(item.installPath)));
    const items: DiscoveredGame[] = [];
    for (const file of Array.from(files)) {
      if (!isGameExecutable(file.name)) continue;
      const path = file.webkitRelativePath || file.name;
      const folder = folderFromPath(path);
      const key = normalizedPath(folder);
      if (seen.has(key)) continue;
      seen.add(key);
      const base = titleFromPath(file.name);
      items.push({
        title: /^(game|start|play)$/i.test(base)
          ? folder.split(/[\\/]/).pop() || base
          : base,
        installPath: folder,
        exePath: path,
        source: "local",
        steamAppId: null,
        recognized: true,
      });
    }
    if (items.length) {
      setCandidates(items);
      setModal("scan");
    } else setToast("没有找到新的游戏主程序。");
    if (folderPicker.current) folderPicker.current.value = "";
  }

  const favorites = games.filter((item) => item.favorite);
  const routeGames =
    route === "favorites"
      ? favorites
      : route === "recent"
        ? games.filter((item) => item.visitedAt || item.lastPlayedAt)
        : route === "completed"
          ? games.filter((item) => item.status === "completed")
          : games;
  const displayed = routeGames
    .filter(
      (item) =>
        (filter === "all" || item.status === filter) &&
        (!query ||
          [item.title, item.originalTitle || "", ...item.tags]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase())),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title, "zh-CN")
        : sort === "time"
          ? b.playTimeSeconds - a.playTimeSeconds
          : sort === "recent"
            ? (b.visitedAt || b.lastPlayedAt || "").localeCompare(
                a.visitedAt || a.lastPlayedAt || "",
              )
            : b.createdAt.localeCompare(a.createdAt),
    );
  const heading =
    route === "favorites"
      ? "把喜欢，留在这里"
      : route === "recent"
        ? "接着上次的故事"
        : route === "completed"
          ? "那些走完的旅程"
          : "收藏每一场心动";
  const iconProps = { size: 20, weight: "regular" as const };
  const style = {
    "--gg-alpha": appearance.opacity / 100,
    "--gg-blur": appearance.blur + "px",
    "--gg-wallpaper":
      'url("' + (appearance.wallpaper || BRAND.wallpaper) + '")',
  } as CSSProperties;

  return (
    <div className="gg-app" data-palette={appearance.palette} style={style}>
      <div className="gg-wallpaper" aria-hidden="true" />
      {appearance.particles && (
        <div className="gg-particles" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <SparkleIcon
              key={i}
              weight="fill"
              style={{
                left: ((i * 13 + 7) % 100) + "%",
                top: ((i * 23 + 9) % 100) + "%",
                animationDelay: -i * 2.3 + "s",
                animationDuration: 16 + i * 2 + "s",
              }}
            />
          ))}
        </div>
      )}
      {desktop && <DesktopSync />}
      <aside className="gg-sidebar gg-glass">
        <NavLink
          to="/library"
          className="gg-brand"
          aria-label={BRAND.name + " 游戏库"}
        >
          <span className="gg-brand-icon">
            <img src={BRAND.icon} alt="" width={50} height={50} />
          </span>
          <span>
            <strong>{BRAND.name}</strong>
          </span>
        </NavLink>
        <div className="gg-nav-caption">
          我的空间<span>MY SPACE</span>
        </div>
        <nav className="gg-navigation" aria-label="主导航">
          <NavLink
            to="/library"
            aria-label="游戏库"
            className={route === "library" ? "active" : ""}
          >
            <BooksIcon {...iconProps} />
            <span>游戏库</span>
            <small>{games.length.toString().padStart(2, "0")}</small>
          </NavLink>
        </nav>
        <div className="gg-nav-caption gg-collection-caption">
          故事收藏<span>COLLECTION</span>
        </div>
        <nav className="gg-navigation" aria-label="收藏分类">
          <NavLink to="/favorites" aria-label="心动收藏">
            <HeartIcon {...iconProps} />
            <span>心动收藏</span>
            {favorites.length > 0 && <small>{favorites.length}</small>}
          </NavLink>
          <NavLink to="/recent" aria-label="最近游玩">
            <ClockCounterClockwiseIcon {...iconProps} />
            <span>最近游玩</span>
          </NavLink>
          <NavLink to="/completed" aria-label="已通关">
            <CheckCircleIcon {...iconProps} />
            <span>已通关</span>
          </NavLink>
        </nav>
        <div className="gg-sidebar-spacer" />
        <div className="gg-download-links" aria-label="下载资源">
          <ExternalLink
            className="gg-source-card gg-download-card"
            href="https://www.touchgal.ink/"
            label="Galgame下载 · TouchGal"
          >
            <span className="gg-source-icon">
              <GameControllerIcon size={20} />
            </span>
            <span>
              <strong>Galgame下载</strong>
              <small>前往 TouchGal</small>
            </span>
            <ArrowUpRightIcon size={14} />
          </ExternalLink>
          <ExternalLink
            className="gg-source-card gg-download-card"
            href="https://www.moyu.moe/"
            label="补丁下载 · Moyu Moe"
          >
            <span className="gg-source-icon">
              <DownloadSimpleIcon size={20} />
            </span>
            <span>
              <strong>补丁下载</strong>
              <small>前往 Moyu Moe</small>
            </span>
            <ArrowUpRightIcon size={14} />
          </ExternalLink>
        </div>
        <div className="gg-sidebar-bottom">
          <button
            className="gg-utility-toggle"
            aria-expanded={utilitiesExpanded}
            aria-controls="gg-utility-menu"
            onClick={() => setUtilitiesExpanded((value) => !value)}
          >
            {utilitiesExpanded ? "收起" : "展开"}
          </button>
          <button
            className="gg-about-button"
            aria-label="关于项目"
            title="关于项目"
            onClick={() => setModal("about")}
          >
            <InfoIcon size={20} />
          </button>
        </div>
        <div
          id="gg-utility-menu"
          className="gg-utility-menu"
          aria-label="快捷操作"
          hidden={!utilitiesExpanded}
        >
          <button
            className="gg-utility-item"
            onClick={() => {
              setUtilitiesExpanded(false);
              setModal("notice");
            }}
          >
            公告
          </button>
          <button
            className="gg-utility-item"
            disabled={updateCheckStatus === "checking"}
            onClick={() => {
              setUtilitiesExpanded(false);
              void checkForUpdates();
            }}
          >
            {updateCheckStatus === "checking" ? "正在检查更新…" : "检查更新"}
          </button>
          {latestRelease && updateCheckStatus === "available" ? (
            <ExternalLink
              className="gg-utility-item"
              href={latestRelease.url}
              label={`查看新版本 v${latestRelease.version}`}
              onClick={() => setUtilitiesExpanded(false)}
            >
              发现新版本 v{latestRelease.version}
            </ExternalLink>
          ) : null}
          {updateCheckStatus === "current" ? (
            <span className="gg-utility-status" role="status">
              当前已是最新版本
            </span>
          ) : null}
          {updateCheckStatus === "no-release" ? (
            <span className="gg-utility-status" role="status">
              暂无正式发布版本
            </span>
          ) : null}
          {updateCheckStatus === "error" ? (
            <span className="gg-utility-status" role="status">
              检查失败，可重试
            </span>
          ) : null}
          <ExternalLink
            className="gg-utility-item"
            href={CONTACT_URL}
            label="反馈与联系"
            onClick={() => setUtilitiesExpanded(false)}
          >
            反馈与联系
          </ExternalLink>
          <button
            className="gg-utility-item"
            onClick={() => {
              setUtilitiesExpanded(false);
              setModal("appearance");
            }}
          >
            外观设置
          </button>
          <ExternalLink
            className="gg-utility-item"
            href={REPOSITORY_URL}
            label="查看 GitHub 源码"
            onClick={() => setUtilitiesExpanded(false)}
          >
            GitHub 源码
          </ExternalLink>
        </div>
        <div className="gg-version">
          <span>v{BRAND.version}</span>
        </div>
      </aside>

      <div className="gg-workspace">
        <header className="gg-topbar">
          <div className="gg-breadcrumb">
            <span>我的空间</span>
            <span>/</span>
            <strong>
              {game
                ? game.title
                : route === "favorites"
                  ? "心动收藏"
                  : route === "recent"
                    ? "最近游玩"
                    : route === "completed"
                      ? "已通关"
                      : "游戏库"}
            </strong>
          </div>
          <div className="gg-topbar-actions">
            <span className="gg-local-badge">
              <span />
              本地游戏库
            </span>
            {latestRelease && updateCheckStatus === "available" ? (
              <ExternalLink
                className="gg-update-badge"
                href={latestRelease.url}
                label={`查看新版本 v${latestRelease.version}`}
              >
                发现更新 v{latestRelease.version}
                <ArrowUpRightIcon size={14} />
              </ExternalLink>
            ) : null}
          </div>
        </header>
        <main
          className={"gg-main" + (detailId === null ? " gg-library-page" : "")}
        >
          {busy && (
            <div className="gg-scan-progress gg-glass" role="status">
              <ArrowClockwiseIcon size={18} />
              <span>
                正在发现本地故事
                <small title={scanPath}>
                  {scanPath || "正在读取游戏目录…"}
                </small>
              </span>
              {desktop && (
                <button
                  className="gg-text-button"
                  onClick={() => void cancelDiscovery()}
                >
                  取消扫描
                </button>
              )}
            </div>
          )}
          {detailId !== null ? (
            game ? (
              <GamePage
                key={game.id}
                game={game}
                back={() => navigate("/library")}
                favorite={() => void toggleFavorite(game)}
                complete={(value) => void setComplete(game, value)}
                rename={async (title) => {
                  replaceGame(
                    await updateGame(game.id, {
                      title,
                      touchgalId: null,
                      touchgalUrl: null,
                      sourceTitle: null,
                      communityRating: null,
                      communityRatingCount: 0,
                    }),
                  );
                }}
                saveTags={async (tags) => {
                  replaceGame(await updateGame(game.id, { tags }));
                }}
                saveReview={async (rating, notes) => {
                  replaceGame(await updateGame(game.id, { rating, notes }));
                }}
                saveCover={async (customCoverPath) => {
                  replaceGame(await updateGame(game.id, { customCoverPath }));
                  if (!desktop && customCoverPath === null)
                    await clearPreviewCover(game.id).catch(() => {});
                }}
                launch={() => void startGame(game)}
                remove={() => setRemoveId(game.id)}
                metadataBusy={metadataBusy}
                metadataMessage={metadataMessage}
                metadataClient={metadataClient}
                applyMetadata={(result, replace) =>
                  applyMetadata(game.id, game.title, result, replace)
                }
                saveVideo={async (videoUrl) => {
                  replaceGame(await updateGame(game.id, { videoUrl }));
                }}
              />
            ) : (
              <div className="gg-empty gg-glass">
                <BooksIcon size={42} weight="light" />
                <h3>
                  {loading ? "正在打开这段故事…" : "这段故事暂时不在游戏库中"}
                </h3>
                <button
                  className="gg-button gg-secondary"
                  onClick={() => navigate("/library")}
                >
                  返回游戏库
                  <ArrowRightIcon size={16} />
                </button>
              </div>
            )
          ) : (
            <>
              <section className="gg-page-heading">
                <div>
                  <div className="gg-eyebrow">
                    <span />A PLACE FOR YOUR STORIES
                  </div>
                  <h1>
                    {heading}
                    <span>。</span>
                  </h1>
                  <p>把散落在磁盘里的故事，慢慢收进日常。</p>
                </div>
                <div className="gg-heading-actions">
                  <button
                    className="gg-button gg-secondary"
                    disabled={!sourceReady}
                    onClick={() => void completeLibraryMetadata()}
                  >
                    <SparkleIcon size={18} />
                    {metadataBatch ? "停止补全" : "补全资料"}
                  </button>
                  <button
                    className="gg-button gg-secondary"
                    onClick={() => void automaticScan()}
                    disabled={busy}
                  >
                    <FolderOpenIcon size={18} />
                    自动查找
                  </button>
                  <button
                    className="gg-button gg-primary"
                    onClick={() => setModal("add")}
                  >
                    <PlusIcon size={19} weight="bold" />
                    添加游戏
                  </button>
                </div>
              </section>
              <div className="gg-content-grid gg-full-library">
                <section className="gg-library gg-glass" aria-label="游戏库">
                  <div className="gg-library-heading">
                    <div>
                      <BooksIcon size={22} weight="duotone" />
                      <h2>我的游戏</h2>
                      <span className="gg-count">{routeGames.length}</span>
                    </div>
                    <div
                      className="gg-view-toggle"
                      role="group"
                      aria-label="展示方式"
                    >
                      <button
                        aria-label="封面网格"
                        aria-pressed={view === "grid"}
                        className={view === "grid" ? "selected" : ""}
                        onClick={() => setView("grid")}
                      >
                        <SquaresFourIcon size={18} />
                      </button>
                      <button
                        aria-label="列表视图"
                        aria-pressed={view === "list"}
                        className={view === "list" ? "selected" : ""}
                        onClick={() => setView("list")}
                      >
                        <ListIcon size={19} />
                      </button>
                    </div>
                  </div>
                  <div className="gg-library-toolbar">
                    <label className="gg-search">
                      <MagnifyingGlassIcon size={18} />
                      <input
                        aria-label="搜索游戏"
                        placeholder="寻找一段故事，或一个标签…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      {query && (
                        <button
                          aria-label="清空搜索"
                          onClick={() => setQuery("")}
                        >
                          <XIcon size={15} />
                        </button>
                      )}
                    </label>
                    <label className="gg-sort">
                      <SlidersHorizontalIcon size={16} />
                      <select
                        aria-label="游戏排序"
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                      >
                        <option value="added">最近添加</option>
                        <option value="recent">最近打开</option>
                        <option value="name">名称排序</option>
                        <option value="time">游玩时长</option>
                      </select>
                      <CaretDownIcon size={12} />
                    </label>
                  </div>
                  <div
                    className="gg-status-tabs"
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
                        {value === "all" && <span>{routeGames.length}</span>}
                      </button>
                    ))}
                  </div>
                  {loadError ? (
                    <div className="gg-empty">
                      <CloudSlashIcon size={40} weight="light" />
                      <h3>{loadError}</h3>
                      <button
                        className="gg-button gg-secondary"
                        onClick={() => void refresh()}
                      >
                        <ArrowClockwiseIcon size={17} />
                        重新读取
                      </button>
                    </div>
                  ) : displayed.length === 0 ? (
                    <div className="gg-empty">
                      <div className="gg-empty-icon">
                        <BooksIcon size={55} weight="duotone" />
                        <SparkleIcon size={16} weight="duotone" />
                      </div>
                      <span className="gg-empty-overline">
                        YOUR NEXT CHAPTER
                      </span>
                      <h3>
                        {loading
                          ? "正在整理你的故事…"
                          : query || filter !== "all"
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
                        {query || filter !== "all" ? (
                          "换个关键词，或看看其他游玩状态。"
                        ) : route === "favorites" ? (
                          "点击游戏上的爱心，就能在这里找到它。"
                        ) : route === "recent" ? (
                          "打开过的故事，会在这里等你回来。"
                        ) : route === "completed" ? (
                          "在游戏详情中，自行标记已通关的作品。"
                        ) : (
                          <>
                            添加一部本地游戏，
                            <br />
                            把属于你的世界，放在触手可及的地方。
                          </>
                        )}
                      </p>
                      {query || filter !== "all" ? (
                        <button
                          className="gg-button gg-secondary"
                          onClick={() => {
                            setQuery("");
                            setFilter("all");
                          }}
                        >
                          查看全部游戏
                          <ArrowRightIcon size={17} />
                        </button>
                      ) : (
                        route === "library" && (
                          <div className="gg-empty-actions">
                            <button
                              className="gg-button gg-primary"
                              onClick={() => setModal("add")}
                            >
                              <PlusIcon size={17} />
                              添加第一部游戏
                            </button>
                            <button
                              className="gg-button gg-secondary"
                              onClick={() => void importFolder()}
                              disabled={busy}
                            >
                              <FolderOpenIcon size={18} />
                              {busy ? "扫描中…" : "扫描文件夹"}
                            </button>
                          </div>
                        )
                      )}
                      {route === "library" && !query && filter === "all" && (
                        <span className="gg-empty-hint">
                          支持本地游戏与 Steam<span>·</span>游戏文件保留在原处
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className={
                        "gg-game-grid " + (view === "list" ? "is-list" : "")
                      }
                    >
                      {displayed.map((item) => (
                        <article key={item.id} className="gg-game-item">
                          <button
                            className="gg-game-select"
                            onClick={() => void openGame(item)}
                            aria-label={"查看 " + item.title}
                          >
                            <Cover game={item} />
                            <div className="gg-game-caption">
                              <h3>{item.title}</h3>
                              <span>
                                {GAME_STATUS_LABELS[item.status]}
                                <i />
                                {item.source === "steam"
                                  ? "Steam"
                                  : formatPlayTime(item.playTimeSeconds)}
                              </span>
                            </div>
                          </button>
                          <button
                            className={
                              "gg-favorite " +
                              (item.favorite ? "is-favorite" : "")
                            }
                            aria-label={
                              (item.favorite ? "取消收藏 " : "收藏 ") +
                              item.title
                            }
                            onClick={() => void toggleFavorite(item)}
                          >
                            <HeartIcon
                              size={18}
                              weight={item.favorite ? "fill" : "regular"}
                            />
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                  <footer className="gg-library-footer">
                    <span>
                      <span className="gg-status-dot" />
                      打开即记为游玩中，通关由你决定。
                    </span>
                    <span>{displayed.length} 部作品</span>
                  </footer>
                </section>
              </div>
            </>
          )}
          <footer className="gg-page-footer">
            <span>
              <SparkleIcon size={9} weight="fill" />
              慢慢收藏，慢慢喜欢。
            </span>
          </footer>
        </main>
      </div>

      <input
        ref={folderPicker}
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        hidden
        onChange={(event) => void browserFolder(event.target.files)}
      />
      <input
        ref={wallpaperPicker}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            setToast("请选择 PNG、JPG 或 WebP 图片。");
            event.target.value = "";
            return;
          }
          void savePreviewWallpaper(file)
            .then((wallpaper) => adjustAppearance({ wallpaper }))
            .catch(() =>
              setToast("背景图片保存失败，请检查本地可用空间后重试。"),
            );
          event.target.value = "";
        }}
      />
      {modal === "notice" && (
        <NoticeDialog close={() => void acknowledgeNotice()} />
      )}
      {modal === "add" && (
        <AddGameDialog
          close={() => setModal(null)}
          done={async (item) => {
            await refresh();
            setModal(null);
            setToast("已添加到游戏库。打开作品，即可查看故事详情。");
            void item;
          }}
        />
      )}
      {modal === "appearance" && (
        <AppearanceDialog
          appearance={appearance}
          change={adjustAppearance}
          close={() => setModal(null)}
          pickWallpaper={() => wallpaperPicker.current?.click()}
        />
      )}
      {modal === "source" && (
        <TouchGalSourceDialog
          endpoint={sourceUrl}
          allowNsfw={allowNsfw}
          close={() => setModal(null)}
          save={async (url, allow) => {
            await writePreference("touchgal.endpoint", url);
            await writePreference("touchgal.allowNsfw", String(allow));
            setSourceUrl(url);
            setAllowNsfw(allow);
            setModal(null);
            setToast("资料设置已保存，可在游戏库点击“补全资料”。");
          }}
        />
      )}
      {modal === "about" && <AboutDialog close={() => setModal(null)} />}
      {modal === "scan" && (
        <ScanResultsDialog
          key={candidates.map((item) => item.installPath).join("|")}
          candidates={candidates}
          close={() => setModal(null)}
          importGames={importCandidates}
        />
      )}
      {removeId !== null && (
        <Modal
          title="移出游戏库？"
          subtitle="只移除收藏记录，磁盘上的游戏文件保留原样。"
          close={() => setRemoveId(null)}
        >
          <p className="gg-confirm-name">
            {games.find((item) => item.id === removeId)?.title}
          </p>
          <div className="gg-dialog-footer">
            <button
              className="gg-button gg-secondary"
              onClick={() => setRemoveId(null)}
            >
              保留游戏
            </button>
            <button
              className="gg-button gg-danger"
              onClick={async () => {
                try {
                  await removeGame(removeId);
                  if (detailId === removeId) navigate("/library");
                  await refresh();
                  setRemoveId(null);
                  setToast("已移出游戏库，游戏文件仍在原处。");
                } catch {
                  setToast("未能移除，请重试。");
                }
              }}
            >
              确认移出
            </button>
          </div>
        </Modal>
      )}
      {desktop && launcher.dialogGame && (
        <LaunchDialog
          open
          game={launcher.dialogGame}
          onClose={launcher.closeDialog}
          onLaunched={() => void refresh()}
        />
      )}
      {toast && (
        <div className="gg-toast gg-glass" role="status">
          <InfoIcon size={19} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <XIcon size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
