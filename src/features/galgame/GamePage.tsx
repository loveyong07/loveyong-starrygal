import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  HeartIcon,
  FolderOpenIcon,
  ImageSquareIcon,
  PencilSimpleIcon,
  PlayIcon,
  TagIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { coverSrc } from "@/lib/asset";
import { formatPlayTime } from "@/types/game";
import { gameCoverImport } from "@/lib/db";
import {
  mediaUrl,
  selectedExecutable,
  statusOf,
  type LibraryGame,
} from "./model";
import {
  ResourceLink,
  TouchGalMatchDialog,
  TouchGalResources,
} from "./TouchGalDialogs";
import type { GameMetadata } from "./metadata";
import type { TouchGalClient } from "./touchgal";
import { parseTouchGalIntroduction } from "./touchgal-introduction";
import { desktop, savePreviewCover } from "./library";
import { Modal } from "./StudioDialogs";

function LinkedParagraph({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'（）)]+/g)) {
    const at = match.index!;
    nodes.push(text.slice(from, at));
    const url = mediaUrl(match[0]);
    nodes.push(
      url && !new URL(url).username && !new URL(url).password ? (
        <ResourceLink key={at} href={url}>
          {match[0]}
        </ResourceLink>
      ) : (
        match[0]
      ),
    );
    from = at + match[0].length;
  }
  nodes.push(text.slice(from));
  return <>{nodes}</>;
}

function LinkedDescription({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((block, index) =>
          /^(游戏介绍|游戏简介|剧情简介|故事介绍|支持正版)$/.test(
            block.trim(),
          ) ? (
            <h3 key={index}>{block.trim()}</h3>
          ) : (
            <p key={index}>
              <LinkedParagraph text={block} />
            </p>
          ),
        )}
    </>
  );
}

export default function GamePage({
  game,
  back,
  favorite,
  complete,
  rename,
  saveCover,
  launch,
  remove,
  metadataBusy,
  metadataMessage,
  metadataClient,
  applyMetadata,
  saveVideo,
  saveExecutable,
  restoreSteam,
}: {
  game: LibraryGame;
  back: () => void;
  favorite: () => void;
  complete: (value: boolean) => void;
  rename: (title: string) => Promise<void>;
  saveCover: (coverPath: string | null) => Promise<void>;
  launch: () => void;
  remove: () => void;
  metadataBusy: boolean;
  metadataMessage: string;
  metadataClient: TouchGalClient;
  applyMetadata: (result: GameMetadata, replace: boolean) => Promise<void>;
  saveVideo: (value: string | null) => Promise<void>;
  saveExecutable: (path: string) => Promise<void>;
  restoreSteam: () => Promise<void>;
}) {
  const introduction = useMemo(
    () => parseTouchGalIntroduction(game.description),
    [game.description],
  );
  const videoUrl = game.videoOverride
    ? game.videoUrl
    : game.videoUrl || introduction.videoUrl;
  const screenshots = game.screenshots.length
    ? game.screenshots
    : introduction.screenshots;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(game.title);
  const [error, setError] = useState("");
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [coverNotice, setCoverNotice] = useState("");
  const [matching, setMatching] = useState(false);
  const [videoDraft, setVideoDraft] = useState(videoUrl || "");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [choosingExecutable, setChoosingExecutable] = useState(false);
  const [exeDraft, setExeDraft] = useState(game.exePath || "");
  const [exeBusy, setExeBusy] = useState(false);
  const [exeError, setExeError] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoNotice, setVideoNotice] = useState("");
  const [videoFailed, setVideoFailed] = useState(false);
  const videoIsPage = videoUrl
    ? /(^|\.)(bilibili\.com|b23\.tv|youtube\.com|youtu\.be|vimeo\.com)$/.test(
        new URL(videoUrl).hostname,
      )
    : false;
  useEffect(() => {
    setVideoDraft(videoUrl || "");
    setVideoFailed(false);
  }, [videoUrl]);
  const coverInput = useRef<HTMLInputElement>(null);
  const src = coverSrc(game.customCoverPath || game.coverPath);
  const status = statusOf(game);

  async function chooseCover() {
    setCoverError("");
    setCoverNotice("");
    setCoverBusy(true);
    try {
      if (desktop) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          title: "选择游戏封面",
          multiple: false,
          filters: [
            { name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] },
          ],
        });
        if (typeof selected !== "string") return;
        const savedPath = await gameCoverImport(game.id, selected);
        await saveCover(savedPath);
      } else {
        setCoverBusy(false);
        coverInput.current?.click();
        return;
      }
      setFailedCover(null);
      setCoverNotice("自定义封面已保存，原封面仍保留。");
    } catch (cause) {
      setCoverError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCoverBusy(false);
    }
  }

  async function saveBrowserCover(file: File) {
    if (!file.type.startsWith("image/")) {
      setCoverError("请选择图片文件。");
      return;
    }
    setCoverBusy(true);
    setCoverError("");
    setCoverNotice("");
    try {
      const imageUrl = await savePreviewCover(game.id, file);
      await saveCover(imageUrl);
      setFailedCover(null);
      setCoverNotice("自定义封面已保存，原封面仍保留。");
    } catch (cause) {
      setCoverError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCoverBusy(false);
      if (coverInput.current) coverInput.current.value = "";
    }
  }

  async function restoreCover() {
    setCoverBusy(true);
    setCoverError("");
    setCoverNotice("");
    try {
      await saveCover(null);
      setFailedCover(null);
      setCoverNotice("已恢复资料中的原封面。");
    } catch {
      setCoverError("原封面未能恢复，请重试。");
    } finally {
      setCoverBusy(false);
    }
  }

  return (
    <div className="gg-game-page">
      <button className="gg-back-button" onClick={back}>
        <ArrowLeftIcon size={18} />
        返回游戏库
      </button>
      <section className="gg-game-hero gg-glass">
        <div className="gg-detail-poster">
          {src && failedCover !== src ? (
            <img
              src={src}
              alt={game.title + "封面"}
              onError={() => setFailedCover(src)}
            />
          ) : (
            <div className="gg-game-art-empty">
              <ImageSquareIcon size={55} weight="light" />
              <span>封面待补充</span>
              <small>可自动补全或手动上传</small>
            </div>
          )}
          <div className="gg-cover-actions">
            <button
              className="gg-cover-edit"
              type="button"
              onClick={() => void chooseCover()}
              disabled={coverBusy}
            >
              <ImageSquareIcon size={15} />
              {coverBusy ? "保存中…" : "更换封面"}
            </button>
            {game.customCoverPath && (
              <button
                className="gg-cover-edit is-restore"
                type="button"
                onClick={() => void restoreCover()}
                disabled={coverBusy}
              >
                恢复原图
              </button>
            )}
          </div>
          {(coverError || coverNotice) && (
            <span
              className={"gg-cover-feedback" + (coverError ? " has-error" : "")}
              role={coverError ? "alert" : "status"}
            >
              {coverError || coverNotice}
            </span>
          )}
          <input
            ref={coverInput}
            className="gg-cover-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="选择自定义游戏封面"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void saveBrowserCover(file);
            }}
          />
        </div>
        <div className="gg-hero-copy">
          <div className="gg-eyebrow">
            <span /> YOUR STORY, YOUR PACE
          </div>
          <div className="gg-hero-title">
            <h1>{game.title}</h1>
            <button
              className="gg-icon-button"
              aria-label="修改游戏名称"
              title="修改游戏名称"
              onClick={() => {
                setTitle(game.title);
                setEditing(true);
              }}
            >
              <PencilSimpleIcon size={19} />
            </button>
          </div>
          {game.originalTitle && (
            <p className="gg-original-title">{game.originalTitle}</p>
          )}
          <div className="gg-hero-badges">
            <span>
              {status === "completed"
                ? "已通关"
                : status === "playing"
                  ? "游玩中"
                  : "待开始"}
            </span>
            <span>{game.source === "steam" ? "Steam 游戏" : "本地游戏"}</span>
            {metadataBusy && <span>正在补全资料…</span>}
          </div>
          <div className="gg-hero-meta">
            <div>
              <span>开发商</span>
              <strong>{game.developer || "—"}</strong>
            </div>
            <div>
              <span>发行日期</span>
              <strong>{game.releaseDate || "—"}</strong>
            </div>
            <div>
              <span>游玩时长</span>
              <strong>{formatPlayTime(game.playTimeSeconds)}</strong>
            </div>
          </div>
          <div className="gg-hero-note">
            <ClockCounterClockwiseIcon size={17} />
            <span>慢慢进入故事，按自己的节奏。</span>
          </div>
          <div className="gg-hero-actions">
            <button
              className="gg-button gg-primary gg-hero-play"
              onClick={launch}
            >
              <PlayIcon size={19} weight="fill" />
              开始游戏
              <ArrowUpRightIcon size={17} />
            </button>
            <button
              className="gg-button gg-secondary"
              onClick={() => {
                setExeDraft(game.exePath || "");
                setExeError("");
                setChoosingExecutable(true);
              }}
            >
              <FolderOpenIcon size={18} />
              选择启动 EXE
            </button>
            <button
              className={
                "gg-button gg-secondary " + (game.favorite ? "is-favorite" : "")
              }
              aria-label={game.favorite ? "取消收藏当前游戏" : "收藏当前游戏"}
              onClick={favorite}
            >
              <HeartIcon
                size={18}
                weight={game.favorite ? "fill" : "regular"}
              />
              {game.favorite ? "已收藏" : "收藏"}
            </button>
            <button
              className={
                "gg-button gg-secondary " +
                (status === "completed" ? "is-completed" : "")
              }
              aria-pressed={status === "completed"}
              onClick={() => complete(status !== "completed")}
            >
              <CheckCircleIcon
                size={18}
                weight={status === "completed" ? "fill" : "regular"}
              />
              {status === "completed" ? "已通关" : "标记为已通关"}
            </button>
          </div>
          <p className="gg-launch-target" title={game.exePath || undefined}>
            启动程序：
            {game.source === "steam"
              ? "由 Steam 启动"
              : game.exePath?.split(/[\\/]/).pop() || "尚未选择 EXE"}
          </p>
        </div>
      </section>
      <div className="gg-game-information">
        <section className="gg-story-panel gg-glass">
          <header>
            <div>
              <span className="gg-section-kicker">THE STORY</span>
              <h2>关于这段故事</h2>
            </div>
            <button
              className="gg-button gg-secondary"
              disabled={metadataBusy}
              onClick={() => setMatching(true)}
            >
              匹配资料
            </button>
          </header>
          {metadataMessage && (
            <p className="gg-field-note" role="status">
              {metadataMessage}
            </p>
          )}
          {game.touchgalUrl && (
            <div className="gg-source-credit">
              <ResourceLink href={game.touchgalUrl}>
                资料来源 · TouchGal
              </ResourceLink>
              {game.communityRating !== null && (
                <span>
                  社区评分 {game.communityRating.toFixed(1)} / 10 ·{" "}
                  {game.communityRatingCount} 人
                </span>
              )}
            </div>
          )}
          {introduction.description ? (
            <div className="gg-description">
              <LinkedDescription text={introduction.description} />
            </div>
          ) : (
            <div className="gg-story-blank">
              <p>故事简介，暂时留白。</p>
              <span>填写正确名称可自动查询，也可点击“匹配资料”选择条目。</span>
            </div>
          )}
          {screenshots.length > 0 && (
            <div className="gg-story-screenshots">
              <h3>游戏截图</h3>
              <div className="gg-screenshot-grid">
                {screenshots.map((url, index) => (
                  <button
                    key={url}
                    aria-label={`放大 ${game.title} 游戏截图 ${index + 1}`}
                    onClick={() => setScreenshot(url)}
                  >
                    <img
                      src={url}
                      alt={`${game.title} 游戏截图 ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="gg-tags-section">
            <h3>
              <TagIcon size={17} />
              故事标签
            </h3>
            <div className="gg-tags">
              {game.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </section>
        <section className="gg-film-panel gg-glass">
          <header>
            <span className="gg-section-kicker">A GLIMPSE OF THE WORLD</span>
            <h2>
              宣传影片<span>PV / OP</span>
            </h2>
          </header>
          {videoUrl && !videoIsPage && !videoFailed ? (
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              preload="metadata"
              aria-label={game.title + "宣传影片"}
              onError={() => {
                setVideoFailed(true);
                setVideoNotice(
                  "此链接无法直接播放，可在浏览器中查看或更换链接。",
                );
              }}
            />
          ) : (
            <div className="gg-film-blank">
              <PlayIcon size={36} weight="light" />
              <span>{videoIsPage ? "宣传影片已关联" : "暂无宣传影片"}</span>
              <small>
                {videoIsPage
                  ? "点击下方链接前往视频页面播放"
                  : "添加官方 PV / OP 链接，收藏故事的声音与画面"}
              </small>
            </div>
          )}
          {videoUrl && (
            <div className="gg-source-credit">
              <ResourceLink href={videoUrl}>在浏览器中播放</ResourceLink>
            </div>
          )}
          <form
            className="gg-video-form"
            onSubmit={(event) => {
              event.preventDefault();
              const url = videoDraft.trim() ? mediaUrl(videoDraft) : null;
              if (
                videoDraft.trim() &&
                (!url ||
                  new URL(url).protocol !== "https:" ||
                  new URL(url).username ||
                  new URL(url).password)
              ) {
                setVideoNotice("请填写有效且不含账号密码的 HTTPS 视频链接。");
                return;
              }
              setVideoBusy(true);
              setVideoNotice("");
              void saveVideo(url)
                .then(() => {
                  setVideoFailed(false);
                  setVideoNotice(
                    url ? "宣传影片链接已保存。" : "宣传影片链接已移除。",
                  );
                })
                .catch(() => setVideoNotice("链接保存失败，请重试。"))
                .finally(() => setVideoBusy(false));
            }}
          >
            <label className="gg-field">
              PV / OP 链接
              <input
                type="url"
                value={videoDraft}
                placeholder="https://…（MP4 / WebM 或视频页面）"
                onChange={(event) => setVideoDraft(event.target.value)}
              />
            </label>
            <button className="gg-button gg-secondary" disabled={videoBusy}>
              保存影片链接
            </button>
          </form>
          {videoNotice && (
            <p className="gg-field-note" role="status">
              {videoNotice}
            </p>
          )}
          <p className="gg-field-note">
            自动识别条目简介中的 PV /
            OP，也可手动添加或修改。清空链接并保存可隐藏影片。
          </p>
          <div className="gg-source-credit">
            <ResourceLink
              href={
                "https://search.bilibili.com/all?keyword=" +
                encodeURIComponent(game.title + " 官方 PV OP")
              }
            >
              查找宣传影片
            </ResourceLink>
          </div>
          <div className="gg-game-path">
            <span>游戏位置</span>
            <p title={game.installPath}>{game.installPath}</p>
          </div>
          <button className="gg-remove-link" onClick={remove}>
            <TrashIcon size={13} />
            移出游戏库
          </button>
        </section>
      </div>
      {screenshot && (
        <Modal title="游戏截图" close={() => setScreenshot(null)} wide>
          <img
            className="gg-screenshot-full"
            src={screenshot}
            alt={game.title + "游戏截图"}
          />
        </Modal>
      )}
      <TouchGalResources url={game.touchgalUrl} />
      {matching && (
        <TouchGalMatchDialog
          title={game.title}
          client={metadataClient}
          close={() => setMatching(false)}
          apply={applyMetadata}
        />
      )}
      {choosingExecutable && (
        <Modal
          title="选择启动程序"
          subtitle="多个 EXE 时，选择你实际使用的游戏主程序。"
          close={() => {
            if (!exeBusy) setChoosingExecutable(false);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setExeError("");
              let path: string;
              try {
                path = selectedExecutable(exeDraft);
              } catch (cause) {
                setExeError((cause as Error).message);
                return;
              }
              setExeBusy(true);
              void saveExecutable(path)
                .then(() => setChoosingExecutable(false))
                .catch((cause) =>
                  setExeError(
                    cause instanceof Error ? cause.message : String(cause),
                  ),
                )
                .finally(() => setExeBusy(false));
            }}
          >
            <label className="gg-field">
              启动 EXE
              <input
                value={exeDraft}
                placeholder="D:\Games\作品名称\Game.exe"
                required
                onChange={(event) => setExeDraft(event.target.value)}
              />
            </label>
            {desktop && (
              <button
                type="button"
                className="gg-button gg-secondary"
                disabled={exeBusy}
                onClick={() => {
                  setExeError("");
                  void import("@tauri-apps/plugin-dialog")
                    .then(({ open }) =>
                      open({
                        title: "选择游戏启动 EXE",
                        defaultPath: game.installPath,
                        multiple: false,
                        filters: [
                          { name: "Windows 启动程序", extensions: ["exe"] },
                        ],
                      }),
                    )
                    .then((path) => {
                      if (typeof path === "string") setExeDraft(path);
                    })
                    .catch((cause) =>
                      setExeError(
                        cause instanceof Error ? cause.message : String(cause),
                      ),
                    );
                }}
              >
                <FolderOpenIcon size={17} />
                浏览 EXE
              </button>
            )}
            <p className="gg-field-note">
              保存后将直接运行所选 EXE。
              {!desktop &&
                "网页预览只保存路径；本地文件选择与程序启动需要桌面版。"}
            </p>
            {exeError && (
              <p className="gg-form-error" role="alert">
                {exeError}
              </p>
            )}
            <div className="gg-dialog-footer">
              {game.steamAppId && game.source !== "steam" ? (
                <button
                  type="button"
                  disabled={exeBusy}
                  className="gg-button gg-secondary"
                  onClick={() => {
                    setExeBusy(true);
                    void restoreSteam()
                      .then(() => setChoosingExecutable(false))
                      .catch((cause) => setExeError(String(cause)))
                      .finally(() => setExeBusy(false));
                  }}
                >
                  恢复 Steam 启动
                </button>
              ) : (
                <button
                  type="button"
                  disabled={exeBusy}
                  className="gg-button gg-secondary"
                  onClick={() => setChoosingExecutable(false)}
                >
                  取消
                </button>
              )}
              <button disabled={exeBusy} className="gg-button gg-primary">
                保存启动程序
                <CheckIcon size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title="修改游戏名称"
          subtitle="正确的作品名，有助于自动匹配封面与简介。"
          close={() => setEditing(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!title.trim()) return;
              void rename(title.trim())
                .then(() => setEditing(false))
                .catch(() => setError("名称未能保存，请重试。"));
            }}
          >
            <label className="gg-field">
              游戏名称
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={250}
                required
              />
            </label>
            {error && (
              <p className="gg-form-error" role="alert">
                {error}
              </p>
            )}
            <div className="gg-dialog-footer">
              <button
                type="button"
                className="gg-button gg-secondary"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
              <button className="gg-button gg-primary">
                保存名称
                <CheckIcon size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
