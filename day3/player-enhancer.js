(function () {
  'use strict';

  const isWlxt = /\/(f|b)\/wlxt\//i.test(location.pathname) || /\/res\//i.test(location.pathname);
  const isYkt = /\.yuketang\.cn$/i.test(location.hostname);
  if (!isWlxt && !isYkt) return;

  const SPEED_STORAGE_KEY = 'coursehub_video_rate';
  const COLLAPSED_STORAGE_KEY = 'coursehub_video_bar_collapsed';
  const PRESETS = [0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
  const LIVE_DOM_SELECTOR =
    '.live__container, .J_live, .xt_video_player_controls.live_control, xt-playtype.xt_video_play_type';
  const isMobileLessonFrame = /\/m\/v2\/lesson\/student\//i.test(location.pathname);

  let targetRate = 1.0;
  let collapsed = false;
  let barMounted = false;
  let editingCustomRate = false;
  let lastRenderedLiveState = null;
  let shadow = null;
  const trackedMedia = new WeakSet();

  function clampRate(val) {
    const n = Math.round(Number(val) * 100) / 100;
    if (!Number.isFinite(n)) return 1.0;
    return Math.min(16.0, Math.max(0.5, n));
  }

  function formatRate(val) {
    const r = clampRate(val);
    return Number.isInteger(r) ? `${r.toFixed(1)}x` : `${String(r).replace(/0$/, '')}x`;
  }

  function isGradedVideoRoute() {
    return /\/xcloud\/video-student\//i.test(location.pathname);
  }

  function isLiveMediaElement(m) {
    if (!m) return false;
    try {
      if (Boolean(m.srcObject)) return true;
      if (m.readyState >= 1 && m.duration === Infinity) return true;
      if (m.classList && (m.classList.contains('live__container') || m.classList.contains('J_live'))) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function getActiveMediaElements() {
    const videos = Array.from(document.querySelectorAll('video')).filter(
      v =>
        v.readyState > 0 ||
        v.src ||
        v.currentSrc ||
        Boolean(v.srcObject) ||
        (v.classList && v.classList.contains('live__container')) ||
        v.querySelector('source') ||
        v.offsetWidth > 80
    );
    const audios = Array.from(document.querySelectorAll('audio')).filter(
      a =>
        a.hasAttribute('data-is-player') ||
        (a.classList && a.classList.contains('live__container')) ||
        Boolean(a.srcObject) ||
        a.readyState > 0 ||
        a.src ||
        a.currentSrc ||
        a.controls
    );
    return [...videos, ...audios];
  }

  function isLiveMode() {
    try {
      if (/^\/lesson\/fullscreen\//i.test(location.pathname)) return true;
      if (document.querySelector(LIVE_DOM_SELECTOR)) return true;
    } catch (_) {}
    const list = getActiveMediaElements();
    return list.some(isLiveMediaElement);
  }

  function clearDomRateAttrIfPresent() {
    try {
      if (document.documentElement && document.documentElement.hasAttribute('data-chub-rate')) {
        document.documentElement.removeAttribute('data-chub-rate');
      }
    } catch (_) {}
  }

  function pickPrimaryMedia() {
    const list = getActiveMediaElements();
    if (!list.length) return document.querySelector('video, audio[data-is-player], audio');
    const playing = list.find(m => !m.paused && !m.ended);
    if (playing) return playing;
    const vid = list.find(m => m.tagName === 'VIDEO');
    return vid || list[0];
  }

  function pickPrimaryVideoOnly() {
    const vids = Array.from(document.querySelectorAll('video')).filter(
      v =>
        v.readyState > 0 ||
        v.src ||
        v.currentSrc ||
        Boolean(v.srcObject) ||
        (v.classList && v.classList.contains('live__container')) ||
        v.offsetWidth > 80
    );
    const playing = vids.find(v => !v.paused && !v.ended);
    return playing || vids[0] || null;
  }

  function saveState(includeRate = true) {
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        const payload = { [COLLAPSED_STORAGE_KEY]: collapsed };
        if (includeRate && !isLiveMode()) {
          payload[SPEED_STORAGE_KEY] = targetRate;
        }
        chrome.storage.local.set(payload);
      }
    } catch (_) {}
  }

  function syncRateAttributeToDom(rate, broadcastFrames = true) {
    if (isLiveMode()) {
      clearDomRateAttrIfPresent();
      return;
    }

    const r = clampRate(rate);
    if (document.documentElement) {
      document.documentElement.setAttribute('data-chub-rate', String(r));
    }
    try {
      window.dispatchEvent(new CustomEvent('chub:apply-rate', { detail: { rate: r } }));
    } catch (_) {}

    document.querySelectorAll('video, audio').forEach(m => {
      if (isLiveMediaElement(m)) return;
      try {
        m.defaultPlaybackRate = r;
        if (Math.abs(m.playbackRate - r) > 0.015) {
          m.playbackRate = r;
        }
      } catch (_) {}
    });

    if (broadcastFrames) {
      const msg = { __chubSyncRate: r };
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, '*');
        }
      } catch (_) {}
      document.querySelectorAll('iframe').forEach(ifr => {
        try {
          if (ifr.contentWindow) ifr.contentWindow.postMessage(msg, '*');
        } catch (_) {}
      });
    }
  }

  function setGlobalRate(nextRate, persist = true, broadcast = true) {
    if (isLiveMode()) {
      clearDomRateAttrIfPresent();
      renderBar();
      return;
    }
    targetRate = clampRate(nextRate);
    syncRateAttributeToDom(targetRate, broadcast);
    if (persist) saveState(true);
    renderBar();
  }

  async function togglePiP() {
    const v = pickPrimaryVideoOnly();
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        v.disablePictureInPicture = false;
        await v.requestPictureInPicture();
      }
      renderBar();
    } catch (_) {}
  }

  function bindMediaEvents(media) {
    if (!media || trackedMedia.has(media)) return;
    trackedMedia.add(media);

    if (!isLiveMode()) {
      syncRateAttributeToDom(targetRate, false);
    } else {
      clearDomRateAttrIfPresent();
    }

    const handleLifecycleSync = () => {
      if (isLiveMode()) {
        clearDomRateAttrIfPresent();
        renderBar();
        return;
      }
      syncRateAttributeToDom(targetRate, false);
    };

    media.addEventListener('loadedmetadata', handleLifecycleSync);
    media.addEventListener('durationchange', handleLifecycleSync);
    media.addEventListener('play', handleLifecycleSync);
    media.addEventListener('playing', handleLifecycleSync);
    media.addEventListener('enterpictureinpicture', renderBar);
    media.addEventListener('leavepictureinpicture', renderBar);
    media.addEventListener('ratechange', () => {
      if (isLiveMode()) {
        clearDomRateAttrIfPresent();
        return;
      }
      // Keep targetRate steady against player-initiated 1.0x resets
      const domAttr = document.documentElement && document.documentElement.getAttribute('data-chub-rate');
      const attrRate = domAttr ? clampRate(Number(domAttr)) : targetRate;
      if (Math.abs(attrRate - targetRate) >= 0.02) {
        targetRate = attrRate;
        saveState(true);
        renderBar();
        return;
      }
      if (Math.abs(media.playbackRate - targetRate) > 0.02) {
        syncRateAttributeToDom(targetRate, false);
      }
    });
  }

  window.addEventListener('chub:native-rate-selected', e => {
    if (isLiveMode()) return;
    const r = e && e.detail && Number(e.detail.rate);
    if (Number.isFinite(r) && r > 0) {
      setGlobalRate(r, true, true);
    }
  });

  window.addEventListener('message', e => {
    if (isLiveMode()) return;
    const d = e && e.data;
    if (d && Number.isFinite(Number(d.__chubSyncRate))) {
      const incoming = clampRate(Number(d.__chubSyncRate));
      if (Math.abs(incoming - targetRate) >= 0.015) {
        setGlobalRate(incoming, true, false);
      } else {
        syncRateAttributeToDom(incoming, false);
      }
    }
  });

  if (document.documentElement) {
    const attrObs = new MutationObserver(() => {
      if (isLiveMode()) {
        clearDomRateAttrIfPresent();
        return;
      }
      const raw = document.documentElement.getAttribute('data-chub-rate');
      if (!raw) return;
      const r = clampRate(Number(raw));
      if (Math.abs(r - targetRate) >= 0.02) {
        targetRate = r;
        saveState(true);
        renderBar();
      }
    });
    attrObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-chub-rate'] });
  }

  function buildHintPillsHtml(rateVal) {
    const pills = [];
    if (isGradedVideoRoute() && rateVal > 2.0) {
      pills.push('<span class="hint-pill warn" title="课程视频按心跳区间结算，超过 2x 容易漏计观看时长">⚠️ 计学时页 &gt;2x 可能漏计进度</span>');
    }
    if (rateVal > 4.0) {
      pills.push('<span class="hint-pill mute" title="超过 4x 时浏览器音频轨道会自动静音">🔇 &gt;4x 浏览器静音</span>');
    }
    return pills.join('');
  }

  function mountBarIfNeeded() {
    if (barMounted) return;
    const hasDetachedMedia =
      document.documentElement && document.documentElement.getAttribute('data-chub-has-media') === '1';
    if (!getActiveMediaElements().length && !hasDetachedMedia && !isLiveMode()) return;
    if (document.getElementById('chub-speed-bar-host')) return;

    barMounted = true;
    const host = document.createElement('div');
    host.id = 'chub-speed-bar-host';
    const initBottom = isMobileLessonFrame ? 68 : 20;
    host.style.cssText = `position:fixed;left:20px;bottom:${initBottom}px;z-index:2147483630;pointer-events:none;`;
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });

    const css = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
      }
      * { box-sizing: border-box; }
      .bar {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 11px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.94);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(15, 23, 42, 0.1);
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
        color: #0f172a;
        font-size: 12px;
        user-select: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      .bar.mini {
        padding: 6px 12px;
        cursor: pointer;
      }
      .drag-handle {
        cursor: grab;
        color: #94a3b8;
        font-size: 12px;
        padding: 0 3px;
      }
      .rate-badge {
        font-weight: 800;
        color: #4f46e5;
        min-width: 42px;
        padding: 1px 4px;
        border-radius: 6px;
        border-bottom: 1px dashed rgba(79, 70, 229, 0.45);
        text-align: center;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
      }
      .rate-badge:hover {
        background: rgba(79, 70, 229, 0.08);
      }
      .rate-input {
        width: 52px;
        padding: 2px 5px;
        border-radius: 6px;
        border: 1.5px solid #4f46e5;
        background: #fff;
        color: #0f172a;
        font-size: 12px;
        font-weight: 700;
        font-family: inherit;
        text-align: center;
        outline: none;
      }
      .live-pill {
        font-weight: 700;
        color: #dc2626;
        background: rgba(239, 68, 68, 0.09);
        border: 1px solid rgba(239, 68, 68, 0.22);
        padding: 3px 9px;
        border-radius: 999px;
        font-size: 11.5px;
        white-space: nowrap;
      }
      .hint-wrap {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .hint-pill {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        white-space: nowrap;
      }
      .hint-pill.warn {
        color: #b45309;
        background: rgba(245, 158, 11, 0.14);
        border: 1px solid rgba(245, 158, 11, 0.28);
      }
      .hint-pill.mute {
        color: #475569;
        background: rgba(100, 116, 139, 0.12);
        border: 1px solid rgba(100, 116, 139, 0.22);
      }
      .btn {
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: #f8fafc;
        color: #334155;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 999px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.14s;
        line-height: 1.2;
      }
      .btn:hover {
        border-color: #6366f1;
        color: #4f46e5;
        background: rgba(99, 102, 241, 0.08);
      }
      .btn.on {
        background: #4f46e5;
        border-color: #4f46e5;
        color: #fff;
      }
      .btn.pip-on {
        background: #059669;
        border-color: #059669;
        color: #fff;
      }
      .slider {
        width: 72px;
        accent-color: #4f46e5;
        cursor: pointer;
      }
      .sep {
        width: 1px;
        height: 14px;
        background: rgba(15, 23, 42, 0.1);
        margin: 0 2px;
      }
      @media (max-width: 780px) {
        .hide-sm { display: none; }
      }
    `;

    shadow.innerHTML = `<style>${css}</style><div id="wrap"></div>`;
    enableDragging(host, initBottom);
    renderBar();
  }

  function enableDragging(hostEl, defaultBottom) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 20;
    let origBottom = defaultBottom;

    shadow.addEventListener('mousedown', e => {
      const handle = e.target && e.target.closest && e.target.closest('[data-drag]');
      if (!handle) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = hostEl.getBoundingClientRect();
      origLeft = rect.left;
      origBottom = window.innerHeight - rect.bottom;
      e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const nx = Math.max(8, Math.min(window.innerWidth - 120, origLeft + (e.clientX - startX)));
      const nb = Math.max(8, Math.min(window.innerHeight - 48, origBottom - (e.clientY - startY)));
      hostEl.style.left = `${nx}px`;
      hostEl.style.bottom = `${nb}px`;
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function renderBar() {
    if (!shadow) return;
    const wrap = shadow.getElementById('wrap');
    if (!wrap) return;
    if (editingCustomRate && shadow.getElementById('custom-rate-input')) return;

    const liveNow = isLiveMode();
    lastRenderedLiveState = liveNow;
    const hasVideo = Boolean(pickPrimaryVideoOnly());
    const primary = pickPrimaryMedia();
    const isAudioOnly = !hasVideo && primary && primary.tagName === 'AUDIO';
    const inPiP = Boolean(document.pictureInPictureElement);

    if (liveNow) {
      if (collapsed) {
        wrap.innerHTML = `
          <div class="bar mini" id="expand-btn" title="展开直播工具胶囊">
            <span>🔴</span>
            <span style="font-weight:700;color:#dc2626">直播中</span>
            ${inPiP ? '<span style="color:#059669;font-weight:700">📺 小窗中</span>' : ''}
          </div>
        `;
        shadow.getElementById('expand-btn').onclick = () => {
          collapsed = false;
          saveState(false);
          renderBar();
        };
        return;
      }

      wrap.innerHTML = `
        <div class="bar">
          <span class="drag-handle" data-drag="1" title="按住拖动位置">⋮⋮</span>
          <span class="live-pill" title="检测到正在直播，已保持原生播放速率防止缓冲卡顿">🔴 直播中 · 原生流畅追帧</span>
          ${hasVideo ? `
            <span class="sep"></span>
            <button class="btn ${inPiP ? 'pip-on' : ''}" id="pip-btn" title="切换悬浮画中画小窗 (快捷键 Alt + P)">
              📺 ${inPiP ? '退出小窗' : '画中画'}
            </button>
          ` : ''}
          <button class="btn" id="collapse-btn" title="收起为迷你胶囊">收起</button>
        </div>
      `;
      const pipBtn = shadow.getElementById('pip-btn');
      if (pipBtn) pipBtn.onclick = togglePiP;
      shadow.getElementById('collapse-btn').onclick = () => {
        collapsed = true;
        saveState(false);
        renderBar();
      };
      return;
    }

    if (collapsed) {
      wrap.innerHTML = `
        <div class="bar mini" id="expand-btn" title="展开回放倍速控制条">
          <span>${isAudioOnly ? '🎙️' : '🎬'}</span>
          <span class="rate-badge" style="border-bottom:none">${formatRate(targetRate)}</span>
          ${inPiP ? '<span style="color:#059669;font-weight:700">📺 小窗中</span>' : ''}
        </div>
      `;
      shadow.getElementById('expand-btn').onclick = () => {
        collapsed = false;
        saveState(true);
        renderBar();
      };
      return;
    }

    const presetHtml = PRESETS.map(p => {
      const active = Math.abs(targetRate - p) < 0.02;
      return `<button class="btn ${active ? 'on' : ''} ${p === 0.75 || p === 2.5 ? 'hide-sm' : ''}" data-rate="${p}">${formatRate(p)}</button>`;
    }).join('');

    const hintHtml = buildHintPillsHtml(targetRate);

    wrap.innerHTML = `
      <div class="bar">
        <span class="drag-handle" data-drag="1" title="按住拖动位置">⋮⋮</span>
        <button class="btn" id="step-down" title="减速 (快捷键 [ )">−</button>
        <span class="rate-badge" id="rate-badge-trigger" title="点击可输入任意倍速 (0.5 ~ 16x)">${formatRate(targetRate)}</span>
        <button class="btn" id="step-up" title="加速 (快捷键 ] )">+</button>
        <input class="slider hide-sm" id="rate-slider" type="range" min="0.5" max="4.0" step="0.05" value="${Math.min(4.0, targetRate)}" title="拖动调节 0.5x ~ 4.0x（点击数字可输入最高 16x）" />
        <span id="rate-hints" class="hint-wrap">${hintHtml}</span>
        <span class="sep"></span>
        ${presetHtml}
        ${hasVideo ? `
          <span class="sep"></span>
          <button class="btn ${inPiP ? 'pip-on' : ''}" id="pip-btn" title="切换悬浮画中画小窗 (快捷键 Alt + P)">
            📺 ${inPiP ? '退出小窗' : '画中画'}
          </button>
        ` : ''}
        <button class="btn" id="collapse-btn" title="收起为迷你胶囊">收起</button>
      </div>
    `;

    const badgeTrigger = shadow.getElementById('rate-badge-trigger');
    if (badgeTrigger) {
      badgeTrigger.onclick = () => {
        editingCustomRate = true;
        const inp = document.createElement('input');
        inp.id = 'custom-rate-input';
        inp.className = 'rate-input';
        inp.type = 'number';
        inp.min = '0.5';
        inp.max = '16';
        inp.step = '0.1';
        inp.value = String(targetRate);
        inp.title = '输入 0.5 ~ 16 倍速，回车确认，Esc 取消';
        badgeTrigger.replaceWith(inp);
        inp.focus();
        inp.select();

        let settled = false;
        const finish = commit => {
          if (settled) return;
          settled = true;
          editingCustomRate = false;
          if (commit) {
            const val = Number(inp.value);
            if (Number.isFinite(val) && val > 0) {
              setGlobalRate(val);
              return;
            }
          }
          renderBar();
        };

        inp.addEventListener('keydown', ev => {
          ev.stopPropagation();
          if (ev.key === 'Enter') {
            ev.preventDefault();
            finish(true);
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            finish(false);
          }
        });
        inp.addEventListener('blur', () => finish(true));
      };
    }

    shadow.querySelectorAll('[data-rate]').forEach(btn => {
      btn.onclick = () => setGlobalRate(Number(btn.getAttribute('data-rate')));
    });
    shadow.getElementById('step-down').onclick = () => setGlobalRate(targetRate - 0.25);
    shadow.getElementById('step-up').onclick = () => setGlobalRate(targetRate + 0.25);
    const rateSlider = shadow.getElementById('rate-slider');
    rateSlider.oninput = e => {
      targetRate = clampRate(Number(e.target.value));
      const badge = shadow.getElementById('rate-badge-trigger');
      if (badge) badge.textContent = formatRate(targetRate);
      const hintsEl = shadow.getElementById('rate-hints');
      if (hintsEl) hintsEl.innerHTML = buildHintPillsHtml(targetRate);
      shadow.querySelectorAll('[data-rate]').forEach(btn => {
        btn.classList.toggle('on', Math.abs(targetRate - Number(btn.getAttribute('data-rate'))) < 0.02);
      });
      syncRateAttributeToDom(targetRate, true);
    };
    rateSlider.onchange = e => setGlobalRate(Number(e.target.value));
    const pipBtn = shadow.getElementById('pip-btn');
    if (pipBtn) pipBtn.onclick = togglePiP;
    shadow.getElementById('collapse-btn').onclick = () => {
      collapsed = true;
      saveState(true);
      renderBar();
    };
  }

  function scanMedia() {
    const liveNow = isLiveMode();
    const list = getActiveMediaElements();
    if (!list.length && !liveNow) return;
    list.forEach(bindMediaEvents);
    if (liveNow) {
      clearDomRateAttrIfPresent();
    } else {
      syncRateAttributeToDom(targetRate, false);
    }
    mountBarIfNeeded();
    if (barMounted && lastRenderedLiveState !== liveNow) {
      renderBar();
    }
  }

  window.addEventListener('keydown', e => {
    if (!barMounted) return;
    if (editingCustomRate) return;
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      togglePiP();
    } else if (!isLiveMode() && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '[') {
        setGlobalRate(targetRate - 0.25);
      } else if (e.key === ']') {
        setGlobalRate(targetRate + 0.25);
      } else if (e.key === '\\') {
        setGlobalRate(1.0);
      }
    }
  });

  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([SPEED_STORAGE_KEY, COLLAPSED_STORAGE_KEY], res => {
        const existingAttr = document.documentElement && document.documentElement.getAttribute('data-chub-rate');
        if (!isLiveMode() && existingAttr && Number.isFinite(Number(existingAttr))) {
          targetRate = clampRate(Number(existingAttr));
        } else if (res && res[SPEED_STORAGE_KEY] !== undefined) {
          targetRate = clampRate(res[SPEED_STORAGE_KEY]);
        }
        if (res && res[COLLAPSED_STORAGE_KEY] !== undefined) {
          collapsed = Boolean(res[COLLAPSED_STORAGE_KEY]);
        }
        if (isLiveMode()) {
          clearDomRateAttrIfPresent();
        } else {
          syncRateAttributeToDom(targetRate, false);
        }
        scanMedia();
      });
    } else {
      scanMedia();
    }
  } catch (_) {
    scanMedia();
  }

  const observer = new MutationObserver(() => scanMedia());
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  setInterval(scanMedia, 1500);
})();
