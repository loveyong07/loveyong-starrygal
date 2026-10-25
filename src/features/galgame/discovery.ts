import { invoke } from "@/lib/logging";
import { ready } from "@/lib/db";
import { desktop } from "./library";

export interface DiscoveredGame {
  title: string;
  installPath: string;
  exePath: string | null;
  source: "local" | "steam";
  steamAppId: string | null;
  recognized: boolean;
}

export interface DiscoveryReport {
  games: DiscoveredGame[];
  rootsScanned: string[];
  warnings: string[];
  cancelled: boolean;
}

export async function discoverInstalledGames(): Promise<DiscoveryReport> {
  if (!desktop) throw new Error("自动扫描需要在桌面版中运行。");
  await ready;
  return invoke<DiscoveryReport>("discover_installed_games");
}

export async function cancelDiscovery() {
  if (desktop) await invoke<void>("cancel_game_discovery");
}

export async function launchSteamGame(appId: string) {
  if (!/^[1-9]\d*$/.test(appId)) throw new Error("Steam 游戏编号无效。");
  return invoke<void>("launch_steam_game", { appId });
}
