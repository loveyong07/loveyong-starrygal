<p align="center">
  <img src="./public/brand/starrygal-logo.png" alt="StarryGal 星月标志" width="720" />
</p>

<h1 align="center">StarryGal</h1>

<p align="center">把故事，收进日常。</p>

<p align="center">
  <a href="https://loveyong07.github.io/loveyong-starrygal/">桌面在线预览</a> ·
  <a href="https://github.com/loveyong07/loveyong-starrygal/releases">下载与更新</a> ·
  <a href="https://loveyong07.top/contact">反馈与联系</a> ·
  <a href="#开发运行">开发运行</a>
</p>

StarryGal 是一个Galgame启动器。提供Galgame启动、Galgame下载等服务，基于 KoiPage支持本地游戏与 Steam 游戏库

当前版本已实现本地游戏管理与启动；游戏下载服务尚待后续接口接入。

界面仅面向桌面使用，最小宽度为 1100px。在线预览保留桌面布局，不提供手机布局。API 接好后再制作安装包。

应用与安装后显示的名称为 **StarryGal**，源码仓库名为 **loveyong-starrygal**。应用图标采用标志左侧的星月图案。

本项目基于 [morilove37/KoiPage](https://github.com/morilove37/KoiPage) 修改，当前版本为 **0.1.0**，修改日期为 **2026-10-26**。代码采用 **GPL-3.0-only**，完整许可见 [LICENSE](LICENSE)。

## 功能

- **统一游戏库**：开始页与游戏库合并，提供搜索、标签搜索、收藏、最近打开、排序和网格/列表视图。
- **游戏详情**：点击作品进入独立页面，展示封面、游戏名、简介、故事标签、宣传影片和“开始游戏”。
- **游玩状态**：没有打开过的作品为“待开始”；进入详情后为“游玩中”；“已通关”由使用者自行标记，再次打开不会覆盖通关状态。
- **首次公告**：首次运行显示开源免费公告，确认后保存已读状态；之后可随时点击顶部公告图标查看。
- **自动发现**：桌面版首次确认公告后，自动查找常见游戏目录与 Steam 游戏库；也可点击“自动查找”或选择文件夹扫描。
- **Steam 识别**：读取本机 Steam 安装路径、libraryfolders.vdf 和已安装 appmanifest。识别出视觉小说引擎的作品自动收录；无法确定类型的游戏列为待确认候选，可修改名称后勾选导入。
- **资料补全预留**：TouchGal API 尚未提供，封面、简介与 PV 默认留空；已接好按正确游戏名查询的适配器入口，不预置假数据。
- **透明玻璃**：可调整不透明度、柔焦、主题色、星光与本地背景。
- **更新与联系**：顶部“检查更新”打开本项目 GitHub Releases；“反馈与联系”打开 [联系页面](https://loveyong07.top/contact)。

## 公告内容

> 本启动器完全开源免费，请使用时务必将游戏名称填入正确的名称，以便于自动导入

## 使用

1. 打开桌面版，阅读公告后进入游戏库。
2. 首次扫描检查各磁盘根目录下常见的 Games、Game、Galgame、Galgames、VisualNovels、游戏、单机游戏目录，以及注册表和 Steam 清单中登记的游戏库。其他目录可以用“扫描文件夹”补充。
3. 自动收录能确认的视觉小说；在候选列表中核对游戏名，选择要添加的作品。也可直接选择 .exe 手动添加。
4. 点击作品进入详情。可编辑正确名称、添加/移除标签、收藏，或自行标记为已通关。
5. 点击“开始游戏”。Steam 作品通过 Steam 客户端启动；本地作品使用既有进程启动与游玩记录逻辑。

游戏文件保留在原目录。移出游戏库只删除管理记录，不删除游戏本体。浏览器预览记录保存在浏览器本地；桌面版使用独立应用目录中的 SQLite。Steam 启动仅表示请求已交给客户端，本版不把请求成功当作已验证游戏进程或时长。

## TouchGal API

正式接口提供后，在 src/features/galgame/metadata.ts 实现并注册 **GameMetadataProvider**：

- searchByName(name, signal) 接收正确游戏名与取消信号。
- 返回标题、原名、封面 URL、简介、开发商、发行日期、标签与可直接播放的视频 URL。
- 详情页已接好自动查询、名称修正后重新匹配、取消过期查询和保留已有本地资料的流程。
- 当前只保存接口地址，不发送请求、不保存账号密码，不显示假连接成功。

宣传视频支持可直接播放的 HTTP/HTTPS 媒体链接；其他站点格式需在接口适配时转换。接口尚未接入前，相关区域保持空状态。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面窗口与本地能力 | Tauri 2、Rust、WebView2 |
| 界面 | React 18、TypeScript、Vite、Tailwind CSS、自定义玻璃样式 |
| 本地数据 | SQLite、tauri-plugin-sql |
| 状态与路由 | Zustand、React Router |
| 图标与字体 | Phosphor Icons、Manrope、系统中文字体 |

## 开发运行

需要 Windows x64、Node.js 24、项目声明版本的 pnpm。运行桌面版还需要 Rust stable、MSVC C++ 构建工具、Windows SDK 与 WebView2。

    git clone https://github.com/loveyong07/loveyong-starrygal.git
    cd loveyong-starrygal
    corepack enable
    pnpm install --frozen-lockfile
    pnpm dev

网页预览默认地址为 `http://127.0.0.1:1420`。建议使用 **1600×900（16:9）桌面画幅**查看界面。

浏览器预览可验证游戏条目、收藏、标签、状态与外观。自动扫描磁盘和运行 `.exe` 需要桌面环境。

运行桌面开发版：

    pnpm tauri dev

检查源码：

    pnpm build
    pnpm build:pages
    pnpm test
    pnpm check:ipc
    cargo test --manifest-path src-tauri/Cargo.toml --lib --bins --locked

安装包发布位置：[GitHub Releases](https://github.com/loveyong07/loveyong-starrygal/releases)。更新按钮打开下载页面，不会直接覆盖安装其他项目的版本。

## 源码结构

- src/features/galgame/：界面、详情、公告、预览数据桥接与资料源适配器。
- src-tauri/src/scanner/discovery.rs：首次发现、Steam 清单解析、候选去重、取消扫描。
- src-tauri/src/scanner/、launcher/、commands/：复用的扫描、启动、记录与 SQLite 能力。
- src-tauri/resources/：运行所需第三方组件及其许可证和对应源代码。
- tests/opengal-*.test.mjs：状态、公告、路径与元数据行为测试。
- .github/workflows/ci.yml：前端构建、测试、IPC 契约与 Windows Rust 测试。

## 致谢

- **[morilove37/KoiPage](https://github.com/morilove37/KoiPage)**：本项目的代码基础，提供 Tauri、SQLite、本地扫描、启动、游玩记录及工具集成。保留原作者署名与 GPL-3.0-only 许可。
- **[KunMoe/kun-touchgal-next](https://github.com/KunMoe/kun-touchgal-next)**：TouchGal 数据结构与接口设计参考。当前未接入其服务，也不包含其社区数据库或游戏资源。
- [Phosphor Icons](https://github.com/phosphor-icons/react)、[Manrope](https://github.com/sharanda/manrope)、Tauri、React 及其他依赖的维护者。

StarryGal 标志由使用者提供，应用图标采用其左侧星月图案，README 展示完整标志。透明素材经 ImageGen 处理，默认背景通过 ImageGen 生成。上游保留的角色素材归各自原权利方所有，代码许可不改变素材权利。游戏封面、简介和影片归各自权利方所有。

## 许可与第三方组件

代码按 GPL-3.0-only 开放，不附带担保。修改与分发时请保留许可证、来源和署名。

Locale Emulator、Magpie、LunaTranslator 和 7-Zip 分别保留各自的 COPYING、LICENSE、NOTICE 与必要的对应源码，位于 src-tauri/resources/。这些是构建和合规分发需要的文件，应与相关代码一起保留。

反馈与联系：[loveyong07.top/contact](https://loveyong07.top/contact)。
