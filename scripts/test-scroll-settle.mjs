#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const port = Number(args.get("--port") ?? 9294);
const screenshotDirectory = args.get("--screenshot-dir");
const explicitExtensionId = args.get("--extension-id");
const lightVisualTheme = args.get("--light-visual-theme") ?? "professional";
const accentTheme = args.get("--accent-theme") ?? "pink";
const baseUrl = `http://127.0.0.1:${port}`;

const lightVisualThemes = new Set(["professional", "mica", "aurora", "paper"]);
const accentThemes = new Set(["pink", "blue", "purple", "brown", "green", "summer", "autumn", "winter", "spring"]);
if (!lightVisualThemes.has(lightVisualTheme)) throw new Error(`Unsupported light visual theme: ${lightVisualTheme}`);
if (!accentThemes.has(accentTheme)) throw new Error(`Unsupported accent theme: ${accentTheme}`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(pathname, init, attempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${pathname}`, init);
      if (!response.ok) throw new Error(`${pathname}: ${response.status} ${response.statusText}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(200);
    }
  }
  throw lastError;
}

async function createTarget(url) {
  return fetchJson(`/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
}

async function closeTarget(targetId) {
  await fetch(`${baseUrl}/json/close/${targetId}`).catch(() => undefined);
}

async function resolveExtensionId() {
  if (explicitExtensionId) return explicitExtensionId;
  const targets = await fetchJson("/json/list");
  const target =
    targets.find((item) => item.type === "service_worker" && /\/background\.js$/.test(item.url ?? "")) ??
    targets.find((item) => item.url?.startsWith("chrome-extension://"));
  if (!target?.url) throw new Error("Unable to resolve the unpacked extension id");
  return new URL(target.url).host;
}

class CdpSession {
  constructor(webSocketUrl) {
    this.nextId = 0;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out opening CDP WebSocket")), 10000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP response: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(cdp, expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await cdp.evaluate(expression);
    if (lastValue) return lastValue;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(lastValue)}`);
}

async function captureScreenshot(cdp, filePath) {
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await fs.writeFile(filePath, Buffer.from(screenshot.data, "base64"));
}

function geometryExpression(selector) {
  return `(() => {
    const scroller = document.querySelector('[data-space-content-scroll="true"]');
    const scrollerRect = scroller?.getBoundingClientRect();
    return Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.dataset.tabId ?? element.dataset.groupId ?? '',
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
      })
      .filter((item) => item.id && scrollerRect && item.bottom !== 0 && item.top < scrollerRect.bottom && item.top + item.height > scrollerRect.top);
  })()`;
}

function compareGeometry(before, after) {
  const afterById = new Map(after.map((item) => [item.id, item]));
  const deltas = before.flatMap((item) => {
    const next = afterById.get(item.id);
    if (!next) return [];
    return [{
      id: item.id,
      delta: Math.max(
        Math.abs(item.left - next.left),
        Math.abs(item.top - next.top),
        Math.abs(item.width - next.width),
        Math.abs(item.height - next.height)
      )
    }];
  });
  return {
    matched: deltas.length,
    maxDeltaPx: Math.round(Math.max(0, ...deltas.map((item) => item.delta)) * 100) / 100,
    largest: deltas.sort((left, right) => right.delta - left.delta).slice(0, 5)
  };
}

async function main() {
  const extensionId = await resolveExtensionId();
  const target = await createTarget(`chrome-extension://${extensionId}/options.html#/space/default`);
  const cdp = new CdpSession(target.webSocketDebuggerUrl);
  await cdp.open();

  try {
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Page.bringToFront");
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        window.__scrollSettleErrors = [];
        window.addEventListener('error', (event) => window.__scrollSettleErrors.push(String(event.error?.stack ?? event.message)));
        window.addEventListener('unhandledrejection', (event) => window.__scrollSettleErrors.push(String(event.reason?.stack ?? event.reason)));
      })()`
    });
    await waitFor(cdp, "document.readyState === 'complete'", "options document ready");

    await cdp.evaluate(`new Promise((resolve, reject) => {
      const now = Date.now();
      const space = {
        id: 'default',
        name: 'Scroll settle smoke',
        pins: {},
        groups: Array.from({ length: 24 }, (_, groupIndex) => ({
          id: 'group_' + groupIndex,
          name: 'Group ' + (groupIndex + 1),
          createdAt: now + groupIndex,
          tags: groupIndex % 3 === 0 ? ['Work', 'Reading'] : [],
          tabs: Array.from({ length: 24 }, (_, tabIndex) => ({
            id: 'tab_' + groupIndex + '_' + tabIndex,
            kind: 'record',
            title: 'Tab ' + (groupIndex + 1) + '-' + (tabIndex + 1),
            url: 'https://example.com/' + groupIndex + '/' + tabIndex
          }))
        }))
      };
      const setting = {
        isSessionBarCollapsed: true,
        isSidebarCollapsed: false,
        collapsedGroups: [],
        openTabMode: 'newtab',
        openGroupMode: 'nogroup',
        showPinnedSessionTab: 'always',
        removeWhenClickWithAlt: 'yes',
        language: 'en',
        newtab: 'override',
        theme: 'light',
        accentTheme: ${JSON.stringify(accentTheme)},
        lightVisualTheme: ${JSON.stringify(lightVisualTheme)},
        zenMode: false,
        zenTheme: 'minimal',
        collectionView: 'card',
        collectionSort: 'manual'
      };
      chrome.storage.local.set({
        'xingluotab:space-list': JSON.stringify([{ id: 'default', name: space.name }]),
        'xingluotab:space:default': JSON.stringify(space),
        'xingluotab:user-setting': JSON.stringify(setting),
        'xingluotab:space-version': String(now)
      }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(true);
      });
    })`);
    await cdp.send("Page.navigate", {
      url: `chrome-extension://${extensionId}/options.html#/space/default`
    });
    try {
      await waitFor(
        cdp,
        `document.readyState === 'complete' && document.documentElement.dataset.visualTheme === ${JSON.stringify(lightVisualTheme)} && document.documentElement.dataset.accentTheme === ${JSON.stringify(accentTheme)} && document.querySelectorAll('[data-record-tab-card="true"]').length > 0 && document.querySelectorAll('[data-group-static-preview="true"]').length === 0`,
        "seeded interactive groups",
        30000
      );
    } catch (error) {
      const diagnostics = await cdp.evaluate(`(() => ({
        href: location.href,
        readyState: document.readyState,
        visualTheme: document.documentElement.dataset.visualTheme,
        accentTheme: document.documentElement.dataset.accentTheme,
        bodyText: document.body?.innerText?.slice(0, 500),
        staticGroups: document.querySelectorAll('[data-group-static-preview="true"]').length,
        interactiveGroups: document.querySelectorAll('[data-group-card="true"]').length,
        interactiveTabs: document.querySelectorAll('[data-record-tab-card="true"]').length,
        pageErrors: window.__scrollSettleErrors ?? []
      }))()`);
      throw new Error(`${error.message}; diagnostics: ${JSON.stringify(diagnostics)}`);
    }

    await cdp.evaluate(`(() => {
      const stats = {
        frameGaps: [],
        longTasks: [],
        layoutShifts: [],
        initialGroupHeights: Array.from(document.querySelectorAll('[data-group-card="true"]')).map((group) =>
          Math.round(group.getBoundingClientRect().height * 100) / 100
        ),
        interactiveGroupCounts: [],
        staticGroupCounts: [],
        bufferedOverlayCounts: [],
        bufferIsolationIssueSignatures: [],
        activeAnimationSignatures: [],
        settleFrames: [],
        settleStarted: false,
        stopped: false
      };
      let previous = performance.now();
      let previousInteractive = -1;
      let previousStatic = -1;
      let previousBuffered = -1;
      const tick = (now) => {
        stats.frameGaps.push(now - previous);
        previous = now;
        const interactive = document.querySelectorAll('[data-group-card="true"]').length;
        const statics = document.querySelectorAll('[data-group-static-preview="true"]').length;
        const buffered = document.querySelectorAll('[data-group-buffer-overlay="true"]').length;
        if (interactive !== previousInteractive) stats.interactiveGroupCounts.push(interactive);
        if (statics !== previousStatic) stats.staticGroupCounts.push(statics);
        if (buffered !== previousBuffered) stats.bufferedOverlayCounts.push(buffered);
        if (stats.settleStarted) stats.settleFrames.push({ interactive, statics, buffered });
        if (stats.settleStarted && buffered > 0 && stats.bufferIsolationIssueSignatures.length < 20) {
          for (const overlay of document.querySelectorAll('[data-group-buffer-overlay="true"]')) {
            if (!(overlay instanceof HTMLElement)) continue;
            const row = overlay.closest('[data-group-virtual-row="true"]');
            const interactiveLayer = row?.querySelector('[data-group-interactive-layer="true"]');
            const overlayStyle = getComputedStyle(overlay);
            const issues = [];
            if (!['transparent', 'rgba(0, 0, 0, 0)'].includes(overlayStyle.backgroundColor)) {
              issues.push('overlay-background-color=' + overlayStyle.backgroundColor);
            }
            if (overlayStyle.backgroundImage !== 'none') {
              issues.push('overlay-background-image=' + overlayStyle.backgroundImage);
            }
            if (!(interactiveLayer instanceof HTMLElement) || getComputedStyle(interactiveLayer).visibility !== 'hidden') {
              issues.push('interactive-layer-visible');
            }
            const signature = issues.join('|');
            if (signature && !stats.bufferIsolationIssueSignatures.includes(signature)) {
              stats.bufferIsolationIssueSignatures.push(signature);
            }
          }
        }
        if (stats.settleStarted && stats.activeAnimationSignatures.length < 50) {
          for (const animation of document.getAnimations()) {
            if (animation.playState !== 'running') continue;
            const target = animation.effect?.target;
            if (!(target instanceof HTMLElement)) continue;
            const virtualRow = target.closest('[data-group-virtual-row="true"]');
            const coveredByBuffer = virtualRow?.querySelector('[data-group-buffer-overlay="true"]');
            if (coveredByBuffer) continue;
            const properties = Array.from(new Set(
              (animation.effect?.getKeyframes?.() ?? []).flatMap((frame) =>
                Object.keys(frame).filter((key) => !['offset', 'easing', 'composite', 'computedOffset'].includes(key))
              )
            )).sort();
            const signature = [
              target.tagName.toLowerCase(),
              target.dataset.faviconPreview ? 'favicon-preview' : '',
              target.dataset.faviconSourceIndex != null ? 'favicon-live' : '',
              target.dataset.groupBufferOverlay ? 'buffer-overlay' : '',
              target.dataset.groupCollapseContent ? 'group-collapse-content' : '',
              properties.join(',')
            ].filter(Boolean).join(':');
            if (signature && !stats.activeAnimationSignatures.includes(signature)) {
              stats.activeAnimationSignatures.push(signature);
            }
          }
        }
        previousInteractive = interactive;
        previousStatic = statics;
        previousBuffered = buffered;
        if (!stats.stopped) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      try {
        const longTasks = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) stats.longTasks.push(entry.duration);
        });
        longTasks.observe({ entryTypes: ['longtask'] });
        stats.longTaskObserver = longTasks;
      } catch {}
      try {
        const shifts = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) stats.layoutShifts.push(entry.value);
        });
        shifts.observe({ type: 'layout-shift' });
        stats.layoutShiftObserver = shifts;
      } catch {}
      window.__scrollSettleStats = stats;
      return true;
    })()`);

    const scrollTarget = await cdp.evaluate(`(() => {
      const scroller = document.querySelector('[data-space-content-scroll="true"]');
      if (!scroller) return null;
      scroller.scrollTop = 0;
      const rect = scroller.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (!scrollTarget) throw new Error("Missing space content scroller");

    await sleep(100);
    for (let step = 0; step < 18; step += 1) {
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: scrollTarget.x,
        y: scrollTarget.y,
        deltaX: 0,
        deltaY: 480
      });
      await sleep(16);
    }

    const previewStats = await cdp.evaluate(`(() => ({
      scrollTop: document.querySelector('[data-space-content-scroll="true"]')?.scrollTop ?? 0,
      staticGroups: document.querySelectorAll('[data-group-static-preview="true"]').length,
      interactiveGroups: document.querySelectorAll('[data-group-card="true"]').length,
      staticTabs: document.querySelectorAll('[data-static-tab-preview="true"]').length,
      interactiveTabs: document.querySelectorAll('[data-record-tab-card="true"]').length
    }))()`);
    const previewGeometry = await cdp.evaluate(geometryExpression('[data-static-tab-preview="true"]'));
    const previewSurfaceStyle = await cdp.evaluate(`(() => {
      const element = document.querySelector('[data-static-tab-preview="true"]');
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
        filter: style.filter,
        opacity: style.opacity,
        color: style.color
      };
    })()`);
    await cdp.evaluate("window.__scrollSettleStats.settleStarted = true");

    let previewScreenshot;
    let bufferedScreenshot;
    let settledScreenshot;
    if (screenshotDirectory) {
      await fs.mkdir(screenshotDirectory, { recursive: true });
      previewScreenshot = path.join(screenshotDirectory, "scroll-preview.png");
      settledScreenshot = path.join(screenshotDirectory, "scroll-settled.png");
      await captureScreenshot(cdp, previewScreenshot);
      try {
        await waitFor(
          cdp,
          "document.querySelectorAll('[data-group-buffer-overlay=\"true\"]').length > 0",
          "buffered preview frame",
          2000
        );
        bufferedScreenshot = path.join(screenshotDirectory, "scroll-buffered.png");
        await captureScreenshot(cdp, bufferedScreenshot);
      } catch {
        bufferedScreenshot = undefined;
      }
    }

    try {
      await waitFor(
        cdp,
        "document.querySelectorAll('[data-group-static-preview=\"true\"]').length === 0 && document.querySelectorAll('[data-group-card=\"true\"]').length > 0",
        "buffered interactive groups revealed",
        5000
      );
    } catch (error) {
      const settleDiagnostics = await cdp.evaluate(`(() => ({
        staticGroups: document.querySelectorAll('[data-group-static-preview="true"]').length,
        interactiveGroups: document.querySelectorAll('[data-group-card="true"]').length,
        bufferedOverlays: document.querySelectorAll('[data-group-buffer-overlay="true"]').length,
        virtualRows: document.querySelectorAll('[data-group-virtual-row="true"]').length,
        rowHeights: Array.from(document.querySelectorAll('[data-group-virtual-row="true"]')).map((row) => ({
          index: row.dataset.index,
          height: Math.round(row.getBoundingClientRect().height * 100) / 100,
          interactive: Boolean(row.querySelector('[data-group-card="true"]')),
          buffered: Boolean(row.querySelector('[data-group-buffer-overlay="true"]'))
        })),
        scrollTop: document.querySelector('[data-space-content-scroll="true"]')?.scrollTop ?? null,
        counts: window.__scrollSettleStats
          ? {
              interactive: window.__scrollSettleStats.interactiveGroupCounts,
              statics: window.__scrollSettleStats.staticGroupCounts,
              buffered: window.__scrollSettleStats.bufferedOverlayCounts
            }
          : null,
        initialGroupHeights: window.__scrollSettleStats?.initialGroupHeights ?? null
      }))()`);
      throw new Error(`${error.message}; diagnostics: ${JSON.stringify(settleDiagnostics)}`);
    }
    await sleep(100);

    const settledStats = await cdp.evaluate(`(() => ({
      scrollTop: document.querySelector('[data-space-content-scroll="true"]')?.scrollTop ?? 0,
      staticGroups: document.querySelectorAll('[data-group-static-preview="true"]').length,
      interactiveGroups: document.querySelectorAll('[data-group-card="true"]').length,
      staticTabs: document.querySelectorAll('[data-static-tab-preview="true"]').length,
      interactiveTabs: document.querySelectorAll('[data-record-tab-card="true"]').length
    }))()`);
    const settledGeometry = await cdp.evaluate(geometryExpression('[data-record-tab-card="true"]'));
    const settledSurfaceStyle = await cdp.evaluate(`(() => {
      const element = document.querySelector('[data-record-tab-card="true"]');
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
        filter: style.filter,
        opacity: style.opacity,
        color: style.color
      };
    })()`);
    if (settledScreenshot) await captureScreenshot(cdp, settledScreenshot);

    const performanceStats = await cdp.evaluate(`(() => {
      const stats = window.__scrollSettleStats;
      stats.stopped = true;
      stats.longTaskObserver?.disconnect();
      stats.layoutShiftObserver?.disconnect();
      const gaps = stats.frameGaps.slice().sort((a, b) => a - b);
      const hydrationFrames = stats.settleFrames.filter((frame) => frame.interactive > 0 && frame.statics > 0);
      const uncoveredHydrationFrames = hydrationFrames.filter((frame) => frame.buffered < frame.interactive);
      const percentile = (ratio) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * ratio))] ?? 0;
      return {
        frameCount: gaps.length,
        averageFrameGapMs: gaps.length ? Math.round((gaps.reduce((sum, value) => sum + value, 0) / gaps.length) * 10) / 10 : 0,
        p95FrameGapMs: Math.round(percentile(0.95) * 10) / 10,
        maxFrameGapMs: Math.round((gaps[gaps.length - 1] ?? 0) * 10) / 10,
        longTaskCount: stats.longTasks.length,
        maxLongTaskMs: Math.round(Math.max(0, ...stats.longTasks) * 10) / 10,
        cumulativeLayoutShift: Math.round(stats.layoutShifts.reduce((sum, value) => sum + value, 0) * 10000) / 10000,
        interactiveGroupCounts: stats.interactiveGroupCounts,
        staticGroupCounts: stats.staticGroupCounts,
        bufferedOverlayCounts: stats.bufferedOverlayCounts,
        bufferIsolationIssueSignatures: stats.bufferIsolationIssueSignatures,
        activeAnimationSignatures: stats.activeAnimationSignatures,
        bufferedHydrationFrameCount: hydrationFrames.length,
        uncoveredHydrationFrameCount: uncoveredHydrationFrames.length,
        pageErrors: window.__scrollSettleErrors ?? []
      };
    })()`);

    const routeBaseline = await cdp.evaluate(`(() => {
      const main = document.querySelector('[data-space-main="true"]')?.getBoundingClientRect();
      const sessionBar = document.querySelector('[data-session-bar="true"]')?.getBoundingClientRect();
      return main && sessionBar
        ? { mainLeft: main.left, mainWidth: main.width, sessionBarWidth: sessionBar.width }
        : null;
    })()`);
    if (!routeBaseline) throw new Error("Missing route stability baseline");
    await cdp.evaluate("location.hash = '#/about'");
    await waitFor(cdp, "location.hash === '#/about' && Boolean(document.querySelector('[data-about-tech-stack=\"true\"]'))", "About route");
    const routeSamples = await cdp.evaluate(`new Promise((resolve) => {
      const samples = [];
      const startedAt = performance.now();
      location.hash = '#/space/default';
      const sample = (now) => {
        const main = document.querySelector('[data-space-main="true"]')?.getBoundingClientRect();
        const sessionBar = document.querySelector('[data-session-bar="true"]')?.getBoundingClientRect();
        if (main && sessionBar) {
          samples.push({ mainLeft: main.left, mainWidth: main.width, sessionBarWidth: sessionBar.width });
        }
        if (now - startedAt < 500) requestAnimationFrame(sample);
        else resolve(samples);
      };
      requestAnimationFrame(sample);
    })`);
    const routeRoundTrip = {
      sampleCount: routeSamples.length,
      maxMainLeftDeltaPx: Math.round(Math.max(0, ...routeSamples.map((sample) => Math.abs(sample.mainLeft - routeBaseline.mainLeft))) * 100) / 100,
      maxMainWidthDeltaPx: Math.round(Math.max(0, ...routeSamples.map((sample) => Math.abs(sample.mainWidth - routeBaseline.mainWidth))) * 100) / 100,
      maxSessionBarWidthDeltaPx: Math.round(Math.max(0, ...routeSamples.map((sample) => Math.abs(sample.sessionBarWidth - routeBaseline.sessionBarWidth))) * 100) / 100
    };

    const settingsRouteSamples = await cdp.evaluate(`new Promise((resolve) => {
      const sidebar = document.querySelector('[data-space-sidebar="true"]');
      const baselineRowCount = document.querySelectorAll('[data-space-row="true"]').length;
      const samples = [];
      let phase = 'settings';
      let phaseStartedAt = performance.now();
      location.hash = '#/settings';
      const sample = (now) => {
        const currentSidebar = document.querySelector('[data-space-sidebar="true"]');
        const spaceMain = document.querySelector('[data-space-main="true"]');
        samples.push({
          phase,
          hash: location.hash,
          sidebarSame: currentSidebar === sidebar,
          sidebarRowCount: document.querySelectorAll('[data-space-row="true"]').length,
          baselineRowCount,
          settingsReady: Boolean(document.querySelector('[data-settings-page="true"][data-settings-ready="true"]')),
          layoutLoading: Boolean(document.querySelector('[data-layout-settings-loading="true"]')),
          spaceMain: Boolean(spaceMain),
          spaceLoading: spaceMain?.dataset.spaceLoading ?? null,
          visibleGroupCount:
            document.querySelectorAll('[data-group-card="true"]').length +
            document.querySelectorAll('[data-group-static-preview="true"]').length
        });
        if (phase === 'settings' && now - phaseStartedAt >= 300) {
          phase = 'space';
          phaseStartedAt = now;
          location.hash = '#/space/default';
        }
        if (phase === 'space' && now - phaseStartedAt >= 500) resolve(samples);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    })`);
    const settingsFrames = settingsRouteSamples.filter((sample) => sample.phase === "settings");
    const spaceReturnFrames = settingsRouteSamples.filter((sample) => sample.phase === "space" && sample.spaceMain);
    const settingsRouteRoundTrip = {
      settingsSampleCount: settingsFrames.length,
      spaceReturnSampleCount: spaceReturnFrames.length,
      baselineSidebarRowCount: settingsRouteSamples[0]?.baselineRowCount ?? 0,
      sidebarNodeReplaced: settingsRouteSamples.some((sample) => !sample.sidebarSame),
      minimumSidebarRowCount: Math.min(...settingsRouteSamples.map((sample) => sample.sidebarRowCount)),
      settingsReadyObserved: settingsFrames.some((sample) => sample.settingsReady),
      layoutLoadingObserved: settingsRouteSamples.some((sample) => sample.layoutLoading),
      cachedSpaceLoadingFrameCount: spaceReturnFrames.filter((sample) => sample.spaceLoading === "true").length,
      cachedSpaceContentObserved: spaceReturnFrames.some((sample) => sample.visibleGroupCount > 0)
    };

    const geometry = compareGeometry(previewGeometry, settledGeometry);
    const surfaceStyleMismatches = previewSurfaceStyle && settledSurfaceStyle
      ? Object.keys(previewSurfaceStyle).filter((property) => previewSurfaceStyle[property] !== settledSurfaceStyle[property])
      : ["missing-surface"];
    const progressiveCounts = performanceStats.interactiveGroupCounts.filter((count) => count > 0);
    const progressiveRestore = new Set(progressiveCounts).size > 1;
    const scrollTopDeltaPx = Math.round(Math.abs(previewStats.scrollTop - settledStats.scrollTop) * 100) / 100;
    const ok =
      previewStats.staticGroups > 0 &&
      previewStats.interactiveGroups === 0 &&
      settledStats.staticGroups === 0 &&
      settledStats.interactiveGroups > 0 &&
      progressiveRestore &&
      performanceStats.bufferedHydrationFrameCount > 0 &&
      performanceStats.uncoveredHydrationFrameCount === 0 &&
      performanceStats.bufferIsolationIssueSignatures.length === 0 &&
      performanceStats.activeAnimationSignatures.length === 0 &&
      scrollTopDeltaPx <= 2 &&
      geometry.maxDeltaPx <= 1 &&
      surfaceStyleMismatches.length === 0 &&
      performanceStats.cumulativeLayoutShift <= 0.05 &&
      routeRoundTrip.sampleCount > 0 &&
      routeRoundTrip.maxMainLeftDeltaPx <= 1 &&
      routeRoundTrip.maxMainWidthDeltaPx <= 1 &&
      routeRoundTrip.maxSessionBarWidthDeltaPx <= 1 &&
      settingsRouteRoundTrip.settingsSampleCount > 0 &&
      settingsRouteRoundTrip.spaceReturnSampleCount > 0 &&
      settingsRouteRoundTrip.baselineSidebarRowCount > 0 &&
      !settingsRouteRoundTrip.sidebarNodeReplaced &&
      settingsRouteRoundTrip.minimumSidebarRowCount === settingsRouteRoundTrip.baselineSidebarRowCount &&
      settingsRouteRoundTrip.settingsReadyObserved &&
      !settingsRouteRoundTrip.layoutLoadingObserved &&
      settingsRouteRoundTrip.cachedSpaceLoadingFrameCount === 0 &&
      settingsRouteRoundTrip.cachedSpaceContentObserved &&
      performanceStats.pageErrors.length === 0;

    const result = {
      ok,
      dataset: "24 groups x 24 tabs",
      appearance: { lightVisualTheme, accentTheme },
      extensionId,
      previewStats,
      settledStats,
      scrollTopDeltaPx,
      geometry,
      cardSurfaceStyle: {
        preview: previewSurfaceStyle,
        settled: settledSurfaceStyle,
        mismatches: surfaceStyleMismatches
      },
      routeRoundTrip,
      settingsRouteRoundTrip,
      performance: performanceStats,
      screenshots: previewScreenshot && settledScreenshot
        ? { previewScreenshot, bufferedScreenshot: bufferedScreenshot ?? null, settledScreenshot }
        : null
    };
    console.log(JSON.stringify(result, null, 2));
    if (!ok) throw new Error(`Scroll settle smoke failed: ${JSON.stringify(result)}`);
  } finally {
    cdp.close();
    await closeTarget(target.id);
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
