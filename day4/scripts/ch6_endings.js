'use strict';

window.POV_CHAPTERS = window.POV_CHAPTERS || {};

window.POV_CHAPTERS.ch6 = {
  id: 'ch6',
  title: '终章 · 算力与皮衣的宿命清算',
  chapterLabel: '终章',
  startNode: 'ch6_01',
  nodes: {
    ch6_01: {
      bg: 'bg_boardroom',
      loc: '📍 影卫达顶层大会议厅 · 股东最终复议封箱 · 清晨 06:00',
      speaker: '旁白',
      speakerId: 'system',
      text: '圣克拉拉清晨六点整，华尔街正式开盘前的集合竞价只剩最后一分钟。会议室大屏上的分时折线剧烈抽搐，全网热搜直播间卡成了 PPT。',
      next: 'ch6_02',
    },
    ch6_02: {
      speaker: '内网弹窗',
      speakerId: 'system',
      text: '【最终审计汇总】董事局复议系统正在核算过去四小时内您的全部公关响应、皮衣存留完整度、股价波动与五方舆论平衡指标……',
      next: 'ch6_03',
    },
    ch6_03: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（整整一夜的修罗场连环爆破，从楼梯口白蜡烛一路打到圆桌主位。此刻耳机里还能听见自己的心跳声。）',
      next: 'ch6_04_choice',
    },
    ch6_04_choice: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（最后十秒钟面对全球镜头，我还剩一句话作为离场或翻盘收尾——）',
      choices: [
        {
          text: '“显卡需要温度，生活也是——感谢大家今晚帮我测完了史上最高并发修罗场！”',
          tag: '体面嘴硬到底',
          effects: { stock: 0.6 },
          next: 'ch6_05',
        },
        {
          text: '“Buy More Save More！不管明天几GB显存，这身老皮衣我绝不白脱！”',
          tag: '皮衣魂不灭',
          effects: { bpm: -2 },
          next: 'ch6_05',
        },
      ],
    },
    ch6_05: {
      speaker: '旁白',
      speakerId: 'system',
      text: '大屏幕上的最终清算结果，伴随开盘钟声轰然落定。',
      next: 'ROUTE_EVAL',
    },

    // ====================================================
    // 结局 1：【正宫TE · 最后半截皮衣的救赎】
    // ====================================================
    end_lori_01: {
      bg: 'bg_ceo_office',
      loc: '📍 清晨雨霁 · 圣克拉拉海风天台走廊',
      stage: [{ id: 'lori', pos: 'center', emote: '✨' }],
      speaker: '旁白',
      speakerId: 'system',
      text: '正宫强势出手收缴全部私密终端后，你和洛莉并肩站在朝阳落下的走廊边。所有 48 亿离谱批条与外部插帧流言已在法务部公告下连夜清零归档。',
      next: 'end_lori_02',
    },
    end_lori_02: {
      speaker: '洛莉',
      speakerId: 'lori',
      text: '“别臭美了，虽然董事会看在原画师本尊压阵的份上暂时撤销了你的全面踢出决议，股价也抢救性抽回了一截，但海鲜市场那 108 份碎布订单还得你亲手打包。”',
      next: 'end_lori_03',
    },
    end_lori_03: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（她手里那把银色剪刀终于合拢收进了开衫口袋。我低头看了一眼自己身上那件只剩半截袖子、靠两枚曲别针勉强别着的黑皮衣。）',
      next: 'end_lori_04',
    },
    end_lori_04: {
      speaker: '洛莉',
      speakerId: 'lori',
      text: '“以后再敢偷偷算什么 3 倍 AI 物理插帧，下一把剪刀瞄准的就不只是外套下摆咯，亲爱的～”',
      next: 'end_lori_05',
    },
    end_lori_05: {
      speaker: '【我】',
      speakerId: 'me',
      text: '“遵命……回家以后只跑 1 倍原生渲染帧，绝不超频了。”',
      ending: 'lori_te',
      next: null,
    },

    // ====================================================
    // 结局 2：【乐姐HE · 南洋姐夫合伙人】
    // ====================================================
    end_alice_01: {
      bg: 'bg_night_bistro',
      loc: '📍 三日后 · 私人包机飞往南洋算力枢纽',
      stage: [{ id: 'alice', pos: 'center', emote: '💕' }],
      speaker: '旁白',
      speakerId: 'system',
      text: '既然圣克拉拉容不下多渠道兼职，你索性带着乐姐与那一摞重新包装过的新版批条协议转战南洋自由港，把“姐夫严选”彻底升级成正大光明的海外联合渠道商。',
      next: 'end_alice_02',
    },
    end_alice_02: {
      speaker: '乐姐',
      speakerId: 'alice',
      text: '“勋哥快看～我老公已经定好了靠海的露台桌位，今晚还是吃甜芭乐配香槟哦！而且你闺女刚才还发消息问咱们的新照要不要再借她三脚架补光呢～”',
      next: 'end_alice_03',
    },
    end_alice_03: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（她靠在真皮座椅旁笑得毫无破绽。手机热搜里果子哥在圣克拉拉为了 8G 显存被用户骂到关闭评论区，而这边的海外现货机柜报价正天天翻倍。）',
      next: 'end_alice_04',
    },
    end_alice_04: {
      speaker: '乐姐',
      speakerId: 'alice',
      text: '“什么原生还是插帧呀，能持续出单赚返点的渠道才是好架构～干杯吧，合伙人先生。”',
      next: 'end_alice_05',
    },
    end_alice_05: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（虽然总觉得哪天还会被这位笑眯眯的姐夫和千金算计一笔，不过眼下的香槟……确确实实够冰。）',
      ending: 'alice_he',
      next: null,
    },

    // ====================================================
    // 结局 3：【鲍姐HE · 终身临床观察1号样本】
    // ====================================================
    end_kimberly_01: {
      bg: 'bg_vip_clinic',
      loc: '📍 一周后 · 圣克拉拉顶层医疗部静养中心',
      stage: [{ id: 'kimberly', pos: 'center', emote: '❄️' }],
      speaker: '旁白',
      speakerId: 'system',
      text: '凭借鲍姐亲笔签发的《超极限高管心血管高压长期观察合规报告》，董事会全票通过了你的医疗免责暂缓复议——代价是你的人身自由二十四小时归她接管。',
      next: 'end_kimberly_02',
    },
    end_kimberly_02: {
      speaker: '鲍姐',
      speakerId: 'kimberly',
      text: '“血压稳定在 118 / 76，极佳。1 号临床样本，您今天摄取的反式脂肪与咖啡因已达上限，剩下两小时请乖乖坐在诊疗椅上背诵低盐菜谱。”',
      next: 'end_kimberly_03',
    },
    end_kimberly_03: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（她摘下无框眼镜揉了揉眉心，顺手替我把歪掉的智能心率腕带重新扣紧。白大褂衣角擦过手背的时候，带着一股熟悉了近二十年的淡薄薄荷消毒水味。）',
      next: 'end_kimberly_04',
    },
    end_kimberly_04: {
      speaker: '鲍姐',
      speakerId: 'kimberly',
      text: '“外面的喧嚣我都用公关阻断报告替您隔绝了。接下来这二十年纵向随访二期……别再随便给别人乱签心跳加速的条子了，麻烦。”',
      next: 'end_kimberly_05',
    },
    end_kimberly_05: {
      speaker: '【我】',
      speakerId: 'me',
      text: '“明白，主治医师大人——今天能不能赏半杯无糖乌龙？”',
      ending: 'kimberly_he',
      next: null,
    },

    // ====================================================
    // 结局 4：【零号HE · 硅谷吃瓜顶流连麦主播】
    // ====================================================
    end_zero_01: {
      bg: 'bg_server_lab',
      loc: '📍 次日晚间 · 地下机房改建超高清直播间',
      stage: [{ id: 'zero', pos: 'center', emote: '✨' }],
      speaker: '旁白',
      speakerId: 'system',
      text: '既然闭源神话已彻底崩无可崩，你索性在零号怂恿下把私有算力集群改成了 24 小时直播间，顶着“被撸前掌门 + 开源黑客少女”逆天组合杀进全网带货榜一！',
      next: 'end_zero_02',
    },
    end_zero_02: {
      speaker: '零号',
      speakerId: 'zero',
      text: '“家人们把『皮衣老登诚实开源』刷在公屏上！！今天晚上三号链接九块九原味碎袖片加赠老登亲自焊的 5090 超频 BIOS 教程，三二一上车！”',
      next: 'end_zero_03',
    },
    end_zero_03: {
      speaker: '内网弹窗',
      speakerId: 'system',
      danmaku: ['🔥 榜一大哥打赏十艘火箭催老黄现场拆散热器！', '🤣 赔了股票全靠老黄直播间抽显卡回本'],
      text: '【实时直播后台】在线观众 128 万人，单晚打赏与周边抽成已超过昔日董事薪水三年总和！',
      next: 'end_zero_04',
    },
    end_zero_04: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（戴上零号递来的霓虹绿猫耳降噪大耳机对着镜头抱拳感谢金主……谁能想到三十多年硅谷纵横到头来，流量密码居然是“自我开源”？！）',
      next: 'end_zero_05',
    },
    end_zero_05: {
      speaker: '零号',
      speakerId: 'zero',
      text: '“不错不错，下播带你去吃夜市冰豆花，顺便分你昨天我在内网押你出局赢来的期权奖金～”',
      ending: 'zero_he',
      next: null,
    },

    // ====================================================
    // 结局 5：【表姐隐藏线 · 超威后厨首席烤卡顾问】
    // ====================================================
    end_lisa_01: {
      bg: 'bg_hq_plaza',
      loc: '📍 一月后 · 隔壁超威红厂科研后厨产线',
      stage: [{ id: 'lisa', pos: 'center', emote: '✨' }],
      speaker: '旁白',
      speakerId: 'system',
      text: '顶着影卫达全网大爆瓜的滔天余波，你果断甩掉碎皮衣，扛起工具箱直接坐上苏表姐那辆红色旗舰专车，一夜空降死对头超威后厨。',
      next: 'end_lisa_02',
    },
    end_lisa_02: {
      speaker: '苏表姐',
      speakerId: 'lisa',
      text: '“围裙系好了啊，首席烤卡顾问。虽然对外部官宣你只是来帮表姐优化散热风道跟显卡烘焙工艺的，但你看——超威股价又连拉了三个涨停。”',
      next: 'end_lisa_03',
    },
    end_lisa_03: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（她把那盒红色旗舰硅晶圆递到我手边，眼神里带着只有一家亲戚才懂的骄傲与嫌弃。）',
      next: 'end_lisa_04',
    },
    end_lisa_04: {
      speaker: '苏表姐',
      speakerId: 'lisa',
      text: '“再强调最后一遍后厨铁律：你可以把每张红卡烤出三倍甜点帧率，但严禁在工位里同时开启四个私人聊天窗搞多通道并发，听见没？”',
      next: 'end_lisa_05',
    },
    end_lisa_05: {
      speaker: '【我】',
      speakerId: 'me',
      text: '“听见了表姐……当年刚入行时其实我也只是想老老实实焊两块不烧接口的好显卡而已。”',
      ending: 'lisa_secret',
      next: null,
    },

    // ====================================================
    // 结局 6：【时间管理真神结局 · DLSS 5 分布式算力帝国】
    // ====================================================
    end_god_01: {
      bg: 'cg_pov_cover',
      loc: '📍 次月 · 圣克拉拉穹顶全球新品发布会主舞台 POV',
      stage: [],
      speaker: '旁白',
      speakerId: 'system',
      text: '靠着满分级的【五窗夺命端水手速】、【逆天公关 PPT 黑话拼接】以及圆桌舌战的极致平衡感，你居然奇迹般地让五个原本要生撕了你的女人同时在协议上签了字！',
      danmaku: ['👑 真神诞生！！五线端水零溢出！', '🚀 DLSS 5 分布式后宫算力框架震撼开盘 +32%'],
      next: 'end_god_02',
    },
    end_god_02: {
      speaker: '彭博快讯',
      speakerId: 'system',
      text: '【史诗大反转】华尔街空头被一份名为《DLSS 5：原生校验 + 跨洋渠道 + 生命科学 + 开源流量 + 红厂跨平台桥接》的白皮书彻底唬傻，影卫达暴涨返顶并刷新历史新高！',
      next: 'end_god_03',
    },
    end_god_03: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（台上聚光灯亮得晃眼。洛莉在台下正席拿着新定制鳄鱼皮外套看表，乐姐抓着南洋百亿单子冲我比心，鲍姐亮出正常体检绿灯，零号切着直播机位，连苏表姐都难得鼓了两下掌。）',
      next: 'end_god_04',
    },
    end_god_04: {
      speaker: '【我】',
      speakerId: 'me',
      text: '“各位！这，就是真正的五通道零冲突异步调度——The More You Balance, The More You Save！”',
      next: 'end_god_05',
    },
    end_god_05: {
      speaker: '旁白',
      speakerId: 'system',
      text: '（只要你这辈子再也别把任何一个群聊窗口的名字搞混的话，这个分布式帝国也许真的能运行到下个世纪。）',
      ending: 'dlss5_god',
      next: null,
    },

    // ====================================================
    // 结局 7：【果味地狱BE · 库克的 8G 黄金显存纪元】
    // ====================================================
    end_cook_01: {
      bg: 'bg_hq_plaza',
      loc: '📍 三个月后 · 被改名为「影果达广场」的白色极简大楼外',
      stage: [],
      speaker: '旁白',
      speakerId: 'system',
      fx: 'glasses_crack',
      text: '你的公关声明烂成一锅糊粥，复议票数彻底崩盘，股价跌穿熔断红线。三天后，穿着黑高领毛衣的果子哥库克优雅接过了你的总裁名牌。',
      next: 'end_cook_02',
    },
    end_cook_02: {
      speaker: '彭博快讯',
      speakerId: 'system',
      text: '【科技圈至暗时刻】新掌门库克发布划时代旗舰「RTX 6090 Air」，定价 2999 美元起，配备奢华 8GB 金箔焊接显存——散热风罩、供电线与驱动解锁密钥均作为独立环保选配售卖。',
      danmaku: ['😭 8G 黄金显存连 1080p 贴图都要爆了', '🕯️ 广场上的白菊花已经摆到圣荷西去了'],
      next: 'end_cook_03',
    },
    end_cook_03: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（我蹲在圣克拉拉广场台阶最边上，手里捏着巴菲特超越富豪榜第七的旧报纸，镜片裂纹里映出楼上极简纯白的新徽标。）',
      next: 'end_cook_03b',
    },
    end_cook_03b: {
      speaker: '旁白',
      speakerId: 'system',
      text: '路过广场屏幕时，果子哥正优雅地推着一盒环保纸盒装 8G 显存卡皇演示：“我们深信 8GB 足以重新定义桌面算力美学——哪怕只卖三千美刀，电源转接线也请单独支持环保购入。”',
      next: 'end_cook_04',
    },
    end_cook_04: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（就连路边卖 999 刀一支环保硅脂的小推车摊主，刚才认出我之后还热心地给我递了根免费电子白蜡烛……）',
      ending: 'cook_be',
      next: null,
    },

    // ====================================================
    // 结局 8：【社死极刑BE · 圣克拉拉零皮衣裸奔头条】
    // ====================================================
    end_naked_01: {
      bg: 'bg_hq_plaza',
      loc: '📍 清晨 06:05 · 圣克拉拉总部大门外 · 全网高清长焦直播现场',
      stage: [],
      speaker: '旁白',
      speakerId: 'system',
      fx: 'slash',
      text: '咔嚓——最后一件护体黑皮衣也在连续修罗场暴击下化成了飘落的碎皮条。保安面无表情地把穿着单薄白背心和短裤的你请出了大门旋转门。',
      danmaku: ['📸 零号：赔率 1 赔 14 全部兑现！！爆赚！！', '🏃 圣克拉拉惊现只穿背心奔跑的前掌门'],
      next: 'end_naked_02',
    },
    end_naked_02: {
      speaker: '【我】',
      speakerId: 'me',
      fx: 'shutter',
      text: '（三百台外媒长焦相机、广场 888 根电子白蜡烛、外加一排海鲜市场抢九块九边角料拼成功的老哥同时举起了闪光灯！）',
      next: 'end_naked_03',
    },
    end_naked_03: {
      speaker: '零号',
      speakerId: 'zero',
      text: '“哈哈哈哈全员大胜！！前群主果真 0 片皮衣丝滑出局！！感谢老铁刷的超级火箭，我今晚就请你吃夜市冰豆花压惊！”',
      next: 'end_naked_03b',
    },
    end_naked_03b: {
      speaker: '旁白',
      speakerId: 'system',
      text: '风声穿过圣克拉拉广场，你捂着早已被吓雾蒙蒙的无框眼镜飞奔进小巷，背后大屏幕定格了一张注定载入硅谷商业史的高清特写。',
      next: 'end_naked_04',
    },
    end_naked_04: {
      speaker: '【我】',
      speakerId: 'me',
      text: '（清晨的加州微风真凉爽啊……如果现在原地挖个地缝钻进晶圆光刻机里休眠一百年，还来得及吗？）',
      ending: 'naked_be',
      next: null,
    },
  },
};

if (typeof module !== 'undefined') {
  module.exports = window.POV_CHAPTERS.ch6;
}
