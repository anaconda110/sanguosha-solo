# ADR-0029：Tauri 2 桌面壳与 Windows 安装包发布

项目已经通过 GitHub Pages 提供零安装 Web 版。M25 增加桌面安装包，目标不是复制游戏
逻辑，而是在现有静态构建外增加一个轻量 Windows 壳：复用 `dist/`、保留网页发布，
同时提供开始菜单入口、独立窗口和标准卸载流程（2026-10-26 定）。

## 决策一：选择 Tauri 2，而不是 Electron 或 PWA-only

本项目没有 Node/服务端运行时需求，引擎、AI Worker、存档与复盘都可在 WebView 中运行。
Electron 会为一个静态站点附带完整 Chromium，安装体积和维护面明显更大；PWA 虽然成本
最低，但仍是浏览器管理的站点，没有传统 `.exe/.msi`、卸载器与独立应用标识。

Tauri 2 使用系统 WebView2，Windows 安装包通常为几 MB 到十几 MB，且可以继续复用
现有 Vue/Vite 工程。代价是构建机需要 Rust、MSVC 与 WebView2。WSL 容器自身没有 Linux
WebKit 依赖，但当前 Windows 主机已具备 Rust 1.98、MSVC、NSIS 与 WiX，因此本次已在
Windows 上实际构建验证；正式、可重复的发布构建仍由 GitHub Actions 的
`windows-latest` 承担。

## 决策二：桌面资源使用相对 base，网页构建保持不变

GitHub Pages 构建需要 `/sanguosha-solo/` 绝对子路径，而 Tauri 的安装包资源必须从
应用自身协议下加载。为此新增独立的 `npm run build:desktop`：

```text
vite build --base=./
```

网页构建继续使用 `npm run build`，Tauri 的 `beforeBuildCommand` 只调用桌面构建。
应用不通过 `file://` 直接打开 `index.html`，避免 Worker、路由和持久化来源异常。

## 决策三：Windows 双产物，GitHub Actions 统一构建

`src-tauri/tauri.conf.json` 同时声明：

- NSIS：面向普通玩家的单文件 `setup.exe`，默认当前用户安装，无需管理员权限；
- MSI：面向需要企业/系统分发的场景。

安装器包含简体中文和英文 NSIS 语言资源，MSI 使用 `zh-CN`。应用 identifier 固定为
`com.anaconda110.sanguosha`，MSI `upgradeCode` 固定为
`04f62606-d171-5a99-bff8-49a53afdda62`。两者发布后不得随意更改，否则 Windows 可能
把升级识别成新应用，并影响用户数据目录与升级链。

`.github/workflows/desktop-release.yml` 支持两种入口：

- 手动 `workflow_dispatch`：构建并上传 14 天有效的 Actions artifact；
- 推送 `v*` 标签：先校验标签与 `package.json` 版本一致，再构建 NSIS/MSI 并创建草稿
  GitHub Release，人工检查后发布。

## 安全与数据边界

- Tauri 生产 CSP 仅允许自身脚本、样式、Worker、图片和 Tauri IPC；开发模式关闭
  `devCsp` 以兼容 Vite HMR。
- 当前没有启用远程内容、文件系统插件、Shell 插件或自动更新，Rust 侧无自定义命令。
- 游戏存档、设置和引导标记仍使用 `localStorage`，由 WebView 的应用数据目录持久化。
  卸载或清理应用数据可能删除存档；后续若提供跨设备备份，应增加显式导出/导入文件能力。
- 桌面版只设置 Windows x64 发布链；macOS、Linux、ARM64 和 Microsoft Store 尚未接入。

## 已知简化（记录在案）

- 安装包暂未做 Authenticode 代码签名，Windows SmartScreen 会显示“未知发布者”。
- 没有自动更新器；升级由用户下载新安装包覆盖安装。
- GitHub Release 当前创建为草稿，版本说明由 GitHub 自动生成，发布前需人工检查。
- 首次 Windows CI 运行会下载 Rust crates 与 NSIS/WiX 工具，耗时会高于后续缓存命中。
- 图标源文件为 `src-tauri/app-icon.svg`，由 `npx tauri icon` 生成各尺寸资源。

## 验证

- `npx tauri info`：Tauri CLI 2.12.4 可识别工程；本地缺少 Linux WebKit/Rust 属预期。
- `npm run build:desktop`：以相对资源路径生成 `dist/`。
- `npm run typecheck`、`npm test`：桌面接入不改变前端类型与既有测试结果。
- Windows 原生构建：Rust 1.98 + MSVC 18 + NSIS 3 + WiX 3.14 实际生成
  `三国杀单机_0.1.0_x64-setup.exe`（约 2.0 MB）和
  `三国杀单机_0.1.0_x64_zh-CN.msi`（约 3.0 MB）；7-Zip 可识别安装器格式及内嵌应用。
- 本机 Windows 使用 WebView2 Runtime 155.0.4283.62；从 NSIS 安装器解包出的
  `sanguosha-solo.exe` 实际启动后进程持续运行，测试结束时由任务管理器关闭，确认应用
  不是“构建成功但启动即崩溃”。WSL 报缺少的 `webkit2gtk-4.1` / `rsvg2` 仅影响 Linux
  桌面构建，不参与 Windows WebView2 发布链。
- `src-tauri/Cargo.lock` 已生成，锁定 405 个 Rust 依赖，后续构建使用锁定版本。
- GitHub Actions `windows-latest`：安装依赖、测试、NSIS/MSI 构建、artifact/Release 全链路。
