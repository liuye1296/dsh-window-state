import type { Bounds, ClientContext } from './types'

/**
 * 浏览器半侧：记住并恢复桌面窗口的几何信息（大小、位置、所在显示器）。
 *
 * 只对 Electron 桌面外壳里的主窗口生效：那个页面带有 preload 暴露的
 * window.dshDesktop；普通浏览器里没有，直接不做事。
 *
 * 窗口几何靠渲染层的 window.moveTo / window.resizeTo 驱动（Electron 会把它
 * 转成 BrowserWindow 的 frame），读回用 screenX / screenY / outerWidth /
 * outerHeight，都是 DIP，和 Electron 的 setBounds 一致。
 */

/** 上次的几何，按 dsh-app://app 这个固定 origin 存在 localStorage 里。 */
const STORAGE_KEY = 'dsh-window-state:v1'
/** 拖拽调整窗口时事件很密，停下来之后再落盘。 */
const SAVE_DELAY = 400
/** 渲染层没有 move 事件，只能低频比对坐标来发现“只挪位置不缩放”。 */
const POLL_INTERVAL = 1000
/** 坐标与尺寸的比较容差，避免像素级抖动反复写盘。 */
const TOLERANCE = 2
/** 恢复后等窗口真正落位，再做一次可见性校验。 */
const SETTLE_DELAY = 150

/** 工作区，已扣掉菜单栏/程序坞。 */
interface Area {
  x: number
  y: number
  width: number
  height: number
}

const isDesktopWindow = (): boolean =>
  typeof window.dshDesktop === 'object' &&
  window.dshDesktop !== null &&
  typeof window.dshDesktop.protocolVersion === 'number'

/** 原生全屏时窗口铺满整块屏，那种几何不值得记住。 */
const isFullscreen = (): boolean => document.documentElement.dataset.fullscreen === 'true'

function currentBounds(): Bounds {
  return {
    x: window.screenX,
    y: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight,
  }
}

/** 窗口当前所在显示器的工作区。 */
function workArea(): Area {
  // TS 的 lib.dom 没声明 availLeft/availTop，但 Chromium 里这两个字段一定存在。
  const screen = window.screen as Screen & { availLeft: number; availTop: number }
  return { x: screen.availLeft, y: screen.availTop, width: screen.availWidth, height: screen.availHeight }
}

function isInside(rect: Bounds, area: Area): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.width <= area.x + area.width &&
    rect.y + rect.height <= area.y + area.height
  )
}

function clampTo(rect: Bounds, area: Area): Bounds {
  const width = Math.min(rect.width, area.width)
  const height = Math.min(rect.height, area.height)
  return {
    x: Math.min(Math.max(rect.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(rect.y, area.y), area.y + area.height - height),
    width,
    height,
  }
}

function moveAndResize(rect: Bounds): void {
  window.moveTo(rect.x, rect.y)
  window.resizeTo(rect.width, rect.height)
}

function sameRect(a: Bounds | null, b: Bounds | null): boolean {
  return (
    a !== null &&
    b !== null &&
    Math.abs(a.x - b.x) <= TOLERANCE &&
    Math.abs(a.y - b.y) <= TOLERANCE &&
    Math.abs(a.width - b.width) <= TOLERANCE &&
    Math.abs(a.height - b.height) <= TOLERANCE
  )
}

function readSaved(): Bounds | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    for (const key of ['x', 'y', 'width', 'height']) {
      if (typeof record[key] !== 'number' || !Number.isFinite(record[key])) return null
    }
    return {
      x: record.x as number,
      y: record.y as number,
      width: record.width as number,
      height: record.height as number,
    }
  } catch {
    return null
  }
}

function writeSaved(rect: Bounds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rect))
  } catch {
    /* 存储不可用时退化成“不记忆”，不影响窗口本身 */
  }
}

/** 启动时把上次的几何套回窗口；没存过就先记下当前几何，供下次启动恢复。 */
function restore(ctx: ClientContext): void {
  if (isFullscreen()) return
  const saved = readSaved()
  if (saved === null) {
    writeSaved(currentBounds())
    return
  }
  moveAndResize(saved)
  // 目标可能落在已经拔掉的显示器上：系统只会把窗口留一点可见，
  // 所以读回落点所在显示器的工作区，再收一次，保证整窗可见。
  const settle = window.setTimeout(() => {
    const actual = currentBounds()
    const area = workArea()
    const target = isInside(actual, area) ? actual : clampTo(actual, area)
    if (!sameRect(target, actual)) moveAndResize(target)
    // 落点写回存储：显示器被拔掉时窗口已被系统挪过，下次不必再纠正一遍。
    writeSaved(target)
  }, SETTLE_DELAY)
  ctx.effect(() => () => window.clearTimeout(settle), 'dsh-window-state: settle')
}

/** 跟随窗口变化保存几何。 */
function track(ctx: ClientContext): void {
  let last: Bounds = currentBounds()
  let timer = 0
  const flush = (): void => {
    if (timer !== 0) {
      window.clearTimeout(timer)
      timer = 0
    }
    if (isFullscreen()) return
    const bounds = currentBounds()
    if (bounds.width <= 0 || bounds.height <= 0 || sameRect(bounds, last)) return
    last = bounds
    writeSaved(bounds)
  }
  const schedule = (): void => {
    if (timer !== 0) window.clearTimeout(timer)
    timer = window.setTimeout(flush, SAVE_DELAY)
  }
  // Electron 不给渲染层发 move 事件，只挪位置不改尺寸时靠这里发现。
  const poll = (): void => {
    if (!sameRect(currentBounds(), last)) schedule()
  }
  ctx.effect(() => {
    const pollTimer = window.setInterval(poll, POLL_INTERVAL)
    window.addEventListener('resize', schedule)
    window.addEventListener('move', schedule)
    window.addEventListener('blur', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      flush()
      window.clearInterval(pollTimer)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('move', schedule)
      window.removeEventListener('blur', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, 'dsh-window-state: geometry tracking')
}

window.__ModuleLoader__.load({
  id: 'dsh-window-state',
  factory() {
    return {
      inject: [],
      apply(ctx: ClientContext) {
        if (!isDesktopWindow()) return
        restore(ctx)
        track(ctx)
      },
    }
  },
})
