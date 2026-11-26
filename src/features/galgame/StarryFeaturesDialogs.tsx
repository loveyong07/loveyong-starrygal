import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArchiveBoxIcon,
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  FolderOpenIcon,
  MonitorPlayIcon,
  TrashIcon,
  TranslateIcon,
  WarningCircleIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { errorMessage } from "@/features/io/io";
import {
  launchProfileGet,
  launchProfileSave,
  type EffectiveLaunchProfile,
} from "@/features/launch/profile-api";
import type { LaunchProfile } from "@/features/launch/profile-model";
import {
  DEFAULT_SAVE_BACKUP_CONFIG,
  formatSnapshotSize,
  normalizeSaveBackupConfig,
  snapshotDate,
  snapshotReason,
  type SaveBackupConfig,
  type SaveSnapshot,
} from "@/features/save-backups/model";
import {
  magpieScalingConfig,
  magpieStatus,
  type MagpieScalingMode,
} from "@/features/tools/io";
import { ready } from "@/lib/db";
import { Modal } from "./StudioDialogs";
import { desktop } from "./library";
import { selectedExecutable, type LibraryGame } from "./model";

export function LaunchSettingsModal({
  game,
  close,
  saveLaunch,
  restoreSteam,
}: {
  game: LibraryGame;
  close: () => void;
  saveLaunch: (exePath: string, launchArgs: string | null) => Promise<void>;
  restoreSteam: () => Promise<void>;
}) {
  const [exeDraft, setExeDraft] = useState(game.exePath || "");
  const [argsDraft, setArgsDraft] = useState(game.launchArgs || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<LaunchProfile | null>(null);
  const [effective, setEffective] = useState<EffectiveLaunchProfile | null>(
    null,
  );
  const [modes, setModes] = useState<MagpieScalingMode[]>([]);
  const [hotkey, setHotkey] = useState<string | null>(null);
  const [localeEnabled, setLocaleEnabled] = useState(false);
  const [magpieEnabled, setMagpieEnabled] = useState(false);
  const [scalingMode, setScalingMode] = useState("");

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void Promise.all([
      launchProfileGet(game.id),
      magpieScalingConfig().catch(() => null),
      magpieStatus().catch(() => null),
    ])
      .then(([loadedProfile, scaling, status]) => {
        if (!active) return;
        setEffective(loadedProfile);
        setProfile(loadedProfile.profile);
        setLocaleEnabled(loadedProfile.locale);
        setMagpieEnabled(loadedProfile.magpie);
        setScalingMode(loadedProfile.profile.scalingMode || "");
        if (scaling) setModes(scaling.modes);
        if (status?.hotkey) setHotkey(status.hotkey);
      })
      .catch(() => {
        /* Keep manual exe editing available even if profile lookup fails. */
      });
    return () => {
      active = false;
    };
  }, [game.id]);

  const isSteamClientLaunch = game.source === "steam" && Boolean(game.steamAppId);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    let path = "";
    const trimmedArgs = argsDraft.trim() || null;
    if (!isSteamClientLaunch || exeDraft.trim()) {
      try {
        path = selectedExecutable(exeDraft);
      } catch (cause) {
        setError((cause as Error).message);
        return;
      }
    }
    setBusy(true);
    try {
      if (path) {
        await saveLaunch(path, trimmedArgs);
      }
      if (desktop && profile && !isSteamClientLaunch) {
        const nextProfile: LaunchProfile = {
          ...profile,
          locale: localeEnabled ? "on" : "off",
          localeSource:
            localeEnabled && profile.localeSource === "inherit"
              ? "bundled"
              : profile.localeSource,
          magpie: magpieEnabled ? "on" : "off",
          scalingMode,
        };
        await launchProfileSave(game.id, nextProfile);
      }
      close();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="启动与辅助"
      subtitle="指定游戏主程序、启动参数，并按需开启日区转区与 Magpie 画面超分。"
      close={() => {
        if (!busy) close();
      }}
    >
      <form className="gg-glass-modal-stack" onSubmit={(e) => void handleSave(e)}>
        <label className="gg-field">
          启动 EXE
          <input
            value={exeDraft}
            placeholder="D:\Games\作品名称\Game.exe"
            required={!isSteamClientLaunch}
            onChange={(event) => setExeDraft(event.target.value)}
          />
        </label>
        {desktop && (
          <div className="gg-inline-actions">
            <button
              type="button"
              className="gg-button gg-secondary"
              disabled={busy}
              onClick={() => {
                setError("");
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
                  .catch((cause) => setError(errorMessage(cause)));
              }}
            >
              <FolderOpenIcon size={16} />
              浏览 EXE
            </button>
            {game.steamAppId && game.source !== "steam" && (
              <button
                type="button"
                className="gg-button gg-secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void restoreSteam()
                    .then(() => close())
                    .catch((cause) => setError(errorMessage(cause)))
                    .finally(() => setBusy(false));
                }}
              >
                恢复 Steam 启动
              </button>
            )}
          </div>
        )}
        <label className="gg-field">
          启动参数（可选）
          <input
            value={argsDraft}
            placeholder="例如 -fullscreen 或留空"
            onChange={(event) => setArgsDraft(event.target.value)}
          />
        </label>

        {desktop && !isSteamClientLaunch && (
          <section className="gg-assist-box" aria-label="运行辅助">
            <div className="gg-assist-row">
              <div className="gg-assist-copy">
                <strong>
                  <TranslateIcon size={15} />
                  日区转区启动（Locale Emulator）
                </strong>
                <p>
                  使用内置 LE 以日文区域启动，解决原版作品乱码与路径报错（仅支持
                  32 位游戏）。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="日区转区启动"
                aria-checked={localeEnabled}
                className={`gg-switch ${localeEnabled ? "on" : ""}`}
                onClick={() => setLocaleEnabled((v) => !v)}
              >
                <span />
              </button>
            </div>
            <div className="gg-assist-row">
              <div className="gg-assist-copy">
                <strong>
                  <MonitorPlayIcon size={15} />
                  Magpie 全屏超分
                </strong>
                <p>
                  启动游戏时自动拉起内置 Magpie
                  {hotkey ? `（缩放快捷键：${hotkey}）` : ""}，提升低分辨率画质。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Magpie 全屏超分"
                aria-checked={magpieEnabled}
                className={`gg-switch ${magpieEnabled ? "on" : ""}`}
                onClick={() => setMagpieEnabled((v) => !v)}
              >
                <span />
              </button>
            </div>
            {magpieEnabled && modes.length > 0 && (
              <label className="gg-field gg-assist-select">
                缩放滤镜模式
                <select
                  value={scalingMode}
                  onChange={(event) => setScalingMode(event.target.value)}
                >
                  <option value="">
                    跟随默认{effective?.scalingMode ? `（${effective.scalingMode}）` : ""}
                  </option>
                  {modes.map((mode) => (
                    <option key={mode.name} value={mode.name}>
                      {mode.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        )}

        <p className="gg-field-note">
          {isSteamClientLaunch
            ? "当前为 Steam 客户端启动；若你拥有免客户端 EXE，可在上方填入后切换为本地启动。"
            : desktop
              ? "保存后点击「开始游戏」将按上述配置启动并统计游玩时长。"
              : "网页预览只保存路径与参数；本地程序启动与辅助功能需要桌面版。"}
        </p>

        {error && (
          <p className="gg-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="gg-dialog-footer">
          <button
            type="button"
            disabled={busy}
            className="gg-button gg-secondary"
            onClick={close}
          >
            取消
          </button>
          <button disabled={busy} className="gg-button gg-primary">
            保存启动设置
            <CheckIcon size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SaveBackupModal({
  game,
  close,
  saveSavePath,
}: {
  game: LibraryGame;
  close: () => void;
  saveSavePath: (savePath: string) => Promise<void>;
}) {
  const [persistedPath, setPersistedPath] = useState(game.savePath || "");
  const [config, setConfig] = useState<SaveBackupConfig>(
    DEFAULT_SAVE_BACKUP_CONFIG,
  );
  const [snapshots, setSnapshots] = useState<SaveSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    kind: "restore" | "delete";
    snapshot: SaveSnapshot;
  } | null>(null);
  const mounted = useRef(true);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      await ready;
      const [settings, list] = await Promise.all([
        invoke<SaveBackupConfig>("save_backup_settings_get", {
          gameId: game.id,
        }),
        invoke<SaveSnapshot[]>("save_backup_list", { gameId: game.id }),
      ]);
      if (!mounted.current) return;
      setConfig(normalizeSaveBackupConfig(settings));
      setSnapshots(list);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [game.id]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await ready;
      await action();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function pickSource(directory: boolean) {
    await run(async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory,
        multiple: false,
        title: directory ? "选择游戏存档目录" : "选择游戏存档文件",
        defaultPath: persistedPath || game.installPath,
      });
      if (typeof selected !== "string" || !mounted.current) return;
      await saveSavePath(selected);
      if (!mounted.current) return;
      setPersistedPath(selected);
      setMessage("存档路径已保存，后续快照与恢复均使用此位置。");
    });
  }

  async function toggleConfig(patch: Partial<SaveBackupConfig>) {
    const next = normalizeSaveBackupConfig({ ...config, ...patch });
    await run(async () => {
      await invoke("save_backup_settings_set", {
        gameId: game.id,
        config: next,
      });
      if (mounted.current) {
        setConfig(next);
        setMessage("自动备份选项已保存。");
      }
    });
  }

  const hasSource = Boolean(persistedPath.trim());

  return (
    <Modal
      title="本地存档快照"
      subtitle={`${game.title} · 独立备份当前作品存档，防重装或误覆盖丢失。`}
      close={() => {
        if (!busy) close();
      }}
      wide
    >
      <div className="gg-glass-modal-stack">
        <div className="gg-modal-card">
          <div className="gg-modal-card-head">
            <strong>当前存档位置</strong>
            <div className="gg-inline-actions">
              <button
                type="button"
                className="gg-button gg-secondary gg-button-sm"
                disabled={busy || loading}
                onClick={() => void pickSource(true)}
              >
                <FolderOpenIcon size={15} />
                选择存档目录
              </button>
              <button
                type="button"
                className="gg-button gg-secondary gg-button-sm"
                disabled={busy || loading}
                onClick={() => void pickSource(false)}
              >
                选择单文件
              </button>
            </div>
          </div>
          <p className="gg-path-text">
            {persistedPath || "尚未设置存档目录或文件，请先选择后再创建快照。"}
          </p>
        </div>

        <div className="gg-backup-toolbar">
          <button
            type="button"
            className="gg-button gg-primary"
            disabled={busy || loading || !hasSource}
            onClick={() =>
              void run(async () => {
                await invoke<SaveSnapshot>("save_backup_create", {
                  gameId: game.id,
                });
                const list = await invoke<SaveSnapshot[]>("save_backup_list", {
                  gameId: game.id,
                });
                if (!mounted.current) return;
                setSnapshots(list);
                setMessage("已创建新的存档快照。");
              })
            }
          >
            <ArchiveBoxIcon size={16} />
            立即备份快照
          </button>
          <button
            type="button"
            className="gg-button gg-secondary"
            disabled={busy || loading}
            onClick={() =>
              void run(async () => {
                const dir = await invoke<string>("save_backup_directory", {
                  gameId: game.id,
                });
                const { openPath } = await import("@tauri-apps/plugin-opener");
                await openPath(dir);
              })
            }
          >
            打开备份文件夹
          </button>
          <div className="gg-backup-switches">
            <label className="gg-check-field">
              <input
                type="checkbox"
                disabled={busy || loading || (!hasSource && !config.beforeLaunch)}
                checked={config.beforeLaunch}
                onChange={(event) =>
                  void toggleConfig({ beforeLaunch: event.target.checked })
                }
              />
              启动前自动备份
            </label>
            <label className="gg-check-field">
              <input
                type="checkbox"
                disabled={busy || loading || (!hasSource && !config.afterExit)}
                checked={config.afterExit}
                onChange={(event) =>
                  void toggleConfig({ afterExit: event.target.checked })
                }
              />
              退出后自动备份
            </label>
          </div>
        </div>

        {confirmAction && (
          <div className="gg-modal-banner is-info">
            <WarningCircleIcon size={17} />
            <span>
              {confirmAction.kind === "restore"
                ? `确认恢复 ${snapshotDate(confirmAction.snapshot.createdAt)} 的快照？恢复前会自动将现有存档另存一份安全备份。`
                : `确认永久删除 ${snapshotDate(confirmAction.snapshot.createdAt)} 的快照？`}
            </span>
            <div className="gg-inline-actions">
              <button
                type="button"
                className="gg-button gg-secondary gg-button-sm"
                disabled={busy}
                onClick={() => setConfirmAction(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={`gg-button gg-button-sm ${confirmAction.kind === "delete" ? "gg-danger" : "gg-primary"}`}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (confirmAction.kind === "restore") {
                      await invoke("save_backup_restore", {
                        gameId: game.id,
                        snapshotId: confirmAction.snapshot.id,
                      });
                      setMessage("存档已恢复，原有存档已留存安全备份。");
                    } else {
                      await invoke("save_backup_delete", {
                        gameId: game.id,
                        snapshotId: confirmAction.snapshot.id,
                      });
                      setMessage("已删除所选快照。");
                    }
                    const list = await invoke<SaveSnapshot[]>(
                      "save_backup_list",
                      { gameId: game.id },
                    );
                    if (!mounted.current) return;
                    setSnapshots(list);
                    setConfirmAction(null);
                  })
                }
              >
                确认
              </button>
            </div>
          </div>
        )}

        <div className="gg-snapshot-list">
          <div className="gg-scan-summary">
            <span>历史快照 · {snapshots.length} 份</span>
            <button
              type="button"
              className="gg-text-button"
              disabled={busy || loading}
              onClick={() => void reload()}
            >
              <ArrowClockwiseIcon size={14} />
              刷新
            </button>
          </div>
          {loading ? (
            <p className="gg-field-note">正在读取存档快照…</p>
          ) : snapshots.length === 0 ? (
            <p className="gg-field-note">
              暂无存档快照。设定好存档目录后，可随时创建第一份快照。
            </p>
          ) : (
            <div className="gg-scan-list">
              {snapshots.map((snap) => (
                <div key={snap.id} className="gg-scan-item">
                  <ClockCounterClockwiseIcon size={18} />
                  <div>
                    <strong className="gg-snapshot-title">
                      {snapshotDate(snap.createdAt)} · {snapshotReason(snap.reason)}
                    </strong>
                    <small title={snap.sourcePath}>
                      {snap.files} 个文件 · {formatSnapshotSize(snap.bytes)} ·{" "}
                      {snap.sourcePath}
                    </small>
                  </div>
                  <div className="gg-inline-actions">
                    <button
                      type="button"
                      className="gg-button gg-secondary gg-button-sm"
                      disabled={busy || !hasSource}
                      onClick={() =>
                        setConfirmAction({ kind: "restore", snapshot: snap })
                      }
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="gg-icon-button"
                      aria-label="删除快照"
                      disabled={busy}
                      onClick={() =>
                        setConfirmAction({ kind: "delete", snapshot: snap })
                      }
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {message && (
          <p className="gg-save-notice" role="status">
            {message}
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
            className="gg-button gg-primary"
            disabled={busy}
            onClick={close}
          >
            完成
            <CheckIcon size={16} />
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface PathCheckRow {
  id: number;
  title: string;
  installPath: string;
  exePath: string | null;
  state: "archived" | "ok" | "offline" | "missingFolder" | "missingExe";
}
interface RelocationRow {
  id: number;
  title: string;
  oldInstallPath: string;
  newInstallPath: string;
  newExePath: string | null;
  ready: boolean;
  message: string;
  fingerprint: string;
}
const PATH_STATE_LABELS: Record<PathCheckRow["state"], string> = {
  archived: "已归档",
  ok: "正常",
  offline: "磁盘离线",
  missingFolder: "目录缺失",
  missingExe: "启动文件缺失",
};

export function PathRepairModal({
  close,
  onApplied,
}: {
  close: () => void;
  onApplied: () => Promise<void>;
}) {
  const [checks, setChecks] = useState<PathCheckRow[] | null>(null);
  const [oldRoot, setOldRoot] = useState("");
  const [newRoot, setNewRoot] = useState("");
  const [preview, setPreview] = useState<RelocationRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await ready;
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function pickDirectory(target: "old" | "new") {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      directory: true,
      multiple: false,
      title: target === "old" ? "选择原游戏根目录" : "选择新游戏根目录",
    });
    if (typeof path === "string") {
      if (target === "old") setOldRoot(path);
      else setNewRoot(path);
      setPreview(null);
      setSelected(new Set());
    }
  }

  return (
    <Modal
      title="路径检查与搬盘修复"
      subtitle="迁移游戏盘符或整理目录后，一键校验并更新路径记录；游玩时长、封面与资料完整保留。"
      close={() => {
        if (!busy) close();
      }}
      wide
    >
      <div className="gg-glass-modal-stack">
        <div className="gg-modal-card">
          <div className="gg-modal-card-head">
            <strong>1. 检查全部作品路径状态</strong>
            <button
              type="button"
              className="gg-button gg-secondary gg-button-sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setChecks(await invoke<PathCheckRow[]>("game_paths_check"));
                })
              }
            >
              <CheckCircleIcon size={15} />
              立即检查
            </button>
          </div>
          {checks ? (
            <div className="gg-path-check-result">
              <p className="gg-field-note">
                共 {checks.length} 部作品：正常{" "}
                {checks.filter((r) => r.state === "ok").length} 部，异常{" "}
                {
                  checks.filter(
                    (r) => r.state !== "ok" && r.state !== "archived",
                  ).length
                }{" "}
                部。
              </p>
              {checks.some((r) => r.state !== "ok") && (
                <div className="gg-scan-list">
                  {checks
                    .filter((r) => r.state !== "ok")
                    .map((row) => (
                      <div key={row.id} className="gg-scan-item">
                        <div>
                          <strong className="gg-snapshot-title">
                            {row.title}
                          </strong>
                          <small title={row.exePath || row.installPath}>
                            {row.exePath || row.installPath}
                          </small>
                        </div>
                        <span className="gg-source-pill">
                          {PATH_STATE_LABELS[row.state]}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <p className="gg-field-note">
              点击右侧「立即检查」，排查移动硬盘离线或目录变更引起的失效路径。
            </p>
          )}
        </div>

        <div className="gg-modal-card">
          <strong>2. 批量替换盘符 / 根目录前缀</strong>
          <div className="gg-path-repair-inputs">
            <div className="gg-game-name-field">
              <label className="gg-field">
                原游戏根目录
                <input
                  value={oldRoot}
                  placeholder="例如 D:\Galgame"
                  onChange={(e) => {
                    setOldRoot(e.target.value);
                    setPreview(null);
                  }}
                />
              </label>
              <button
                type="button"
                className="gg-button gg-secondary"
                disabled={busy}
                onClick={() => void pickDirectory("old")}
              >
                浏览
              </button>
            </div>
            <div className="gg-game-name-field">
              <label className="gg-field">
                新游戏根目录
                <input
                  value={newRoot}
                  placeholder="例如 E:\Games"
                  onChange={(e) => {
                    setNewRoot(e.target.value);
                    setPreview(null);
                  }}
                />
              </label>
              <button
                type="button"
                className="gg-button gg-secondary"
                disabled={busy}
                onClick={() => void pickDirectory("new")}
              >
                浏览
              </button>
            </div>
          </div>
          <div className="gg-inline-actions">
            <button
              type="button"
              className="gg-button gg-secondary gg-button-sm"
              disabled={busy || !oldRoot.trim() || !newRoot.trim()}
              onClick={() =>
                void run(async () => {
                  const rows = await invoke<RelocationRow[]>(
                    "game_paths_preview",
                    { oldRoot, newRoot },
                  );
                  setPreview(rows);
                  setSelected(
                    new Set(rows.filter((r) => r.ready).map((r) => r.id)),
                  );
                })
              }
            >
              <WrenchIcon size={15} />
              预览变更
            </button>
            {preview && selected.size > 0 && (
              <button
                type="button"
                className="gg-button gg-primary gg-button-sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const expected = preview
                      .filter((r) => selected.has(r.id))
                      .map((r) => ({ id: r.id, fingerprint: r.fingerprint }));
                    const count = await invoke<number>("game_paths_apply", {
                      oldRoot,
                      newRoot,
                      ids: [...selected],
                      expected,
                    });
                    setPreview(null);
                    setSelected(new Set());
                    setChecks(await invoke<PathCheckRow[]>("game_paths_check"));
                    await onApplied();
                    setNotice(
                      `已修复 ${count} 部作品路径，游玩记录与封面已完整保留。`,
                    );
                  })
                }
              >
                确认更新选中 ({selected.size})
              </button>
            )}
          </div>
          {preview && (
            <div className="gg-scan-list">
              {preview.length === 0 ? (
                <p className="gg-field-note">未匹配到以原目录开头的作品。</p>
              ) : (
                preview.map((row) => (
                  <div key={row.id} className="gg-scan-item">
                    <input
                      type="checkbox"
                      disabled={!row.ready || busy}
                      checked={selected.has(row.id)}
                      onChange={(e) => {
                        setSelected((cur) => {
                          const next = new Set(cur);
                          if (e.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        });
                      }}
                    />
                    <div>
                      <strong className="gg-snapshot-title">{row.title}</strong>
                      <small>{row.oldInstallPath} → {row.newInstallPath}</small>
                      <small>{row.message}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {notice && (
          <p className="gg-save-notice" role="status">
            {notice}
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
            className="gg-button gg-primary"
            disabled={busy}
            onClick={close}
          >
            关闭
          </button>
        </div>
      </div>
    </Modal>
  );
}
