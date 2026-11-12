(function () {
  'use strict';

  if (window.__CHUB_RATE_ENGINE_INSTALLED__) return;
  window.__CHUB_RATE_ENGINE_INSTALLED__ = true;

  const proto = typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.prototype : null;
  if (!proto) return;

  const origRateDesc = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
  const origDefRateDesc = Object.getOwnPropertyDescriptor(proto, 'defaultPlaybackRate');
  const origPlay = proto.play;
  const origLoad = proto.load;

  if (!origRateDesc || !origRateDesc.get || !origRateDesc.set) return;

  const MIN_RATE = 0.5;
  const MAX_RATE = 16.0;
  const WORKER_TICK_MS = 28;
  const LIVE_DOM_SELECTOR =
    '.live__container, .J_live, .xt_video_player_controls.live_control, xt-playtype.xt_video_play_type';

  const mediaSet = new Set();
  const lockedByEngine = new WeakSet();
  const liveReleased = new WeakSet();
  const lastPulseMap = new WeakMap();
  let allowNativeMenuSetUntil = 0;
  let lastSyncedPlayerInternalRate = null;
  let lastInternalSyncMs = 0;

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

  function isLiveContextOrMedia(m) {
    try {
      if (/^\/lesson\/fullscreen\//i.test(location.pathname)) return true;
      if (document.querySelector && document.querySelector(LIVE_DOM_SELECTOR)) return true;
    } catch (_) {}
    if (m && isLiveMediaElement(m)) return true;
    for (const item of mediaSet) {
      if (item && item.isConnected !== false && isLiveMediaElement(item)) return true;
    }
    return false;
  }

  function safeSetNativeRate(media, rate, syncDefault) {
    if (!media || !Number.isFinite(rate)) return;
    if (syncDefault && origDefRateDesc && origDefRateDesc.set) {
      try {
        origDefRateDesc.set.call(media, rate);
      } catch (_) {}
    }
    try {
      origRateDesc.set.call(media, rate);
    } catch (_) {}
  }

  function releaseIfPreviouslyLocked(media) {
    if (!media || !lockedByEngine.has(media) || liveReleased.has(media)) return;
    liveReleased.add(media);
    safeSetNativeRate(media, 1.0, true);
  }

  function parseDesiredRate(media) {
    if (isLiveContextOrMedia(media)) {
      if (media) releaseIfPreviouslyLocked(media);
      return null;
    }
    const root = document.documentElement;
    if (!root) return null;
    const raw = root.getAttribute('data-chub-rate');
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < MIN_RATE || n > MAX_RATE) return null;
    return Math.round(n * 100) / 100;
  }

  function markHasMedia() {
    try {
      if (document.documentElement && document.documentElement.getAttribute('data-chub-has-media') !== '1') {
        document.documentElement.setAttribute('data-chub-has-media', '1');
      }
    } catch (_) {}
  }

  function enablePitchPreserve(media) {
    try {
      if ('preservesPitch' in media) media.preservesPitch = true;
      else if ('webkitPreservesPitch' in media) media.webkitPreservesPitch = true;
      else if ('mozPreservesPitch' in media) media.mozPreservesPitch = true;
    } catch (_) {}
  }

  function applyHardwareRate(media, rate) {
    if (!media || !Number.isFinite(rate)) return;
    if (isLiveContextOrMedia(media)) {
      releaseIfPreviouslyLocked(media);
      return;
    }
    mediaSet.add(media);
    lockedByEngine.add(media);
    markHasMedia();
    enablePitchPreserve(media);
    try {
      if (origDefRateDesc && origDefRateDesc.set) {
        origDefRateDesc.set.call(media, rate);
      }
    } catch (_) {}
    try {
      const cur = origRateDesc.get.call(media);
      if (Math.abs(cur - rate) > 0.01) {
        origRateDesc.set.call(media, rate);
      }
    } catch (_) {}
  }

  // Align xtPlayer's internal speed slot [2, 1.5, 1.25, 1, 0.5] when available
  function syncCustomPlayerInternalSpeed(desired) {
    if (!Number.isFinite(desired) || isLiveContextOrMedia(null)) return;
    const speedBtn = document.querySelector && document.querySelector('xt-speedbutton.xt_video_player_speed');
    if (!speedBtn) return;

    const slots = [2, 1.5, 1.25, 1, 0.5];
    let nearest = 1;
    let bestDiff = Infinity;
    for (const s of slots) {
      const diff = Math.abs(Math.min(2, desired) - s);
      if (diff < bestDiff) {
        bestDiff = diff;
        nearest = s;
      }
    }
    const targetLi = speedBtn.querySelector(`li[data-speed="${nearest}"]`);
    if (!targetLi) return;
    if (
      lastSyncedPlayerInternalRate === nearest &&
      targetLi.classList.contains('xt_video_player_common_active')
    ) {
      return;
    }
    lastSyncedPlayerInternalRate = nearest;
    try {
      speedBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 12, clientY: 12 }));
      speedBtn.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 28, clientY: 28 }));
      targetLi.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 28, clientY: 28 }));
      speedBtn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    } catch (_) {}
  }

  function collectAllMedia() {
    if (document.querySelectorAll) {
      const domMedia = document.querySelectorAll('video, audio');
      if (domMedia.length > 0) markHasMedia();
      domMedia.forEach(m => mediaSet.add(m));
    }
    for (const item of Array.from(mediaSet)) {
      if (item && item.isConnected === false && item.paused) {
        mediaSet.delete(item);
      }
    }
    return Array.from(mediaSet);
  }

  function enforceRateOnAllMedia() {
    const all = collectAllMedia();
    if (isLiveContextOrMedia(null)) {
      for (const m of all) releaseIfPreviouslyLocked(m);
      return;
    }
    const desired = parseDesiredRate(null);
    if (desired === null) return;
    syncCustomPlayerInternalSpeed(desired);
    for (const m of all) {
      if (isLiveContextOrMedia(m)) {
        releaseIfPreviouslyLocked(m);
        continue;
      }
      applyHardwareRate(m, desired);
    }
  }

  // Only allow genuine human clicks (e.isTrusted === true) on native speed menus to change desired rate
  function markNativeMenuGesture(e) {
    if (!e || !e.isTrusted) return;
    const t = e.target;
    if (!t || !t.closest) return;
    const menuHit = t.closest(
      '[data-speed], .rate-options-pc, .pseudo-fullscreen-rate-options, .rate-config-box, .xt_video_player_list_set, .vjs-playback-rate'
    );
    if (menuHit) {
      allowNativeMenuSetUntil = Date.now() + 450;
    }
  }

  window.addEventListener('pointerdown', markNativeMenuGesture, true);
  window.addEventListener('mousedown', markNativeMenuGesture, true);
  window.addEventListener('click', markNativeMenuGesture, true);

  try {
    Object.defineProperty(proto, 'playbackRate', {
      configurable: true,
      enumerable: true,
      get: function () {
        return origRateDesc.get.call(this);
      },
      set: function (val) {
        mediaSet.add(this);
        markHasMedia();
        const numVal = Number(val);

        if (isLiveContextOrMedia(this)) {
          liveReleased.add(this);
          if (Number.isFinite(numVal)) {
            safeSetNativeRate(this, numVal, false);
          }
          return;
        }

        enablePitchPreserve(this);
        const desired = parseDesiredRate(this);

        if (desired !== null) {
          if (
            Date.now() < allowNativeMenuSetUntil &&
            Number.isFinite(numVal) &&
            numVal >= MIN_RATE &&
            numVal <= MAX_RATE
          ) {
            allowNativeMenuSetUntil = 0;
            const clean = Math.round(numVal * 100) / 100;
            if (document.documentElement) {
              document.documentElement.setAttribute('data-chub-rate', String(clean));
            }
            lockedByEngine.add(this);
            safeSetNativeRate(this, clean, true);
            try {
              window.dispatchEvent(new CustomEvent('chub:native-rate-selected', { detail: { rate: clean } }));
            } catch (_) {}
            return;
          }
          // Keep desired rate locked against programmatic resets
          lockedByEngine.add(this);
          safeSetNativeRate(this, desired, true);
          return;
        }

        if (Number.isFinite(numVal)) {
          safeSetNativeRate(this, numVal, false);
        }
      }
    });
  } catch (_) {}

  try {
    if (origDefRateDesc && origDefRateDesc.get && origDefRateDesc.set) {
      Object.defineProperty(proto, 'defaultPlaybackRate', {
        configurable: true,
        enumerable: true,
        get: function () {
          return origDefRateDesc.get.call(this);
        },
        set: function (val) {
          mediaSet.add(this);
          const numVal = Number(val);
          if (isLiveContextOrMedia(this)) {
            if (Number.isFinite(numVal)) {
              try {
                origDefRateDesc.set.call(this, numVal);
              } catch (_) {}
            }
            return;
          }
          const desired = parseDesiredRate(this);
          if (desired !== null) {
            try {
              origDefRateDesc.set.call(this, desired);
            } catch (_) {}
            return;
          }
          if (Number.isFinite(numVal)) {
            try {
              origDefRateDesc.set.call(this, numVal);
            } catch (_) {}
          }
        }
      });
    }
  } catch (_) {}

  if (typeof origPlay === 'function') {
    proto.play = function () {
      mediaSet.add(this);
      markHasMedia();
      if (!isLiveContextOrMedia(this)) {
        const desired = parseDesiredRate(this);
        if (desired !== null) {
          applyHardwareRate(this, desired);
        }
      } else {
        releaseIfPreviouslyLocked(this);
      }
      return origPlay.apply(this, arguments);
    };
  }

  if (typeof origLoad === 'function') {
    proto.load = function () {
      mediaSet.add(this);
      markHasMedia();
      const live = isLiveContextOrMedia(this);
      const desired = live ? null : parseDesiredRate(this);
      if (desired !== null && origDefRateDesc && origDefRateDesc.set) {
        try {
          origDefRateDesc.set.call(this, desired);
        } catch (_) {}
      }
      const ret = origLoad.apply(this, arguments);
      if (desired !== null && !isLiveContextOrMedia(this)) {
        applyHardwareRate(this, desired);
      }
      return ret;
    };
  }

  const MEDIA_LIFECYCLE_EVENTS = [
    'loadstart',
    'loadedmetadata',
    'loadeddata',
    'canplay',
    'play',
    'playing',
    'ratechange',
    'durationchange',
    'emptied'
  ];
  const onMediaLifecycle = e => {
    const t = e && e.target;
    if (t && (t instanceof HTMLMediaElement || t.tagName === 'VIDEO' || t.tagName === 'AUDIO')) {
      mediaSet.add(t);
      markHasMedia();
      if (isLiveContextOrMedia(t)) {
        releaseIfPreviouslyLocked(t);
        return;
      }
      const desired = parseDesiredRate(t);
      if (desired !== null && Math.abs(origRateDesc.get.call(t) - desired) > 0.015) {
        applyHardwareRate(t, desired);
      }
    }
  };
  for (const evt of MEDIA_LIFECYCLE_EVENTS) {
    window.addEventListener(evt, onMediaLifecycle, true);
  }

  window.addEventListener('chub:apply-rate', () => {
    enforceRateOnAllMedia();
  });

  const bindRootObserver = () => {
    if (!document.documentElement) {
      setTimeout(bindRootObserver, 30);
      return;
    }
    const obs = new MutationObserver(() => enforceRateOnAllMedia());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-chub-rate'] });
    enforceRateOnAllMedia();
  };
  bindRootObserver();

  // Adaptive sub-second timeupdate cadence keeps media step delta < 1.0s up to 16.0x
  function pulseTick() {
    const all = collectAllMedia();
    if (isLiveContextOrMedia(null)) {
      for (const m of all) releaseIfPreviouslyLocked(m);
      return;
    }

    const now = Date.now();
    const desired = parseDesiredRate(null);
    if (desired !== null && now - lastInternalSyncMs >= 160) {
      lastInternalSyncMs = now;
      syncCustomPlayerInternalSpeed(desired);
    }

    for (const m of all) {
      if (isLiveContextOrMedia(m)) {
        releaseIfPreviouslyLocked(m);
        continue;
      }
      if (desired !== null && Math.abs(origRateDesc.get.call(m) - desired) > 0.015) {
        applyHardwareRate(m, desired);
      }
      let actualRate = 1.0;
      try {
        actualRate = origRateDesc.get.call(m);
      } catch (_) {}

      if (actualRate > 1.05 && !m.paused && !m.ended && !m.seeking && m.readyState >= 2) {
        const minIntervalMs = Math.max(28, Math.min(160, Math.floor(420 / actualRate)));
        const curTime = Number(m.currentTime);
        const prev = lastPulseMap.get(m);
        const wallDue = !prev || now - prev.ts >= minIntervalMs;
        const mediaDue = Number.isFinite(curTime) && (!prev || Math.abs(curTime - prev.ct) >= 0.36);
        if (wallDue || mediaDue) {
          lastPulseMap.set(m, { ts: now, ct: Number.isFinite(curTime) ? curTime : 0 });
          try {
            m.dispatchEvent(new Event('timeupdate'));
          } catch (_) {}
        }
      }
    }
  }

  let workerStarted = false;
  try {
    const blob = new Blob([`setInterval(function(){postMessage(1)},${WORKER_TICK_MS});`], {
      type: 'application/javascript'
    });
    const wUrl = URL.createObjectURL(blob);
    const worker = new Worker(wUrl);
    worker.onmessage = pulseTick;
    workerStarted = true;
  } catch (_) {}

  if (!workerStarted) {
    setInterval(pulseTick, WORKER_TICK_MS);
  }
})();
