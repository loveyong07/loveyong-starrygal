import { useState } from "react";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  HeartIcon,
  ImageSquareIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { coverSrc } from "@/lib/asset";
import { formatPlayTime } from "@/types/game";
import { normalizeTags, statusOf, type LibraryGame } from "./model";
import { Modal } from "./StudioDialogs";

export default function GamePage({
  game,
  back,
  favorite,
  complete,
  rename,
  saveTags,
  launch,
  remove,
  metadataBusy,
}: {
  game: LibraryGame;
  back: () => void;
  favorite: () => void;
  complete: (value: boolean) => void;
  rename: (title: string) => Promise<void>;
  saveTags: (tags: string[]) => Promise<void>;
  launch: () => void;
  remove: () => void;
  metadataBusy: boolean;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(game.title);
  const [error, setError] = useState("");
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const src = coverSrc(game.coverPath);
  const status = statusOf(game);

  async function addTag() {
    const tags = normalizeTags([...game.tags, ...tagDraft.split(/[,，]/)]);
    if (tags.join("\0") === game.tags.join("\0")) {
      setTagDraft("");
      return;
    }
    try {
      await saveTags(tags);
      setTagDraft("");
      setError("");
    } catch {
      setError("标签未能保存，请重试。");
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
              <small>TouchGal · 等待连接</small>
            </div>
          )}
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
        </div>
      </section>
      <div className="gg-game-information">
        <section className="gg-story-panel gg-glass">
          <header>
            <div>
              <span className="gg-section-kicker">THE STORY</span>
              <h2>关于这段故事</h2>
            </div>
          </header>
          {game.description ? (
            <p className="gg-description">{game.description}</p>
          ) : (
            <div className="gg-story-blank">
              <p>故事简介，暂时留白。</p>
              <span>接入 TouchGal API 后，将根据正确游戏名自动补全。</span>
            </div>
          )}
          <div className="gg-tags-section">
            <h3>
              <TagIcon size={17} />
              故事标签
            </h3>
            <div className="gg-tags">
              {game.tags.map((tag) => (
                <span key={tag}>
                  {tag}
                  <button
                    aria-label={"移除标签 " + tag}
                    onClick={() =>
                      void saveTags(
                        game.tags.filter((item) => item !== tag),
                      ).catch(() => setError("标签未能保存。"))
                    }
                  >
                    <XIcon size={12} />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="gg-tag-form"
              onSubmit={(event) => {
                event.preventDefault();
                void addTag();
              }}
            >
              <input
                aria-label="新增故事标签"
                placeholder="添加标签，例如：恋爱、科幻"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                maxLength={200}
              />
              <button
                className="gg-button gg-secondary"
                disabled={!tagDraft.trim()}
              >
                <PlusIcon size={16} />
                添加
              </button>
            </form>
            {error && (
              <p className="gg-form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
        <section className="gg-film-panel gg-glass">
          <header>
            <span className="gg-section-kicker">A GLIMPSE OF THE WORLD</span>
            <h2>
              宣传影片<span>PV / OP</span>
            </h2>
          </header>
          {game.videoUrl ? (
            <video
              key={game.videoUrl}
              src={game.videoUrl}
              controls
              preload="metadata"
              aria-label={game.title + "宣传影片"}
            />
          ) : (
            <div className="gg-film-blank">
              <PlayIcon size={36} weight="light" />
              <span>暂无宣传影片</span>
              <small>影片位置已为这段故事留好</small>
            </div>
          )}
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
