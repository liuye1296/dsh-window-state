"use strict";
(() => {
  // src/client/index.ts
  var STORAGE_KEY = "dsh-window-state:v1";
  var SAVE_DELAY = 400;
  var POLL_INTERVAL = 1e3;
  var TOLERANCE = 2;
  var SETTLE_DELAY = 150;
  var isDesktopWindow = () => typeof window.dshDesktop === "object" && window.dshDesktop !== null && typeof window.dshDesktop.protocolVersion === "number";
  var isFullscreen = () => document.documentElement.dataset.fullscreen === "true";
  function currentBounds() {
    return {
      x: window.screenX,
      y: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight
    };
  }
  function workArea() {
    const screen = window.screen;
    return { x: screen.availLeft, y: screen.availTop, width: screen.availWidth, height: screen.availHeight };
  }
  function isInside(rect, area) {
    return rect.x >= area.x && rect.y >= area.y && rect.x + rect.width <= area.x + area.width && rect.y + rect.height <= area.y + area.height;
  }
  function clampTo(rect, area) {
    const width = Math.min(rect.width, area.width);
    const height = Math.min(rect.height, area.height);
    return {
      x: Math.min(Math.max(rect.x, area.x), area.x + area.width - width),
      y: Math.min(Math.max(rect.y, area.y), area.y + area.height - height),
      width,
      height
    };
  }
  function moveAndResize(rect) {
    window.moveTo(rect.x, rect.y);
    window.resizeTo(rect.width, rect.height);
  }
  function sameRect(a, b) {
    return a !== null && b !== null && Math.abs(a.x - b.x) <= TOLERANCE && Math.abs(a.y - b.y) <= TOLERANCE && Math.abs(a.width - b.width) <= TOLERANCE && Math.abs(a.height - b.height) <= TOLERANCE;
  }
  function readSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const value = JSON.parse(raw);
      if (typeof value !== "object" || value === null) return null;
      const record = value;
      for (const key of ["x", "y", "width", "height"]) {
        if (typeof record[key] !== "number" || !Number.isFinite(record[key])) return null;
      }
      return {
        x: record.x,
        y: record.y,
        width: record.width,
        height: record.height
      };
    } catch {
      return null;
    }
  }
  function writeSaved(rect) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
    } catch {
    }
  }
  function restore(ctx) {
    if (isFullscreen()) return;
    const saved = readSaved();
    if (saved === null) {
      writeSaved(currentBounds());
      return;
    }
    moveAndResize(saved);
    const settle = window.setTimeout(() => {
      const actual = currentBounds();
      const area = workArea();
      const target = isInside(actual, area) ? actual : clampTo(actual, area);
      if (!sameRect(target, actual)) moveAndResize(target);
      writeSaved(target);
    }, SETTLE_DELAY);
    ctx.effect(() => () => window.clearTimeout(settle), "dsh-window-state: settle");
  }
  function track(ctx) {
    let last = currentBounds();
    let timer = 0;
    const flush = () => {
      if (timer !== 0) {
        window.clearTimeout(timer);
        timer = 0;
      }
      if (isFullscreen()) return;
      const bounds = currentBounds();
      if (bounds.width <= 0 || bounds.height <= 0 || sameRect(bounds, last)) return;
      last = bounds;
      writeSaved(bounds);
    };
    const schedule = () => {
      if (timer !== 0) window.clearTimeout(timer);
      timer = window.setTimeout(flush, SAVE_DELAY);
    };
    const poll = () => {
      if (!sameRect(currentBounds(), last)) schedule();
    };
    ctx.effect(() => {
      const pollTimer = window.setInterval(poll, POLL_INTERVAL);
      window.addEventListener("resize", schedule);
      window.addEventListener("move", schedule);
      window.addEventListener("blur", flush);
      window.addEventListener("pagehide", flush);
      return () => {
        flush();
        window.clearInterval(pollTimer);
        window.removeEventListener("resize", schedule);
        window.removeEventListener("move", schedule);
        window.removeEventListener("blur", flush);
        window.removeEventListener("pagehide", flush);
      };
    }, "dsh-window-state: geometry tracking");
  }
  window.__ModuleLoader__.load({
    id: "dsh-window-state",
    factory() {
      return {
        inject: [],
        apply(ctx) {
          if (!isDesktopWindow()) return;
          restore(ctx);
          track(ctx);
        }
      };
    }
  });
})();
