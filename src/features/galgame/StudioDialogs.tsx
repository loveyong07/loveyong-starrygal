import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CaretDownIcon,
  CheckIcon,
  CloudSlashIcon,
  FolderOpenIcon,
  GithubLogoIcon,
  ImageSquareIcon,
  MegaphoneIcon,
  PaletteIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { BRAND } from "@/lib/brand";
import {
  addGame,
  defaultAppearance,
  desktop,
  folderFromPath,
  titleFromPath,
  type Appearance,
} from "./library";
import { NOTICE_TEXT, type LibraryGame } from "./model";
import type { DiscoveredGame } from "./discovery";

export function Modal({
  title,
  subtitle,
  close,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className={["gg-dialog", wide && "gg-dialog-wide"]
        .filter(Boolean)
        .join(" ")}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          close();
      }}
    >
      <header className="gg-dialog-heading">
        <div>
          <h2 id={headingId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="gg-icon-button"
          aria-label="关闭对话框"
          onClick={close}
        >
          <XIcon size={20} />
        </button>
      </header>
      <div className="gg-dialog-body">{children}</div>
    </dialog>
  );
}

export function NoticeDialog({ close }: { close: () => void }) {
  return (
    <Modal
      title="公告"
      subtitle={BRAND.name + " · 欢迎来到你的故事收藏馆"}
      close={close}
    >
      <div className="gg-notice-symbol">
        <MegaphoneIcon size={34} weight="duotone" />
      </div>
      <p className="gg-notice-title">让喜欢的故事，自由相遇。</p>
      <p className="gg-notice-text">{NOTICE_TEXT}</p>
      <div className="gg-notice-license">
        <CheckIcon size={16} />
        GPL-3.0-only · 完全开源 · 免费使用
      </div>
      <div className="gg-dialog-footer">
        <small>之后可在左下角“展开”菜单中重新查看公告。</small>
        <button className="gg-button gg-primary" onClick={close}>
          我已了解，进入游戏库
          <ArrowRightIcon size={16} />
        </button>
      </div>
    </Modal>
  );
}

export function AppearanceDialog({
  appearance,
  change,
  close,
  pickWallpaper,
}: {
  appearance: Appearance;
  change: (value: Partial<Appearance>) => void;
  close: () => void;
  pickWallpaper: () => void;
}) {
  return (
    <Modal
      title="让这里，更像你"
      subtitle="调一点光，留一点透明。所有调整即时生效。"
      close={close}
    >
      <div className="gg-settings-section">
        <span className="gg-settings-label">
          <PaletteIcon size={18} />
          主题色
        </span>
        <div className="gg-color-options">
          {(
            [
              ["blue", "晴空蓝"],
              ["lilac", "雾凇紫"],
              ["rose", "初樱粉"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={appearance.palette === value}
              className={appearance.palette === value ? "selected" : ""}
              onClick={() => change({ palette: value })}
            >
              <i data-color={value} />
              {label}
              {appearance.palette === value && <CheckIcon size={15} />}
            </button>
          ))}
        </div>
      </div>
      <div className="gg-settings-section">
        <label className="gg-range-label" htmlFor="glass-opacity">
          玻璃不透明度<strong>{appearance.opacity}%</strong>
        </label>
        <input
          id="glass-opacity"
          type="range"
          min={12}
          max={75}
          value={appearance.opacity}
          onChange={(e) => change({ opacity: Number(e.target.value) })}
        />
        <p>降低数值，让背景更清晰地透进来。</p>
        <label className="gg-range-label" htmlFor="glass-blur">
          柔焦程度<strong>{appearance.blur}px</strong>
        </label>
        <input
          id="glass-blur"
          type="range"
          min={0}
          max={24}
          value={appearance.blur}
          onChange={(e) => change({ blur: Number(e.target.value) })}
        />
      </div>
      <div className="gg-settings-section gg-setting-row">
        <div>
          <strong>星光微动</strong>
          <p>让光点慢慢经过，不打扰阅读。</p>
        </div>
        <button
          className={"gg-switch " + (appearance.particles ? "on" : "")}
          role="switch"
          aria-label="星光微动"
          aria-checked={appearance.particles}
          onClick={() => change({ particles: !appearance.particles })}
        >
          <span />
        </button>
      </div>
      <div className="gg-settings-section gg-setting-row">
        <div>
          <strong>你的背景</strong>
          <p>PNG、JPG 或 WebP，按原图保存，不限制文件大小。</p>
        </div>
        <button className="gg-button gg-secondary" onClick={pickWallpaper}>
          <ImageSquareIcon size={17} />
          更换图片
        </button>
      </div>
      <div className="gg-dialog-footer">
        <button
          className="gg-text-button"
          onClick={() => change({ ...defaultAppearance })}
        >
          <ArrowClockwiseIcon size={16} />
          恢复默认
        </button>
        <button className="gg-button gg-primary" onClick={close}>
          就这样，很好
          <CheckIcon size={16} />
        </button>
      </div>
    </Modal>
  );
}

export function SourceDialog({
  endpoint,
  close,
  save,
}: {
  endpoint: string;
  close: () => void;
  save: (url: string) => Promise<void>;
}) {
  const [value, setValue] = useState(endpoint);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="让故事，变得完整" subtitle="TouchGal 数据源" close={close}>
      <div className="gg-source-status">
        <CloudSlashIcon size={28} />
        <div>
          <strong>等待 API 接入</strong>
          <p>封面、简介与宣传影片暂时留空。</p>
        </div>
        <span>未连接</span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const url = value.trim();
          try {
            if (url && !["http:", "https:"].includes(new URL(url).protocol))
              throw new Error();
          } catch {
            setError("请填写有效的 HTTP 或 HTTPS 接口地址。");
            return;
          }
          setBusy(true);
          void save(url).catch(() => {
            setError("地址未能保存，请重试。");
            setBusy(false);
          });
        }}
      >
        <label className="gg-field">
          API 地址
          <input
            type="url"
            placeholder="https://…"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className="gg-field-note">
          正式接口提供后，将按游戏名称自动查询并补全资料。当前仅保存地址，不发送请求，也不保存账号密码。
        </p>
        {error && (
          <p className="gg-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="gg-dialog-footer">
          <span className="gg-field-note">游戏库始终保存在本机</span>
          <button className="gg-button gg-primary" disabled={busy}>
            保存地址
            <CheckIcon size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AboutDialog({ close }: { close: () => void }) {
  return (
    <Modal
      title={BRAND.name}
      subtitle="A little place for your favorite worlds."
      close={close}
    >
      <div className="gg-about-mark">
        <img src={BRAND.icon} alt="StarryGal 星月图标" width={64} height={64} />
        <div>
          <strong>让喜欢的故事，有自己的位置。</strong>
          <p>Tauri 2 · Rust · React · TypeScript · SQLite</p>
        </div>
      </div>
      <div className="gg-attribution">
        <h3>致谢与开源</h3>
        <p>
          基于 morilove37 / KoiPage 修改，保留 GPL-3.0-only
          许可证和原作者署名；资料接口设计参考 KunMoe /
          kun-touchgal-next。感谢两项开源项目。
        </p>
        <a
          href="https://github.com/morilove37/KoiPage"
          target="_blank"
          rel="noreferrer"
        >
          <GithubLogoIcon size={17} />
          morilove37 / KoiPage
          <ArrowUpRightIcon size={14} />
        </a>
        <a
          href="https://github.com/KunMoe/kun-touchgal-next"
          target="_blank"
          rel="noreferrer"
        >
          <GithubLogoIcon size={17} />
          KunMoe / kun-touchgal-next
          <ArrowUpRightIcon size={14} />
        </a>
        <p>
          免费开源，不附带担保。完整许可见源码中的 LICENSE。TouchGal API
          将于正式接口提供后接入。
        </p>
      </div>
      <div className="gg-dialog-footer">
        <small>v{BRAND.version} · GPL-3.0-only</small>
        <button className="gg-button gg-primary" onClick={close}>
          回到故事里
          <ArrowRightIcon size={16} />
        </button>
      </div>
    </Modal>
  );
}

export function AddGameDialog({
  close,
  done,
}: {
  close: () => void;
  done: (game: LibraryGame) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [args, setArgs] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  function acceptFile(name: string) {
    if (!/\.exe$/i.test(name)) {
      setError("请选择 .exe 游戏主程序。");
      return;
    }
    setPath(name);
    if (!title) {
      const base = titleFromPath(name);
      setTitle(
        /^(game|start|play)$/i.test(base)
          ? name.split(/[\\/]/).slice(-2, -1)[0] || base
          : base,
      );
    }
    setError("");
  }
  async function pick() {
    if (!desktop) {
      picker.current?.click();
      return;
    }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({
        multiple: false,
        title: "选择游戏主程序",
        filters: [{ name: "游戏主程序", extensions: ["exe"] }],
      });
      if (typeof file === "string") acceptFile(file);
    } catch {
      setError("未能打开文件选择器，请手动填写启动路径。");
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("请填写游戏的正确名称。");
      return;
    }
    if (!/\.exe$/i.test(path.trim())) {
      setError("请填写以 .exe 结尾的游戏启动路径。");
      return;
    }
    if (desktop && !/^(?:[a-z]:[\\/]|\\\\)/i.test(path.trim())) {
      setError("桌面版需要完整的游戏启动路径。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (desktop) {
        const { inspectExeFile } = await import("@/lib/db");
        await inspectExeFile(path.trim());
      }
      await done(
        await addGame({
          title: title.trim(),
          installPath: folderFromPath(path.trim()),
          exePath: path.trim(),
          launchArgs: args.trim() || null,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="收藏一段新故事"
      subtitle="请填写正确作品名，便于后续自动匹配资料。"
      close={close}
    >
      <form onSubmit={(event) => void submit(event)}>
        <button
          type="button"
          className="gg-file-drop"
          onClick={() => void pick()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) acceptFile(file.name);
          }}
        >
          <FolderOpenIcon size={34} weight="duotone" />
          <strong>{path ? titleFromPath(path) : "选择游戏主程序"}</strong>
          <span>点击选择，或将 .exe 文件拖到这里</span>
          <small>所有文件仅在本机处理</small>
        </button>
        <input
          ref={picker}
          type="file"
          accept=".exe"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) acceptFile(file.name);
          }}
        />
        <label className="gg-field">
          游戏名称
          <input
            autoComplete="off"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="请填写完整、正确的游戏名称"
            required
            maxLength={250}
          />
        </label>
        <label className="gg-field">
          启动路径
          <input
            autoComplete="off"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="D:\Games\作品名称\Game.exe"
            required
          />
        </label>
        <details className="gg-advanced">
          <summary>
            更多启动选项
            <CaretDownIcon size={13} />
          </summary>
          <label className="gg-field">
            启动参数
            <input
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              placeholder="可选"
            />
          </label>
        </details>
        {!desktop && (
          <p className="gg-field-note">
            网页预览可保存条目和查看详情；启动游戏、自动扫描需要桌面版。
          </p>
        )}
        {error && (
          <p className="gg-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="gg-dialog-footer">
          <button
            type="button"
            className="gg-button gg-secondary"
            onClick={close}
          >
            再等等
          </button>
          <button
            type="submit"
            className="gg-button gg-primary"
            disabled={saving}
          >
            {saving ? "添加中…" : "加入我的游戏库"}
            <PlusIcon size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ScanResultsDialog({
  candidates,
  close,
  importGames,
}: {
  candidates: DiscoveredGame[];
  close: () => void;
  importGames: (games: DiscoveredGame[]) => Promise<void>;
}) {
  const [items, setItems] = useState(() =>
    candidates.map((game) => ({ ...game, checked: game.recognized })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = items.filter((game) => game.checked).length;
  return (
    <Modal
      wide
      title="发现这些本地故事"
      subtitle="可修改名称后导入；未能确定为 Galgame 的 Steam 游戏需要你勾选确认。"
      close={close}
    >
      <div className="gg-scan-summary">
        <span>{items.length} 部待确认</span>
        <button
          className="gg-text-button"
          onClick={() =>
            setItems(
              items.map((item) => ({
                ...item,
                checked: count !== items.length,
              })),
            )
          }
        >
          {count === items.length ? "取消全选" : "选择全部"}
        </button>
      </div>
      <div className="gg-scan-list">
        {items.map((game, index) => (
          <div className="gg-scan-item" key={game.installPath}>
            <input
              type="checkbox"
              aria-label={"导入 " + game.title}
              checked={game.checked}
              onChange={(event) =>
                setItems(
                  items.map((item, i) =>
                    i === index
                      ? { ...item, checked: event.target.checked }
                      : item,
                  ),
                )
              }
            />
            <div>
              <input
                aria-label={"游戏名称 " + (index + 1)}
                value={game.title}
                maxLength={250}
                onChange={(event) =>
                  setItems(
                    items.map((item, i) =>
                      i === index
                        ? { ...item, title: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <small title={game.installPath}>{game.installPath}</small>
            </div>
            <span
              className={
                "gg-source-pill " + (game.source === "steam" ? "steam" : "")
              }
            >
              {game.source === "steam" ? "Steam" : "本地"}
            </span>
          </div>
        ))}
      </div>
      {error && (
        <p className="gg-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="gg-dialog-footer">
        <button
          className="gg-button gg-secondary"
          onClick={close}
          disabled={busy}
        >
          稍后整理
        </button>
        <button
          className="gg-button gg-primary"
          disabled={!count || busy}
          onClick={() => {
            const selected = items.filter((item) => item.checked);
            if (selected.some((item) => !item.title.trim())) {
              setError("请为每部选中的游戏填写正确名称。");
              return;
            }
            setBusy(true);
            void importGames(selected).catch((cause) => {
              setError(cause instanceof Error ? cause.message : String(cause));
              setBusy(false);
            });
          }}
        >
          {busy ? "导入中…" : "导入选中游戏 (" + count + ")"}
          <PlusIcon size={16} />
        </button>
      </div>
    </Modal>
  );
}
