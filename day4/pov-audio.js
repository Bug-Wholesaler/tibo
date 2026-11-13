'use strict';

/**
 * 纯 WebAudio 第一人称修罗场音效合成器 (无外链音频资源依赖)
 */
window.PovAudio = (function () {
  let ctx = null;
  let muted = false;
  let lastTick = 0;
  let hbTimer = null;

  function ensureCtx() {
    if (muted) return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, dur, type = 'sine', gainVal = 0.08, delay = 0, sweepTo = null) {
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainVal, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, filterFreq = 2400, gainVal = 0.14, delay = 0) {
    const c = ensureCtx();
    if (!c) return;
    const sr = c.sampleRate;
    const len = Math.max(1, Math.floor(sr * dur));
    const buf = c.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.45));
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = filterFreq;
    flt.Q.value = 1.6;
    const g = c.createGain();
    const t0 = c.currentTime + delay;
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(c.destination);
    src.start(t0);
  }

  const TIMBRES = {
    lori: { freq: 540, type: 'triangle', vol: 0.042 },
    alice: { freq: 690, type: 'sine', vol: 0.045 },
    kimberly: { freq: 410, type: 'sine', vol: 0.04 },
    zero: { freq: 810, type: 'square', vol: 0.024 },
    lisa: { freq: 360, type: 'triangle', vol: 0.046 },
    me: { freq: 270, type: 'triangle', vol: 0.036 },
    system: { freq: 940, type: 'square', vol: 0.022 },
  };

  return {
    isMuted: () => muted,
    setMuted(v) {
      muted = Boolean(v);
      if (muted && hbTimer) {
        clearInterval(hbTimer);
        hbTimer = null;
      }
      return muted;
    },
    toggleMute() {
      return this.setMuted(!muted);
    },
    typeTick(speakerId) {
      const now = performance.now ? performance.now() : Date.now();
      if (now - lastTick < 42) return;
      lastTick = now;
      const cfg = TIMBRES[speakerId] || { freq: 460, type: 'sine', vol: 0.03 };
      const jitter = (Math.random() - 0.5) * 44;
      tone(cfg.freq + jitter, 0.042, cfg.type, cfg.vol);
    },
    click() {
      tone(580, 0.06, 'triangle', 0.06, 0, 320);
    },
    choice() {
      tone(523.25, 0.07, 'sine', 0.07, 0);
      tone(659.25, 0.09, 'sine', 0.07, 0.05);
    },
    scissorSlash() {
      // 金属双刃咔嚓剪断皮衣音效
      noiseBurst(0.11, 5200, 0.22, 0);
      tone(1950, 0.08, 'sawtooth', 0.11, 0.01, 420);
      noiseBurst(0.16, 3800, 0.24, 0.11);
      tone(2200, 0.14, 'sawtooth', 0.12, 0.12, 310);
      tone(110, 0.24, 'triangle', 0.16, 0.12, 48);
    },
    heartbeat(strong = false) {
      const vol = strong ? 0.24 : 0.14;
      tone(68, 0.14, 'sine', vol, 0, 42);
      tone(82, 0.18, 'sine', vol * 0.85, 0.16, 38);
    },
    ecgBeep(urgent = false) {
      tone(urgent ? 1320 : 1046, 0.09, 'sine', 0.065, 0);
      if (urgent) {
        tone(1320, 0.09, 'sine', 0.065, 0.14);
      }
    },
    tinnitus() {
      // 高血压耳鸣嗡响
      this.heartbeat(true);
      tone(2880, 0.65, 'sine', 0.032, 0.05, 2760);
    },
    glassCrack() {
      noiseBurst(0.14, 6400, 0.18, 0);
      tone(1480, 0.12, 'triangle', 0.08, 0.02, 560);
      tone(2120, 0.09, 'sine', 0.05, 0.05, 920);
    },
    shutter() {
      noiseBurst(0.05, 4200, 0.16, 0);
      noiseBurst(0.06, 2600, 0.14, 0.07);
    },
    imPing() {
      tone(880, 0.06, 'sine', 0.07, 0);
      tone(1174.66, 0.1, 'sine', 0.07, 0.06);
    },
    buffett() {
      tone(523.25, 0.11, 'triangle', 0.09, 0);
      tone(659.25, 0.11, 'triangle', 0.09, 0.09);
      tone(783.99, 0.11, 'triangle', 0.09, 0.18);
      tone(1046.5, 0.26, 'triangle', 0.1, 0.27);
    },
    alarm() {
      tone(740, 0.18, 'sawtooth', 0.09, 0, 620);
      tone(587, 0.18, 'sawtooth', 0.09, 0.2, 490);
    },
    ending(kind) {
      if (kind === 'BE') {
        tone(311.13, 0.26, 'sawtooth', 0.07, 0);
        tone(277.18, 0.26, 'sawtooth', 0.07, 0.24);
        tone(220.0, 0.55, 'sawtooth', 0.08, 0.48, 146);
      } else {
        tone(523.25, 0.18, 'triangle', 0.09, 0);
        tone(659.25, 0.18, 'triangle', 0.09, 0.14);
        tone(783.99, 0.18, 'triangle', 0.09, 0.28);
        tone(1046.5, 0.45, 'triangle', 0.1, 0.42);
      }
    },
  };
})();
