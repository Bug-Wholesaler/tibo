/**
 * 《恋与皮衣：今夜无人加仓》- 纯原生 Web Audio 动态合成音效引擎
 * 零外部音频依赖，开箱即用，支持一键静音与自动解锁音频上下文
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.hasUnlocked = false;
  }

  // 懒加载初始化 AudioContext
  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.hasUnlocked = true;
      }).catch(() => {});
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  // 基础振荡器发声封装
  playTone(freq, duration, type = 'sine', gainVal = 0.15, pitchDecay = 0) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (pitchDecay !== 0) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + pitchDecay), now + duration);
      }

      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      // 忽略部分移动端后台策略警告
    }
  }

  // 1. 打字机清脆滴答音（带轻微随机微调，避免机械刺耳）
  typewriter() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const baseFreq = 950 + (Math.random() * 200 - 100);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  // 2. 对话框推进 / 通用点击
  click() {
    this.playTone(600, 0.06, 'triangle', 0.1, 200);
  }

  // 3. 选项悬浮轻音
  hover() {
    this.playTone(480, 0.05, 'sine', 0.04);
  }

  // 4. 心动值上升：粉红泡泡琶音
  loveUp() {
    if (this.isMuted) return;
    this.initContext();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 0.22, 'sine', 0.12);
      }, idx * 70);
    });
  }

  // 5. 心动值下降：落寞双音
  loveDown() {
    if (this.isMuted) return;
    this.initContext();
    this.playTone(392.00, 0.2, 'sawtooth', 0.08, -120);
    setTimeout(() => {
      this.playTone(261.63, 0.3, 'sawtooth', 0.09, -80);
    }, 120);
  }

  // 6. 股价暴涨：金币清脆叮当声
  stockUp() {
    if (this.isMuted) return;
    this.initContext();
    this.playTone(1318.51, 0.15, 'triangle', 0.15); // E6
    setTimeout(() => {
      this.playTone(1760.00, 0.35, 'sine', 0.2); // A6
    }, 90);
  }

  // 7. 股价暴跌：急促红字警报
  stockDown() {
    if (this.isMuted) return;
    this.initContext();
    this.playTone(240, 0.25, 'sawtooth', 0.18, -100);
    setTimeout(() => {
      this.playTone(180, 0.3, 'sawtooth', 0.2, -80);
    }, 140);
  }

  // 8. 挽留票增加：清脆木槌盖章定音
  voteUp() {
    if (this.isMuted) return;
    this.initContext();
    this.playTone(280, 0.18, 'triangle', 0.25, -150);
    setTimeout(() => {
      this.playTone(660, 0.22, 'sine', 0.15);
    }, 60);
  }

  // 9. 手机来电与振动：拟真美式电铃与马达嗡嗡声
  phoneRing() {
    if (this.isMuted) return;
    this.initContext();
    // 双频振动
    const ringPair = () => {
      this.playTone(853, 0.18, 'sine', 0.12);
      this.playTone(960, 0.18, 'sine', 0.12);
    };
    ringPair();
    setTimeout(ringPair, 260);
  }

  // 10. QTE 烘烤过程指针扫荡微音
  qteTick() {
    this.playTone(700, 0.03, 'sine', 0.05);
  }

  // 11. QTE 成功：端出 5090 金光灿灿音
  qteSuccess() {
    if (this.isMuted) return;
    this.initContext();
    const chords = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    chords.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 0.35, 'triangle', 0.14);
      }, idx * 60);
    });
  }

  // 12. QTE 失败：焦糊味水花扑灭声
  qteFail() {
    if (this.isMuted) return;
    this.initContext();
    this.playTone(200, 0.35, 'sawtooth', 0.2, -120);
    setTimeout(() => {
      this.playTone(120, 0.4, 'triangle', 0.22, -60);
    }, 100);
  }

  // 13. 一键抄底驳回：华尔街刺耳风控蜂鸣 Buzzer
  reject() {
    if (this.isMuted) return;
    this.initContext();
    this.playTone(150, 0.2, 'sawtooth', 0.3);
    setTimeout(() => {
      this.playTone(150, 0.25, 'sawtooth', 0.35);
    }, 180);
  }

  // 14. 结局 TE/HE 达成乐章
  endingTe() {
    if (this.isMuted) return;
    this.initContext();
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.6, 'sine', 0.15);
      }, i * 110);
    });
  }

  // 15. 结局 BE 萧瑟寒风单音
  endingBe() {
    if (this.isMuted) return;
    this.initContext();
    this.playTone(330, 0.8, 'sine', 0.18, -120);
  }

  // 16. 狗仔快门 + 俏皮吃瓜滑音 (小报号外 / 吃瓜名场面)
  gossip() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 快门咔嚓白噪脉冲
      if (this.ctx.createBuffer) {
        const bufSize = Math.floor(this.ctx.sampleRate * 0.045);
        const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2400, now);
        filter.Q.setValueAtTime(1.2, now);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.22, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.ctx.destination);
        noise.start(now);
      }

      // 双击机械快门声 + 俏皮上扬吃瓜滑音
      this.playTone(1750, 0.03, 'square', 0.1, -300);
      setTimeout(() => {
        this.playTone(1450, 0.035, 'triangle', 0.1, -200);
      }, 45);
      setTimeout(() => {
        this.playTone(540, 0.16, 'sine', 0.14, 580);
      }, 95);
      setTimeout(() => {
        this.playTone(1080, 0.14, 'triangle', 0.12, -220);
      }, 220);
    } catch (e) {}
  }

  // 17. 泼冰水 / 清脆巴掌醒脑白噪爆裂音
  slap() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      if (this.ctx.createBuffer) {
        const bufSize = Math.floor(this.ctx.sampleRate * 0.16);
        const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          const env = i < bufSize * 0.08 ? i / (bufSize * 0.08) : Math.exp(-(i - bufSize * 0.08) / (bufSize * 0.22));
          data[i] = (Math.random() * 2 - 1) * env;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1350, now);
        filter.Q.setValueAtTime(0.9, now);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.32, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.ctx.destination);
        noise.start(now);
      }

      // 低频闷响 + 水花飞溅高频尾音
      this.playTone(230, 0.09, 'triangle', 0.26, -150);
      setTimeout(() => {
        this.playTone(1580, 0.09, 'sine', 0.09, -680);
      }, 35);
    } catch (e) {}
  }

  // 18. 救护车双音鸣笛 (老黄血压拉爆送进鲍姐医疗部)
  siren() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const bursts = [
      { freq: 880, delay: 0 },
      { freq: 660, delay: 180 },
      { freq: 880, delay: 360 },
      { freq: 660, delay: 540 }
    ];
    bursts.forEach((b) => {
      setTimeout(() => {
        this.playTone(b.freq, 0.17, 'triangle', 0.18, b.freq === 880 ? 35 : -35);
      }, b.delay);
    });
  }
}

window.sound = new SoundEngine();
