import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowUpRightIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Modal } from "./StudioDialogs";
import { desktop } from "./library";
import {
  createTouchGalClient,
  DEFAULT_TOUCHGAL_ENDPOINT,
  TOUCHGAL_TOKEN_DOCS_URL,
  validateEndpoint,
  validateToken,
  type TouchGalCandidate,
  type TouchGalClient,
} from "./touchgal";
import { touchgalTransport } from "./touchgal-transport";
import type { GameMetadata } from "./metadata";

export function ResourceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        if (!desktop) return;
        event.preventDefault();
        void import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(href))
          .catch(() => window.alert("未能打开浏览器，请访问：" + href));
      }}
    >
      {children}
      <ArrowUpRightIcon size={15} />
    </a>
  );
}

export function TouchGalSourceDialog({
  endpoint,
  allowNsfw,
  apiToken = "",
  close,
  save,
}: {
  endpoint: string;
  allowNsfw: boolean;
  apiToken?: string;
  close: () => void;
  save: (url: string, allowNsfw: boolean, apiToken: string) => Promise<void>;
}) {
  const [value, setValue] = useState(endpoint);
  const [allow, setAllow] = useState(allowNsfw);
  const [token, setToken] = useState(apiToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [cachePath, setCachePath] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void invoke<string>("touchgal_cache_directory")
      .then((path) => {
        if (active) setCachePath(path);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, []);
  async function check() {
    setBusy(true);
    setError("");
    setStatus("");
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    try {
      const client = createTouchGalClient(
        validateEndpoint(value),
        allow,
        touchgalTransport,
        validateToken(token),
      );
      await client.status(active.signal);
      if (!active.signal.aborted) setStatus("连接成功，可以查询游戏资料。");
    } catch (cause) {
      if (!active.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  return (
    <Modal
      title="让故事，变得完整"
      subtitle="TouchGal 数据源与 Token 设置"
      close={close}
    >
      <p className="gg-field-note">
        按游戏名称补全封面、简介、截图、PV、会社、发售日、标签与社区评分。默认使用公共资料服务，若遇调用限制也可填入自行申请的
        TouchGal Token。
      </p>
      <p className="gg-field-note">
        搜索结果与游戏详情获取后长期保存在本地。再次打开或重启优先读取本地资料，
        新增游戏或尚未获取的内容才请求接口；需要新内容时，在详情中选择“更新资料”或在匹配窗口勾选“从网站重新获取”。
        测试连接也会请求接口。
      </p>
      {desktop ? (
        <div className="gg-source-credit">
          <button
            type="button"
            className="gg-button gg-secondary"
            disabled={!cachePath}
            onClick={() => {
              void invoke("touchgal_cache_open").catch(() =>
                setError("未能打开本地资料文件夹：" + cachePath),
              );
            }}
          >
            打开本地资料文件夹
          </button>
          {cachePath && (
            <span style={{ overflowWrap: "anywhere" }}>{cachePath}</span>
          )}
        </div>
      ) : (
        <p className="gg-field-note">网页版资料缓存在当前浏览器本地存储中。</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          let url: string;
          let cleanedToken: string;
          try {
            url = validateEndpoint(value);
            cleanedToken = validateToken(token);
          } catch (cause) {
            setError((cause as Error).message);
            return;
          }
          setBusy(true);
          void save(url, allow, cleanedToken).catch((cause) => {
            setError(cause instanceof Error ? cause.message : "设置保存失败。");
            setBusy(false);
          });
        }}
      >
        <label className="gg-field">
          自定义 TouchGal Token（可选）
          <input
            type="password"
            autoComplete="off"
            value={token}
            placeholder="留空则使用默认公共额度，可填自行获取的 Token"
            onChange={(event) => {
              setToken(event.target.value);
              setStatus("");
            }}
          />
        </label>
        <div className="gg-source-credit">
          <ResourceLink href={TOUCHGAL_TOKEN_DOCS_URL}>
            前往 TouchGal API 获取 Token
          </ResourceLink>
        </div>
        <label className="gg-field">
          资料服务地址
          <input
            type="url"
            value={value}
            placeholder={DEFAULT_TOUCHGAL_ENDPOINT}
            onChange={(event) => {
              setValue(event.target.value);
              setStatus("");
            }}
          />
        </label>
        <label className="gg-check-field">
          <input
            type="checkbox"
            checked={allow}
            onChange={(event) => setAllow(event.target.checked)}
          />
          允许查询成人分级条目（18+）
        </label>
        <p className="gg-field-note">
          默认只查询全年龄条目。开启后，TouchGal
          才会返回其成人分级作品。宣传影片可在详情页手动添加；资源与补丁会在浏览器中打开
          TouchGal 页面。
        </p>
        {error && (
          <p className="gg-form-error" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p className="gg-save-notice" role="status">
            {status}
          </p>
        )}
        <div className="gg-dialog-footer">
          <button
            type="button"
            className="gg-button gg-secondary"
            disabled={busy}
            onClick={() => void check()}
          >
            测试连接
          </button>
          <button className="gg-button gg-primary" disabled={busy}>
            保存设置
            <CheckIcon size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TouchGalMatchDialog({
  title,
  client,
  close,
  apply,
  selectionOnly = false,
  autoSearch = false,
  initialId,
}: {
  title: string;
  client: TouchGalClient;
  close: () => void;
  apply: (metadata: GameMetadata, replace: boolean) => Promise<void>;
  selectionOnly?: boolean;
  autoSearch?: boolean;
  initialId?: string;
}) {
  const [query, setQuery] = useState(title);
  const [items, setItems] = useState<TouchGalCandidate[]>([]);
  const [page, setPage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replace, setReplace] = useState(false);
  const [selected, setSelected] = useState<GameMetadata | null>(null);
  const [refresh, setRefresh] = useState(!!initialId);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer =
      initialId || autoSearch
        ? window.setTimeout(() => {
            if (initialId)
              void run(async (signal) => {
                const result = await client.detail(initialId, signal, true);
                if (!signal.aborted) setSelected(result);
              });
            else void search();
          }, 0)
        : undefined;
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      controller.current?.abort();
    };
  }, []);
  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    try {
      await operation(active.signal);
    } catch (cause) {
      if (!active.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  async function search(next = 1) {
    setSelected(null);
    await run(async (signal) => {
      const result = await client.search(
        next === 1 ? query : searchKeyword,
        signal,
        next,
        refresh,
      );
      if (signal.aborted) return;
      setItems(result.items);
      setPage(next);
      setSearchKeyword(result.keyword);
      setHasMore(result.hasMore);
      setSearched(true);
    });
  }
  return (
    <Modal
      title={
        initialId
          ? "更新游戏资料"
          : selectionOnly
            ? "搜索游戏作品"
            : "匹配游戏资料"
      }
      subtitle="支持部分名称、外文词语或别名；至少 3 个字符，选择后再确认。"
      close={close}
    >
      <form
        className="gg-tag-form"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="TouchGal 游戏名称"
          placeholder="部分名称或关键词，至少 3 个字符"
          value={query}
          maxLength={100}
          onChange={(event) => {
            controller.current?.abort();
            setQuery(event.target.value);
            setBusy(false);
            setSelected(null);
            setItems([]);
            setSearched(false);
            setHasMore(false);
            setPage(1);
            setSearchKeyword("");
            setError("");
          }}
        />
        <button className="gg-button gg-primary" disabled={busy}>
          <MagnifyingGlassIcon size={17} />
          搜索
        </button>
      </form>
      <label className="gg-check-field">
        <input
          type="checkbox"
          checked={refresh}
          disabled={busy}
          onChange={(event) => {
            setRefresh(event.target.checked);
            setSelected(null);
            setItems([]);
            setSearched(false);
            setHasMore(false);
            setPage(1);
          }}
        />
        从网站重新获取（消耗接口额度并更新本地缓存）
      </label>
      <p className="gg-field-note">
        默认使用已保存的搜索结果与详情。没有本地记录的内容会自动获取并保存。
      </p>
      {error && (
        <p className="gg-form-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">正在查询…</p>}
      {selected ? (
        <div className="gg-match-preview">
          {selected.coverUrl && (
            <img src={selected.coverUrl} alt={selected.title + "封面"} />
          )}
          <h3>{selected.title}</h3>
          <p>
            {selected.developer} {selected.releaseDate}
          </p>
          <p>{selected.description?.slice(0, 400)}</p>
          {!selectionOnly && (
            <label className="gg-check-field">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              替换已有的简介、会社、发售日与接口封面
            </label>
          )}
          <p className="gg-field-note">
            {selectionOnly
              ? "确认选择后返回添加窗口，核对本地启动路径后加入游戏库。"
              : "默认只补全空白资料。自定义封面与手动设置的 PV 会保留。"}
          </p>
          <div className="gg-dialog-footer">
            <button
              className="gg-button gg-secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              重新选择
            </button>
            <button
              className="gg-button gg-primary"
              disabled={busy}
              onClick={() =>
                void run(async (signal) => {
                  await apply(selected, replace);
                  if (!signal.aborted) close();
                })
              }
            >
              {selectionOnly ? "确认选择" : "确认匹配"}
              <CheckIcon size={16} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="gg-source-results">
            {items.map((item) => (
              <button
                key={item.uniqueId}
                disabled={busy}
                onClick={() =>
                  void run(async (signal) => {
                    const result = await client.detail(
                      item.uniqueId,
                      signal,
                      refresh,
                    );
                    if (!signal.aborted) setSelected(result);
                  })
                }
              >
                <strong>{item.name}</strong>
                <span>查看资料 →</span>
              </button>
            ))}
          </div>
          {searched && !busy && items.length === 0 && (
            <p className="gg-field-note">
              未找到作品。可换用其他名称片段、外文词语或别名，或检查资料设置中的分级选项。
            </p>
          )}
          <div className="gg-dialog-footer">
            <button
              className="gg-button gg-secondary"
              disabled={page <= 1 || busy}
              onClick={() => void search(page - 1)}
            >
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              className="gg-button gg-secondary"
              disabled={!hasMore || busy}
              onClick={() => void search(page + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function TouchGalResources({ url }: { url: string | null }) {
  const destination = (section: "galgame" | "patch") => {
    const target = new URL(url!);
    target.searchParams.set("tab", "resources");
    target.searchParams.set("resourceSection", section);
    return target.href;
  };
  return (
    <section className="gg-resources-panel gg-glass">
      <header>
        <div>
          <span className="gg-section-kicker">TOUCHGAL</span>
          <h2>前往 TouchGal</h2>
        </div>
      </header>
      {url ? (
        <div className="gg-resource-tabs">
          <ResourceLink href={destination("galgame")}>
            前往 TouchGal 游戏资源
          </ResourceLink>
          <ResourceLink href={destination("patch")}>
            前往 TouchGal 补丁
          </ResourceLink>
        </div>
      ) : (
        <p className="gg-field-note">
          先点击“匹配资料”关联正确条目，即可直达对应下载页面。
        </p>
      )}
      <p className="gg-field-note">在浏览器中打开当前作品的对应页面。</p>
    </section>
  );
}
