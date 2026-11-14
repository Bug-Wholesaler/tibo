'use strict';

/**
 * 三大修罗场交互小玩法：
 * 1. im_rush: 五窗夺命私信 · 第一人称限时端水
 * 2. ppt_builder: 紧急公关 PPT 黑话拼装器（支持拖拽与点击双交互）
 * 3. board_clash: 董事会主座五女围攻三轮嘴炮
 */
window.PovMinigames = (function () {
  const IM_WAVES = [
    {
      senderId: 'lori',
      senderName: '洛莉 · 家庭主群',
      badgeColor: '#fbbf24',
      question: '“海鲜市场那 108 份剪下来的黑袖边角料，快递品名我写‘前任总裁尊严碎片’还是‘导热硅胶垫’？”',
      options: [
        { text: '写「定制纪念导热垫」，运费算我账上，老婆息怒！', correct: true, favor: { lori: 6 }, msg: '【回对了】洛莉勉强哼了一声，暂时放下手里大剪刀。' },
        { text: '别寄啦！留给乐姐和闺女拍照打光用……', correct: false, msg: '【串群送命！】发错给正宫！咔嚓一声皮衣又少一件！' },
        { text: '写「超威红厂 6% 庆祝周边礼盒」挺喜庆！', correct: false, msg: '【彻底踩雷！】洛莉直接当场剪掉你半边袖子！' },
      ],
    },
    {
      senderId: 'alice',
      senderName: '乐姐 · VIP 密聊窗',
      badgeColor: '#fb7185',
      question: '“勋哥～南洋 48 亿算力加急批条还等我老公催呢，你跟大家说咱们这单走的是什么通道呀？”',
      options: [
        { text: '老公亲手端酒杯引荐的正经原厂授权渠道，账期先缓三天！', correct: true, favor: { alice: 6 }, msg: '【端水成功】乐姐暂时收起清吧九宫格原图没有乱发。' },
        { text: '谁跟你渠道？那是全员邮件群发泄漏的事故！', correct: false, msg: '【直接引爆！】乐姐反手把合影置顶全网热搜第一！' },
        { text: '问就是二十年临床双盲随访，先量个心率！', correct: false, msg: '【串窗事故！】乐姐冷笑：拿我当医疗部样本呢？' },
      ],
    },
    {
      senderId: 'kimberly',
      senderName: '鲍姐 · 医疗部加密线',
      badgeColor: '#38bdf8',
      question: '“1 号样本，您的静态心率仍超标。外媒追问您与医疗总监二十年同进同出的审计定性是什么？”',
      options: [
        { text: '高龄算力领袖心血管耐受度 20 年纵向双盲随访！绝对合规！', correct: true, favor: { kimberly: 6 }, msg: '【精准对词】鲍姐满意地点点头，给你降压面板调低 8 BPM。' },
        { text: '快发个全员公告说俺俩明天去台北开清吧！', correct: false, msg: '【串群炸裂！】鲍姐冷冷拿起冰冻听诊器外加手术剪……' },
        { text: '顺便帮我押一注零号开的 Net-Out 赔率盘！', correct: false, msg: '【挑衅御医！】鲍姐在报告上怒批：认知紊乱加一分！' },
      ],
    },
    {
      senderId: 'zero',
      senderName: '零号 · 开源吃瓜群',
      badgeColor: '#a855f7',
      question: '“前群主！大家问你干嘛把私密忏悔信写成小作文还不敢公开，你的开源态度呢？”',
      options: [
        { text: '不是不敢公开，那是 DLSS 4 算法情感权重开放测试版！', correct: true, favor: { zero: 6 }, msg: '【黑话共鸣】零号哈哈大笑：老登太懂梗了，赔率算你平手！' },
        { text: '别吵，我正在用 9.9 包邮买自己袖子！', correct: false, msg: '【血压上头！】零号当场截图置顶，全场散户笑到打鸣！' },
        { text: '库克明天带 8G 显存上任我就退休！', correct: false, msg: '【自暴自弃！】内网群炸出满屏“8G 卡皇警告”！' },
      ],
    },
    {
      senderId: 'lisa',
      senderName: '苏表姐 · 红厂直连窗',
      badgeColor: '#ef4444',
      question: '“表弟，超威今天暴涨 6%，外头都说你顶不住要让位给穿高领的果子哥啦？围裙留多大码？”',
      options: [
        { text: '谢表姐随份子！先把超威后厨烤箱说明书发来看看，但我今天还没认输呢！', correct: true, favor: { lisa: 6 }, msg: '【体面回敬】苏表姐挑眉轻笑：行，有底气，先留个特大码等你。' },
        { text: '表姐快救我！我这就写代码公开开源全员私信！', correct: false, msg: '【丢脸丢到红厂！】苏表姐默默截屏发了家族朋友圈！' },
        { text: '不穿围裙，我要当你的 4 号 AI 插帧！', correct: false, msg: '【全员暴走！】苏表姐：滚！严禁多通道并发！' },
      ],
    },
  ];

  const PPT_SLOTS = [
    { id: 'slot_arch', label: '第一页 · 核心架构定调', hint: '解释“1原配+3红颜”风波', bestIds: ['tok_native', 'tok_frame3'] },
    { id: 'slot_channel', label: '第二页 · 台北清吧与48亿批条', hint: '回应“姐夫引荐与闺女掌镜”', bestIds: ['tok_bro_in_law', 'tok_transparent'] },
    { id: 'slot_medical', label: '第三页 · 二十年直属高管同框', hint: '替鲍姐的近20年关系正名', bestIds: ['tok_clinical'] },
    { id: 'slot_open', label: '第四页 · 全员忏悔信开源事故', hint: '顺手回击零号并封堵库克谣言', bestIds: ['tok_open_weights', 'tok_no_8g'] },
  ];

  const PPT_TOKENS = [
    { id: 'tok_native', text: '[1原生帧]', score: 25, desc: '正宫原画基准校验位' },
    { id: 'tok_frame3', text: '[3倍AI插帧]', score: 25, desc: '多通道异步情绪补帧' },
    { id: 'tok_bro_in_law', text: '[姐夫原厂认证]', score: 25, desc: '南洋生态合规亲情背书' },
    { id: 'tok_clinical', text: '[20年靶向问诊]', score: 25, desc: '高管心血管双盲随访课题' },
    { id: 'tok_open_weights', text: '[Open Weights 透明公关]', score: 20, desc: '全员信逆向升级开源声明' },
    { id: 'tok_transparent', text: '[家庭掌镜可信审计]', score: 20, desc: '把贴脸自拍洗成全家福验收' },
    { id: 'tok_no_8g', text: '[拒绝8G黄金显存缩水]', score: 20, desc: '拿果子哥当共同假想敌' },
    { id: 'tok_trap_confess', text: '[老实承认全员都爱]', score: -35, desc: '高危自爆词条（切勿放入）' },
  ];

  const BOARD_ROUNDS = [
    {
      roundTitle: '第一轮围攻 · 原配剪刀与茶艺合影双连击',
      attackerLines: [
        '洛莉晃着大剪刀：“三十件定制黑皮衣剪到只剩三件，你倒是解释解释昨晚谁给你挑的灯！”',
        '乐姐举起手机：“人家那张清吧近照可是闺女亲手拍的呢～姐夫至今还等着 48 亿发货单哦！”',
      ],
      choices: [
        {
          text: '“先把家族原生帧校验拉满！闺女掌镜纯粹是帮老爹测手机人像光追，48 亿超规部分当场冻结！”',
          favor: { lori: 7, alice: -4, kimberly: 2 },
          stock: 1.5,
          bpm: 4,
          reply: '洛莉脸色明显和缓半度，乐姐气鼓鼓咬紧下唇但不敢当场撕破脸！',
        },
        {
          text: '“各位稍安勿躁！家庭校验归家庭，南洋大客户渠道照样保留合规框架，咱们内外双通道并行！”',
          favor: { lori: 3, alice: 5, zero: 3 },
          stock: 1.8,
          bpm: 8,
          reply: '两头都暂时按住了！虽然两边都在心里偷偷给你记了一笔高延迟警告……',
        },
        {
          text: '“都别吵了，拍照好看和剪衣利落说明你们俩各有千秋，要不合开一家高定店？”',
          favor: { lori: -6, alice: -3 },
          jackets: -1,
          stock: -1.4,
          bpm: 12,
          reply: '话音刚落，一道银光擦过你肩头——皮衣存活数当场再减 1 件！',
        },
      ],
    },
    {
      roundTitle: '第二轮围攻 · 临床心率警告与开源直播背刺',
      attackerLines: [
        '鲍姐敲击全息病历：“1 号样本血压已逼近红色警戒，再端不住这杯水我立刻建议董事会移交监护权。”',
        '零号举起直播手机：“家人们快看！如果老登今天当场社死，我直播间抽十张卡！”',
      ],
      choices: [
        {
          text: '“感谢医疗团队二十年风控守护，更欢迎年轻黑客监督透明化——全部指标即刻对股东开源审计！”',
          favor: { kimberly: 6, zero: 6, lori: 2 },
          stock: 2.0,
          bpm: -6,
          reply: '医疗合规与新生代吃瓜风向同时站队！大屏上红线突然向上猛抽两格！',
        },
        {
          text: '“谁敢动我监护权？！我写进 PPT 的核心显卡架构你们谁听得懂一半！”',
          favor: { kimberly: -6, zero: -4, lisa: 3 },
          stock: -1.2,
          bpm: 14,
          reply: '鲍姐冷笑一声直接把你的心电报警线调红，零号刷了满屏“老登急了”！',
        },
        {
          text: '“鲍总监先帮我按住血压，回头拿零号这直播间带货佣金一半充实医疗部科研经费！”',
          favor: { kimberly: 5, zero: 3 },
          stock: 0.9,
          bpm: -4,
          reply: '用预算利益巧妙搓圆了水火不容的二位，局势暂时稳住！',
        },
      ],
    },
    {
      roundTitle: '第三轮围攻 · 红厂表姐挖角与果子哥 8G 显存兵临城下',
      attackerLines: [
        '苏表姐捧着红芯礼盒笑眯眯：“超威今天 +6% 已成定局，趁果子哥还没扛着 8G 显存登基，来后厨跟表姐烤卡吧？”',
        '全员齐声盯着你：“最后一句定论——你的位置、皮衣和公司未来，到底给谁！”',
      ],
      choices: [
        {
          text: '“告诉果子哥，只要我还有最后半截皮衣在身，影卫达就绝不退回 8GB 耻辱时代！”',
          favor: { lori: 5, alice: 3, kimberly: 4, zero: 4, lisa: 4 },
          stock: 2.6,
          bpm: 4,
          reply: '一番宣言震住全场！连苏表姐都忍不住点头：“这才像我认识了三十年的冤家表弟！”',
        },
        {
          text: '“表姐你把红芯礼盒先放这儿，真要跌穿底线我今晚就带着全套手艺去超威报道！”',
          favor: { lisa: 9, lori: -5, kimberly: -3 },
          stock: -0.8,
          bpm: 2,
          reply: '表姐眼睛瞬间一亮，正宫与医疗总监同时眯起危险的眼神……',
        },
        {
          text: '“我选择把全部 30 年光辉写成代码开源，自己彻底净身脱圈看烟花！”',
          favor: { zero: 7, lori: -6 },
          jackets: -1,
          stock: -1.6,
          bpm: 8,
          reply: '零号激动的鼓掌欢呼，洛莉却气得抬手又绞断一条袖带！',
        },
      ],
    },
  ];

  function createEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function runImRush(container, audio, onFinish) {
    container.innerHTML = '';
    let waveIdx = 0;
    let okCount = 0;
    let failCount = 0;
    const aggDelta = {
      favor: { lori: 0, alice: 0, kimberly: 0, zero: 0, lisa: 0 },
      jackets: 0,
      stock: 0,
      bpm: 0,
    };
    let timeLeft = 12.0;
    let timerId = null;
    let locked = false;

    const wrap = createEl('div', 'mg-panel mg-im-wrap');
    const hdr = createEl('div', 'mg-header');
    const title = createEl('div', 'mg-title', '💬 五窗夺命私信 · 第一人称限时端水');
    const timerBadge = createEl('div', 'mg-timer', '12.0s');
    hdr.appendChild(title);
    hdr.appendChild(timerBadge);
    wrap.appendChild(hdr);

    const sub = createEl('div', 'mg-sub', '盯紧当前闪烁红框的私信窗口，切勿串群发错人或超时（每错一次当场挨剪 -1 件皮衣）！');
    wrap.appendChild(sub);

    // 5 窗口顶栏预览
    const winBar = createEl('div', 'mg-im-windows');
    const winNodes = {};
    IM_WAVES.forEach((w) => {
      const card = createEl('div', 'mg-im-win');
      card.style.setProperty('--accent', w.badgeColor);
      card.innerHTML = `<span class="mg-im-dot"></span><span class="mg-im-wname">${w.senderName}</span>`;
      winBar.appendChild(card);
      winNodes[w.senderId] = card;
    });
    wrap.appendChild(winBar);

    const msgBox = createEl('div', 'mg-im-msgbox');
    const feedback = createEl('div', 'mg-feedback');
    const optsBox = createEl('div', 'mg-options');
    wrap.appendChild(msgBox);
    wrap.appendChild(optsBox);
    wrap.appendChild(feedback);
    container.appendChild(wrap);

    function stopTimer() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    function advanceWave() {
      waveIdx++;
      if (waveIdx >= IM_WAVES.length) {
        stopTimer();
        onFinish({
          type: 'im_rush',
          okCount,
          failCount,
          score: okCount * 20,
          ...aggDelta,
        });
      } else {
        renderWave();
      }
    }

    function handleAnswer(opt, timedOut = false) {
      if (locked) return;
      locked = true;
      stopTimer();
      if (timedOut || !opt || !opt.correct) {
        failCount++;
        aggDelta.jackets -= 1;
        aggDelta.stock -= 0.7;
        aggDelta.bpm += 8;
        if (audio && audio.scissorSlash) audio.scissorSlash();
        feedback.className = 'mg-feedback bad';
        feedback.textContent = timedOut
          ? '⏱️ 超时未回！对面直接气急败坏顺着网线咔嚓剪碎你 1 件皮衣！'
          : opt.msg;
      } else {
        okCount++;
        aggDelta.stock += 0.6;
        aggDelta.bpm -= 2;
        if (opt.favor) {
          Object.keys(opt.favor).forEach((k) => {
            aggDelta.favor[k] = (aggDelta.favor[k] || 0) + opt.favor[k];
          });
        }
        if (audio && audio.imPing) audio.imPing();
        feedback.className = 'mg-feedback good';
        feedback.textContent = opt.msg;
      }
      setTimeout(advanceWave, 950);
    }

    function renderWave() {
      locked = false;
      const w = IM_WAVES[waveIdx];
      Object.keys(winNodes).forEach((k) => {
        winNodes[k].classList.toggle('active', k === w.senderId);
      });
      if (audio && audio.imPing) audio.imPing();
      msgBox.innerHTML = `<div class="mg-im-sender" style="color:${w.badgeColor}">[${waveIdx + 1}/${IM_WAVES.length}] ${w.senderName}</div><div class="mg-im-question">${w.question}</div>`;
      feedback.className = 'mg-feedback';
      feedback.textContent = '';
      optsBox.innerHTML = '';

      // 保持稳定且每波打乱一点顺序
      const ordered = w.options.slice().sort((a, b) => ((a.text.length + waveIdx) % 3) - ((b.text.length + waveIdx) % 3));
      ordered.forEach((opt) => {
        const btn = createEl('button', 'mg-opt-btn', opt.text);
        btn.type = 'button';
        btn.addEventListener('click', () => handleAnswer(opt, false));
        optsBox.appendChild(btn);
      });

      timeLeft = 12.0;
      timerBadge.textContent = `${timeLeft.toFixed(1)}s`;
      timerBadge.classList.remove('urgent');
      stopTimer();
      timerId = setInterval(() => {
        timeLeft = Math.max(0, timeLeft - 0.1);
        timerBadge.textContent = `${timeLeft.toFixed(1)}s`;
        if (timeLeft <= 4.0) timerBadge.classList.add('urgent');
        if (timeLeft <= 0) {
          handleAnswer(null, true);
        }
      }, 100);
    }

    renderWave();
    return () => stopTimer();
  }

  function runPptBuilder(container, audio, onFinish) {
    container.innerHTML = '';
    const assigned = {};
    let activeSlotId = PPT_SLOTS[0].id;
    let draggingTokenId = null;

    const wrap = createEl('div', 'mg-panel mg-ppt-wrap');
    const hdr = createEl('div', 'mg-header');
    hdr.appendChild(createEl('div', 'mg-title', '📊 紧急公关 PPT 黑话拼装器'));
    const countBadge = createEl('div', 'mg-timer', '已填 0 / 4 页');
    hdr.appendChild(countBadge);
    wrap.appendChild(hdr);
    wrap.appendChild(
      createEl('div', 'mg-sub', '点击选中 PPT 版块后再点词条即可填入（宽屏也支持拖拽），拼出能唬住董事局的白皮书，切勿手滑塞进自爆实话！')
    );

    const grid = createEl('div', 'mg-ppt-grid');
    const slotsCol = createEl('div', 'mg-ppt-slots');
    const tokensCol = createEl('div', 'mg-ppt-tokens');
    grid.appendChild(slotsCol);
    grid.appendChild(tokensCol);
    wrap.appendChild(grid);

    const feedback = createEl('div', 'mg-feedback');
    const submitBtn = createEl('button', 'btn-title btn-title-primary mg-ppt-submit', '📢 导出白皮书并呈送董事局 (至少填满4页)');
    submitBtn.type = 'button';
    wrap.appendChild(feedback);
    wrap.appendChild(submitBtn);
    container.appendChild(wrap);

    function render() {
      const filledCount = Object.keys(assigned).length;
      countBadge.textContent = `已填 ${filledCount} / ${PPT_SLOTS.length} 页`;
      submitBtn.disabled = filledCount < PPT_SLOTS.length;

      slotsCol.innerHTML = '';
      PPT_SLOTS.forEach((slot) => {
        const card = createEl('div', 'mg-ppt-slot');
        if (slot.id === activeSlotId) card.classList.add('selected');
        const tok = PPT_TOKENS.find((t) => t.id === assigned[slot.id]);
        card.innerHTML = `
          <div class="mg-slot-title">${slot.label}</div>
          <div class="mg-slot-hint">${slot.hint}</div>
          <div class="mg-slot-val ${tok ? 'filled' : ''}">${tok ? tok.text + ' · ' + tok.desc : '（先点此版块，再点选词条填入）'}</div>
        `;
        card.addEventListener('click', () => {
          activeSlotId = slot.id;
          if (audio && audio.click) audio.click();
          render();
        });
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          card.classList.add('dragover');
        });
        card.addEventListener('dragleave', () => card.classList.remove('dragover'));
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('dragover');
          const tid = e.dataTransfer ? e.dataTransfer.getData('text/plain') || draggingTokenId : draggingTokenId;
          if (tid) placeToken(slot.id, tid);
        });
        slotsCol.appendChild(card);
      });

      tokensCol.innerHTML = '';
      PPT_TOKENS.forEach((tok) => {
        const usedIn = Object.keys(assigned).find((k) => assigned[k] === tok.id);
        const btn = createEl('button', 'mg-token-chip');
        btn.type = 'button';
        btn.draggable = true;
        if (usedIn) btn.classList.add('used');
        btn.innerHTML = `<strong>${tok.text}</strong><span>${tok.desc}</span>`;
        btn.addEventListener('dragstart', (e) => {
          draggingTokenId = tok.id;
          if (e.dataTransfer) e.dataTransfer.setData('text/plain', tok.id);
        });
        btn.addEventListener('click', () => {
          placeToken(activeSlotId, tok.id);
        });
        tokensCol.appendChild(btn);
      });
    }

    function placeToken(slotId, tokenId) {
      // 从原槽位挪出避免重复
      Object.keys(assigned).forEach((k) => {
        if (assigned[k] === tokenId) delete assigned[k];
      });
      assigned[slotId] = tokenId;
      if (audio && audio.choice) audio.choice();
      const nextEmpty = PPT_SLOTS.find((s) => !assigned[s.id]);
      if (nextEmpty) activeSlotId = nextEmpty.id;
      render();
    }

    submitBtn.addEventListener('click', () => {
      let score = 0;
      let hasTrap = false;
      PPT_SLOTS.forEach((slot) => {
        const tid = assigned[slot.id];
        const tok = PPT_TOKENS.find((t) => t.id === tid);
        if (!tok) return;
        score += tok.score;
        if (slot.bestIds.includes(tid)) score += 10;
        if (tid === 'tok_trap_confess') hasTrap = true;
      });

      let rank = 'B';
      let stockDelta = 1.2;
      let bpmDelta = 2;
      let summary = '公关稿勉强能看，董事会虽然半信半疑，但一时也挑不出语法漏洞。';
      if (hasTrap) {
        rank = 'F';
        stockDelta = -2.4;
        bpmDelta = 12;
        summary = '【自爆大社死！】你在第' + (Object.keys(assigned).indexOf('slot_open') + 1) + '页塞了大实话！空头直接敲锣加仓！';
        if (audio && audio.alarm) audio.alarm();
      } else if (score >= 120) {
        rank = 'S';
        stockDelta = 3.2;
        bpmDelta = -6;
        summary = '【S级魔幻封神！】白皮书黑话密度爆表，华尔街分析师直呼看不懂但大受震撼！';
        if (audio && audio.buffett) audio.buffett();
      } else if (score >= 95) {
        rank = 'A';
        stockDelta = 2.0;
        bpmDelta = -2;
        summary = '【A级稳健洗白】把热搜瓜全部重塑成先进计算架构宣言，成功稳住机构盘！';
        if (audio && audio.choice) audio.choice();
      }

      feedback.className = 'mg-feedback ' + (hasTrap ? 'bad' : 'good');
      feedback.textContent = `PPT 评级：${rank} 级 (${score} 分) · ${summary}`;
      submitBtn.disabled = true;

      setTimeout(() => {
        onFinish({
          type: 'ppt_builder',
          rank,
          score,
          stock: stockDelta,
          bpm: bpmDelta,
          favor: hasTrap ? { lori: -6, kimberly: -4 } : { lori: 4, alice: 3, kimberly: 3, zero: 4 },
        });
      }, 1150);
    });

    render();
    return () => {};
  }

  function runBoardClash(container, audio, onFinish) {
    container.innerHTML = '';
    let roundIdx = 0;
    let totalScore = 0;
    const aggDelta = {
      favor: { lori: 0, alice: 0, kimberly: 0, zero: 0, lisa: 0 },
      stock: 0,
      jackets: 0,
      bpm: 0,
    };

    const wrap = createEl('div', 'mg-panel mg-board-wrap');
    const hdr = createEl('div', 'mg-header');
    const title = createEl('div', 'mg-title', '⚖️ 董事会主座 · 五女围攻三轮嘴炮');
    const roundBadge = createEl('div', 'mg-timer', 'Round 1 / 3');
    hdr.appendChild(title);
    hdr.appendChild(roundBadge);
    wrap.appendChild(hdr);

    const rosterBar = createEl('div', 'mg-board-roster');
    [
      ['lori', '洛莉', '#fbbf24'],
      ['alice', '乐姐', '#fb7185'],
      ['kimberly', '鲍姐', '#38bdf8'],
      ['zero', '零号', '#a855f7'],
      ['lisa', '苏表姐', '#ef4444'],
    ].forEach(([id, name, color]) => {
      const chip = createEl('div', 'mg-roster-chip');
      chip.dataset.id = id;
      chip.style.borderColor = color;
      chip.innerHTML = `<span style="color:${color};font-weight:800;">${name}</span><span class="mg-r-delta" id="mgDelta_${id}">+0</span>`;
      rosterBar.appendChild(chip);
    });
    wrap.appendChild(rosterBar);

    const attackBox = createEl('div', 'mg-board-attacks');
    const optsBox = createEl('div', 'mg-options');
    const feedback = createEl('div', 'mg-feedback');
    wrap.appendChild(attackBox);
    wrap.appendChild(optsBox);
    wrap.appendChild(feedback);
    container.appendChild(wrap);

    let locked = false;

    function renderRound() {
      locked = false;
      const r = BOARD_ROUNDS[roundIdx];
      roundBadge.textContent = `Round ${roundIdx + 1} / ${BOARD_ROUNDS.length}`;
      attackBox.innerHTML = `<div class="mg-round-name">${r.roundTitle}</div>` + r.attackerLines.map((l) => `<p class="mg-attack-line">${l}</p>`).join('');
      feedback.className = 'mg-feedback';
      feedback.textContent = '';
      optsBox.innerHTML = '';

      r.choices.forEach((ch) => {
        const btn = createEl('button', 'mg-opt-btn', ch.text);
        btn.type = 'button';
        btn.addEventListener('click', () => {
          if (locked) return;
          locked = true;
          if (ch.favor) {
            Object.keys(ch.favor).forEach((k) => {
              aggDelta.favor[k] = (aggDelta.favor[k] || 0) + ch.favor[k];
              const badge = document.getElementById(`mgDelta_${k}`);
              if (badge) {
                const v = aggDelta.favor[k];
                badge.textContent = (v >= 0 ? '+' : '') + v;
                badge.style.color = v >= 0 ? '#34d399' : '#f87171';
              }
            });
          }
          aggDelta.stock += ch.stock || 0;
          aggDelta.jackets += ch.jackets || 0;
          aggDelta.bpm += ch.bpm || 0;
          if ((ch.stock || 0) > 0) totalScore += 30;
          if ((ch.jackets || 0) < 0) {
            if (audio && audio.scissorSlash) audio.scissorSlash();
          } else if (audio && audio.choice) {
            audio.choice();
          }
          feedback.className = 'mg-feedback ' + ((ch.jackets || 0) < 0 || (ch.stock || 0) < 0 ? 'bad' : 'good');
          feedback.textContent = ch.reply;

          setTimeout(() => {
            roundIdx++;
            if (roundIdx >= BOARD_ROUNDS.length) {
              onFinish({
                type: 'board_clash',
                score: totalScore,
                ...aggDelta,
              });
            } else {
              renderRound();
            }
          }, 1150);
        });
        optsBox.appendChild(btn);
      });
    }

    renderRound();
    return () => {};
  }

  return {
    IM_WAVES,
    PPT_SLOTS,
    PPT_TOKENS,
    BOARD_ROUNDS,
    start(type, container, audio, onFinish) {
      if (type === 'im_rush') return runImRush(container, audio, onFinish);
      if (type === 'ppt_builder') return runPptBuilder(container, audio, onFinish);
      if (type === 'board_clash') return runBoardClash(container, audio, onFinish);
      onFinish({ type, score: 0 });
      return () => {};
    },
  };
})();
