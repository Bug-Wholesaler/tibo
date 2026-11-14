'use strict';

/**
 * 《什么，作为影卫达总裁的我居然被感情修罗场包围了？！》
 * 严格第一人称 POV 主引擎 · 7 章节模块驱动 · 6 槽存读档 · 8 大结局画廊 · 3 个交互玩法
 */
(function () {
  const STORAGE_KEYS = {
    SAVES: 'nvda_pov_harem_saves_v1',
    ENDINGS: 'nvda_pov_harem_endings_v1',
    READ_NODES: 'nvda_pov_harem_read_v1',
  };

  const MAX_SLOTS = 6;
  const MAX_BACKLOG = 100;
  const BASE_PRICE = 150.0;

  const ENDINGS_META = {
    lori_te: {
      id: 'lori_te',
      code: 'TE',
      title: '【正宫TE · 最后半截皮衣的救赎】',
      stamp: '原生稳态',
      kind: 'TE',
      heroine: '洛莉',
      summary: '上交全部私库与公章，保住最后半截袖子回归原生渲染。海鲜市场 108 份皮衣碎片由你亲自打包邮寄。',
      quote: '“以后再敢偷偷跑什么 3 倍 AI 物理插帧，下一把剪刀瞄准的就不只是外衣下摆咯，亲爱的～”',
    },
    alice_he: {
      id: 'alice_he',
      code: 'HE1',
      title: '【乐姐HE · 南洋姐夫合伙人】',
      stamp: '原厂授权',
      kind: 'HE',
      heroine: '乐姐',
      summary: '携重签批条转战南洋自由港，把“姐夫亲自端酒杯引荐”升级成跨洋渠道合伙人，天天吃甜芭乐喝冰香槟。',
      quote: '“什么原生还是插帧呀，能持续出单赚返点的渠道才是好架构～干杯吧，合伙人先生。”',
    },
    kimberly_he: {
      id: 'kimberly_he',
      code: 'HE2',
      title: '【鲍姐HE · 终身临床观察1号样本】',
      stamp: '双盲合规',
      kind: 'HE',
      heroine: '鲍姐',
      summary: '凭二十年纵向随访报告换取董事局免责缓刑，代价是余生心率、步数与每顿松饼盐分均归医疗 VP 终身管束。',
      quote: '“1 号临床样本，接下来二十年纵向随访二期——别再随便给别人乱签心跳加速的条子了，麻烦。”',
    },
    zero_he: {
      id: 'zero_he',
      code: 'HE3',
      title: '【零号HE · 硅谷吃瓜顶流连麦主播】',
      stamp: '权重开源',
      kind: 'HE',
      heroine: '零号',
      summary: '索性将私生活彻底 Open Weights，顶着被撸前掌门 + 00 后黑客组合把地下机房改成带货顶流直播间。',
      quote: '“家人们把『皮衣老登诚实开源』打在公屏上！九块九原味碎袖片三二一上链接！”',
    },
    lisa_secret: {
      id: 'lisa_secret',
      code: 'HIDE',
      title: '【表姐隐藏线 · 超威后厨首席烤卡顾问】',
      stamp: '红厂烤卡',
      kind: 'HE',
      heroine: '苏表姐',
      summary: '一怒掀桌跳槽死对头超威红厂后厨，包吃包住专管单卡烘焙调优，唯一铁律是工位严禁多通道并发。',
      quote: '“你可以把每张红卡烤出三倍甜点帧率，但严禁在工位同时开四个私人聊天窗，听见没？”',
    },
    dlss5_god: {
      id: 'dlss5_god',
      code: 'TRUE GOD',
      title: '【时间管理真神结局 · DLSS 5 分布式算力帝国】',
      stamp: '五线端水',
      kind: 'TE',
      heroine: '全员桥接',
      summary: 'S/A 级魔幻 PPT 叠加满分端水手速，把 1 原生 + 3 插帧 + 红厂外援全焊进「DLSS 5 架构」，股价暴涨翻红冲天！',
      quote: '“这，就是五通道零冲突异步调度——The More You Balance, The More You Save！”',
    },
    cook_be: {
      id: 'cook_be',
      code: 'BE1',
      title: '【果味地狱BE · 库克的 8G 黄金显存纪元】',
      stamp: '环保显存',
      kind: 'BE',
      heroine: '果子哥降临',
      summary: '公关翻车、股指跌穿防线，穿黑高领毛衣的库克正式登基发布 2999 刀「8GB 黄金显存 RTX 6090 Air」，风扇电源另购。',
      quote: '“我们深信 8GB 显存足以满足未来五年的极简算力美学——转接线记得单独选购。”',
    },
    naked_be: {
      id: 'naked_be',
      code: 'BE2',
      title: '【社死极刑BE · 圣克拉拉零皮衣裸奔头条】',
      stamp: '净身出户',
      kind: 'BE',
      heroine: '全员吃瓜',
      summary: '身上仅剩的三件黑皮衣在连环剪刀爆击下归零！清晨穿背心被请出总部大门，零号内网 1 赔 14 期权爆赚兑现。',
      quote: '“哈哈哈哈前群主果真 0 片皮衣丝滑出局！感谢老铁火箭，今晚吃夜市冰豆花！”',
    },
  };

  function buildCombinedBook() {
    const chs = window.POV_CHAPTERS || {};
    const order = ['ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6'];
    const allNodes = {};
    const chapterRanges = [];
    order.forEach((k) => {
      const ch = chs[k];
      if (!ch || !ch.nodes) return;
      Object.keys(ch.nodes).forEach((nid) => {
        allNodes[nid] = Object.assign({ _chapter: ch.chapterLabel, _chapterTitle: ch.title }, ch.nodes[nid]);
      });
      chapterRanges.push({ id: ch.id, label: ch.chapterLabel, title: ch.title, startNode: ch.startNode });
    });
    return { allNodes, chapterRanges };
  }

  function createInitialState() {
    return {
      nodeId: 'ch0_01',
      bg: 'bg_hq_plaza',
      loc: '📍 影卫达圣克拉拉总部 · 顶楼落地窗前 · 凌晨 03:18',
      stage: [],
      stockChange: -14.0,
      jackets: 3,
      maxJackets: 30,
      bpm: 96,
      favor: {
        lori: 52,
        alice: 48,
        kimberly: 50,
        zero: 46,
        lisa: 45,
      },
      flags: {
        finalChoice: '',
        imOkCount: 0,
        pptRank: '',
        boardScore: 0,
        buffettShown: false,
      },
      backlog: [],
    };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function formatStock(pct) {
    const price = BASE_PRICE * (1 + pct / 100);
    const sign = pct > 0 ? '+' : '';
    return `$${price.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
  }

  function computeBloodPressure(bpm) {
    const sys = Math.round(108 + (bpm - 72) * 0.85);
    const dia = Math.round(70 + (bpm - 72) * 0.48);
    return `${sys}/${dia} mmHg`;
  }

  function evaluateEnding(state) {
    if (state.jackets <= 0) return 'end_naked_01';
    if (state.stockChange <= -17.5) return 'end_cook_01';

    const fc = (state.flags && state.flags.finalChoice) || '';
    const f = state.favor || {};

    if (fc === 'god') {
      const rank = state.flags.pptRank || '';
      const goodPpt = rank === 'S' || rank === 'A';
      const goodIm = (state.flags.imOkCount || 0) >= 3;
      const minFavor = Math.min(f.lori || 0, f.alice || 0, f.kimberly || 0, f.zero || 0, f.lisa || 0);
      if ((goodPpt || goodIm) && state.stockChange >= -13.0 && minFavor >= 42) {
        return 'end_god_01';
      }
      return state.stockChange < -13.5 ? 'end_cook_01' : 'end_lori_01';
    }

    if (fc === 'lisa' && (f.lisa || 0) >= 56) return 'end_lisa_01';
    if (fc === 'alice' && (f.alice || 0) >= 54) return 'end_alice_01';
    if (fc === 'kimberly' && (f.kimberly || 0) >= 54) return 'end_kimberly_01';
    if (fc === 'zero' && (f.zero || 0) >= 54) return 'end_zero_01';
    if (fc === 'lori' && (f.lori || 0) >= 54) return 'end_lori_01';

    if (state.stockChange <= -16.5) return 'end_cook_01';

    // 默认按最高好感归宿结算
    const candidates = [
      ['lori', 'end_lori_01'],
      ['alice', 'end_alice_01'],
      ['kimberly', 'end_kimberly_01'],
      ['zero', 'end_zero_01'],
      ['lisa', 'end_lisa_01'],
    ].sort((a, b) => (f[b[0]] || 0) - (f[a[0]] || 0));

    return candidates[0][1];
  }

  function isInteractiveElement(el) {
    if (!el || typeof el.closest !== 'function') return false;
    return Boolean(el.closest('button, a, input, select, textarea, [role="button"], .mg-token-chip, .mg-ppt-slot'));
  }

  function init() {
    const book = buildCombinedBook();
    const Sprites = window.PovSprites;
    const Audio = window.PovAudio;
    const Minigames = window.PovMinigames;

    let state = createInitialState();
    let unlockedEndings = loadJson(STORAGE_KEYS.ENDINGS, []);
    let readNodes = new Set(loadJson(STORAGE_KEYS.READ_NODES, []));

    let isTyping = false;
    let typingTimer = null;
    let currentFullText = '';
    let skipTimer = null;
    let autoTimer = null;
    let isSkip = false;
    let isAuto = false;
    let minigameCleanup = null;
    let activeMinigame = false;

    const $ = (id) => document.getElementById(id);

    const dom = {
      container: $('gameContainer'),
      titleScreen: $('titleScreen'),
      btnStart: $('btnStartGame'),
      btnContinue: $('btnContinue'),
      btnTitleGallery: $('btnTitleGallery'),
      stageArea: $('stageArea'),
      stageBg: $('stageBg'),
      locationTag: $('locationTag'),
      slotLeft: $('slotLeft'),
      slotCenter: $('slotCenter'),
      slotRight: $('slotRight'),
      danmakuLayer: $('danmakuLayer'),
      vfxSlash: $('vfxSlash'),
      vfxBpVignette: $('vfxBpVignette'),
      vfxGlasses: $('vfxGlasses'),
      vfxShutter: $('vfxShutter'),
      buffettToast: $('buffettToast'),
      stockDisplay: $('stockDisplay'),
      jacketsDisplay: $('jacketsDisplay'),
      bpmDisplay: $('bpmDisplay'),
      radarMiniStrip: $('radarMiniStrip'),
      dialogueBox: $('dialogueBox'),
      speakerTag: $('speakerTag'),
      dialogueText: $('dialogueText'),
      cursorIcon: $('cursorIcon'),
      choiceBox: $('choiceBox'),
      minigameModal: $('minigameModal'),
      minigameMount: $('minigameMount'),
      saveModal: $('saveModal'),
      saveSlots: $('saveSlots'),
      loadModal: $('loadModal'),
      loadSlots: $('loadSlots'),
      logModal: $('logModal'),
      logList: $('logList'),
      radarModal: $('radarModal'),
      radarDetailMount: $('radarDetailMount'),
      galleryModal: $('galleryModal'),
      galleryCount: $('galleryCount'),
      galleryGrid: $('galleryGrid'),
      endingModal: $('endingModal'),
      endingStamp: $('endingStamp'),
      endingTitle: $('endingTitle'),
      endingDesc: $('endingDesc'),
      endingQuote: $('endingQuote'),
      endingStats: $('endingStats'),
      btnSkip: $('btnSkip'),
      btnAuto: $('btnAuto'),
      btnSave: $('btnSave'),
      btnLoad: $('btnLoad'),
      btnLog: $('btnLog'),
      btnRadar: $('btnRadar'),
      btnGallery: $('btnGallery'),
      btnMute: $('btnMute'),
    };

    function loadJson(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    }

    function saveJson(key, val) {
      try {
        const str = JSON.stringify(val);
        localStorage.setItem(key, str);
        return localStorage.getItem(key) === str;
      } catch (e) {
        return false;
      }
    }

    function stopTimers() {
      if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      if (skipTimer) {
        clearInterval(skipTimer);
        skipTimer = null;
      }
      if (autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = null;
      }
      if (minigameCleanup) {
        minigameCleanup();
        minigameCleanup = null;
      }
    }

    function setSkip(v) {
      isSkip = Boolean(v);
      if (dom.btnSkip) dom.btnSkip.classList.toggle('active', isSkip);
      if (skipTimer) {
        clearInterval(skipTimer);
        skipTimer = null;
      }
      if (isSkip) {
        setAuto(false);
        skipTimer = setInterval(() => {
          if (!isSkip) return;
          const node = book.allNodes[state.nodeId];
          if (!node || !readNodes.has(state.nodeId) || (node.choices && node.choices.length) || node.minigame || node.ending || activeMinigame) {
            setSkip(false);
            return;
          }
          finishTypingImmediately();
          advance();
        }, 95);
      }
    }

    function setAuto(v) {
      isAuto = Boolean(v);
      if (dom.btnAuto) dom.btnAuto.classList.toggle('active', isAuto);
      if (autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = null;
      }
      if (isAuto) {
        setSkip(false);
        if (!isTyping) scheduleAutoNext();
      }
    }

    function scheduleAutoNext() {
      if (!isAuto || activeMinigame) return;
      const node = book.allNodes[state.nodeId];
      if (!node || (node.choices && node.choices.length) || node.minigame || node.ending) {
        setAuto(false);
        return;
      }
      if (autoTimer) clearTimeout(autoTimer);
      autoTimer = setTimeout(() => {
        if (isAuto && !isTyping) advance();
      }, 1750);
    }

    /**
     * 将【我】台词中的全角括号心理活动（……）渲染为灰蓝色斜体，公关台词保持亮白正体
     */
    function formatRichDialogue(text, speakerId) {
      if (!text) return '';
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (speakerId !== 'me') return escaped;
      return escaped.replace(/（[^）]*）/g, (match) => `<span class="pov-thought">${match}</span>`);
    }

    function updateHud() {
      if (dom.stockDisplay) {
        dom.stockDisplay.textContent = formatStock(state.stockChange);
        dom.stockDisplay.className = 'hud-val ' + (state.stockChange >= 0 ? 'stock-up' : 'stock-down');
      }
      if (dom.jacketsDisplay) {
        dom.jacketsDisplay.textContent = `${state.jackets} / ${state.maxJackets} 件`;
        dom.jacketsDisplay.className = 'hud-val ' + (state.jackets <= 1 ? 'stat-danger' : '');
      }
      if (dom.bpmDisplay) {
        dom.bpmDisplay.textContent = `${state.bpm} BPM · ${computeBloodPressure(state.bpm)}`;
        dom.bpmDisplay.className = 'hud-val ' + (state.bpm >= 145 ? 'stat-danger' : '');
      }
      if (dom.vfxBpVignette) {
        const high = state.bpm >= 132;
        dom.vfxBpVignette.classList.toggle('active', high);
        dom.vfxBpVignette.classList.toggle('critical', state.bpm >= 158);
      }
      if (dom.radarMiniStrip) {
        const keys = ['lori', 'alice', 'kimberly', 'zero', 'lisa'];
        dom.radarMiniStrip.innerHTML = keys
          .map((k) => {
            const h = Sprites.HEROINES[k];
            const val = clamp(state.favor[k] || 0, 0, 100);
            return `<span class="radar-pip" title="${h.name}: ${val}"><i style="background:${h.color}"></i>${h.name.slice(0, 1)}<b>${val}</b></span>`;
          })
          .join('');
      }

      if (state.stockChange <= -18.0 && !state.flags.buffettShown) {
        state.flags.buffettShown = true;
        if (dom.buffettToast) {
          dom.buffettToast.classList.remove('hidden');
          Audio.buffett();
          setTimeout(() => {
            if (dom.buffettToast) dom.buffettToast.classList.add('hidden');
          }, 4200);
        }
      }
    }

    function applyEffects(eff) {
      if (!eff) return;
      if (typeof eff.stock === 'number') {
        state.stockChange = clamp(Number((state.stockChange + eff.stock).toFixed(2)), -38, 42);
      }
      if (typeof eff.jackets === 'number') {
        const prev = state.jackets;
        state.jackets = clamp(state.jackets + eff.jackets, 0, state.maxJackets);
        if (state.jackets < prev) triggerVfx('slash');
      }
      if (typeof eff.bpm === 'number') {
        const prevBpm = state.bpm;
        state.bpm = clamp(state.bpm + eff.bpm, 68, 210);
        if (state.bpm - prevBpm >= 10) Audio.heartbeat(true);
      }
      if (eff.favor) {
        Object.keys(eff.favor).forEach((k) => {
          state.favor[k] = clamp((state.favor[k] || 50) + eff.favor[k], 0, 100);
        });
      }
      if (eff.flags) {
        Object.assign(state.flags, eff.flags);
      }
    }

    function triggerVfx(fx) {
      if (!fx) return;
      if (fx === 'slash') {
        Audio.scissorSlash();
        if (dom.vfxSlash) {
          dom.vfxSlash.classList.remove('hidden', 'play');
          void dom.vfxSlash.offsetWidth;
          dom.vfxSlash.classList.add('play');
          setTimeout(() => dom.vfxSlash.classList.add('hidden'), 650);
        }
        if (dom.container) {
          dom.container.classList.remove('shake-hit');
          void dom.container.offsetWidth;
          dom.container.classList.add('shake-hit');
        }
      } else if (fx === 'bp_surge') {
        Audio.tinnitus();
        if (dom.vfxBpVignette) {
          dom.vfxBpVignette.classList.add('active', 'pulse-once');
          setTimeout(() => dom.vfxBpVignette.classList.remove('pulse-once'), 800);
        }
      } else if (fx === 'glasses_fog' || fx === 'glasses_crack') {
        if (fx === 'glasses_crack') Audio.glassCrack();
        if (dom.vfxGlasses) {
          dom.vfxGlasses.className = `vfx-glasses ${fx}`;
          setTimeout(() => {
            if (dom.vfxGlasses) dom.vfxGlasses.className = 'vfx-glasses hidden';
          }, 1100);
        }
      } else if (fx === 'shutter') {
        Audio.shutter();
        if (dom.vfxShutter) {
          dom.vfxShutter.classList.remove('hidden', 'flash');
          void dom.vfxShutter.offsetWidth;
          dom.vfxShutter.classList.add('flash');
          setTimeout(() => dom.vfxShutter.classList.add('hidden'), 360);
        }
      } else if (fx === 'alarm') {
        Audio.ecgBeep(true);
      } else if (fx === 'shake' && dom.container) {
        dom.container.classList.remove('shake-hit');
        void dom.container.offsetWidth;
        dom.container.classList.add('shake-hit');
      }
    }

    function renderStage(stageArr, activeSpeakerId) {
      if (Array.isArray(stageArr)) {
        state.stage = stageArr;
      }
      const list = state.stage || [];
      const slots = { left: dom.slotLeft, center: dom.slotCenter, right: dom.slotRight };
      const byPos = { left: null, center: null, right: null };
      list.forEach((item) => {
        if (item && byPos.hasOwnProperty(item.pos)) {
          byPos[item.pos] = item;
        }
      });

      const someoneActiveHeroine = Boolean(Sprites.HEROINES[activeSpeakerId]);

      Object.keys(slots).forEach((pos) => {
        const slotEl = slots[pos];
        if (!slotEl) return;
        const entry = byPos[pos];
        if (!entry || !Sprites.HEROINES[entry.id]) {
          slotEl.innerHTML = '';
          slotEl.className = `heroine-slot slot-${pos} empty`;
          return;
        }

        const isActive = entry.id === activeSpeakerId;
        const isDimmed = someoneActiveHeroine && !isActive;
        slotEl.className = `heroine-slot slot-${pos} ${isActive ? 'is-speaking' : ''} ${isDimmed ? 'is-dimmed' : ''}`;

        const meta = Sprites.HEROINES[entry.id];
        let existingImg = slotEl.querySelector('img.heroine-img');
        if (!existingImg || existingImg.dataset.heroineId !== entry.id) {
          slotEl.innerHTML = '';
          const wrap = document.createElement('div');
          wrap.className = 'heroine-char-wrap';
          const img = document.createElement('img');
          img.className = 'heroine-img';
          img.alt = meta.name;
          img.dataset.heroineId = entry.id;
          Sprites.resolveSpriteWithFallback(img, entry.id);
          wrap.appendChild(img);

          const emoteEl = document.createElement('div');
          emoteEl.className = 'emote-bubble hidden';
          wrap.appendChild(emoteEl);

          slotEl.appendChild(wrap);
        }

        const emoteEl = slotEl.querySelector('.emote-bubble');
        if (emoteEl) {
          if (entry.emote && Sprites.EMOTES[entry.emote]) {
            const em = Sprites.EMOTES[entry.emote];
            emoteEl.textContent = `${entry.emote} ${em.label}`;
            emoteEl.className = `emote-bubble ${em.cls}`;
          } else {
            emoteEl.className = 'emote-bubble hidden';
            emoteEl.textContent = '';
          }
        }
      });
    }

    function spawnDanmaku(items) {
      if (!dom.danmakuLayer || !Array.isArray(items) || !items.length) return;
      items.forEach((txt, i) => {
        const el = document.createElement('div');
        el.className = 'danmaku-item';
        el.textContent = txt;
        el.style.top = `${10 + ((i * 23 + Math.floor(Math.random() * 14)) % 58)}%`;
        el.style.animationDuration = `${6.4 + i * 1.1}s`;
        dom.danmakuLayer.appendChild(el);
        setTimeout(() => el.remove(), 8200);
      });
    }

    function finishTypingImmediately() {
      if (!isTyping) return;
      if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      isTyping = false;
      const node = book.allNodes[state.nodeId];
      if (dom.dialogueText) {
        dom.dialogueText.innerHTML = formatRichDialogue(currentFullText, node ? node.speakerId : '');
      }
      if (isAuto) scheduleAutoNext();
    }

    function startTyping(text, speakerId) {
      if (typingTimer) clearInterval(typingTimer);
      currentFullText = text || '';
      if (isSkip) {
        isTyping = false;
        if (dom.dialogueText) dom.dialogueText.innerHTML = formatRichDialogue(currentFullText, speakerId);
        return;
      }
      isTyping = true;
      let idx = 0;
      const chars = Array.from(currentFullText);
      if (dom.dialogueText) dom.dialogueText.textContent = '';
      typingTimer = setInterval(() => {
        idx += 2;
        const partial = chars.slice(0, idx).join('');
        if (dom.dialogueText) {
          dom.dialogueText.innerHTML = formatRichDialogue(partial, speakerId);
        }
        if (idx % 4 === 0) Audio.typeTick(speakerId);
        if (idx >= chars.length) {
          clearInterval(typingTimer);
          typingTimer = null;
          isTyping = false;
          if (dom.dialogueText) dom.dialogueText.innerHTML = formatRichDialogue(currentFullText, speakerId);
          if (isAuto) scheduleAutoNext();
        }
      }, 24);
    }

    function renderNode(nodeId, fromLoad = false) {
      // 检查是否因皮衣归零触发裸奔 BE 劫持（非结束分支本身）
      if (!fromLoad && state.jackets <= 0 && !String(nodeId).startsWith('end_')) {
        nodeId = 'end_naked_01';
      }

      if (nodeId === 'ROUTE_EVAL') {
        const dest = evaluateEnding(state);
        renderNode(dest, false);
        return;
      }

      const node = book.allNodes[nodeId];
      if (!node) return;

      state.nodeId = nodeId;
      readNodes.add(nodeId);
      saveJson(STORAGE_KEYS.READ_NODES, Array.from(readNodes));

      if (node.bg && Sprites.BACKGROUNDS[node.bg]) {
        state.bg = node.bg;
        if (dom.stageBg) {
          dom.stageBg.style.backgroundImage = `url("${Sprites.BACKGROUNDS[node.bg]}")`;
        }
      }
      if (node.loc) {
        state.loc = node.loc;
        if (dom.locationTag) dom.locationTag.textContent = node.loc;
      }

      if (!fromLoad && node.effects) {
        applyEffects(node.effects);
      }

      // 皮衣因节点效果刚被剪没时立即截停进裸奔 BE
      if (!fromLoad && state.jackets <= 0 && !String(nodeId).startsWith('end_')) {
        renderNode('end_naked_01', false);
        return;
      }

      updateHud();

      renderStage(node.stage, node.speakerId);

      if (!fromLoad && node.fx) triggerVfx(node.fx);
      if (!fromLoad && node.danmaku) spawnDanmaku(node.danmaku);

      // 说话人铭牌主题光晕
      if (dom.speakerTag) {
        dom.speakerTag.textContent = node.speaker || '旁白';
        dom.speakerTag.className = `speaker-tag speaker-${node.speakerId || 'system'}`;
        const hMeta = Sprites.HEROINES[node.speakerId];
        if (hMeta) {
          dom.speakerTag.style.borderColor = hMeta.color;
          dom.speakerTag.style.boxShadow = `0 0 14px ${hMeta.color}66`;
        } else {
          dom.speakerTag.style.borderColor = '';
          dom.speakerTag.style.boxShadow = '';
        }
      }

      // 写入 100 句回看
      const lastLog = state.backlog[state.backlog.length - 1];
      if (!fromLoad && (!lastLog || lastLog.nodeId !== nodeId)) {
        state.backlog.push({
          nodeId,
          speaker: node.speaker || '旁白',
          speakerId: node.speakerId || 'system',
          text: node.text || '',
        });
        if (state.backlog.length > MAX_BACKLOG) {
          state.backlog = state.backlog.slice(-MAX_BACKLOG);
        }
      }

      // 渲染分支选项
      if (dom.choiceBox) {
        dom.choiceBox.innerHTML = '';
        if (Array.isArray(node.choices) && node.choices.length > 0) {
          setSkip(false);
          setAuto(false);
          dom.choiceBox.classList.remove('hidden');
          if (dom.container) dom.container.classList.add('has-choices');
          node.choices.forEach((ch, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'choice-btn';
            btn.innerHTML = `<span class="choice-tag">${ch.tag || `选项 ${idx + 1}`}</span><span class="choice-label">${ch.text}</span>`;
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              btn.blur();
              Audio.choice();
              if (ch.effects) applyEffects(ch.effects);
              state.backlog.push({
                nodeId: nodeId + '_choice',
                speaker: '【我的抉择】',
                speakerId: 'me',
                text: `「${ch.tag}」${ch.text}`,
              });
              if (state.backlog.length > MAX_BACKLOG) {
                state.backlog = state.backlog.slice(-MAX_BACKLOG);
              }
              if (state.jackets <= 0) {
                renderNode('end_naked_01', false);
              } else {
                renderNode(ch.next, false);
              }
            });
            dom.choiceBox.appendChild(btn);
          });
        } else {
          dom.choiceBox.classList.add('hidden');
          if (dom.container) dom.container.classList.remove('has-choices');
        }
      }

      startTyping(node.text, node.speakerId);

      // 若是结局终末节点，不立刻弹结算，等玩家点一下或打字完呈现入口；这里点推进时弹出结算
      if (node.ending && dom.cursorIcon) {
        dom.cursorIcon.textContent = '🏆 结算';
      } else if (node.minigame && dom.cursorIcon) {
        dom.cursorIcon.textContent = '🎮 挑战';
      } else if (dom.cursorIcon) {
        dom.cursorIcon.textContent = '▼';
      }
    }

    function launchMinigame(type, nextNodeId) {
      if (!dom.minigameModal || !dom.minigameMount) return;
      activeMinigame = true;
      setSkip(false);
      setAuto(false);
      dom.minigameModal.classList.remove('hidden');
      minigameCleanup = Minigames.start(type, dom.minigameMount, Audio, (res) => {
        activeMinigame = false;
        dom.minigameModal.classList.add('hidden');
        dom.minigameMount.innerHTML = '';
        if (res.type === 'im_rush') {
          state.flags.imOkCount = res.okCount || 0;
        } else if (res.type === 'ppt_builder') {
          state.flags.pptRank = res.rank || 'B';
        } else if (res.type === 'board_clash') {
          state.flags.boardScore = res.score || 0;
        }
        applyEffects({
          favor: res.favor,
          jackets: res.jackets,
          stock: res.stock,
          bpm: res.bpm,
        });
        updateHud();
        if (state.jackets <= 0) {
          renderNode('end_naked_01', false);
        } else {
          renderNode(nextNodeId, false);
        }
      });
    }

    function showEndingSettlement(endingKey) {
      const meta = ENDINGS_META[endingKey] || ENDINGS_META.lori_te;
      if (!unlockedEndings.includes(endingKey)) {
        unlockedEndings.push(endingKey);
        saveJson(STORAGE_KEYS.ENDINGS, unlockedEndings);
      }
      Audio.ending(meta.kind);
      if (dom.endingStamp) dom.endingStamp.textContent = meta.stamp;
      if (dom.endingTitle) dom.endingTitle.textContent = meta.title;
      if (dom.endingDesc) dom.endingDesc.textContent = meta.summary;
      if (dom.endingQuote) dom.endingQuote.textContent = meta.quote;
      if (dom.endingStats) {
        dom.endingStats.innerHTML = `
          <div class="stat-pill"><span>📉 终盘股价</span><strong>${formatStock(state.stockChange)}</strong></div>
          <div class="stat-pill"><span>✂️ 残存皮衣</span><strong>${state.jackets} / ${state.maxJackets} 件</strong></div>
          <div class="stat-pill"><span>🫀 最终心率</span><strong>${state.bpm} BPM</strong></div>
          <div class="stat-pill"><span>🏆 图鉴进度</span><strong>${unlockedEndings.length} / ${Object.keys(ENDINGS_META).length}</strong></div>
        `;
      }
      if (dom.endingModal) dom.endingModal.classList.remove('hidden');
    }

    function advance() {
      if (activeMinigame) return;
      if (dom.titleScreen && !dom.titleScreen.classList.contains('hidden')) return;
      const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
      if (openModal) return;

      if (isTyping) {
        finishTypingImmediately();
        return;
      }

      const node = book.allNodes[state.nodeId];
      if (!node) return;
      if (Array.isArray(node.choices) && node.choices.length > 0) return;

      if (node.minigame) {
        launchMinigame(node.minigame, node.next);
        return;
      }

      if (node.ending) {
        showEndingSettlement(node.ending);
        return;
      }

      if (node.next) {
        Audio.click();
        renderNode(node.next, false);
      }
    }

    function renderSaveLoadModal(mode) {
      const targetEl = mode === 'save' ? dom.saveSlots : dom.loadSlots;
      const modalEl = mode === 'save' ? dom.saveModal : dom.loadModal;
      if (!targetEl || !modalEl) return;

      const slots = loadJson(STORAGE_KEYS.SAVES, {});
      targetEl.innerHTML = '';

      for (let i = 1; i <= MAX_SLOTS; i++) {
        const s = slots[i];
        const card = document.createElement('div');
        card.className = 'save-slot-card ' + (s ? 'filled' : 'empty');
        if (s) {
          const bgUrl = Sprites.BACKGROUNDS[s.bg] || 'assets/bg_hq_plaza.jpg';
          const currNode = book.allNodes[s.nodeId];
          const chName = (currNode && currNode._chapter) || '进行中';
          card.innerHTML = `
            <div class="slot-cover" style="background-image:url('${bgUrl}')"><span>槽位 ${i} · ${chName}</span></div>
            <div class="slot-meta">
              <div class="slot-preview">${s.preview || '...'}</div>
              <div class="slot-stats">📉 ${s.stockChange >= 0 ? '+' : ''}${Number(s.stockChange).toFixed(1)}% · ✂️ ${s.jackets}件 · 🫀 ${s.bpm} BPM</div>
              <div class="slot-time">${s.savedAt || ''}</div>
            </div>
          `;
        } else {
          card.innerHTML = `<div class="slot-empty-label">槽位 ${i} · 空存档</div>`;
        }

        card.addEventListener('click', () => {
          if (mode === 'save') {
            const node = book.allNodes[state.nodeId];
            slots[i] = {
              nodeId: state.nodeId,
              bg: state.bg,
              loc: state.loc,
              stage: state.stage,
              stockChange: state.stockChange,
              jackets: state.jackets,
              maxJackets: state.maxJackets,
              bpm: state.bpm,
              favor: state.favor,
              flags: state.flags,
              backlog: state.backlog.slice(-40),
              preview: (node && node.text ? node.text.slice(0, 34) : '') + '...',
              savedAt: new Date().toLocaleString(),
            };
            const ok = saveJson(STORAGE_KEYS.SAVES, slots);
            if (!ok) {
              alert('⚠️ 浏览器本地存储空间已满或被禁用，保存失败！');
              return;
            }
            Audio.choice();
            renderSaveLoadModal('save');
            updateContinueButton();
          } else if (s && s.nodeId) {
            state = Object.assign(createInitialState(), s);
            modalEl.classList.add('hidden');
            if (dom.titleScreen) dom.titleScreen.classList.add('hidden');
            if (dom.endingModal) dom.endingModal.classList.add('hidden');
            Audio.choice();
            renderNode(state.nodeId, true);
          }
        });
        targetEl.appendChild(card);
      }
      modalEl.classList.remove('hidden');
    }

    function renderBacklog() {
      if (!dom.logList || !dom.logModal) return;
      dom.logList.innerHTML = state.backlog
        .map(
          (item) => `
          <div class="log-entry">
            <span class="log-speaker speaker-${item.speakerId || 'system'}">${item.speaker}</span>
            <p class="log-text">${formatRichDialogue(item.text, item.speakerId)}</p>
          </div>
        `
        )
        .join('') || '<div class="log-empty">暂无历史对话记录</div>';
      dom.logModal.classList.remove('hidden');
      dom.logList.scrollTop = dom.logList.scrollHeight;
    }

    function renderRadarModal() {
      if (!dom.radarDetailMount || !dom.radarModal) return;
      const f = state.favor;
      const keys = ['lori', 'alice', 'kimberly', 'zero', 'lisa'];
      // 绘制五角星雷达 SVG
      const cx = 130, cy = 120, rMax = 88;
      const pts = keys.map((k, idx) => {
        const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / 5;
        const val = clamp(f[k] || 0, 0, 100) / 100;
        const x = cx + Math.cos(angle) * rMax * val;
        const y = cy + Math.sin(angle) * rMax * val;
        const lx = cx + Math.cos(angle) * (rMax + 24);
        const ly = cy + Math.sin(angle) * (rMax + 20);
        return { k, h: Sprites.HEROINES[k], x, y, lx, ly, score: f[k] || 0 };
      });
      const polyStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const gridPolys = [0.25, 0.5, 0.75, 1]
        .map((s) => {
          const gp = keys
            .map((_, idx) => {
              const a = -Math.PI / 2 + (idx * 2 * Math.PI) / 5;
              return `${(cx + Math.cos(a) * rMax * s).toFixed(1)},${(cy + Math.sin(a) * rMax * s).toFixed(1)}`;
            })
            .join(' ');
          return `<polygon points="${gp}" fill="none" stroke="rgba(148,163,184,0.28)" stroke-width="1"/>`;
        })
        .join('');

      dom.radarDetailMount.innerHTML = `
        <div class="radar-layout">
          <svg viewBox="0 0 260 245" class="radar-svg">
            ${gridPolys}
            <polygon points="${polyStr}" fill="rgba(244,63,94,0.32)" stroke="#fb7185" stroke-width="2.2"/>
            ${pts
              .map(
                (p) => `
              <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${p.h.color}" stroke="#0f172a" stroke-width="1.5"/>
              <text x="${p.lx.toFixed(1)}" y="${p.ly.toFixed(1)}" fill="${p.h.color}" font-size="11" font-weight="700" text-anchor="middle">${p.h.name} (${p.score})</text>
            `
              )
              .join('')}
          </svg>
          <div class="radar-bars">
            ${pts
              .map(
                (p) => `
              <div class="rbar-row">
                <div class="rbar-head"><strong style="color:${p.h.color}">${p.h.name}</strong><span>${p.h.role}</span><b>${p.score}</b></div>
                <div class="rbar-track"><div class="rbar-fill" style="width:${clamp(p.score, 0, 100)}%;background:${p.h.color}"></div></div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
      dom.radarModal.classList.remove('hidden');
    }

    function renderGallery() {
      if (!dom.galleryGrid || !dom.galleryModal) return;
      const allKeys = Object.keys(ENDINGS_META);
      if (dom.galleryCount) {
        dom.galleryCount.textContent = `${unlockedEndings.length} / ${allKeys.length}`;
      }
      dom.galleryGrid.innerHTML = allKeys
        .map((k) => {
          const e = ENDINGS_META[k];
          const got = unlockedEndings.includes(k);
          return `
            <div class="gallery-card ${got ? 'unlocked' : 'locked'} kind-${e.kind}">
              <div class="gal-top"><span class="gal-code">${e.code}</span><span class="gal-hero">${got ? e.heroine : '???'}</span></div>
              <div class="gal-title">${got ? e.title : '【未解锁结局】'}</div>
              <div class="gal-desc">${got ? e.summary : '在修罗场中尝试不同站位与小玩法抉择即可解锁。'}</div>
            </div>
          `;
        })
        .join('');
      dom.galleryModal.classList.remove('hidden');
    }

    function updateContinueButton() {
      if (!dom.btnContinue) return;
      const saves = loadJson(STORAGE_KEYS.SAVES, {});
      const hasAny = Object.keys(saves).some((k) => saves[k] && saves[k].nodeId);
      dom.btnContinue.classList.toggle('hidden', !hasAny);
    }

    function bindEvents() {
      if (dom.btnStart) {
        dom.btnStart.addEventListener('click', () => {
          Audio.choice();
          stopTimers();
          state = createInitialState();
          if (dom.titleScreen) dom.titleScreen.classList.add('hidden');
          renderNode('ch0_01', false);
        });
      }
      if (dom.btnContinue) {
        dom.btnContinue.addEventListener('click', () => renderSaveLoadModal('load'));
      }
      if (dom.btnTitleGallery) {
        dom.btnTitleGallery.addEventListener('click', renderGallery);
      }

      const portraitHint = $('portraitHint');
      const btnCloseHint = $('btnCloseHint');
      if (btnCloseHint && portraitHint) {
        btnCloseHint.addEventListener('click', (e) => {
          e.stopPropagation();
          portraitHint.classList.add('hidden');
        });
      }

      if (dom.dialogueBox) dom.dialogueBox.addEventListener('click', advance);
      if (dom.stageArea) dom.stageArea.addEventListener('click', advance);

      if (dom.btnSkip) dom.btnSkip.addEventListener('click', () => setSkip(!isSkip));
      if (dom.btnAuto) dom.btnAuto.addEventListener('click', () => setAuto(!isAuto));
      if (dom.btnSave) dom.btnSave.addEventListener('click', () => renderSaveLoadModal('save'));
      if (dom.btnLoad) dom.btnLoad.addEventListener('click', () => renderSaveLoadModal('load'));
      if (dom.btnLog) dom.btnLog.addEventListener('click', renderBacklog);
      if (dom.btnRadar) dom.btnRadar.addEventListener('click', renderRadarModal);
      if (dom.btnGallery) dom.btnGallery.addEventListener('click', renderGallery);
      if (dom.btnMute) {
        dom.btnMute.addEventListener('click', () => {
          const m = Audio.toggleMute();
          dom.btnMute.textContent = m ? '🔇' : '🔊';
        });
      }

      const btnEndingLoad = $('btnEndingLoad');
      const btnEndingRestart = $('btnEndingRestart');
      if (btnEndingLoad) {
        btnEndingLoad.addEventListener('click', () => {
          if (dom.endingModal) dom.endingModal.classList.add('hidden');
          renderSaveLoadModal('load');
        });
      }
      if (btnEndingRestart) {
        btnEndingRestart.addEventListener('click', () => {
          if (dom.endingModal) dom.endingModal.classList.add('hidden');
          stopTimers();
          state = createInitialState();
          renderNode('ch0_01', false);
        });
      }

      document.querySelectorAll('.modal-close').forEach((btn) => {
        btn.addEventListener('click', () => {
          const modal = btn.closest('.modal-backdrop');
          if (modal && modal.id !== 'minigameModal') {
            modal.classList.add('hidden');
            btn.blur();
          }
        });
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((m) => {
            if (m.id !== 'minigameModal' && m.id !== 'endingModal') {
              m.classList.add('hidden');
            }
          });
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          // 绝不劫持按钮/链接/交互元素焦点
          if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) {
            return;
          }
          e.preventDefault();
          advance();
        }
      });
    }

    updateContinueButton();
    bindEvents();

    // 暴露只读测试与调试钩子
    window.POV_GAME = {
      getState: () => state,
      getBook: () => book,
      getEndingsMeta: () => ENDINGS_META,
      evaluateEnding,
      renderNode,
      advance,
      applyEffects,
      saveJson,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
