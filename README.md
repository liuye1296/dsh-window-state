# dsh-window-state

记住 DeepSeek Harness **桌面窗口**的大小、位置和所在显示器，下次启动自动恢复。

DeepSeek Harness 的桌面外壳创建主窗口时尺寸是写死的（1280×820），也不保存位置，
所以每次打开都落回默认尺寸和主屏。这个插件把窗口几何记下来，重新打开时套回去。

## 行为

- **启动恢复**：读到上次的 `{x, y, width, height}` 就直接把窗口挪/缩回去。位置是绝对坐标，
  所以「上次在哪块显示器」也一并记住，多显示器场景不需要额外配置。
- **变更保存**：改尺寸后 400ms 落盘；窗口失去焦点或关闭时立即落盘；
  渲染层没有 `move` 事件，所以另外用 1 秒一次的低频比对来发现「只挪位置、不改尺寸」。
- **显示器被拔掉**：目标坐标落在不存在的屏幕上时，系统只会留一条缝；插件会读回落点所在
  显示器的工作区再收一次，保证整窗可见，并把修正后的坐标写回，下次不再重复纠正。
- **原生全屏不记录**：全屏时既不恢复也不保存，避免把全屏尺寸当成普通窗口尺寸。
- **只在桌面端生效**：靠 preload 暴露的 `window.dshDesktop` 判断；浏览器里的 Web 版不受影响。

几何一律是 DIP（与 Electron `BrowserWindow.setBounds` 一致），Retina 不需要额外换算。

## 安装

插件管理器里用包名/安装 spec 安装即可（本仓库已提交 `lib/` 构建产物，安装时不需要构建）：

```text
github:liuye1296/dsh-window-state
```

或者本地目录安装：

```text
plugin_manager install_bundle  target=/path/to/dsh-window-state
```

装好后需要让页面重载一次客户端模块（安装时通常会热载，必要时刷新页面或重开应用）。
第一次运行只会记录当前窗口状态；把窗口调整到想要的样子、正常退出，再打开就会恢复。

## 限制

- 启动瞬间窗口先按默认 1280×820 出现，几百毫秒内跳到记忆尺寸，做不到完全无感
  （窗口是外壳先建的，插件运行在页面里）。
- 只作用于桌面主窗口；浏览器版 Web UI 不参与。
- 全屏状态不跨启动保留。

## 重置

清掉 `dsh-app://app` 这个 origin 下的 localStorage 键 `dsh-window-state:v1` 即可；
在插件管理器里移除本 bundle 则完全停用。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build     # src/client/index.ts -> lib/client.js（IIFE），src/index.ts -> lib/index.js（ESM）
```

`lib/` 是构建产物，但需要提交进仓库：从 GitHub 安装时不会再跑构建。

## License

MIT
