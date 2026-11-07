/** 窗口矩形，坐标与尺寸都是 DIP（与 Electron BrowserWindow.setBounds 一致）。 */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Cordis 浏览器侧最小上下文面：只需要注册可释放的副作用。 */
export interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): unknown
}

/** 浏览器模块加载器（DSH Web UI 注入的全局对象）。 */
export interface ClientModuleLoader {
  load(definition: {
    id: string
    factory: () => { inject: string[]; apply(ctx: ClientContext): void }
  }): void
}

declare global {
  interface Window {
    __ModuleLoader__: ClientModuleLoader
    /** 桌面外壳 preload 只对主窗口（dsh-app://app）暴露；普通浏览器里没有。 */
    dshDesktop?: { protocolVersion?: number }
  }
}
