/**
 * 《恋与皮衣：今夜无人加仓》（DLSS 4 四线修罗场 · 终极串子版）- 全剧本数据树
 * 四线修罗场追思会主线 + 6 大损人结局 + 实时弹幕 + 夺命四连洗 + 巴菲特与血压救护车双联动
 */

const SCRIPT_DATA = {
  // 初始游戏状态
  initialState: {
    currentNode: "p0_1",
    candles: 18,          // 🕯️ 圣克拉拉总部白蜡烛数 0~100 根
    stock: 129.00,        // 📉 NVDA 盘前股价 ($)（较 $192 高点蒸发超 32%）
    stockChange: -14.00,  // 盘前涨跌幅 (%)
    bp: 40,               // 🔥 老黄血压值 0~100%（爆表 100% 触发救护车拉走结局）
    inventory: [],        // 散户随身背包道具
    qteResult: null,      // 后厨回流焊 QTE 结果
    buffettShown: false,  // 是否已触发巴菲特升至富豪榜第七播报
    currentChapter: "序章：圣克拉拉追思会与白蜡烛摊"
  },

  // 散户修罗场恶搞道具库（6 大核心整活道具）
  itemDefs: {
    item_notice: {
      id: "item_notice",
      name: "【零遗言一撸到底公告截图】",
      icon: "📢",
      desc: "董事会连夜下发的解职通告，CEO、总裁、董事三职即刻解除，连句虚伪的『感谢多年贡献』都没给留，散户看了连夜批量下单白蜡烛。"
    },
    item_apology_draft: {
      id: "item_apology_draft",
      name: "【台北酒吧合照九宫格缓存】",
      icon: "📸",
      desc: "高清无码吃瓜原图：老公亲自引荐乐姐、本人亲闺女贴心掌镜构图，完美诠释什么叫『家庭开源透明协作架构』。"
    },
    item_lemon_water: {
      id: "item_lemon_water",
      name: "【Denny's 免费冰柠檬水】",
      icon: "🍋",
      desc: "山顶站岗暴躁散户今晚唯一的生命补给。卡里只剩 14 块 5 毛，喝不完还能顺手泼老头脸上给显卡核心物理降压。"
    },
    item_ecg_report: {
      id: "item_ecg_report",
      name: "【鲍姐亲签 20 年心率监测病历】",
      icon: "🩺",
      desc: "医疗保健女 VP 鲍姐（Kimberly）保存了近二十年的『生命科学一对一深夜汇报曲线』，每分钟都在考验股东承受极限。"
    },
    item_rtx5090: {
      id: "item_rtx5090",
      name: "【拆掉8G耻辱颗粒·满血神卡】",
      icon: "⚡",
      desc: "在后厨回流焊炉里亲手抠掉果味 8GB 黄金显存后重铸的满血样卡，通体玄黑发亮，终于不再被库克笑话。"
    },
    item_glue: {
      id: "item_glue",
      name: "【华强北工业级防插帧焊死胶】",
      icon: "🧴",
      desc: "一滴焊死皮衣拉链，两滴物理断开 Wi-Fi，专治六十岁算力老头半夜手痒给第 4 号女员工手动补帧。"
    }
  },

  // 🍉《硅谷今夜大瓜号外》四宫格暴击小报
  tabloidData: {
    issue: "🍉《硅谷今夜大瓜号外》· 追思会突发特刊 · 第 4090 期",
    headline: "1 原配 + 3 情人 = DLSS 4 肉身四倍多帧生成！三职一撸到底连遗言都没留！",
    subhead: "圣克拉拉总部门口摆满白菊花与白蜡烛 · 盘前暴跌 -14%（较山顶高点已蒸发超 30%）",
    image: "assets/cg_distracted.jpg",
    caption: "▲ 吃瓜现场名画《物理插帧大师》：台北酒吧亲闺女掌镜贴贴照与总部门口千支白蜡烛同框冲上热搜第一",
    quads: [
      {
        tag: "瓜1【姐夫严选】",
        text: "Megaspeed 高管乐姐（卷入48亿算力倒爷风波）：老公亲自引荐认识，台北酒吧贴贴由亲闺女掌镜拍照！"
      },
      {
        tag: "瓜2【贴身医保】",
        text: "潜伏近20年的直属下属！医疗保健副总裁鲍姐（Kimberly）深夜一对一汇报生命科学！"
      },
      {
        tag: "瓜3【隐藏盲盒】",
        text: "路透社辞职日再爆第3名内部女员工！算力教父实现“1 原生帧 + 3 插帧”满血并发！"
      },
      {
        tag: "瓜4【灵堂蹦迪】",
        text: "总部大楼外摆满鲜花白蜡烛，老马在线发聘书招安，金发大统领钦点苹果库克跨界接盘！"
      }
    ],
    letterExcerpt: [
      "【官方三职一撸到底公告（省流直译版）】",
      "经董事会连夜投票：即日起解除某皮衣先生 CEO、总裁、董事三项全部职务，立即生效，无过渡期、无致敬环节、连一句『祝愿未来一切顺利』的体面遗言都没留。",
      "【热心散户追思会现场播报】",
      "目前圣克拉拉园区正门已被九块九包邮的白菊花和电子白蜡烛彻底淹没，门外哭丧队列一路排到了十字路口红绿灯；隔壁巴菲特老爷子睡醒喝口可乐，发现自己躺赢升到了富豪榜第七。"
    ],
    comments: [
      {
        user: "@192山顶满仓冤种",
        likes: "14.8w",
        text: "准备买显卡和结婚的血汗本金全套在山顶，账户缩水三成多，银行卡就剩 14 块 5……既然退不了钱，今晚老黄每哭一声我都帮他大声洗一句！"
      },
      {
        user: "@DLSS4课代表",
        likes: "11.2w",
        text: "1 个原配叫原生渲染帧，3 个红颜叫 AI 预测补帧，合起来正好四倍帧率！全网黑子懂个锤子的算力架构！"
      },
      {
        user: "@果味8G黄金内存受害者",
        likes: "9.7w",
        text: "别真让库克来接盘啊！！我怕明年 RTX 6090 Air 焊死 8GB 显存，买卡还不送风扇和散热硅脂！！"
      },
      {
        user: "@德州铁皮火箭HR",
        likes: "8.5w",
        text: "楼上某教父速来老马工位报到！区区三个插帧算什么，德州火箭车间手把手教你什么叫工业级硅谷繁殖学！"
      }
    ]
  },

  // 6 大损人结局图鉴定义
  endings: {
    TE: {
      code: "TE",
      title: "DLSS 4 满帧复活",
      badge: "🏆 TRUE ENDING",
      stamp: "反串封神",
      desc: "你凭一己之力把全网黑子和空头彻底串懵了！华尔街量化机构连夜把你的阴阳洗地长文喂进模型，竟误以为“1原生+3插帧”是下一代 GPU 神秘架构的绝密暗号！空头踩踏回补把股价直接拉上天，山顶全仓的血汗本金连本带利全吐了回来。",
      quote: "“黑子只看风月，华尔街只认暗号！谁能想到四倍多帧生成救了满仓散户的命？”",
      req: "路线1 · 总部门口白蜡烛 >= 72 根，股价 >= -6.0%，后厨成功拆掉8G焊出满血神卡，且全程没把老黄血压气炸"
    },
    HE: {
      code: "HE",
      title: "剪刀手合伙人 · Denny's 终身洗碗工",
      badge: "🍳 HAPPY ENDING",
      stamp: "盘子刷冒烟",
      desc: "为了防止这老头以后再搞出第 4 个、第 5 个插帧对象连累大盘，你联手正宫没收了他所有黑皮衣和两部手机，把最后一件皮衣剪成限量纪念块卖 99 刀回本，并直接把这六十岁老头捆回 Denny's 后厨终身刷盘子摊松饼抵债！",
      quote: "“刷不完今晚这三百个油盘子，别想拿回手机！再敢偷偷补帧我就把你的铁铲焊死！”",
      req: "路线2 · 白蜡烛 >= 52 根且股价 >= -14.0%，选择“没收皮衣与手机，联手正宫把他捆回 Denny's 终身刷盘子”"
    },
    NE: {
      code: "NE",
      title: "德州火箭焊工·繁殖学进修生",
      badge: "🚀 NORMAL ENDING",
      stamp: "投奔老马",
      desc: "反串洗地洗到最后实在没法收场，你一脚油门把老黄打包送去了德州找老马报到。老黄白天在闷热铁皮厂房里蹲着给星舰焊推理芯片，晚上还得被老马按头旁听硅谷繁殖学大师课——直到他看着课表颤抖承认：区区三个插帧，在人家面前纯属新兵蛋子。",
      quote: "“来给我打工是我的荣幸。先把那堆 8G 边角料焊到火箭助推器上，晚上教你什么叫真正的多线程！”",
      req: "路线3 · 股价 >= -16.0% 且老黄血压 < 85%，选择“打包投奔老马学繁殖学”"
    },
    BE1: {
      code: "BE1",
      title: "圣克拉拉捧花人",
      badge: "🚑 BAD ENDING 1",
      stamp: "血压拉爆",
      desc: "你的每一句嘴替洗地都精准踩在他大动脉上！随着最后一声惊天咳血，老黄血压飙破 100% 阈值当场抽搐倒地，直接被 120 急救车拉进了公司内部医疗部——好死不死主治领班刚好归潜伏 20 年的鲍姐管！至于你，只能捧着一束九块九包邮的白菊花，站在圣克拉拉总部门口排第 10086 号。",
      quote: "“大夫，他刚才还能喊一句『别念了』，怎么一进医疗部心电图跟股指一样直冲鲍姐那边去了？”",
      req: "在任意节点把🔥老黄血压拉爆至 100%（或高压下强走高危路线），立刻触发急救车拉走"
    },
    BE2: {
      code: "BE2",
      title: "果味 8G 显存地狱",
      badge: "🍏 BAD ENDING 2",
      stamp: "持仓归零",
      desc: "洗地彻底翻车，金发大统领拍板生效——蒂姆·库克真的穿着黑色高领毛衣神清气爽地登台接班了！次月秋季发布会上，库克微笑着单手拎出一台机身仅厚 5 毫米、显存焊死 8GB、加 8G 另付八千、包装盒为了环保连散热风扇和硅脂都不送的 RTX 6090 Air。台下极客集体呕吐，你的账户当场归零。",
      quote: "“我们认为 8GB 黄金显存足以媲美友商 32GB！散热硅脂？在官网仅售 999 刀，还支持分期！”",
      req: "护盘/焊卡翻车，或选择顺水推舟恭迎库克接班"
    },
    BE3: {
      code: "BE3",
      title: "巴菲特躺赢背景板",
      badge: "🥤 BAD ENDING 3",
      stamp: "强平清盘",
      desc: "一番反向控评操作猛如虎，NVDA 股价彻底砸穿铁底暴跌 -18% 以下！在大洋彼岸，喝着樱桃可乐的巴菲特老爷子啥都没干就躺赢升回了全球富豪榜第七；而你的账户惨遭强平清零，只能把卡里最后的 14 块 5 拿去批发电子白蜡烛，连夜在总部门口跟第 10085 号难兄难弟抢摊位。",
      quote: "“别人贪婪我喝可乐，别人点白蜡烛我重返富豪榜第七。山顶的风，今晚真暄腾啊。”",
      req: "盘中或结局前未能兜住股价导致跌幅跌穿 -18% 以上且未凑齐翻盘条件"
    }
  },

  // ==========================================
  // 完整毒舌修罗场剧本节点（148 节点 × 16 分支）
  // ==========================================
  nodes: {
    // ------------------------------------------
    // 序章：圣克拉拉追思会与白蜡烛摊 (p0_1 ~ p0_16)
    // ------------------------------------------
    p0_1: {
      speaker: "旁白",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      text: "午夜两点半的硅谷妖风阵阵。你蹲在圣克拉拉某绿标总部的花坛石阶上，手里攥着刚花九块九包邮抢来的两捆白菊花和半打电子白蜡烛。",
      danmaku: ["🕯️ 家人们圣克拉拉门外还能摆摊吗", "😭 我血汗本金全套在山顶了"],
      next: "p0_2"
    },
    p0_2: {
      speaker: "旁白",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      text: "十分钟前，这家万亿帝国甩出一封冷冰冰到连标点符号都透着嫌弃的解职通告：CEO、总裁、董事三职一撸到底，即刻生效，官方声明连半句体面遗言都没给那位皮衣老头留。",
      next: "p0_3"
    },
    p0_3: {
      speaker: "我（反串护夫宝）",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      text: "“开盘直接暴跌 -14%，距离山顶高点已经蒸发超三成……我银行卡就剩 14 块 5 毛，连顿像样的猪脚饭都不够点！”",
      next: "p0_4"
    },
    p0_4: {
      speaker: "系统提示",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      showTabloid: true,
      item: "item_notice",
      text: "你的手机嗡嗡狂震，《硅谷今夜大瓜号外 · 追思会四宫格特刊》自动弹窗！看清这四条保真猛料后，你决定当场化身全网第一「反串护夫宝」——反正钱都要没了，不如用显卡黑话替他大声洗白！",
      danmaku: ["🍉 1原生+3插帧直接热搜第一", "📸 姐夫严选+亲闺女掌镜太炸裂了"],
      next: "p0_5"
    },
    p0_5: {
      speaker: "门口哭丧散户甲",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      text: "“兄弟，这堆菊花和白蜡烛摆老黄工位铜牌正下方吗？隔壁卖冥币算力的老哥说，今天这三职一撸，这大楼已经改名叫圣克拉拉追思堂了。”",
      next: "p0_6"
    },
    p0_6: {
      speaker: "我（反串护夫宝）",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      text: "看着周围越来越多亏红眼的散户举着手机直播点蜡烛，你清了清嗓子，决定用第一句反串控评拉开今夜处刑大幕——",
      choices: [
        { text: "🕯️ 立纸牌《下代核弹散热压测祈福柱》，严肃号召散户每人再点八根白蜡烛！", target: "p0_6a" },
        { text: "📸 打开股吧小号开播《圣克拉拉灵堂蹦迪现场》，免费教大伙怎么给老板点赛博白烛！", target: "p0_6b" },
        { text: "🤫 先顺手吹灭几根太靠近保安亭的白蜡烛，免得保安报警把散户全撵走砸盘。", target: "p0_6c" }
      ]
    },
    p0_6a: {
      speaker: "我（反串护夫宝）",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      effects: { candles: +8, stockChange: +1.0, bp: +5 },
      text: "你拿油性笔在纸箱上写了个大大的『DLSS 4 散热灵堂压测中，请勿熄火』，围观群众纷纷竖起大拇指：真有你的，这都能洗成技术路演！",
      next: "p0_10"
    },
    p0_6b: {
      speaker: "我（反串护夫宝）",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      effects: { candles: +11, stockChange: -2.5, bp: +9 },
      text: "直播间瞬间涌进两万个满仓难兄难弟，满屏刷起了『点蜡烛送老黄走好』，股价顺势又往下哆嗦了两个半点！",
      danmaku: ["🔥 直播间怎么全是卖菊花的链接", "😂 散户都在灵堂蹦迪，没人抄底"],
      next: "p0_10"
    },
    p0_6c: {
      speaker: "我（反串护夫宝）",
      location: "📍 加州圣克拉拉总部大门外 · 鲜花与白蜡烛摊位旁",
      bg: "rain_street",
      effects: { candles: -3, stockChange: +0.5, bp: -4 },
      text: "你悄悄掐灭了几根最显眼的白蜡烛，保安瞅了你一眼觉得还算老实，转身回岗亭喝咖啡去了，门口勉强维持着尴尬的体面。",
      next: "p0_10"
    },
    p0_10: {
      speaker: "旁白",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      text: "正当你准备收摊回出租屋啃干脆面时，余光突然扫见街头对面那家 24 小时营业的 Denny's 餐厅——那正是老头当年洗盘子起家的地方。",
      next: "p0_11"
    },
    p0_11: {
      speaker: "旁白",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      sprite: "broken",
      text: "推开玻璃门，最靠墙的油腻卡座里缩着一个裹着起毛旧卫衣的熟悉身影。皮衣破了个大洞还贴着卡通创可贴，银白微卷的头发彻底炸成了鸡窝，镜框歪在鼻梁上。",
      danmaku: ["👀 抓包野生无业游民一名", "💔 三十年纯爱战神碎成渣了"],
      next: "p0_12"
    },
    p0_12: {
      speaker: "老黄（无业前高管）",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      sprite: "broken",
      text: "“……点一份最便宜的松饼吧，别让人认出我。刚刚董事会发那封公告，连我给公司买第一台烤箱的功劳都没写进去，直接三职全免，连句再见都没留……”",
      next: "p0_13"
    },
    p0_13: {
      speaker: "我（反串护夫宝）",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      sprite: "broken",
      item: "item_lemon_water",
      text: "你顺手端过服务员刚放下的两杯免费冰柠檬水，一屁股坐在他对面，顺带把手机里刚截的《总部门口百支白蜡烛航拍图》怼到他镜片前。",
      next: "p0_14"
    },
    p0_14: {
      speaker: "老黄（无业前高管）",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      sprite: "shock",
      text: "“咳咳咳——！！门口那群举菊花点白蜡烛的是要给我送终吗？！我都还喘着气呢！还有你谁啊，眼里这股想顺着网线掐死我的劲儿是怎么回事？”",
      next: "p0_15"
    },
    p0_15: {
      speaker: "我（反串护夫宝）",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      sprite: "shock",
      text: "你盯着券商 App 里绿油油的强平倒计时，气极反笑：“我是你 192 山顶满仓、刚亏掉全副结婚买卡本金、卡里只剩 14 块 5 的头号反串护夫宝。开局第一步先表个态——”",
      choices: [
        { text: "🔪 贴脸输出：恭喜三职一撸到底成功实现 0 冗余轻资产，连遗言流量费都省了！", target: "p0_15a" },
        { text: "🍋 强灌冰水：先闭嘴灌两口免费柠檬水把血压压下去，留着口气听热搜怎么喷你。", target: "p0_15b" },
        { text: "📱 抢过手机：别刷那些伤眼新闻了，今晚全网控评嘴替的麦克风归我！", target: "p0_15c" }
      ]
    },
    p0_15a: {
      speaker: "老黄（无业前高管）",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +7, stockChange: -2.0, bp: +10 },
      text: "老黄差点一口气没倒上来，扶着卡座桌面直喘粗气：“省流量费是吧……求你嘴里吐出一句人话吧，我太阳穴突突跳！”",
      next: "p1_1"
    },
    p0_15b: {
      speaker: "老黄（无业前高管）",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      sprite: "sad",
      effects: { candles: -4, stockChange: +0.5, bp: -10 },
      text: "冰水顺着领口凉透半边身子，老黄打了个寒战总算恢复了一点清醒：“谢了……虽然这水酸得跟今天盘前 K 线一模一样，至少没当场气过去。”",
      next: "p1_1"
    },
    p0_15c: {
      speaker: "老黄（无业前高管）",
      location: "📍 街角 24h Denny's 餐厅 · 角落卡座",
      bg: "dennys_night",
      sprite: "broken",
      effects: { candles: +9, stockChange: +1.5, bp: +7 },
      text: "你一把夺过他刚准备退登小号的手机，顺手点开全球股民吃瓜广场热搜第一：“闭嘴坐好听着，今天让你见识一下什么叫专业级黑话强洗！”",
      next: "p1_1"
    },

    // ------------------------------------------
    // 第一幕：夺命四连洗（前两刀）+ 正宫剪刀暴击 (p1_1 ~ p1_29)
    // ------------------------------------------
    p1_1: {
      speaker: "系统提示",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "broken",
      text: "屏幕蓝光映亮卡座，【夺命四连洗 · 串子嘴替处刑局】正式开启第一刀！全球热搜榜首挂着一条千万转发暴击热评——",
      danmaku: ["⚔️ 夺命四连洗第一刀来喽！", "💀 老黄：求求你别念热搜了"],
      next: "p1_2"
    },
    p1_2: {
      speaker: "热搜暴击一号",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "sad",
      text: "『吐了！三十年模范好男人招牌全是演的！家里一个结发原配，外面足足三个情人，芯片教父改行时间管理大师了是吧？！』",
      next: "p1_3"
    },
    p1_3: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "broken",
      text: "老黄缩着脖子抱紧双臂，声音细得像蚊子叫：“别、别大声念出来……隔壁桌吃煎蛋的华尔街实习生都在拿手机录像了……”",
      next: "p1_4"
    },
    p1_4: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "broken",
      text: "“录像怕啥？这不正好现场给你辟谣？”你直接拔高八度清清嗓子，把麦克风音量调到最大，对着热搜评论区疯狂敲字——",
      next: "p1_5"
    },
    p1_5: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "shock",
      text: "“等会儿你要发什么？！求你别再用英文简写了，L夫人昨晚刚买了一套钛合金大剪刀！！”",
      next: "p1_6"
    },
    p1_6: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "shock",
      text: "面对“1 原配 + 3 情人”铁证如山的实锤，你的第一刀反串控评金句决定怎么甩出去？",
      choices: [
        { text: "🚀 A. “少见多怪！1个原配叫原生渲染帧，外挂3个叫AI补帧，老黄这是在肉身实测 DLSS 4 四倍多帧生成！不愧是算力先锋！”", target: "p1_6a" },
        { text: "🔌 B. “不懂别乱黑！这叫三卡 NVLink 冗余热备拓扑，防止单点情感系统崩溃影响季度财报！”", target: "p1_6b" },
        { text: "🕶️ C. “六十岁人了老花眼记性差，偶尔认错几个同名女同事很正常，大惊小怪！”", target: "p1_6c" }
      ]
    },
    p1_6a: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +14, stockChange: +3.5, bp: +16 },
      text: "“咳咳咳——！！别念了！你给我闭嘴！！L夫人的剪刀已经捅穿我衣柜里第 30 件定制小牛皮皮衣了啊！！”老黄死死捂住胸口，脸上青一阵紫一阵。",
      danmaku: ["🤯 1原生帧+3AI补帧=DLSS4 我笑到拍大腿", "👏 这反串黑话太专业，多头竟然买账了！"],
      next: "p1_10"
    },
    p1_6b: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +10, stockChange: +2.0, bp: +10 },
      text: "“什、什么 NVLink 冗余热备……这词听上去怎么比我私下发的检讨信还要刑啊？！”隔壁桌食客差点把糖浆喷在菜单上。",
      danmaku: ["🔌 三卡互联热备笑死，真不怕烧接口吗"],
      next: "p1_10"
    },
    p1_6c: {
      speaker: "热搜暴击一号",
      location: "📍 Denny's 角落卡座 · 第一刀【洗“1原配+3情人”】",
      bg: "dennys_night",
      sprite: "sad",
      effects: { candles: -8, stockChange: -4.5, bp: +12 },
      text: "你这条嘴硬洗地刚发出去就被几万名股民喷成筛子：“都阿尔茨海默认错二十年下属了还卖啥算力？快清仓吧！”股价应声再砸一刀！",
      next: "p1_10"
    },
    p1_10: {
      speaker: "正宫·L夫人",
      location: "📍 Denny's 角落卡座 · 正宫查岗来电",
      bg: "dennys_night",
      sprite: "broken",
      callPopup: { character: "正宫 · L夫人", title: "✂️ 第30件皮衣剪裁直播中", avatar: "wife" },
      effects: { sound: "phoneRing" },
      text: "（金属大剪刀咔嚓咔嚓咬合的恐怖声效穿透听筒）“我刚才在热搜看见有人管我叫『原生渲染帧』？！姓黄的，旁边那个替你嘴硬吹什么 DLSS 4 的串子是谁？！”",
      next: "p1_11"
    },
    p1_11: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 正宫查岗来电",
      bg: "dennys_night",
      sprite: "shock",
      callPopup: { character: "正宫 · L夫人", title: "✂️ 第30件皮衣剪裁直播中", avatar: "wife" },
      text: "“老婆我发誓不是我雇的水军！这散户卡里只有 14 块 5，我哪雇得起啊呜呜呜——”他吓得把手机举到离耳朵三尺远。",
      next: "p1_12"
    },
    p1_12: {
      speaker: "正宫·L夫人",
      location: "📍 Denny's 角落卡座 · 正宫查岗来电",
      bg: "dennys_night",
      sprite: "shock",
      callPopup: { character: "正宫 · L夫人", title: "✂️ 正在核算财产分割", avatar: "wife" },
      text: "“少废话！第 30 件皮衣我已经留出下剪子划线了。让你旁边那张嘴说句实在话，这几万个股民今晚点着白蜡烛到底是替你哭丧还是帮我凑份子！”",
      next: "p1_13"
    },
    p1_13: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 正宫查岗来电",
      bg: "dennys_night",
      sprite: "broken",
      text: "接过滚烫的手机对着 L 夫人开麦，你决定怎么继续火上浇油（或勉强续命）？",
      choices: [
        { text: "✂️ “嫂子千万别扔！按 DLSS 4 规格精确剪成四份挂海鲜市场，每份标『原生帧认证版』立赚四倍！”", target: "p1_13a" },
        { text: "🛡️ “夫人消消气！门口全是散户帮您站台的，他今晚在 Denny's 喝凉水反省，一分钱没敢乱花！”", target: "p1_13b" },
        { text: "📵 “喂？信号不好……这里 Denny's 地下室有屏蔽层……嘟嘟嘟——”直接反手帮老黄挂断！", target: "p1_13c" }
      ]
    },
    p1_13a: {
      speaker: "正宫·L夫人",
      location: "📍 Denny's 角落卡座 · 正宫查岗来电",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +9, stockChange: -2.0, bp: +14, sound: "slap" },
      text: "“好主意啊铁子！那我连他现在身上这件也一起算在『四倍切割预售』里！”老黄捂着脖子差点从椅子上滑到桌底！",
      danmaku: ["✂️ 原生帧认证裁片已上架海鲜市场", "🚑 这血压飙得我隔着屏幕都听见心电监护了"],
      next: "p1_17"
    },
    p1_13b: {
      speaker: "正宫·L夫人",
      location: "📍 Denny's 角落卡座 · 正宫查岗来电",
      bg: "dennys_night",
      sprite: "sad",
      effects: { candles: -5, stockChange: +1.5, bp: -12 },
      text: "电话那头冷哼一声：“算你个小散户还讲点道理。看在他今天三职被撸、真没地儿去的份上，最后半截袖子先给他留到天亮！”",
      next: "p1_17"
    },
    p1_13c: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 正宫查岗来电",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: -6, stockChange: -4.0, bp: +12, sound: "stockDown" },
      text: "电话刚被掐断三秒，弹窗提示正宫直接登录了家族信托大号挂出第一笔天量卖单！“你挂她电话干嘛啊？！！”",
      next: "p1_17"
    },
    p1_17: {
      speaker: "系统提示",
      location: "📍 Denny's 角落卡座 · 第二刀【洗“老公介绍 + 闺女拍照”】",
      bg: "dennys_night",
      sprite: "sad",
      item: "item_apology_draft",
      text: "还没等老黄顺过这口气，【夺命四连洗 · 第二刀】直接把一条更炸裂的高清实锤怼到屏幕正中央——",
      danmaku: ["📸 第二刀来了！乐姐合照片怎么洗我倒要看看", "💀 这怎么可能洗得动啊！"],
      next: "p1_18"
    },
    p1_18: {
      speaker: "算力红颜 · 乐姐",
      location: "📍 Denny's 角落卡座 · 第二刀【洗“老公介绍 + 闺女拍照”】",
      bg: "dennys_night",
      sprite: "shock",
      callPopup: { character: "Megaspeed · 乐姐", title: "📸 台北酒吧贴贴照热搜中", avatar: "joy" },
      effects: { sound: "gossip" },
      text: "乐姐的语音一条接一条炸进来：“哎呀宝贝～他们怎么连我老公当年亲自引荐咱们认识、还有咱亲闺女在台北酒吧举手机帮拍贴贴照的事全扒出来啦？顺便问下，那场 48 亿算力倒爷风波你可别供出我呀！”",
      next: "p1_19"
    },
    p1_19: {
      speaker: "热搜暴击二号",
      location: "📍 Denny's 角落卡座 · 第二刀【洗“老公介绍 + 闺女拍照”】",
      bg: "dennys_night",
      sprite: "shock",
      text: "全网评论区彻底炸锅：『好家伙！！跟 Megaspeed 高管乐姐居然是人家老公亲手介绍认识的？台北酒吧吃饭搂腰贴贴还让亲闺女举着手机在旁边拍照？！这什么当代硅谷行为艺术！』",
      next: "p1_20"
    },
    p1_20: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第二刀【洗“老公介绍 + 闺女拍照”】",
      bg: "dennys_night",
      sprite: "broken",
      text: "“求你了大爷，这一题真的超纲了！认输吧，我把卡座这盘凉掉的免费面包片全送你，别洗这条了行不行……”",
      next: "p1_21"
    },
    p1_21: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 第二刀【洗“老公介绍 + 闺女拍照”】",
      bg: "dennys_night",
      sprite: "broken",
      text: "你一把推开他的免费面包片，两眼放光狂敲键盘——越是地狱级难洗的瓜，越要洗出千亿级合规高度！",
      choices: [
        { text: "📜 A. “人家老公亲自引荐，这叫官方原厂授权渠道，合规性拉满！让亲闺女拍照更是主打一个家庭开源透明无暗箱操作！”", target: "p1_21a" },
        { text: "🕵️ B. “这是黄老板深入酒吧一线暗访那起 48亿算力倒爷风波，亲闺女负责全程执法记录仪留证，黑子别懂哥了！”", target: "p1_21b" },
        { text: "🍺 C. “台北酒吧灯光太暗，老头度数深把乐姐看成了表姐苏妈，纯属友商亲戚认亲失误！”", target: "p1_21c" }
      ]
    },
    p1_21a: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第二刀【洗“老公介绍 + 闺女拍照”】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +14, stockChange: +3.0, bp: +15, sound: "gossip" },
      text: "咔嚓！老黄鼻梁上的黑框眼镜镜片应声裂开一道绝望的蛛网纹！他颤抖着抓住桌边：“求你给我留条底裤吧！！没看见集体诉讼律师已经在评论区拿小本本一字不落地记笔记了吗？！”",
      danmaku: ["🤣 原厂授权渠道+家庭开源透明哈哈哈哈", "🕶️ 眼镜都给你串碎了！", "📝 律师：这词写进起诉书挺顺口啊"],
      next: "p1_25"
    },
    p1_21b: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第二刀【洗“老公介绍 + 闺女拍照”】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +9, stockChange: +1.5, bp: +9 },
      text: "“我一个卖芯片的哪来的执法记录仪权限啊！还 48 亿算力倒爷风波暗访……明天审计组不得把我家冰箱门都拆了查折旧率？！”",
      next: "p1_25"
    },
    p1_21c: {
      speaker: "红厂表姐 · 苏妈",
      location: "📍 Denny's 角落卡座 · 第二刀【洗“老公介绍 + 闺女拍照”】",
      bg: "dennys_night",
      sprite: "sad",
      callPopup: { character: "红厂表姐 · 苏妈", title: "⚖️ 律师函已在路上了", avatar: "su" },
      effects: { candles: -7, stockChange: -3.5, bp: +13, sound: "slap" },
      text: "微信瞬间弹出表姐苏妈三连惊叹号：“少拿我档脸！酒吧贴贴认成我？！看我明天不在发布会贴满 MI450 性能翻倍图顺便发律师函！”",
      next: "p1_25"
    },
    p1_25: {
      speaker: "旁白",
      location: "📍 Denny's 角落卡座 · 喘息两分钟",
      bg: "dennys_night",
      sprite: "broken",
      text: "前两刀下来，圣克拉拉总部门口原本冷冷清清的花坛外，白蜡烛火光已经连成了两条璀璨的银河；而对座老头的太阳穴像超频到 1000W 的显卡供电一样突突猛跳。",
      next: "p1_26"
    },
    p1_26: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 喘息两分钟",
      bg: "dennys_night",
      sprite: "sad",
      text: "“祖宗，你到底跟我什么仇什么怨……要不把我仅剩的一只机械表摘给你，你拿去抵那山顶亏空的本金行不行？求你别替我发言了，真的会死人的。”",
      next: "p1_27"
    },
    p1_27: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 喘息两分钟",
      bg: "dennys_night",
      sprite: "sad",
      text: "你低头瞅了眼手机：14 块 5 的余额纹丝不动，离下一轮美股小作文热搜刷新还有十秒。在第三刀砍下来之前，你决定——",
      next: "p1_28"
    },
    p1_28: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 喘息两分钟",
      bg: "dennys_night",
      sprite: "sad",
      choices: [
        { text: "📰 趁热打铁！把那份《三职一撸到底零遗言公告》折成纸扇对着他脸狂扇撒盐！", target: "p1_28a" },
        { text: "🧊 仁慈半分钟：强行捏着他下巴灌下半杯冰水、狠狠掐他人中免得提前咽气！", target: "p1_28b" }
      ]
    },
    p1_28a: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 喘息两分钟",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +6, stockChange: +0.5, bp: +9 },
      text: "纸扇带风把『即刻生效，无感恩致辞』七个字反复糊在他鼻尖上：“呼……呼……你比董事会的审计律师还残忍一百倍……”",
      next: "p2_1"
    },
    p1_28b: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 喘息两分钟",
      bg: "dennys_night",
      sprite: "sad",
      effects: { candles: -5, stockChange: +1.0, bp: -12 },
      text: "猛掐人中外加半杯冰水灌顶，老头一个激灵打了个长嗝，血压总算勉强从悬崖边拽回来一点点：“谢谢……至少没让你提前排到火葬场队列。”",
      next: "p2_1"
    },

    // ------------------------------------------
    // 第二幕：夺命四连洗（后两刀）· 20年医疗VP、3号盲盒与库克老马齐上阵 (p2_1 ~ p2_30)
    // ------------------------------------------
    p2_1: {
      speaker: "系统提示",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "sad",
      text: "手机屏幕再次爆亮，【夺命四连洗 · 第三刀】准时落地！这次弹窗的竟然不是外面的人，而是英伟达自己内部潜伏了将近二十年的元老——",
      danmaku: ["🩺 潜伏近20年？！这比CUDA历史还长吧", "😱 鲍姐 Kimberly 亲自连麦了！"],
      next: "p2_2"
    },
    p2_2: {
      speaker: "医疗保健副总裁 · 鲍姐 (Kimberly)",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "shock",
      item: "item_ecg_report",
      callPopup: { character: "医疗VP · 鲍姐 (Kimberly)", title: "🩺 20年深夜一对一汇报通道", avatar: "kimberly" },
      effects: { sound: "phoneRing" },
      text: "“喂，老大？听说全网都把咱俩近二十年的深夜单独工作汇报扒出来了，顺便告诉你一声，今天急诊科夜班值班排表上刚好写了我的名字哦～你血压千万保重呀，一会儿拉进医院可归我管！”",
      next: "p2_3"
    },
    p2_3: {
      speaker: "热搜暴击三号",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "shock",
      callPopup: { character: "医疗VP · 鲍姐 (Kimberly)", title: "🩺 20年深夜一对一汇报通道", avatar: "kimberly" },
      text: "热搜广场瞬间被骂声淹没：『连跟了自己快 20 年的直属医疗业务女副总裁鲍姐都下手？！整整二十年啊，还说是深夜一对一汇报生命科学，办公室恋情彻底实锤！』",
      next: "p2_4"
    },
    p2_4: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "broken",
      text: "老黄嘴唇都在哆嗦：“这二十年交情……当年她还陪我测过第一批算力加速卡在医疗影像里的功耗曲线呢……这回跳进太湖也洗不清了……”",
      next: "p2_5"
    },
    p2_5: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "broken",
      text: "“太湖洗不清？那是因为你没用英伟达生命科学生态的口径去洗！”你推了推不存在的眼镜，手指在手机上敲出了火星子——",
      next: "p2_6"
    },
    p2_6: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "broken",
      choices: [
        { text: "🩺 A. “黑子懂个屁！六十多岁老同志天天熬夜烤显卡，找自家医疗保健副总裁做一下20年长周期临床心率监测怎么了？这叫垂直整合生命科学！”", target: "p2_6a" },
        { text: "🧬 B. “这叫 AI 制药管线一期临床双盲对照组！没那二十年夜间高频采样，咱的医疗大模型能跑通吗？”", target: "p2_6b" },
        { text: "💊 C. “外部体检太贵还要自费，找直属下属内部走员工医保报销还能顺便打个八折，多省股东钱啊！”", target: "p2_6c" }
      ]
    },
    p2_6a: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +14, stockChange: +3.0, bp: +15 },
      text: "“垂、垂直整合生命科学？！”老黄听完直接从卡座弹起半尺高又砸回垫子上：“你特么是魔鬼吗？！我现在心脏真需要她做临床心率监测了啊！！”",
      danmaku: ["🩺 垂直整合生命科学笑死，鲍姐申请加薪", "📈 生物医药基金看了连夜拉升1%！"],
      next: "p2_10"
    },
    p2_6b: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +9, stockChange: +2.0, bp: +9 },
      text: "“双盲对照组个头啊……我俩现在睁眼闭眼全是董事会的传票好吗？！”嘴上虽然在骂，华尔街居然还真有几个研报狗把这句话抄走了。",
      next: "p2_10"
    },
    p2_6c: {
      speaker: "华尔街空头大鳄",
      location: "📍 Denny's 角落卡座 · 第三刀【洗“潜伏20年医疗VP鲍姐”】",
      bg: "dennys_night",
      sprite: "sad",
      effects: { candles: -7, stockChange: -3.5, bp: +14, sound: "stockDown" },
      text: "“好家伙，公器私用骗保还敢拿到台面上省股东钱？！”华尔街治理机构当场连下两级ESG评级，股价再次砸穿一条均线！",
      next: "p2_10"
    },
    p2_10: {
      speaker: "神秘第3号女员工（盲盒）",
      location: "📍 Denny's 角落卡座 · 【路透社辞职日隐藏盲盒】",
      bg: "dennys_night",
      sprite: "shock",
      callPopup: { character: "内部神秘第3号员工", title: "🎁 DLSS #3 隐藏补帧盲盒已开启", avatar: "mystery3" },
      effects: { sound: "gossip" },
      text: "叮咚！就在辞职公告发出几个小时后，路透社又甩出一枚重磅盲盒——还有第 3 名身份严格保密的内部女员工上线打卡！“这下 1 个原配 + 3 个情人，4 倍物理插帧总算一点不差全部集齐了！”",
      danmaku: ["🎁 隐藏第3帧解锁！DLSS 4 正式达成满帧", "🤡 原来刚才第一刀还没凑齐，现在齐活了"],
      next: "p2_11"
    },
    p2_11: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 【路透社辞职日隐藏盲盒】",
      bg: "dennys_night",
      sprite: "broken",
      text: "“……连第 3 个都被掀出来凑齐你的笑话了，你满意了吧？”老黄像一坨被晒化的橡皮泥摊在卡座沙发里，眼神彻底失去了高光。",
      next: "p2_12"
    },
    p2_12: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 【路透社辞职日隐藏盲盒】",
      bg: "dennys_night",
      sprite: "broken",
      text: "你盯着这位『隐藏款第 3 号补帧对象』的新闻弹框，手指在屏幕上悬停了两秒，准备顺手把它也纳入今晚的反串大礼包——",
      next: "p2_13"
    },
    p2_13: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 【路透社辞职日隐藏盲盒】",
      bg: "dennys_night",
      sprite: "broken",
      choices: [
        { text: "🎁 吹成『未公开的灰度内测保密盲盒』：正好印证 1原生+3插帧 是经过严谨内部测试的！", target: "p2_13a" },
        { text: "🔇 替他把第 3 号联系账号一键拉黑冷处理：至少别让名字也飞上天，先把老头血压往回按两格。", target: "p2_13b" },
        { text: "📢 嘴硬嘲讽网友：“区区三个才刚刚达到硅谷大佬平均值，有本事你们再挖出第四个算我输！”", target: "p2_13c" }
      ]
    },
    p2_13a: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 【路透社辞职日隐藏盲盒】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +9, stockChange: +1.0, bp: +11 },
      text: "弹幕齐刷刷飘过『什么黑盒盲测大师』，老黄咬着牙把假牙都快咬碎了，总部门口的蜡烛堆又高出了半人。",
      next: "p2_17"
    },
    p2_13b: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 【路透社辞职日隐藏盲盒】",
      bg: "dennys_night",
      sprite: "sad",
      effects: { candles: -5, stockChange: +2.5, bp: -9 },
      text: "物理拉黑外加低调降热搜居然奏效了几分钟，没见新名字流出，华尔街情绪稍微缓了半口气，老头也终于把大喘气调匀了。",
      next: "p2_17"
    },
    p2_13c: {
      speaker: "华尔街空头大鳄",
      location: "📍 Denny's 角落卡座 · 【路透社辞职日隐藏盲盒】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +4, stockChange: -4.5, bp: +14, sound: "stockDown" },
      text: "你话音刚落就被十几家风控基金打上『重大未披露衍生品隐患』标签！机构直接踩踏抛盘，大盘一脚踩进深水区！",
      next: "p2_17"
    },
    p2_17: {
      speaker: "硅谷钢铁侠 · 老马",
      location: "📍 Denny's 角落卡座 · 第四刀【总部蜡烛 + 库克接班 + 老马招安】",
      bg: "dennys_night",
      sprite: "shock",
      callPopup: { character: "硅谷钢铁侠 · 老马", title: "🚀 聘书：来给我打工是我的荣幸", avatar: "musk" },
      effects: { sound: "phoneRing" },
      text: "叮铃铃！手机连环弹窗轰炸——首先炸屏的是老马发来的加急飞书聘书：『嘿兄弟！三职一撸算个屁，来德州给我打工是我的荣幸！工资按火箭螺栓算，晚上还可以教你几招硅谷顶级人口统计学实战经验！』",
      danmaku: ["🚀 老马在线趁火打劫：来给我打工是我的荣幸", "😂 教硅谷繁殖学是吧"],
      next: "p2_18"
    },
    p2_18: {
      speaker: "跨界接班人 · 库克",
      location: "📍 Denny's 角落卡座 · 第四刀【总部蜡烛 + 库克接班 + 老马招安】",
      bg: "dennys_night",
      sprite: "shock",
      callPopup: { character: "苹果掌门 · 库克", title: "🍏 金发大统领钦点跨界接班", avatar: "cook" },
      effects: { sound: "gossip" },
      text: "紧接着另一条全网弹窗把热搜直接炸瘫痪——金发大统领公开喊话力挺：『建议蒂姆·库克跨界接任英伟达 CEO，由一位传奇接替另一位传奇！』屏幕里库克正穿着标志性黑色高领毛衣慈祥微笑，手里好像还捏着一条 8GB 贴纸。",
      next: "p2_19"
    },
    p2_19: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第四刀【总部蜡烛 + 库克接班 + 老马招安】",
      bg: "dennys_night",
      sprite: "broken",
      text: "老黄整个人已经石化了：左边总部门口在摆菊花点白蜡烛，右边老马喊他去打黑工，正前方库克甚至连高领毛衣都熨好准备来换掉他家的黑皮衣了！",
      next: "p2_20"
    },
    p2_20: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 第四刀【总部蜡烛 + 库克接班 + 老马招安】",
      bg: "dennys_night",
      sprite: "broken",
      text: "【夺命四连洗 · 第四刀】直插心脏！面对门口灵堂、老马招安、库克接班这三重暴击，你把手机喇叭怼到他脑门前大声输出——",
      next: "p2_21"
    },
    p2_21: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 第四刀【总部蜡烛 + 库克接班 + 老马招安】",
      bg: "dennys_night",
      sprite: "broken",
      choices: [
        { text: "🍏 A. “强烈支持库克接班！以后 RTX 6090 焊死 8G 黄金显存，升 16G 加价八千，显卡盒为了环保不送风扇，散热硅脂单独卖 999 刀！”", target: "p2_21a" },
        { text: "🚀 B. “劝哥赶紧去投奔老马！白天给他焊火箭芯片，晚上教你真正的硅谷繁殖学，区区三个哪够看啊！”", target: "p2_21b" },
        { text: "🙏 C. “呜呜呜库总快来吧，我拿山顶亏掉的 0.015 股 NVDA 能不能 1:1 换购一台高配 Mac mini？”", target: "p2_21c" }
      ]
    },
    p2_21a: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第四刀【总部蜡烛 + 库克接班 + 老马招安】",
      bg: "dennys_night",
      sprite: "cool",
      effects: { candles: +15, stockChange: +4.0, bp: +10, sound: "stockUp" },
      text: "“我靠！！显卡盒为了环保不送风扇、散热硅脂单卖 999 刀？！”原本快咽气的老黄一听库克真敢这么干，竟然从椅子上气得猛拍桌子：“这帮做消费电子的哪懂大显存？！我死了也不让 8G 显存进圣克拉拉大门！”股价竟诡异地抽抽往上拉了一波！",
      danmaku: ["🍏 8G黄金显存等价于友商32G笑死", "🔥 散热硅脂999刀居然把多头毛利率喊醒了？！"],
      next: "p2_25"
    },
    p2_21b: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 第四刀【总部蜡烛 + 库克接班 + 老马招安】",
      bg: "dennys_night",
      sprite: "shock",
      effects: { candles: +12, stockChange: -1.5, bp: +17, sound: "reject" },
      text: "老黄直接被这一句串到灵魂出窍，眼白一翻差点当场去见祖师爷：“区区三个哪够看……你特么这是盼着 L 夫人拿着电锯追到德州去砍我吗？！！”",
      danmaku: ["👻 老黄灵魂出窍已截图当表情包", "🚑 血压条要顶穿屏幕啦喂！"],
      next: "p2_25"
    },
    p2_21c: {
      speaker: "热搜暴击四号",
      location: "📍 Denny's 角落卡座 · 第四刀【总部蜡烛 + 库克接班 + 老马招安】",
      bg: "dennys_night",
      sprite: "sad",
      effects: { candles: -8, stockChange: -5.0, bp: +12, sound: "stockDown" },
      text: "全网笑声刚响了半秒，苹果供应链那帮黄牛就开始提前砸盘测试 8GB 显卡残值，大盘哗啦啦往下再泄五层楼！",
      next: "p2_25"
    },
    p2_25: {
      speaker: "旁白",
      location: "📍 Denny's 角落卡座 · 四连洗战报汇总",
      bg: "dennys_night",
      sprite: "sad",
      text: "夺命四连洗全部砸完，窗外距离美股正式开盘只剩不到两小时。刚刚还在喊着要让库克接班的硬件极客们，突然收到了代工厂发来的恐怖试产报告——",
      next: "p2_26"
    },
    p2_26: {
      speaker: "圣克拉拉代工厂内鬼短信",
      location: "📍 Denny's 角落卡座 · 突发硬件危急",
      bg: "dennys_night",
      sprite: "shock",
      text: "『紧急预警！！听说总部门口白蜡烛点到快熄火，代工厂工程部那帮墙头草怕库克天亮真来接盘，连夜把最后一台压箱底的工程样卡焊上了两颗 4GB 颗粒——凑成了一张 8GB 黄金显存版！』",
      next: "p2_27"
    },
    p2_27: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 角落卡座 · 突发硬件危急",
      bg: "dennys_night",
      sprite: "cool",
      text: "“反了天了！什么墙头草敢把 8GB 黄金显存焊到我的样卡上？！”老头抓起门边 Denny's 厨师专用石棉隔热手套就往后厨冲：“就算我三职被撸，我也绝对不能容忍 8G 显存卡从我面前上市！”",
      next: "p2_28"
    },
    p2_28: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 突发硬件危急",
      bg: "dennys_night",
      sprite: "cool",
      text: "看着老头冲进后厨的样子，你拎起那桶免费冰水跟在后面，顺手决定在进门前再发一条动态——",
      next: "p2_29"
    },
    p2_29: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 角落卡座 · 突发硬件危急",
      bg: "dennys_night",
      sprite: "cool",
      choices: [
        { text: "🔧 拽紧老黄进后厨直接开工：先别废话发小作文了，把 8G 颗粒拆下来才是正事！", target: "p2_29a" },
        { text: "📸 顺手偷拍他套隔热手套背影发外网：《三职被撸前总裁深夜后厨重操旧业烤煎饼》！", target: "p2_29b" }
      ]
    },
    p2_29a: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "normal",
      effects: { candles: -3, stockChange: +1.5, bp: -8 },
      text: "你老实把手机塞兜里帮他掀开后厨防油门帘，老头感动地看了你一眼：“今晚头一次像个人类盟友。”",
      next: "p3_1"
    },
    p2_29b: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "shock",
      effects: { candles: +8, stockChange: -2.0, bp: +9 },
      text: "配文发出去三秒，全球散户集体哀嚎『卖艺还债了啊』，门口那圈白蜡烛又往外扩了两米，老头进后厨时差点被门槛绊个跟头。",
      next: "p3_1"
    },

    // ------------------------------------------
    // 第三幕：后厨回流焊 QTE · 拆掉果味 8G 显存 (p3_1 ~ p3_14)
    // ------------------------------------------
    p3_1: {
      speaker: "旁白",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "cool",
      text: "深夜两点半的后厨热浪滚滚。老黄熟门熟路地把三号松饼炉开关扭到最大功率，这台老伙计当年烤过香蕉煎饼，今晚要用来做 BGA 返修拆焊。",
      next: "p3_2"
    },
    p3_2: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "cool",
      text: "“瞅见那两颗印着『4GB』的小黑方块没？这就是代工厂那帮墙头草连夜焊上去准备讨好库克的耻辱！只要拆掉它们换回满血高带宽颗粒，天亮听证会咱们就能打库克的脸！”",
      next: "p3_3"
    },
    p3_3: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "normal",
      text: "热风枪跟松饼铁板滋滋作响，就在准备把显卡送进高温回流炉前，你注意到显卡背板上还粘着几滴刚才外边暴雨淋进去的水渍，而老黄手抖得跟筛糠一样——",
      next: "p3_4"
    },
    p3_4: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "normal",
      choices: [
        { text: "🍋 往他发颤的手腕上抹点柠檬汁擦干板子，冷冷提醒：焊爆了我就发帖说你在后厨炸猪排。", target: "p3_4a" },
        { text: "🥤 一口冰水直接拍他后脖颈上物理降压：稳住别抖！天亮还得拿它去抽空头的脸呢！", target: "p3_4b" }
      ]
    },
    p3_4a: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "shock",
      effects: { candles: +5, bp: +6 },
      text: "“炸你个大头鬼猪排！”老头狠狠吸了口气，在你的毒舌激励下把隔热手套扣得死紧，目光重新锁定温度表。",
      next: "p3_5"
    },
    p3_4b: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "cool",
      effects: { candles: -2, bp: -7 },
      text: "冰水瞬间镇住了发飙的心率，老头长吐一口白气，手腕竟然稳如老式光刻机机械臂。",
      next: "p3_5"
    },
    p3_5: {
      speaker: "旁白",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "cool",
      text: "松饼铁板通红，温度计指针开始狂飙——88°C 到 96°C 的【BGA 满血甜点区】转瞬即逝！温度不够显存撬不下来，温度太高整张卡直接烤成焦炭！",
      next: "p3_6"
    },
    p3_6: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "cool",
      text: "“准备！等那个黄指针晃进中间绿区那一毫秒，立刻上手帮我拔掉 8G 耻辱颗粒！”",
      next: "p3_7"
    },
    p3_7: {
      speaker: "系统提示",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "cool",
      qte: "oven",
      text: "🔥 点击【拆掉8G显存 · 焊出满血神卡！】，瞄准绿色 BGA 满血甜点区出手！",
      next: "p3_8_check"
    },
    p3_8_success: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "cool",
      item: "item_rtx5090",
      effects: { candles: +8, stockChange: +3.5, bp: -6 },
      text: "啪嗒一声清脆锡裂声！你一把薅掉两颗可耻的 4GB 缩水颗粒，反手焊上满血高频显存，一张泛着黑金冷光的工程神卡稳稳出炉！",
      danmaku: ["⚡ 拆8G换满血成功！库克连夜退订机票", "🔥 这才是能亮屏的真家伙！"],
      next: "p3_10"
    },
    p3_8_fail: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "broken",
      effects: { candles: -6, stockChange: -4.0, bp: +12 },
      text: "刺啦一阵浓烟冒起！手抖偏出甜点区，不但 8G 黄金颗粒永久焊死在了锡膏里，整张 PCB 还烤出了一股焦糊铁板鱿鱼味！完蛋，真成『8G 糊卡』了！",
      danmaku: ["💥 烤糊了！！这卡插上去怕是要直接冒烟", "🍏 库克：谢谢帮我省了模具钱"],
      next: "p3_10"
    },
    p3_10: {
      speaker: "旁白",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "sad",
      item: "item_glue",
      text: "你在后厨工具箱底顺手摸出半管华强北同款工业级防插帧焊死胶，顺带拽住老头身上那件已经快开线了的第 30 号战损皮衣——",
      next: "p3_11"
    },
    p3_11: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "sad",
      text: "“这……你拿这工业胶水对着我皮衣拉链比划什么？”",
      next: "p3_12"
    },
    p3_12: {
      speaker: "我（反串护夫宝）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "normal",
      choices: [
        { text: "🧴 直接拿强力胶糊死皮衣拉链：“从现在起物理封死插帧开关，免得等会门口记者一问你又心虚解扣子！”", target: "p3_12a" },
        { text: "📹 拉着满脸黑灰的老头合拍十秒竖屏短视频：《前万亿高管夜班后厨端盘子，点个白烛再走》！", target: "p3_12b" }
      ]
    },
    p3_12a: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "cool",
      effects: { candles: -3, stockChange: +1.5, bp: -10 },
      text: "拉链呲溜一下彻底焊死，老头低头喘了口气反而觉得莫名安全：“行吧……至少今晚再没人能找借口扯我皮衣了。”",
      next: "p4_1"
    },
    p3_12b: {
      speaker: "老黄（无业前高管）",
      location: "📍 Denny's 深夜后厨 · 烤松饼炉改回流焊台",
      bg: "kitchen_fire",
      sprite: "shock",
      effects: { candles: +8, stockChange: -1.5, bp: +10 },
      text: "短视频刚一上传播放量秒破百万，『昔日算力教父夜半端烤盘』冲上热榜，门口等待天亮的散户群里哀鸿遍野，老头气得手里锅铲都握弯了！",
      next: "p4_1"
    },

    // ------------------------------------------
    // 第四幕：圣克拉拉黎明串子大听证会 (p4_1 ~ p4_18)
    // ------------------------------------------
    p4_1: {
      speaker: "旁白",
      location: "📍 圣克拉拉总部大门 · 黎明前开盘 1 小时",
      bg: "board_room",
      sprite: "sad",
      text: "凌晨五点半，圣克拉拉总部大厅外亮起了几十盏媒体补光灯。昨晚摆下的白蜡烛与白菊花已经堆成一座两米高的小山，华尔街空头代表、集体诉讼律师团和举牌支持库克的人挤满了大门台阶。",
      danmaku: ["📺 黎明公关听证会直播间已挤爆！", "🕯️ 现场白蜡烛已经能当篝火用了吧"],
      next: "p4_2"
    },
    p4_2: {
      speaker: "华尔街空头大鳄",
      location: "📍 圣克拉拉总部大门 · 听证会第一回合",
      bg: "board_room",
      sprite: "sad",
      callPopup: { character: "华尔街空头大鳄", title: "🦈 做空报告：1原生+3插帧算力欺诈", avatar: "shark" },
      text: "空头大鳄举着厚厚一叠打印件咧嘴大笑：“各位股东看好了！CEO、总裁、董事一夜撸光还不够，这老头居然能同时在公司内外瞒着原配养出三个补帧红颜——这证明公司治理彻底失灵，今天目标价给我再砍一半！”",
      next: "p4_3"
    },
    p4_3: {
      speaker: "老黄（无业前高管）",
      location: "📍 圣克拉拉总部大门 · 听证会第一回合",
      bg: "board_room",
      sprite: "shock",
      text: "“完了完了……律师跟空头一起来了，要不我还是钻回 Denny's 后厨躲一天吧……”",
      next: "p4_4"
    },
    p4_4: {
      speaker: "我（反串护夫宝）",
      location: "📍 圣克拉拉总部大门 · 听证会第一回合",
      bg: "board_room",
      sprite: "shock",
      text: "你一把揪住他焊死拉链的领口按在露天大喇叭前：“躲屁！我卡里那 14 块 5 就指望这把回本了，听我的话继续反串输出！”",
      choices: [
        { text: "🔥 “不懂别做空！1原生+3插帧是我们黄老板自掏腰包做极限多帧并发压测，没动用公司一分研发费，净赚一百个亿研发投入！”", target: "p4_4a" },
        { text: "📄 “昨天的事已出零遗言处分公告，今日已带鲍姐心率监测病历与合规切割文件现场报到，请求重估治理折价！”", target: "p4_4b" },
        { text: "📞 “你们别乱黑，我现在就给乐姐她老公打电话，让他当众夸黄老板是大善人好兄弟！”", target: "p4_4c" }
      ]
    },
    p4_4a: {
      speaker: "华尔街空头大鳄",
      location: "📍 圣克拉拉总部大门 · 听证会第一回合",
      bg: "board_room",
      sprite: "cool",
      effects: { candles: +11, stockChange: +4.0, bp: +10, sound: "stockUp" },
      text: "全场记者笔杆子集体停顿两秒，几个对冲基金分析师居然疯狂点头记笔记：“自掏腰包替股东省研发费测试多帧并发？！这逻辑虽然缺德但财报毛利率看着很性感啊！”",
      danmaku: ["🤯 空头被绕进去了哈哈哈", "📈 居然真的拉红了几个点！"],
      next: "p4_7"
    },
    p4_4b: {
      speaker: "旁白",
      location: "📍 圣克拉拉总部大门 · 听证会第一回合",
      bg: "board_room",
      sprite: "normal",
      effects: { candles: -4, stockChange: +3.5, bp: -8 },
      text: "板正到发指的合规清单甩出来后，几位机构老古董意外地不再吱声，老头悬着的一颗心暂时落回胸腔一半。",
      next: "p4_7"
    },
    p4_4c: {
      speaker: "华尔街空头大鳄",
      location: "📍 圣克拉拉总部大门 · 听证会第一回合",
      bg: "board_room",
      sprite: "shock",
      effects: { candles: -7, stockChange: -5.5, bp: +14, sound: "stockDown" },
      text: "电话刚拨通那边就传出一声震天怒骂，顺带还把 Megaspeed 48 亿算力倒爷风波的新录音甩到了公屏上！空头大鳄笑得差点背过气去！",
      next: "p4_7"
    },
    p4_7: {
      speaker: "苹果系推手代表",
      location: "📍 圣克拉拉总部大门 · 听证会第二回合",
      bg: "board_room",
      sprite: "shock",
      callPopup: { character: "苹果掌门 · 库克", title: "🍏 8G 黄金显存接班演讲彩排", avatar: "cook" },
      text: "话音未落，广场大屏幕突然切进跨界热门人选库克的预录短片：『谢谢金发大统领的赏识！如果下周我来执掌圣克拉拉，第一刀就把消费级旗舰统一成优雅轻薄的 8GB 黄金显存，把多余显存颗粒统统省下来环保做表壳！』",
      next: "p4_8"
    },
    p4_8: {
      speaker: "我（反串护夫宝）",
      location: "📍 圣克拉拉总部大门 · 听证会第二回合",
      bg: "board_room",
      sprite: "cool",
      text: "台下一众臭打游戏的、炼丹佬和游戏宅瞬间血压拉满！趁库克还在镜头里微笑，你赶紧抢过麦克风进行第二轮点杀——",
      choices: [
        { text: "⚡ 把刚才后厨回流焊炉搞出来的样卡高高举过头顶：“睁大眼看清楚，这才是不搞 8G 阉割的满血黑科技！”", target: "p4_8a_check" },
        { text: "🎤 高喊：“谁投库克谁先吃两年 8G 黄金显存加价八千的苦！环保不送风扇你们谁敢插电开机？！”", target: "p4_8b" },
        { text: "📉 “哎呀其实 8GB 够用了啦，多卡买八张拼起来也是 64G嘛，正好多卖几张卡赚大钱！”", target: "p4_8c" }
      ]
    },
    p4_8a: {
      speaker: "老黄（无业前高管）",
      location: "📍 圣克拉拉总部大门 · 听证会第二回合",
      bg: "board_room",
      sprite: "cool",
      effects: { candles: +12, stockChange: +6.5, bp: -4, sound: "stockUp" },
      text: "你掏出卡往现场测试机架上一插，4K 全高跑分秒破天花板、显存占用条拉满绿光！极客观众爆发出山呼海啸般的嚎叫：『去他的 8G 环保显卡，把原厂老头给我焊回台上！』",
      danmaku: ["⚡ 8G显存耻辱柱被一脚踹碎了！", "📈 多头情绪爆表！空头头皮发麻"],
      next: "p4_11"
    },
    p4_8a_nocard: {
      speaker: "华尔街空头大鳄",
      location: "📍 圣克拉拉总部大门 · 听证会第二回合",
      bg: "board_room",
      sprite: "broken",
      effects: { candles: -8, stockChange: -6.0, bp: +14, sound: "qteFail" },
      text: "你信心满满举起后厨烤糊的那块黑砖往测试机里一怼——刺啦一阵青烟直冲天花板，整台机器当场跳闸黑屏！板子上还明晃晃焊着那两颗没拆下来的 4GB 贴片，全网直播间笑喷十万人！",
      danmaku: ["💥 焊歪了还不承认，当众放烟花喽", "😭 救命，我的本金跟主板一起冒青烟了"],
      next: "p4_11"
    },
    p4_8b: {
      speaker: "我（反串护夫宝）",
      location: "📍 圣克拉拉总部大门 · 听证会第二回合",
      bg: "board_room",
      sprite: "cool",
      effects: { candles: +8, stockChange: +4.0, bp: +6 },
      text: "一提『不送风扇 + 硅脂单卖 999 刀』，全球装机佬当场反水狂刷弹幕：『渣男归渣男，至少不砍显存还给送盒！别让果味高领毛衣碰瓷老子的主板！』",
      next: "p4_11"
    },
    p4_8c: {
      speaker: "老黄（无业前高管）",
      location: "📍 圣克拉拉总部大门 · 听证会第二回合",
      bg: "board_room",
      sprite: "shock",
      effects: { candles: -6, stockChange: -5.0, bp: +12, sound: "stockDown" },
      text: "这话一出直接同时得罪了极客和机构两边！全场疯狂嘘声差点把玻璃震碎，老黄死捂胸口直瞪白眼：『你到底是哪边派来清零我市值的？！』",
      next: "p4_11"
    },
    p4_11: {
      speaker: "旁白",
      location: "📍 圣克拉拉总部大门 · 听证会第三回合",
      bg: "board_room",
      sprite: "sad",
      text: "最后一轮提问压轴到来！门外记者长枪短炮直接对准了满地摇曳的电子白蜡烛和白菊花，问出一个最直戳肺管子的问题——",
      next: "p4_12"
    },
    p4_12: {
      speaker: "吃瓜前线记者",
      location: "📍 圣克拉拉总部大门 · 听证会第三回合",
      bg: "board_room",
      sprite: "sad",
      text: "“门口这些白蜡烛和菊花都要排到街口红绿灯了！全硅谷都说这是英伟达旧时代的追思会灵堂，请问两位最后还有什么狡辩词？”",
      next: "p4_13"
    },
    p4_13: {
      speaker: "我（反串护夫宝）",
      location: "📍 圣克拉拉总部大门 · 听证会第三回合",
      bg: "board_room",
      sprite: "cool",
      text: "开盘敲钟倒计时只剩十分钟！你清了清嘶哑的嗓子，决定在最后一回合献上整晚最癫狂的结案陈词——",
      choices: [
        { text: "🕯️ “追思会？笑死！这是全球信徒用白蜡烛点亮的算力逼空祈福阵，蜡烛越亮、下代插帧越旺，空头还不连夜跪下交筹码？”", target: "p4_13a" },
        { text: "✂️ “我们决定把门口拍卖第30件剪碎皮衣和白菊花攒下的全部零钱，直接塞进《散户反割合规监督保证金》！”", target: "p4_13b" },
        { text: "🌼 “实话实说，这白蜡烛确实是在悼念我高位满仓的三年前程！家人们别买股票了，快来跟我在总部门口批发九块九菊花吧！”", target: "p4_13c" }
      ]
    },
    p4_13a: {
      speaker: "我（反串护夫宝）",
      location: "📍 圣克拉拉总部大门 · 听证会第三回合",
      bg: "board_room",
      sprite: "cool",
      effects: { candles: +10, stockChange: +5.0, bp: +8, sound: "stockUp" },
      text: "“算力逼空祈福阵？！”华尔街一帮信风水的算法交易员居然真被忽悠瘸了，大买单疯狂涌入扫货，白蜡烛堆成了全美最强赛博图腾！",
      danmaku: ["🕯️ 灵堂白蜡烛变成算力图腾了哈哈哈", "🚀 多头疯了！！这也能反转？！"],
      next: "p4_16_check"
    },
    p4_13b: {
      speaker: "老黄（无业前高管）",
      location: "📍 圣克拉拉总部大门 · 听证会第三回合",
      bg: "board_room",
      sprite: "normal",
      effects: { candles: -3, stockChange: +3.5, bp: -7 },
      text: "一听还要扣押皮衣保证金盯紧他那张嘴和手机，机构觉得总算有人管住这老头瞎折腾了，股价顺滑地又垫稳了几分。",
      next: "p4_16_check"
    },
    p4_13c: {
      speaker: "门口哭丧散户甲",
      location: "📍 圣克拉拉总部大门 · 听证会第三回合",
      bg: "board_room",
      sprite: "shock",
      effects: { candles: +4, stockChange: -6.5, bp: +12, sound: "stockDown" },
      text: "周围散户一听带头护夫宝都喊出清仓改行卖菊花了，哗啦一下全都把市价卖单挂了出去，门口地摊瞬间迎来史上最大扩招！",
      next: "p4_16_check"
    },
    p4_16_pass: {
      speaker: "旁白",
      location: "📍 圣克拉拉总部大厅外 · 终极分流时刻",
      bg: "rooftop_dawn",
      sprite: "cool",
      text: "天光大亮，美股盘前最后十分钟竞价开始了！令人窒息又魔幻的局面出现了：由于你今晚嘴替控评太过于离谱，整个华尔街居然在认真研究你的『四倍多帧理论』，股价总算堪堪稳住了半口气！",
      next: "p5_1"
    },
    p4_16_crisis: {
      speaker: "旁白",
      location: "📍 圣克拉拉总部大厅外 · 终极分流时刻",
      bg: "rooftop_dawn",
      sprite: "broken",
      text: "清晨的冷风吹得总部门口白菊花漫天乱飞，热搜黑粉、大统领点名、库克发稿和空头砸盘混作一团，盘前红绿数字狂闪——现在能决定的，只剩最后一把梭哈或者跑路了！",
      next: "p5_1"
    },

    // ------------------------------------------
    // 终章：四大收尾路径 + 血压爆表救护车急救 (p5_1 ~ end_*)
    // ------------------------------------------
    p5_1: {
      speaker: "老黄（无业前高管）",
      location: "📍 圣克拉拉总部大门外 · 开盘前一分钟",
      bg: "rooftop_dawn",
      sprite: "sad",
      text: "太阳升起时，这老头捂着焊死拉链的破皮衣站在门口，左边停着鲍姐医疗部随时候命的急救车，右边是老马派来接他的德州皮卡，大屏幕上还有库克穿高领毛衣的定妆照在晃悠。",
      next: "p5_2"
    },
    p5_2: {
      speaker: "老黄（无业前高管）",
      location: "📍 圣克拉拉总部大门外 · 开盘前一分钟",
      bg: "rooftop_dawn",
      sprite: "sad",
      text: "“行了，我这辈子三十年好男人金身算是彻彻底底埋进总部门口这堆白蜡烛里了……最后一把方向盘交给你，天亮以后到底往哪条路滚蛋？”",
      next: "p5_3"
    },
    p5_3: {
      speaker: "我（反串护夫宝）",
      location: "📍 圣克拉拉总部大门外 · 开盘前一分钟",
      bg: "rooftop_dawn",
      sprite: "cool",
      text: "你低头看了一眼手机上实时跳动的白蜡烛数、NVDA 股价以及老头随时快爆炸的心率手环，按下最后一条终极抉择——",
      next: "p5_4"
    },
    p5_4: {
      speaker: "我（反串护夫宝）",
      location: "📍 圣克拉拉总部大门外 · 开盘前一分钟",
      bg: "rooftop_dawn",
      sprite: "cool",
      choices: [
        { text: "⚡ 终极反串梭哈！发顶置长文定调『1原生+3插帧即全新 DLSS 4 架构暗号』，举卡逼空！", target: "route_dlss_eval" },
        { text: "🍳 没收皮衣与两部手机！联手正宫把老头直接捆回 Denny's 后厨终身刷盘子摊松饼抵债！", target: "route_dennys_eval" },
        { text: "🚀 一脚踢进老马接应皮卡：送去德州焊火箭芯片顺便进修硅谷繁殖学！", target: "route_musk_eval" },
        { text: "🍏 算了摆烂了，举手欢迎库克穿高领毛衣上来接盘，一起迎接 8G 黄金显存时代！", target: "route_cook_eval" }
      ]
    },

    // --- 血压 100% 救护车急救通用触发链 -> BE1 ---
    bp_overload_1: {
      speaker: "救护车警报",
      location: "📍 圣克拉拉总部急诊通道 · 血压爆表 100%！",
      bg: "board_room",
      sprite: "shock",
      effects: { sound: "siren" },
      text: "嘀——呜——嘀——呜——！！随着老黄大动脉“嘣”地一声巨响，你的连续阴阳怪气彻底冲穿了他的血压警戒线！老头白眼一翻直挺挺往后倒去，两秒钟后救护车尾灯闪烁着冲进总部门口！",
      danmaku: ["🚑 救命！！真把老头气进急救车了！", "🩺 鲍姐：这单正好归我生命科学部管！"],
      next: "bp_overload_2"
    },
    bp_overload_2: {
      speaker: "医疗保健副总裁 · 鲍姐 (Kimberly)",
      location: "📍 总部内部医疗部重症监护室",
      bg: "board_room",
      sprite: "broken",
      callPopup: { character: "医疗VP · 鲍姐 (Kimberly)", title: "🩺 正在接管20年VIP病人", avatar: "kimberly" },
      text: "担架车门啪地合上，医疗部主管鲍姐从白大褂口袋掏出听诊器冲你微微一笑：“谢谢这位反串护夫宝的热情嘴替啊～放心，这单刚好归我管，这下未来二十年他每天深夜心率监测都不用出门了！”",
      next: "bp_overload_3"
    },
    bp_overload_3: {
      speaker: "旁白",
      location: "📍 圣克拉拉总部大门外 · 第 10086 号站岗位",
      bg: "rain_street",
      sprite: null,
      text: "救护车绝尘而去，只剩下一脸懵逼的你站在原地的鲜花堆前——手里恰好还捧着那束刚花九块九包邮买来的白菊花。",
      next: "end_be1"
    },

    // --- 各路线结算中继节点 ---
    route_dlss_win: {
      speaker: "华尔街量化机构群播报",
      location: "📍 圣克拉拉总部大门 · 09:30 美股开盘钟声",
      bg: "rooftop_dawn",
      sprite: "cool",
      effects: { stockChange: +28.0, sound: "stockUp" },
      text: "叮——开盘钟响！你的『1原生+3插帧』反串强洗文案竟把华尔街所有 AI 舆论爬虫和量化机构彻底干懵了！买方经理疯狂拍桌：『原来绯闻只是烟雾弹，DLSS 4 四倍多帧生成才是真架构暗号！满仓抢筹！！』",
      danmaku: ["📈 空头踩踏暴涨！！山顶本金连本带利杀回来了！", "🏆 全网黑子：这都能洗活？！"],
      next: "end_te"
    },
    route_dlss_cook_win: {
      speaker: "旁白",
      location: "📍 圣克拉拉总部大门 · 09:30 美股开盘钟声",
      bg: "rooftop_dawn",
      sprite: "sad",
      effects: { stockChange: -4.0, sound: "stockDown" },
      text: "可惜光靠嘴硬，要蜡烛没点够数量、要不就是那张被烤成黑炭的显卡实在拿不出手。华尔街大佬翻了个白眼根本不信你的架构暗号，反而一致通过了金发大统领钦点的跨界换帅方案！",
      next: "end_be2"
    },
    route_dlss_liquidated: {
      speaker: "券商强平短信",
      location: "📍 圣克拉拉总部大门 · 强平短信轰炸",
      bg: "rain_street",
      sprite: "broken",
      effects: { sound: "reject" },
      text: "由于前期洗地实在太掉粉砸穿了 -18% 铁底防线，你还没发完暗号，券商强平通知先一步炸穿了手机屏幕！与此同时，财经频道大红字幕弹出：巴菲特靠着啥都没干躺赢重返全球富豪榜第七！",
      next: "end_be3"
    },
    route_dennys_win: {
      speaker: "我（反串护夫宝）",
      location: "📍 硅谷 Denny's 后厨 · 凌晨清算现场",
      bg: "rooftop_dawn",
      sprite: "normal",
      effects: { stockChange: +6.5 },
      text: "去他的华尔街和三个插帧对象！你联手正宫当机立断撕下他身上最后一件黑皮衣、没收了藏在袜筒里的两部备用机，直接拿扎带捆起这六十岁老头塞进 Denny's 后厨，剪碎皮衣上线限量纪念块卖 99 刀回本！",
      next: "route_dennys_win2"
    },
    route_dennys_win2: {
      speaker: "老黄（Denny's 终身洗碗工）",
      location: "📍 Denny's 后厨 · 洗碗池与松饼铁板前",
      bg: "kitchen_fire",
      sprite: "normal",
      text: "被围裙拴在洗碗池前的老黄委屈巴巴地举起钢丝球和松饼铲：“小老板，今天第三百个油盘子刷冒烟了……能把手机还我三分钟给正宫报个平安吗？”你冷笑一声：“先把今晚这波松饼摊完回本再说，敢偷摸搞第 4 个插帧我就把铁铲给你焊死！”",
      next: "end_he"
    },
    route_dennys_fail: {
      speaker: "旁白",
      location: "📍 Denny's 停车场 · 账户强平提示",
      bg: "rain_street",
      sprite: "broken",
      effects: { sound: "reject" },
      text: "你连买扎带和租金摊位的钱都被股市砸飞了！卡里那 14 块 5 在手续费扣完后正式归零，老头趁你接强平电话的工夫溜进了夜色，而巴菲特的名字正得意洋洋地挂在富豪榜第七。",
      next: "end_be3"
    },
    route_musk_win: {
      speaker: "硅谷钢铁侠 · 老马",
      location: "📍 德克萨斯星舰发射场 · 火箭焊接车间",
      bg: "rooftop_dawn",
      sprite: "shock",
      callPopup: { character: "硅谷钢铁侠 · 老马", title: "🚀 欢迎加盟星舰铁皮班组", avatar: "musk" },
      text: "德州荒漠风沙漫天，老马戴着墨镜拍了拍灰头土脸的老黄肩膀：“别难过兄弟！在我这给我打工是你的荣幸，先去把这批星舰推进器芯片焊完，晚上给你加开硅谷繁殖学一小时专题辅导，保证治好你那区区三帧格局！”",
      next: "end_ne"
    },
    route_musk_cook: {
      speaker: "旁白",
      location: "📍 加州公路半道 · 皮卡爆胎现场",
      bg: "rain_street",
      sprite: "broken",
      text: "可惜股价跌得太惨，老马一看资产重估连夜撤回了聘书，把老头直接踹下了皮卡。回头望去，圣克拉拉大屏幕已经换上了高领毛衣发布会预热海报！",
      next: "end_be2"
    },
    route_cook_win: {
      speaker: "跨界接班人 · 库克",
      location: "📍 圣克拉拉发布会现场 · 库克登基",
      bg: "board_room",
      sprite: "sad",
      callPopup: { character: "苹果掌门 · 库克", title: "🍏 RTX 6090 Air 发布倒计时", avatar: "cook" },
      effects: { stockChange: -22.0, sound: "stockDown" },
      text: "伴随着标志性的果味极简转场动画，蒂姆·库克真的穿着黑色高领毛衣缓缓走上了圣克拉拉原本属于黑皮衣的舞台正中央……",
      next: "end_be2"
    },

    // --- 6 大损人结局终极锚点 ---
    end_te: {
      speaker: "结局达成 · DLSS 4 满帧复活",
      location: "📍 圣克拉拉总部大门 · 多头反攻纪念碑",
      bg: "rooftop_dawn",
      sprite: "cool",
      text: "你凭一己之力把全网黑子串懵了，华尔街误以为『四倍多帧生成』是全新架构暗号，空头连夜踩踏回补！山顶全仓的血汗本金满血回本还多赚两万顿顶配猪脚饭，而老头只能被迫举着『感谢反串护夫宝赐我新生』的锦旗站在大门口站岗！",
      next: "game_finish"
    },
    end_he: {
      speaker: "结局达成 · 剪刀手合伙人 · Denny's 终身洗碗工",
      location: "📍 硅谷 Denny's 后厨 · 物理戒断监工位",
      bg: "kitchen_fire",
      sprite: "normal",
      text: "为了防止老黄再搞出第 4 个插帧对象连累大盘，你联手正宫没收了他所有皮衣和手机，把战损皮衣剪成限量块卖 99 刀回血，还把他锁回 Denny's 后厨每天老实刷盘子摊松饼抵债——全网散户终于不再担心他半夜发癫，只有后厨洗洁精味最令人安心！",
      next: "game_finish"
    },
    end_ne: {
      speaker: "结局达成 · 德州火箭焊工",
      location: "📍 德州火箭发射基地 · 深夜进修班",
      bg: "rooftop_dawn",
      sprite: "shock",
      text: "老黄认命去给老马打黑工，白天蹲在烈日底下给铁皮火箭焊芯片，晚上被迫研读老马亲自批注的《硅谷繁殖学原理与应用》——听说学完第一课，老头当场捂脸惭愧表示自己才三个插帧确实上不了台面。",
      next: "game_finish"
    },
    end_be1: {
      speaker: "结局达成 · 圣克拉拉捧花人",
      location: "📍 圣克拉拉总部大门外 · 第 10086 号位",
      bg: "rain_street",
      sprite: null,
      text: "老黄被你的毒舌洗地发言直接气进内部医疗部（好巧不巧正好归潜伏 20 年的鲍姐管），顺理成章续上了下半辈子长周期心率监测。而你独自捧着一束九块九包邮的白菊花，乖乖站在圣克拉拉总部大门口排上了第 10086 号……",
      next: "game_finish"
    },
    end_be2: {
      speaker: "结局达成 · 果味 8G 显存地狱",
      location: "📍 圣克拉拉发布会大厅 · 8GB 黄金显卡灾难",
      bg: "board_room",
      sprite: null,
      text: "库克真的穿黑色高领毛衣来接班了！他在聚光灯下微笑着单手端出一张机身只有 5 毫米厚、显存焊死 8GB 黄金容量、升级 16G 加价八千、盒子里为了环保不送风扇且散热硅脂单独卖 999 刀的 RTX 6090 Air——全场发疯，你的持仓当场归零！",
      next: "game_finish"
    },
    end_be3: {
      speaker: "结局达成 · 巴菲特躺赢背景板",
      location: "📍 圣克拉拉总部大门外 · 电子蜡烛批发摊",
      bg: "rain_street",
      sprite: null,
      text: "盘面彻底跌穿防线，强平短信准时送达。远方的巴菲特老爷子啥事没干喝口樱桃可乐躺赢升至全球富豪榜第七；而你卡里最后剩的那点零钱全换成了电子白蜡烛，连夜在总部门口跟别的难兄难弟卷起了九块九批发价。",
      next: "game_finish"
    }
  }
};

window.SCRIPT_DATA = SCRIPT_DATA;
