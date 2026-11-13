/**
 * 《恋与皮衣：今夜无人加仓》（Love & Leather Jacket）- Galgame 主核心逻辑与交互状态机
 * DLSS 4 四线修罗场 · 终极串子版（6 大损人结局、四宫格号外小报、实时弹幕、巴菲特榜单触发与血压救护车急救）
 */

const ENDING_ORDER = ["TE", "HE", "NE", "BE1", "BE2", "BE3"];
const STOCK_BASE_CLOSE = 150.00; // -14.00% = $129.00（较 $192 高点已蒸发超 32%）

const DANMAKU_COLORS = [
  "#ff4d94", // 吃瓜亮粉
  "#34d399", // 荧光翠绿
  "#fbbf24", // 暴富明金
  "#38bdf8", // 赛博冰青
  "#fb923c", // 火线亮橙
  "#c084fc"  // 霓虹浅紫
];

const DEFAULT_TABLOID_DATA = {
  issue: "🍉 硅谷今夜大瓜号外 · 追思会突发特刊",
  headline: "1 原配 + 3 情人 = DLSS 4 肉身四倍多帧生成！三职一撸到底连遗言都没留！",
  subhead: "加州圣克拉拉总部门口摆满菊花与白蜡烛 · 盘前跌超 -14%（较山顶已蒸发超 30%）",
  image: "assets/cg_distracted.jpg",
  caption: "📸 狗仔实拍名画《DLSS 4 物理补帧》：台北酒吧贴贴与总部门口点蜡烛全网热传",
  quads: [
    { tag: "瓜1【姐夫严选】", text: "Megaspeed 高管乐姐（卷入48亿算力倒爷风波）：老公亲自引荐认识，台北酒吧贴贴由亲闺女掌镜拍照！" },
    { tag: "瓜2【贴身医保】", text: "潜伏近20年的直属下属！医疗保健副总裁鲍姐（Kimberly）深夜一对一汇报生命科学！" },
    { tag: "瓜3【隐藏盲盒】", text: "路透社辞职日再爆第3名内部女员工！算力教父实现“1原生帧+3插帧”满编运行！" },
    { tag: "瓜4【灵堂蹦迪】", text: "总部大楼外摆满鲜花白蜡烛，老马在线发聘书招安，金发大统领钦点库克跨界接盘！" }
  ],
  letterExcerpt:
    "【官方免责直译版公告】\n经董事会紧急决议：即日起解除某皮衣高管 CEO、总裁、董事全部三项职务，即刻生效，无交接过渡期、无感恩致辞、连句体制内体面遗言都没给留。\n（门外追思摊位提示：9块9白菊花+白蜡烛限时加购中）",
  comments: [
    { user: "@192山顶满仓冤种", text: "准备买显卡和结婚的血汗本金全套在山顶，卡里剩14块5，今夜我就是总部门口最强反串护夫宝！", likes: "12.4w" },
    { user: "@巴菲特躺赢后援会", text: "老巴啥也没干喝着可乐又升回富豪榜第七了，这波叫无为而治价值投资！", likes: "9.8w" },
    { user: "@库克8G黄金内存推销员", text: "支持库克穿高领毛衣来接盘，RTX 6090 Air 直接焊死 8GB 显存，硅脂单卖 999 刀！", likes: "7.6w" },
    { user: "@德州火箭招聘办", text: "区区1原生+3补帧算啥？来德州给老马焊火箭芯片，手把手教你正统硅谷繁殖学！", likes: "6.5w" }
  ]
};

class GalgameEngine {
  constructor() {
    this.script = window.SCRIPT_DATA || { initialState: {}, nodes: {}, itemDefs: {}, endings: {} };
    this.state = JSON.parse(JSON.stringify(this.script.initialState));
    this.readNodes = new Set();
    this.history = []; // 最近 40 条对话
    this.endingsUnlocked = this.loadEndings();
    this.lastEndingCode = null;

    // 引擎交互运行态
    this.isTyping = false;
    this.typewriterTimer = null;
    this.fullTextToType = "";
    this.currentTextIndex = 0;
    this.isSkipActive = false;
    this.qteOpenTimer = null;
    this.tabloidOpenTimer = null;

    // QTE 运行态
    this.qteActive = false;
    this.qtePos = 0;
    this.qteDirection = 1;
    this.qteAnimId = null;

    // DOM 元素缓存
    this.dom = {};
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.loadReadNodes();
    this.renderTabloid();
    this.renderEndingsGallery();
    this.renderHUD();

    // 检查是否有自动存档
    try {
      const autosave = localStorage.getItem("love_leather_autosave");
      if (autosave) {
        this.dom.btnContinue.classList.remove("hidden");
      }
    } catch (e) {}

    // 启动飘落樱花粒子效果
    this.initSakuraParticles();
  }

  cacheDom() {
    this.dom = {
      // 场景容器
      gameContainer: document.getElementById("gameContainer"),
      stage: document.getElementById("stage"),
      stageBg: document.getElementById("stageBg"),
      sakuraContainer: document.getElementById("sakuraContainer"),
      locationTag: document.getElementById("locationTag"),
      spriteContainer: document.getElementById("spriteContainer"),
      danmakuLayer: document.getElementById("danmakuLayer"),
      callPopup: document.getElementById("callPopup"),
      callAvatar: document.getElementById("callAvatar"),
      callName: document.getElementById("callName"),
      callSub: document.getElementById("callSub"),

      // HUD 顶栏
      loveBar: document.getElementById("loveBar"),
      loveValue: document.getElementById("loveValue"),
      loveStatusTag: document.getElementById("loveStatusTag"),
      stockDisplay: document.getElementById("stockDisplay"),
      votesDisplay: document.getElementById("votesDisplay"),
      votesBadge: document.getElementById("votesBadge"),

      // 对话框与选项
      dialogueBox: document.getElementById("dialogueBox"),
      speakerName: document.getElementById("speakerName"),
      dialogueText: document.getElementById("dialogueText"),
      cursorHeart: document.getElementById("cursorHeart"),
      choiceBox: document.getElementById("choiceBox"),

      // 菜单按钮
      btnSave: document.getElementById("btnSave"),
      btnLoad: document.getElementById("btnLoad"),
      btnSkip: document.getElementById("btnSkip"),
      btnLog: document.getElementById("btnLog"),
      btnInventory: document.getElementById("btnInventory"),
      btnTabloid: document.getElementById("btnTabloid"),
      btnBuyDip: document.getElementById("btnBuyDip"),
      btnGallery: document.getElementById("btnGallery"),
      btnMute: document.getElementById("btnMute"),

      // 标题界面
      titleScreen: document.getElementById("titleScreen"),
      btnStartGame: document.getElementById("btnStartGame"),
      btnContinue: document.getElementById("btnContinue"),
      btnTitleGallery: document.getElementById("btnTitleGallery"),

      // 存读档 / 回看 / 背包 / 图鉴弹窗
      saveModal: document.getElementById("saveModal"),
      saveSlots: document.getElementById("saveSlots"),
      loadModal: document.getElementById("loadModal"),
      loadSlots: document.getElementById("loadSlots"),
      logModal: document.getElementById("logModal"),
      logList: document.getElementById("logList"),
      inventoryModal: document.getElementById("inventoryModal"),
      inventoryGrid: document.getElementById("inventoryGrid"),
      galleryModal: document.getElementById("galleryModal"),
      galleryGrid: document.getElementById("galleryGrid"),
      galleryCount: document.getElementById("galleryCount"),

      // QTE 焚情炼卡炉弹窗
      qteModal: document.getElementById("qteModal"),
      qtePointer: document.getElementById("qtePointer"),
      btnQteCatch: document.getElementById("btnQteCatch"),
      qteSweetSpot: document.getElementById("qteSweetSpot"),

      // 一键抄底整活弹窗
      buyDipModal: document.getElementById("buyDipModal"),
      btnDipClose: document.getElementById("btnDipClose"),

      // 结局诊断书弹窗
      endingModal: document.getElementById("endingModal"),
      endingStamp: document.getElementById("endingStamp"),
      endingTitle: document.getElementById("endingTitle"),
      endingDesc: document.getElementById("endingDesc"),
      endingQuote: document.getElementById("endingQuote"),
      endingStats: document.getElementById("endingStats"),
      btnEndingRestart: document.getElementById("btnEndingRestart"),
      btnEndingLoad: document.getElementById("btnEndingLoad"),

      // 🍉 硅谷今夜大瓜号外弹窗
      tabloidModal: document.getElementById("tabloidModal"),
      tabloidIssue: document.getElementById("tabloidIssue"),
      tabloidHeadline: document.getElementById("tabloidHeadline"),
      tabloidSubhead: document.getElementById("tabloidSubhead"),
      tabloidImage: document.getElementById("tabloidImage"),
      tabloidCaption: document.getElementById("tabloidCaption"),
      tabloidQuadGrid: document.getElementById("tabloidQuadGrid"),
      tabloidLetter: document.getElementById("tabloidLetter"),
      tabloidComments: document.getElementById("tabloidComments"),
      btnTabloidClose: document.getElementById("btnTabloidClose"),

      // 通用关闭弹窗按钮
      modalCloseBtns: document.querySelectorAll(".modal-close")
    };
  }

  bindEvents() {
    // 页面任意首触解锁音频
    document.addEventListener("click", () => {
      window.sound && window.sound.initContext();
    }, { once: true });

    // 开始游戏与继续游戏
    this.dom.btnStartGame.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.dom.btnStartGame.blur();
      this.dom.titleScreen.classList.add("fade-out");
      setTimeout(() => {
        this.dom.titleScreen.classList.add("hidden");
        this.startNewGame();
      }, 450);
    });

    this.dom.btnContinue.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.dom.btnContinue.blur();
      try {
        const autosave = localStorage.getItem("love_leather_autosave");
        if (autosave) {
          this.loadGameState(JSON.parse(autosave));
          this.dom.titleScreen.classList.add("fade-out");
          setTimeout(() => {
            this.dom.titleScreen.classList.add("hidden");
          }, 450);
        }
      } catch (e) {}
    });

    this.dom.btnTitleGallery.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.renderEndingsGallery();
      this.openModal(this.dom.galleryModal);
    });

    // 对话框推进点击
    this.dom.dialogueBox.addEventListener("click", (e) => {
      if (e.target.closest(".choice-btn")) return;
      this.onDialogueBoxClick();
    });

    // 舞台区域任意位置点击也可推进对话（避开选项与来电弹窗）
    if (this.dom.stage) {
      this.dom.stage.addEventListener("click", (e) => {
        if (
          e.target.closest(".choice-btn") ||
          e.target.closest(".call-popup") ||
          this.isAnyModalOpen() ||
          !this.dom.titleScreen.classList.contains("hidden")
        ) {
          return;
        }
        this.onDialogueBoxClick();
      });
    }

    // 快进按钮
    this.dom.btnSkip.addEventListener("click", () => {
      this.toggleSkip();
    });

    // 存档与读档
    this.dom.btnSave.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.renderSaveSlots();
      this.openModal(this.dom.saveModal);
    });

    this.dom.btnLoad.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.renderLoadSlots();
      this.openModal(this.dom.loadModal);
    });

    // Backlog 历史对话
    this.dom.btnLog.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.renderBacklog();
      this.openModal(this.dom.logModal);
    });

    // 背包
    this.dom.btnInventory.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.renderInventory();
      this.openModal(this.dom.inventoryModal);
    });

    // 🍉 吃瓜号外小报
    this.dom.btnTabloid.addEventListener("click", () => {
      window.sound && window.sound.gossip();
      this.renderTabloid();
      this.openModal(this.dom.tabloidModal);
    });

    this.dom.btnTabloidClose.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.closeModal(this.dom.tabloidModal);
    });

    // 一键抄底整活
    this.dom.btnBuyDip.addEventListener("click", () => {
      this.triggerBuyDipPrank();
    });
    this.dom.btnDipClose.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.closeModal(this.dom.buyDipModal);
    });

    // 图鉴
    this.dom.btnGallery.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.renderEndingsGallery();
      this.openModal(this.dom.galleryModal);
    });

    // 静音
    this.dom.btnMute.addEventListener("click", () => {
      const isMuted = window.sound ? window.sound.toggleMute() : false;
      this.dom.btnMute.innerHTML = isMuted ? "🔇" : "🔊";
      this.dom.btnMute.title = isMuted ? "开启音效" : "静音切换";
    });

    // 通用弹窗关闭按钮
    this.dom.modalCloseBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        window.sound && window.sound.click();
        const modal = e.target.closest(".modal-backdrop");
        if (modal) this.closeModal(modal);
      });
    });

    // 烤箱 QTE 抓取按钮
    this.dom.btnQteCatch.addEventListener("click", () => {
      this.onQteCatch();
    });

    // 结局诊断书按钮
    this.dom.btnEndingRestart.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.closeModal(this.dom.endingModal);
      this.startNewGame();
    });

    this.dom.btnEndingLoad.addEventListener("click", () => {
      window.sound && window.sound.click();
      this.closeModal(this.dom.endingModal);
      this.renderLoadSlots();
      this.openModal(this.dom.loadModal);
    });

    // 键盘支持快捷操作（避免劫持聚焦在按钮/交互控件上的 Enter / Space）
    document.addEventListener("keydown", (e) => {
      if (e.code === "Escape") {
        const nonForcedModalIds = [
          "saveModal",
          "loadModal",
          "logModal",
          "inventoryModal",
          "galleryModal",
          "buyDipModal",
          "tabloidModal"
        ];
        for (const id of nonForcedModalIds) {
          const modal = this.dom[id];
          if (modal && !modal.classList.contains("hidden")) {
            this.closeModal(modal);
            return;
          }
        }
        return;
      }

      if (e.code === "Space" || e.code === "Enter") {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (this.isInteractiveElement(e.target) || this.isInteractiveElement(document.activeElement)) {
          return;
        }
        if (!this.isAnyModalOpen() && this.dom.titleScreen.classList.contains("hidden")) {
          e.preventDefault();
          if (!e.repeat) {
            this.onDialogueBoxClick();
          }
        }
        return;
      }

      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        if (!this.isAnyModalOpen() && this.dom.titleScreen.classList.contains("hidden")) {
          this.toggleSkip();
        }
      }
    });
  }

  isInteractiveElement(el) {
    if (!el || typeof el.closest !== "function") return false;
    if (el === document.body || el === document.documentElement) return false;
    return Boolean(
      el.closest('button, a[href], input, textarea, select, summary, [role="button"], [contenteditable="true"]')
    );
  }

  clearPendingTimers() {
    clearTimeout(this.qteOpenTimer);
    clearTimeout(this.tabloidOpenTimer);
    this.qteOpenTimer = null;
    this.tabloidOpenTimer = null;
    if (this.qteAnimId) {
      cancelAnimationFrame(this.qteAnimId);
      this.qteAnimId = null;
    }
    this.qteActive = false;
    if (this.dom.qteModal && !this.dom.qteModal.classList.contains("hidden")) {
      this.closeModal(this.dom.qteModal);
    }
  }

  isAnyModalOpen() {
    const modals = document.querySelectorAll(".modal-backdrop:not(.hidden)");
    return modals.length > 0;
  }

  openModal(modalElem) {
    if (!modalElem) return;
    if (this.isSkipActive) this.stopSkip();
    modalElem.classList.remove("hidden");
    if (modalElem === this.dom.qteModal && this.dom.btnQteCatch) {
      this.dom.btnQteCatch.focus();
    }
  }

  closeModal(modalElem) {
    if (!modalElem) return;
    if (document.activeElement && typeof modalElem.contains === "function" && modalElem.contains(document.activeElement)) {
      if (typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
    }
    modalElem.classList.add("hidden");
  }

  normalizeState(rawState) {
    const base = JSON.parse(JSON.stringify(this.script.initialState || {}));
    const s = Object.assign(base, rawState && typeof rawState === "object" ? rawState : {});
    if (typeof s.candles !== "number") {
      s.candles = typeof s.love === "number" ? s.love : 18;
    }
    if (typeof s.bp !== "number") {
      s.bp = 40;
    }
    if (typeof s.stockChange !== "number") {
      s.stockChange = -14.00;
    }
    if (typeof s.stock !== "number") {
      s.stock = +(STOCK_BASE_CLOSE * (1 + s.stockChange / 100)).toFixed(2);
    }
    if (typeof s.buffettShown !== "boolean") {
      s.buffettShown = s.stockChange <= -18.0;
    }
    if (!Array.isArray(s.inventory)) {
      s.inventory = [];
    }
    if (!this.script.nodes || !this.script.nodes[s.currentNode]) {
      s.currentNode = (this.script.initialState && this.script.initialState.currentNode) || "p0_1";
    }
    return s;
  }

  startNewGame() {
    this.clearPendingTimers();
    this.state = this.normalizeState(this.script.initialState);
    this.state.tabloidAutoShown = false;
    this.lastEndingCode = null;
    this.history = [];
    if (this.dom.gameContainer) {
      this.dom.gameContainer.classList.remove("has-choices");
    }
    if (this.dom.danmakuLayer) {
      this.dom.danmakuLayer.innerHTML = "";
    }
    this.goToNode(this.state.currentNode);
  }

  loadGameState(savedState) {
    this.clearPendingTimers();
    this.state = this.normalizeState(savedState);
    this.lastEndingCode = this.state.lastEndingCode || this.extractEndingCode(this.state.currentNode) || null;
    if (this.dom.danmakuLayer) {
      this.dom.danmakuLayer.innerHTML = "";
    }
    this.renderHUD();
    this.goToNode(this.state.currentNode, false);
  }

  // ==========================================
  // 对话流推进与打字机
  // ==========================================
  onDialogueBoxClick() {
    if (this.isAnyModalOpen()) return;

    const node = this.script.nodes[this.state.currentNode];
    if (!node) return;

    // 1. 如果正在逐字打字中，点击立即补齐
    if (this.isTyping) {
      this.finishTypingImmediately();
      return;
    }

    // 2. 如果当前有选项，不响应推进
    if (node.choices && node.choices.length > 0) {
      return;
    }

    // 3. 如果当前有 QTE 尚未执行完，弹出 QTE
    if (node.qte && this.state.qteResult === null) {
      this.triggerOvenQte();
      return;
    }

    // 4. 推进到下一个节点
    if (node.next) {
      window.sound && window.sound.click();
      this.resolveAndGoNext(node.next);
    }
  }

  resolveAndGoNext(nextNodeId) {
    const hasCard = Array.isArray(this.state.inventory) && this.state.inventory.includes("item_rtx5090");

    // 0. 血压爆表 100% 强制触发救护车拉走结局（除非已在急救或结局收束流程中）
    if (
      nextNodeId !== "game_finish" &&
      this.state.bp >= 100 &&
      !String(this.state.currentNode || "").startsWith("bp_overload") &&
      !String(nextNodeId || "").startsWith("bp_overload") &&
      !this.extractEndingCode(this.state.currentNode) &&
      !this.extractEndingCode(nextNodeId)
    ) {
      this.goToNode("bp_overload_1");
      return;
    }

    // 1. 第三幕后厨回流焊 QTE 判定（失败绝不发放满血神卡）
    if (nextNodeId === "p3_8_check") {
      const target = this.state.qteResult === true ? "p3_8_success" : "p3_8_fail";
      this.goToNode(target);
      return;
    }

    // 2. 第四幕第二轮：当众掏卡抗议 8G 显存笑话（没焊出来直接当众黑屏）
    if (nextNodeId === "p4_8a_check") {
      const target = (this.state.qteResult === true && hasCard) ? "p4_8a" : "p4_8a_nocard";
      this.goToNode(target);
      return;
    }

    // 3. 第四幕：全网串子听证会风向分流
    if (nextNodeId === "p4_16_check") {
      const target = (this.state.candles >= 55 && this.state.stockChange > -14.0) ? "p4_16_pass" : "p4_16_crisis";
      this.goToNode(target);
      return;
    }

    // 4. 终章路线 A：DLSS 4 强行满帧洗地线 -> TE / BE2 / BE3
    if (nextNodeId === "route_dlss_eval") {
      if (this.state.candles >= 72 && this.state.stockChange >= -6.0 && this.state.qteResult === true && hasCard) {
        this.goToNode("route_dlss_win");
      } else if (this.state.stockChange <= -18.0) {
        this.goToNode("route_dlss_liquidated");
      } else {
        this.goToNode("route_dlss_cook_win");
      }
      return;
    }

    // 5. 终章路线 B：没收皮衣与手机，捆回 Denny's 后厨终身刷盘子摊松饼 -> HE / BE3
    if (nextNodeId === "route_dennys_eval") {
      if (this.state.candles >= 52 && this.state.stockChange >= -14.0) {
        this.goToNode("route_dennys_win");
      } else {
        this.goToNode("route_dennys_fail");
      }
      return;
    }

    // 6. 终章路线 C：投奔老马去德州焊火箭学硅谷繁殖学 -> NE / BE1 / BE2
    if (nextNodeId === "route_musk_eval") {
      if (this.state.bp >= 85) {
        this.goToNode("bp_overload_1");
      } else if (this.state.stockChange >= -16.0) {
        this.goToNode("route_musk_win");
      } else {
        this.goToNode("route_musk_cook");
      }
      return;
    }

    // 7. 终章路线 D：顺水推舟迎库克穿高领毛衣接班 -> BE1 / BE2
    if (nextNodeId === "route_cook_eval") {
      if (this.state.bp >= 82) {
        this.goToNode("bp_overload_1");
      } else {
        this.goToNode("route_cook_win");
      }
      return;
    }

    // 8. 终章结算：弹出损人结局诊断书
    if (nextNodeId === "game_finish") {
      this.triggerEndingDiagnosis();
      return;
    }

    this.goToNode(nextNodeId);
  }

  goToNode(nodeId, applyEffects = true) {
    const node = this.script.nodes[nodeId];
    if (!node) {
      console.error("Node not found:", nodeId);
      return;
    }

    this.state.currentNode = nodeId;
    this.readNodes.add(nodeId);
    this.saveReadNodes();

    // 记录历史对白（纯分支节点不写入空白回看）
    if (node.text) {
      this.history.push({
        speaker: node.speaker,
        text: node.text
      });
      if (this.history.length > 40) {
        this.history.shift();
      }
    }

    // 应用数值变动与道具
    if (applyEffects) {
      if (node.effects) {
        this.applyEffects(node.effects);
      }
      if (node.item) {
        this.grantItem(node.item);
      }
    }

    // 结局节点识别与图鉴解锁（兼容 end_te / end_he3 / end_be3 等全部 8 大结局）
    const detectedEnding = this.extractEndingCode(nodeId);
    if (detectedEnding) {
      this.unlockEnding(detectedEnding);
      if (this.isSkipActive) this.stopSkip();
    }

    // 自动存档
    this.autoSave();

    // 更新舞台视觉与 HUD
    this.updateStage(node);
    this.renderHUD();

    // 实时吃瓜弹幕触发
    if (Array.isArray(node.danmaku) && node.danmaku.length > 0) {
      this.spawnDanmaku(node.danmaku);
    }

    // 选项渲染
    if (node.choices && node.choices.length > 0) {
      this.renderChoices(node.choices);
      if (this.isSkipActive) this.stopSkip();
    } else {
      if (this.dom.gameContainer) {
        this.dom.gameContainer.classList.remove("has-choices");
      }
      this.dom.choiceBox.classList.add("hidden");
      this.dom.choiceBox.innerHTML = "";
    }

    // 吃瓜小报首次自动弹出检查
    if (node.showTabloid === true && !this.state.tabloidAutoShown) {
      this.state.tabloidAutoShown = true;
      this.autoSave();
      if (this.isSkipActive) this.stopSkip();
      this.renderTabloid();
      clearTimeout(this.tabloidOpenTimer);
      this.tabloidOpenTimer = setTimeout(() => {
        window.sound && window.sound.gossip();
        this.openModal(this.dom.tabloidModal);
      }, 320);
    }

    // 打字机播放（纯选项节点补充右侧作答引导文案，避免底栏空白）
    const displayLine =
      node.text ||
      (node.choices && node.choices.length > 0
        ? "⚡ 轮到你开麦控评了——请在右侧选择你的毒舌洗地方案！"
        : "");
    this.startTyping(node.speaker || "我（反串护夫宝）", displayLine);

    // 焚情炼卡炉 QTE 触发检查
    if (node.qte === "oven" && this.state.qteResult === null) {
      if (this.isSkipActive) this.stopSkip();
      clearTimeout(this.qteOpenTimer);
      this.qteOpenTimer = setTimeout(() => {
        this.triggerOvenQte();
      }, 600);
    }
  }

  grantItem(itemId) {
    if (!itemId) return;
    if (!Array.isArray(this.state.inventory)) {
      this.state.inventory = [];
    }
    if (!this.state.inventory.includes(itemId)) {
      this.state.inventory.push(itemId);
      const itemDef = this.script.itemDefs && this.script.itemDefs[itemId];
      this.showToast(`获得道具：${itemDef ? itemDef.name : itemId}`);
    }
  }

  applyEffects(effects) {
    if (effects.candles !== undefined) {
      this.state.candles = Math.max(0, Math.min(100, (this.state.candles || 0) + effects.candles));
      if (effects.candles > 0) window.sound && window.sound.loveUp();
      else if (effects.candles < 0) window.sound && window.sound.loveDown();
    }
    if (effects.stock !== undefined) {
      this.state.stock = Math.max(8, +((this.state.stock || 129.00) + effects.stock).toFixed(2));
      this.state.stockChange = +((this.state.stock - STOCK_BASE_CLOSE) / (STOCK_BASE_CLOSE / 100)).toFixed(2);
      if (effects.stock > 0) window.sound && window.sound.stockUp();
      else if (effects.stock < 0) window.sound && window.sound.stockDown();
    }
    if (effects.stockChange !== undefined) {
      this.state.stockChange = +((this.state.stockChange || 0) + effects.stockChange).toFixed(2);
      this.state.stock = Math.max(8, +(STOCK_BASE_CLOSE * (1 + this.state.stockChange / 100)).toFixed(2));
      if (effects.stockChange < 0) window.sound && window.sound.stockDown();
      else if (effects.stockChange > 0) window.sound && window.sound.stockUp();
    }
    if (effects.bp !== undefined) {
      this.state.bp = Math.max(0, Math.min(100, (this.state.bp || 0) + effects.bp));
      if (this.state.bp >= 100) {
        window.sound && window.sound.siren();
      } else if (effects.bp >= 12) {
        window.sound && window.sound.reject();
      } else if (effects.bp < 0) {
        window.sound && window.sound.voteUp();
      }
    }
    // 跌破防线触发“恭喜巴菲特躺赢升至富豪榜第七”突发播报
    if (this.state.stockChange <= -18.0 && !this.state.buffettShown) {
      this.state.buffettShown = true;
      window.sound && window.sound.gossip();
      this.showToast("🎉 恭喜巴菲特躺赢升至富豪榜第七！", "buffett");
      this.spawnDanmaku([
        "🥤 突发：老巴喝着樱桃可乐躺赢升回富豪榜第七！",
        "📉 NVDA 跌破铁底防线，山顶散户连夜批发生菊花"
      ]);
    }
    if (effects.item) {
      this.grantItem(effects.item);
    }
    if (effects.sound && window.sound && typeof window.sound[effects.sound] === "function") {
      window.sound[effects.sound]();
    }
  }

  updateStage(node) {
    // 地点
    if (node.location) {
      this.dom.locationTag.textContent = node.location;
    }

    // 场景背景
    if (node.bg) {
      this.dom.stageBg.className = `stage-bg bg-${node.bg}`;
    }

    // 立绘切换
    if (node.sprite && typeof window.renderCharacterSprite === "function") {
      this.dom.spriteContainer.innerHTML = window.renderCharacterSprite(node.sprite);
      this.dom.spriteContainer.classList.remove("hidden");
    } else {
      this.dom.spriteContainer.innerHTML = "";
      this.dom.spriteContainer.classList.add("hidden");
    }

    // 手机来电弹窗
    if (node.callPopup) {
      if (typeof window.renderAvatar === "function") {
        this.dom.callAvatar.innerHTML = window.renderAvatar(node.callPopup.avatar);
      }
      this.dom.callName.textContent = node.callPopup.character || "";
      this.dom.callSub.textContent = node.callPopup.title || "Incoming Call...";
      this.dom.callPopup.classList.remove("hidden");
      this.dom.callPopup.classList.add("ring-anim");
    } else {
      this.dom.callPopup.classList.add("hidden");
      this.dom.callPopup.classList.remove("ring-anim");
    }
  }

  getSpeakerClass(speaker) {
    const s = String(speaker || "");
    if (s === "我" || s.includes("护夫宝") || s.includes("散户")) return "me";
    if (s === "旁白" || s.includes("系统") || s.includes("热搜") || s.includes("公告") || s.includes("救护车")) return "narrator";
    if (s.includes("乐姐") || s.includes("红颜")) return "joy";
    if (s.includes("夫人") || s.includes("正宫")) return "wife";
    if (s.includes("鲍姐") || s.includes("Kimberly") || s.includes("医疗")) return "kimberly";
    if (s.includes("库克")) return "cook";
    if (s.includes("盲盒") || s.includes("3号")) return "mystery";
    if (s.includes("巴菲特")) return "buffett";
    if (s.includes("阿嬷") || s.includes("芭乐")) return "grandma";
    if (s.includes("老马") || s.includes("钢铁侠")) return "musk";
    if (s.includes("苏妈") || s.includes("表姐")) return "su";
    if (s.includes("空头") || s.includes("大鳄") || s.includes("大统领") || s.includes("董事")) return "shark";
    return "huang";
  }

  startTyping(speaker, text) {
    clearInterval(this.typewriterTimer);
    this.isTyping = true;
    this.fullTextToType = String(text || "");
    this.currentTextIndex = 0;

    this.dom.speakerName.textContent = speaker || "旁白";
    this.dom.speakerName.className = `speaker-tag speaker-${this.getSpeakerClass(speaker)}`;
    this.dom.dialogueText.textContent = "";
    this.dom.cursorHeart.classList.remove("beating");

    const speed = this.isSkipActive ? 10 : 24;

    this.typewriterTimer = setInterval(() => {
      if (this.currentTextIndex < this.fullTextToType.length) {
        this.dom.dialogueText.textContent += this.fullTextToType.charAt(this.currentTextIndex);
        this.currentTextIndex++;
        if (this.currentTextIndex % 2 === 0) {
          window.sound && window.sound.typewriter();
        }
      } else {
        this.finishTypingImmediately();
      }
    }, speed);
  }

  finishTypingImmediately() {
    clearInterval(this.typewriterTimer);
    this.isTyping = false;
    this.dom.dialogueText.textContent = this.fullTextToType;
    this.dom.cursorHeart.classList.add("beating");

    // 如果处于快进模式且无弹窗遮挡，快速推进到下一步
    if (this.isSkipActive && !this.isAnyModalOpen()) {
      const node = this.script.nodes[this.state.currentNode];
      if (node && (!node.choices || node.choices.length === 0) && !node.qte && node.next) {
        setTimeout(() => {
          if (this.isSkipActive && !this.isAnyModalOpen()) {
            this.resolveAndGoNext(node.next);
          }
        }, 120);
      } else {
        this.stopSkip();
      }
    }
  }

  renderChoices(choices) {
    this.dom.choiceBox.innerHTML = "";
    this.dom.choiceBox.classList.remove("hidden");
    if (this.dom.gameContainer) {
      this.dom.gameContainer.classList.add("has-choices");
    }

    choices.forEach((c, idx) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";

      const numSpan = document.createElement("span");
      numSpan.className = "choice-num";
      numSpan.textContent = `0${idx + 1}`;

      const textSpan = document.createElement("span");
      textSpan.className = "choice-text";
      textSpan.textContent = c.text;

      btn.appendChild(numSpan);
      btn.appendChild(textSpan);

      btn.addEventListener("mouseenter", () => {
        window.sound && window.sound.hover();
      });

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.blur();
        window.sound && window.sound.click();
        if (this.dom.gameContainer) {
          this.dom.gameContainer.classList.remove("has-choices");
        }
        this.dom.choiceBox.classList.add("hidden");
        this.dom.choiceBox.innerHTML = "";
        this.resolveAndGoNext(c.target);
      });

      this.dom.choiceBox.appendChild(btn);
    });
  }

  // ==========================================
  // 恶趣味实时吃瓜弹幕层
  // ==========================================
  spawnDanmaku(danmakuList) {
    if (!this.dom.danmakuLayer || !Array.isArray(danmakuList)) return;

    // 防止连续快点堆积过多节点
    while (this.dom.danmakuLayer.children.length > 24) {
      this.dom.danmakuLayer.firstElementChild.remove();
    }

    const trackTops = [6, 23, 40, 57, 74];
    danmakuList.forEach((rawText, idx) => {
      const text = String(rawText || "").trim();
      if (!text) return;

      const item = document.createElement("div");
      item.className = "danmaku-item";
      item.textContent = text;

      const color = DANMAKU_COLORS[(idx + Math.floor(Math.random() * 2)) % DANMAKU_COLORS.length];
      const trackPct = trackTops[idx % trackTops.length];
      const duration = (7.2 + (idx % 3) * 0.65 + Math.random() * 0.7).toFixed(2);
      const delay = (idx * 0.42 + Math.random() * 0.16).toFixed(2);

      item.style.color = color;
      item.style.top = `${trackPct}%`;
      item.style.animationDuration = `${duration}s`;
      item.style.animationDelay = `${delay}s`;

      item.addEventListener("animationend", () => {
        item.remove();
      });
      setTimeout(() => {
        if (item.parentNode) item.remove();
      }, 11500);

      this.dom.danmakuLayer.appendChild(item);
    });
  }

  // ==========================================
  // 🍉《硅谷今夜大瓜号外》小报渲染
  // ==========================================
  renderTabloid() {
    if (!this.dom.tabloidModal) return;
    const data = Object.assign({}, DEFAULT_TABLOID_DATA, this.script.tabloidData || {});

    this.dom.tabloidIssue.textContent = data.issue || DEFAULT_TABLOID_DATA.issue;
    this.dom.tabloidHeadline.textContent = data.headline || DEFAULT_TABLOID_DATA.headline;
    this.dom.tabloidSubhead.textContent = data.subhead || DEFAULT_TABLOID_DATA.subhead;

    const imgSrc = data.image || DEFAULT_TABLOID_DATA.image;
    this.dom.tabloidImage.style.display = "";
    this.dom.tabloidImage.src = imgSrc;
    this.dom.tabloidCaption.textContent = data.caption || DEFAULT_TABLOID_DATA.caption;

    // 2×2 四宫格暴击热搜板
    if (this.dom.tabloidQuadGrid) {
      const quads = Array.isArray(data.quads) && data.quads.length > 0
        ? data.quads
        : DEFAULT_TABLOID_DATA.quads;
      this.dom.tabloidQuadGrid.innerHTML = "";
      quads.forEach((q) => {
        const card = document.createElement("div");
        card.className = "tabloid-quad-card";
        const tag = document.createElement("div");
        tag.className = "quad-tag";
        tag.textContent = q.tag || "";
        const body = document.createElement("div");
        body.className = "quad-body";
        body.textContent = q.text || "";
        card.appendChild(tag);
        card.appendChild(body);
        this.dom.tabloidQuadGrid.appendChild(card);
      });
    }

    const letterText = Array.isArray(data.letterExcerpt)
      ? data.letterExcerpt.join("\n")
      : (data.letterExcerpt || DEFAULT_TABLOID_DATA.letterExcerpt);
    this.dom.tabloidLetter.textContent = letterText;

    const comments = Array.isArray(data.comments) && data.comments.length > 0
      ? data.comments
      : DEFAULT_TABLOID_DATA.comments;

    this.dom.tabloidComments.innerHTML = "";
    comments.forEach((c, idx) => {
      const card = document.createElement("div");
      card.className = "tabloid-comment-item";

      if (typeof c === "string") {
        const body = document.createElement("div");
        body.textContent = c;
        card.appendChild(body);
      } else if (c && typeof c === "object") {
        const user = c.user || c.author || c.name || c.nick || `@吃瓜网友0${idx + 1}`;
        const likes = c.likes || c.hot || c.votes || "";
        const text = c.text || c.content || c.comment || c.msg || "";

        const top = document.createElement("div");
        top.className = "tabloid-comment-top";

        const userSpan = document.createElement("span");
        userSpan.className = "tabloid-comment-user";
        userSpan.textContent = user;
        top.appendChild(userSpan);

        if (likes) {
          const likeSpan = document.createElement("span");
          likeSpan.className = "tabloid-comment-likes";
          likeSpan.textContent = `👍 ${likes}`;
          top.appendChild(likeSpan);
        }

        const body = document.createElement("div");
        body.textContent = text;

        card.appendChild(top);
        card.appendChild(body);
      }

      this.dom.tabloidComments.appendChild(card);
    });
  }

  // ==========================================
  // HUD 状态刷新（白蜡烛 + 美股绿涨红跌 + 老黄血压预警）
  // ==========================================
  renderHUD() {
    const candles = typeof this.state.candles === "number" ? this.state.candles : 18;
    const stock = typeof this.state.stock === "number" ? this.state.stock : 129.00;
    const stockChange = typeof this.state.stockChange === "number" ? this.state.stockChange : -14.00;
    const bp = typeof this.state.bp === "number" ? this.state.bp : 40;

    // 1. 总部白蜡烛数与灵堂气氛徽标
    this.dom.loveValue.textContent = `${candles} 根`;
    this.dom.loveBar.style.width = `${candles}%`;
    this.dom.loveBar.classList.remove("bar-low", "bar-high");

    if (this.dom.loveStatusTag) {
      this.dom.loveStatusTag.classList.remove("love-tag-low", "love-tag-mid", "love-tag-high");
      if (candles <= 25) {
        this.dom.loveStatusTag.textContent = "🕯️ 零星白烛";
        this.dom.loveStatusTag.classList.add("love-tag-low");
        this.dom.loveBar.classList.add("bar-low");
      } else if (candles >= 80) {
        this.dom.loveStatusTag.textContent = "⚡ 串子封神";
        this.dom.loveStatusTag.classList.add("love-tag-high");
        this.dom.loveBar.classList.add("bar-high");
      } else if (candles >= 55) {
        this.dom.loveStatusTag.textContent = "🪩 灵堂蹦迪";
        this.dom.loveStatusTag.classList.add("love-tag-high");
      } else {
        this.dom.loveStatusTag.textContent = "🌼 菊花摆摊";
        this.dom.loveStatusTag.classList.add("love-tag-mid");
      }
    }

    // 2. 股价与涨跌幅（美股绿涨红跌）
    const isUp = stockChange >= 0;
    const sign = isUp ? "+" : "";
    const colorClass = isUp ? "stock-green" : "stock-red";
    this.dom.stockDisplay.className = `hud-val ${colorClass}`;
    this.dom.stockDisplay.textContent = `$${stock.toFixed(2)} (${sign}${stockChange.toFixed(2)}%)`;

    // 3. 老黄血压值（满 100% 触发救护车拉进鲍姐医疗部）
    let bpState = "隐忍";
    if (bp >= 100) bpState = "🚑 爆表";
    else if (bp >= 80) bpState = "⚠️ 濒危";
    else if (bp >= 60) bpState = "💢 捂胸";

    this.dom.votesDisplay.textContent = `${bp}% · ${bpState}`;
    this.dom.votesBadge.classList.remove("votes-pass", "bp-warn", "bp-critical");
    if (bp >= 80) {
      this.dom.votesBadge.classList.add("bp-critical");
    } else if (bp >= 60) {
      this.dom.votesBadge.classList.add("bp-warn");
    }
  }

  // ==========================================
  // 快进 (Skip) 控制
  // ==========================================
  toggleSkip() {
    if (this.isSkipActive) {
      this.stopSkip();
    } else {
      this.startSkip();
    }
  }

  startSkip() {
    if (this.isAnyModalOpen()) return;
    this.isSkipActive = true;
    this.dom.btnSkip.classList.add("btn-active");
    if (this.isTyping) {
      this.finishTypingImmediately();
    } else {
      const node = this.script.nodes[this.state.currentNode];
      if (node && (!node.choices || node.choices.length === 0) && !node.qte && node.next) {
        this.resolveAndGoNext(node.next);
      } else {
        this.stopSkip();
      }
    }
  }

  stopSkip() {
    this.isSkipActive = false;
    this.dom.btnSkip.classList.remove("btn-active");
  }

  // ==========================================
  // 第三幕：后厨焚情炼卡炉 QTE 小游戏
  // ==========================================
  triggerOvenQte() {
    if (this.isSkipActive) this.stopSkip();
    if (this.qteActive) return;

    const SPEED_PCT_PER_SEC = 90; // 恒定每秒扫过 90%，彻底独立于显示器刷新率
    this.qteActive = true;
    this.qtePos = 10;
    this.qteDirection = 1;
    this.dom.qtePointer.style.left = `${this.qtePos}%`;
    this.openModal(this.dom.qteModal);

    let lastTimestamp = null;
    const animate = (timestamp) => {
      if (!this.qteActive) return;
      const now = typeof timestamp === "number" ? timestamp : (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (lastTimestamp === null) {
        lastTimestamp = now;
      }
      const dtSec = Math.max(0, Math.min(0.05, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      this.qtePos += this.qteDirection * SPEED_PCT_PER_SEC * dtSec;
      if (this.qtePos >= 92) {
        this.qtePos = 92 - (this.qtePos - 92);
        this.qteDirection = -1;
      } else if (this.qtePos <= 8) {
        this.qtePos = 8 + (8 - this.qtePos);
        this.qteDirection = 1;
      }
      this.qtePos = Math.max(8, Math.min(92, this.qtePos));
      this.dom.qtePointer.style.left = `${this.qtePos}%`;
      this.qteAnimId = requestAnimationFrame(animate);
    };
    this.qteAnimId = requestAnimationFrame(animate);
  }

  onQteCatch() {
    if (!this.qteActive) return;
    this.qteActive = false;
    cancelAnimationFrame(this.qteAnimId);

    // 甜点区为 42% ~ 58%
    const isSuccess = this.qtePos >= 42 && this.qtePos <= 58;
    this.state.qteResult = isSuccess;

    if (isSuccess) {
      window.sound && window.sound.qteSuccess();
      this.showToast("🔥 8G 耻辱显存已拆除！满血 DLSS 4 神卡淬火出炉！");
    } else {
      window.sound && window.sound.qteFail();
      this.showToast("💥 焊歪冒黑烟！8G 黄金显存永久焊死在 PCB 上了！");
    }

    setTimeout(() => {
      this.closeModal(this.dom.qteModal);
      this.resolveAndGoNext("p3_8_check");
    }, 800);
  }

  // ==========================================
  // 一键抄底整活按钮
  // ==========================================
  triggerBuyDipPrank() {
    window.sound && window.sound.reject();
    this.dom.gameContainer.classList.add("shake-screen");
    setTimeout(() => {
      this.dom.gameContainer.classList.remove("shake-screen");
    }, 600);
    this.openModal(this.dom.buyDipModal);
  }

  // ==========================================
  // 6 大损人结局识别、解锁与结算诊断书
  // ==========================================
  extractEndingCode(nodeId) {
    if (!nodeId) return null;
    const m = String(nodeId).match(/^end_(te|he|ne|be1|be2|be3)(?:_|$)/i);
    return m ? m[1].toUpperCase() : null;
  }

  unlockEnding(code) {
    if (!code) return;
    const upper = String(code).toUpperCase();
    this.lastEndingCode = upper;
    this.state.lastEndingCode = upper;

    if (!this.endingsUnlocked.includes(upper)) {
      this.endingsUnlocked.push(upper);
      try {
        localStorage.setItem("love_leather_endings", JSON.stringify(this.endingsUnlocked));
      } catch (e) {}
    }
    this.renderEndingsGallery();
  }

  triggerEndingDiagnosis() {
    const endKey =
      this.extractEndingCode(this.state.currentNode) ||
      this.lastEndingCode ||
      this.state.lastEndingCode ||
      "BE2";

    const endDef = (this.script.endings && this.script.endings[endKey]) ||
      (this.script.endings && this.script.endings.BE2) || {
        badge: endKey,
        title: "圣克拉拉雨夜终局",
        stamp: "今夜收盘",
        desc: "这一夜的追思会终于落下帷幕。",
        quote: "“多帧生成诚可贵，原生钱包价更高。”"
      };

    if (endKey.startsWith("BE")) {
      window.sound && window.sound.endingBe();
    } else {
      window.sound && window.sound.endingTe();
    }

    this.dom.endingStamp.textContent = endDef.stamp;
    this.dom.endingTitle.textContent = `${endDef.badge} · ${endDef.title}`;
    this.dom.endingDesc.textContent = endDef.desc;
    this.dom.endingQuote.textContent = endDef.quote;

    const candles = typeof this.state.candles === "number" ? this.state.candles : 18;
    const bp = typeof this.state.bp === "number" ? this.state.bp : 40;
    const stock = typeof this.state.stock === "number" ? this.state.stock : 129.00;
    const stockChange = typeof this.state.stockChange === "number" ? this.state.stockChange : -14.00;

    // 串子嘴替毒舌评级
    let rating = "C (白蜡烛都点不旺)";
    if (candles >= 85 && bp < 90) rating = "SSS (华尔街级阴阳怪气大宗师)";
    else if (candles >= 70) rating = "S (总部门口首席追思控评官)";
    else if (candles >= 50) rating = "A (合格反串护夫宝)";
    else if (bp >= 95) rating = "🚑 (物理超度·血压拉爆专业户)";

    const unlockedValidCount = ENDING_ORDER.filter(c => this.endingsUnlocked.includes(c)).length;
    const totalEndings = ENDING_ORDER.length;

    this.dom.endingStats.innerHTML = `
      <div class="stat-card"><span>最终 NVDA 股价</span><strong>$${stock.toFixed(2)} (${stockChange >= 0 ? "+" : ""}${stockChange.toFixed(2)}%)</strong></div>
      <div class="stat-card"><span>串子嘴替战绩</span><strong>🕯️ ${candles} 根 · ${rating}</strong></div>
      <div class="stat-card"><span>老黄收尾血压</span><strong>🔥 ${bp}% / 100%</strong></div>
      <div class="stat-card"><span>损人结局图鉴</span><strong>${unlockedValidCount} / ${totalEndings} (${Math.round(unlockedValidCount / totalEndings * 100)}%)</strong></div>
    `;

    this.openModal(this.dom.endingModal);
  }

  // ==========================================
  // 3 槽位存档 / 读档系统
  // ==========================================
  renderSaveSlots() {
    this.dom.saveSlots.innerHTML = "";
    for (let slot = 1; slot <= 3; slot++) {
      let data = null;
      try {
        const dataStr = localStorage.getItem(`love_leather_save_${slot}`);
        data = dataStr ? JSON.parse(dataStr) : null;
      } catch (e) {}

      const slotElem = document.createElement("div");
      slotElem.className = "slot-card";

      if (data) {
        const slotCandles = typeof data.candles === "number" ? data.candles : (data.love || 18);
        const slotBp = typeof data.bp === "number" ? data.bp : 40;
        slotElem.innerHTML = `
          <div class="slot-info">
            <div class="slot-header"><span class="slot-badge">槽位 0${slot}</span><span class="slot-time">${data.timestamp}</span></div>
            <div class="slot-detail">白烛 ${slotCandles}根 · 股价 $${Number(data.stock).toFixed(2)} · 血压 ${slotBp}%</div>
            <div class="slot-text">“${data.previewText || '无预览'}”</div>
          </div>
          <button class="btn-slot-action save-btn">覆盖存档</button>
        `;
      } else {
        slotElem.innerHTML = `
          <div class="slot-info">
            <div class="slot-header"><span class="slot-badge">槽位 0${slot}</span><span class="slot-empty">空白槽位</span></div>
            <div class="slot-detail">点击右侧按钮将当前进度写入此槽位</div>
          </div>
          <button class="btn-slot-action save-btn">新建存档</button>
        `;
      }

      slotElem.querySelector(".save-btn").addEventListener("click", () => {
        const ok = this.saveToSlot(slot);
        if (ok) {
          window.sound && window.sound.click();
          this.renderSaveSlots();
          this.showToast(`已成功保存至槽位 0${slot}！`);
        } else {
          window.sound && window.sound.reject();
          this.showToast("⚠️ 保存失败：当前浏览器禁用或写满了本地存储！");
        }
      });

      this.dom.saveSlots.appendChild(slotElem);
    }
  }

  renderLoadSlots() {
    this.dom.loadSlots.innerHTML = "";
    for (let slot = 1; slot <= 3; slot++) {
      let data = null;
      try {
        const dataStr = localStorage.getItem(`love_leather_save_${slot}`);
        const parsed = dataStr ? JSON.parse(dataStr) : null;
        data = parsed && parsed.state && typeof parsed.state === "object" ? parsed : null;
      } catch (e) {}

      const slotElem = document.createElement("div");
      slotElem.className = `slot-card ${data ? '' : 'disabled'}`;

      if (data) {
        const slotCandles = typeof data.candles === "number" ? data.candles : (data.love || 18);
        const slotBp = typeof data.bp === "number" ? data.bp : 40;
        slotElem.innerHTML = `
          <div class="slot-info">
            <div class="slot-header"><span class="slot-badge">槽位 0${slot}</span><span class="slot-time">${data.timestamp}</span></div>
            <div class="slot-detail">白烛 ${slotCandles}根 · 股价 $${Number(data.stock).toFixed(2)} · 血压 ${slotBp}%</div>
            <div class="slot-text">“${data.previewText || '无预览'}”</div>
          </div>
          <button class="btn-slot-action load-btn">读取</button>
        `;
        slotElem.querySelector(".load-btn").addEventListener("click", () => {
          window.sound && window.sound.click();
          this.loadGameState(data.state);
          this.closeModal(this.dom.loadModal);
          if (!this.dom.titleScreen.classList.contains("hidden")) {
            this.dom.titleScreen.classList.add("hidden");
          }
          this.showToast(`已读取槽位 0${slot}！`);
        });
      } else {
        slotElem.innerHTML = `
          <div class="slot-info">
            <div class="slot-header"><span class="slot-badge">槽位 0${slot}</span><span class="slot-empty">无存档记录</span></div>
          </div>
        `;
      }
      this.dom.loadSlots.appendChild(slotElem);
    }
  }

  saveToSlot(slot) {
    const now = new Date();
    const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const node = this.script.nodes[this.state.currentNode];

    const rawPreview = node
      ? (node.text || (node.choices && node.choices[0] ? `【抉择】${node.choices[0].text}` : ""))
      : "";
    const saveData = {
      timestamp: timeStr,
      candles: this.state.candles,
      stock: this.state.stock,
      bp: this.state.bp,
      previewText: String(rawPreview).substring(0, 24).replace(/[<>"]/g, "") + "...",
      state: JSON.parse(JSON.stringify(this.state))
    };
    const key = `love_leather_save_${slot}`;
    const serialized = JSON.stringify(saveData);
    try {
      localStorage.setItem(key, serialized);
      return localStorage.getItem(key) === serialized;
    } catch (e) {
      return false;
    }
  }

  autoSave() {
    try {
      localStorage.setItem("love_leather_autosave", JSON.stringify(this.state));
    } catch (e) {}
  }

  // ==========================================
  // 回看 (Backlog)
  // ==========================================
  renderBacklog() {
    this.dom.logList.innerHTML = "";
    this.history.forEach((h) => {
      const item = document.createElement("div");
      item.className = "log-item";

      const spk = document.createElement("span");
      spk.className = "log-speaker";
      spk.textContent = `${h.speaker}：`;

      const txt = document.createElement("span");
      txt.className = "log-text";
      txt.textContent = h.text;

      item.appendChild(spk);
      item.appendChild(txt);
      this.dom.logList.appendChild(item);
    });
    setTimeout(() => {
      this.dom.logList.scrollTop = this.dom.logList.scrollHeight;
    }, 50);
  }

  // ==========================================
  // 背包
  // ==========================================
  renderInventory() {
    this.dom.inventoryGrid.innerHTML = "";
    if (!Array.isArray(this.state.inventory) || this.state.inventory.length === 0) {
      this.dom.inventoryGrid.innerHTML = `<div class="empty-hint">口袋空空如也，连半截战损皮衣袖子都没抢到……</div>`;
      return;
    }

    this.state.inventory.forEach(itemId => {
      const item = this.script.itemDefs && this.script.itemDefs[itemId];
      if (!item) return;

      const card = document.createElement("div");
      card.className = "inventory-card";
      card.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-name">${item.name}</div>
        <div class="item-desc">${item.desc}</div>
      `;
      this.dom.inventoryGrid.appendChild(card);
    });
  }

  // ==========================================
  // 8 大结局图鉴
  // ==========================================
  loadEndings() {
    try {
      const raw = localStorage.getItem("love_leather_endings");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  renderEndingsGallery() {
    if (!this.dom.galleryGrid || !this.dom.galleryCount) return;
    this.dom.galleryGrid.innerHTML = "";

    const unlockedCount = ENDING_ORDER.filter(code => this.endingsUnlocked.includes(code)).length;
    this.dom.galleryCount.textContent = `${unlockedCount} / ${ENDING_ORDER.length}`;

    ENDING_ORDER.forEach(code => {
      const endDef = (this.script.endings && this.script.endings[code]) || {
        badge: `🎯 ${code}`,
        title: `${code} 结局`,
        desc: "隐藏世界线等待解锁中……",
        quote: "",
        req: "推进不同剧情抉择即可解锁"
      };
      const isUnlocked = this.endingsUnlocked.includes(code);

      const card = document.createElement("div");
      card.className = `gallery-card ${isUnlocked ? 'unlocked' : 'locked'}`;

      if (isUnlocked) {
        card.innerHTML = `
          <div class="gallery-badge">${endDef.badge}</div>
          <div class="gallery-title">${endDef.title}</div>
          <div class="gallery-desc">${endDef.desc}</div>
          <div class="gallery-quote">${endDef.quote}</div>
        `;
      } else {
        card.innerHTML = `
          <div class="gallery-badge">🔒 尚未达成 (${code})</div>
          <div class="gallery-title">【结局未解锁】</div>
          <div class="gallery-desc">解锁线索：${endDef.req}</div>
        `;
      }
      this.dom.galleryGrid.appendChild(card);
    });
  }

  // ==========================================
  // 已读节点缓存
  // ==========================================
  loadReadNodes() {
    try {
      const raw = localStorage.getItem("love_leather_read_nodes");
      if (raw) {
        this.readNodes = new Set(JSON.parse(raw));
      }
    } catch (e) {}
  }

  saveReadNodes() {
    try {
      localStorage.setItem("love_leather_read_nodes", JSON.stringify(Array.from(this.readNodes)));
    } catch (e) {}
  }

  // ==========================================
  // Toast 浮动提示
  // ==========================================
  showToast(msg, variant = "") {
    const toast = document.createElement("div");
    toast.className = variant ? `toast-bubble toast-${variant}` : "toast-bubble";
    toast.textContent = msg;
    const host = this.dom.gameContainer || document.body;
    host.appendChild(toast);
    const stayMs = variant === "buffett" ? 3400 : 2200;
    setTimeout(() => {
      toast.classList.add("toast-fade-out");
      setTimeout(() => toast.remove(), 400);
    }, stayMs);
  }

  // ==========================================
  // 飘落樱花像素粒子
  // ==========================================
  initSakuraParticles() {
    const container = this.dom.sakuraContainer || document.getElementById("sakuraContainer");
    if (!container) return;

    for (let i = 0; i < 24; i++) {
      const p = document.createElement("div");
      p.className = "sakura-petal";
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${5 + Math.random() * 6}s`;
      p.style.animationDelay = `${Math.random() * 5}s`;
      p.style.opacity = `${0.35 + Math.random() * 0.5}`;
      container.appendChild(p);
    }
  }
}

// 页面加载完成后自启动
window.addEventListener("DOMContentLoaded", () => {
  window.gameEngine = new GalgameEngine();
  window.gameEngine.init();
});
