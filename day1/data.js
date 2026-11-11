/**
 * 28天护茶监控台 — 打卡进度与作品链接配置 (data.js)
 * 
 * 状态字段 status 说明：
 * - "done"  : 🚀 已交作业（点亮绿色，点击可跳转对应 GitHub 源码或下载链接）
 * - "reset" : 🧋 触发断更（点亮橙色，点击可查看当天抽中的奶茶锦鲤截图）
 * - "auto"  : 🕒 自动对齐时间（未到日期显示待解锁，当天未更新时显示手搓中）
 */

window.YTTRIUM_CONFIG = {
  // 挑战启动第一天日期（YYYY-MM-DD）
  startDate: "2026-11-10",

  // 实时留言板云端同步频道标识
  boardTopic: "yttrium_39_tea_board_v2",

  // 页面头部信息
  profile: {
    title: "Yttrium的28天护茶监控台",
    subtitle: "THU某天坑牛马 · 28天AI手搓军令状",
    ruleText: "断更一天，评论区随机请喝一杯奶茶🧋",
    githubHome: "https://github.com/Bug-Wholesaler/yttrium"
  },

  // 留言板固定/精选展示留言（可随时将高赞痛点归档在此永久展示）
  pinnedMessages: [
    {
      id: "pin-1",
      author: "Yttrium",
      isOwner: true,
      tag: "📌 置顶声明",
      text: "纯本地自用瞎折腾，不卖课不收费不建群！大家平时电脑上或实验搬砖有什么奇葩痛点，直接往下面丢，被翻牌就手搓出来；哪天我断更了，直接从这里和小红书评论区抽一位请喝奶茶🧋",
      time: "2026-11-10 置顶"
    }
  ],

  // 28天打卡记录与作品传送门
  days: [
    {
      day: 1,
      status: "done",
      title: "Day 01：手搓本护茶监控台网站，卡Bug保住第一杯奶茶",
      desc: "纯前端清爽亮色监控面板，对接真实日历时间，支持作品跳转、实时留言许愿与断更锦鲤公示。",
      githubUrl: "https://github.com/Bug-Wholesaler/yttrium/tree/main/day1",
      downloadUrl: "./index.html",
      winnerName: "",
      winnerImage: ""
    },
    {
      day: 2,
      status: "done",
      title: "Day 02：手搓 YPod 桌面悬浮监工舱，切出去摸鱼也不慌",
      desc: "置顶挂在屏幕角落盯 Coding Agent 干活的小胶囊：实时看 Token 消耗、首字耗时与模型剩余额度，点开直接看红绿 Diff 和死循环提醒。",
      githubUrl: "https://github.com/Bug-Wholesaler/yttrium/tree/main/day2",
      downloadUrl: "https://github.com/Bug-Wholesaler/yttrium/archive/refs/heads/main.zip",
      winnerName: "",
      winnerImage: ""
    },
    { day: 3,  status: "auto", title: "Day 03：待解锁更新", desc: "欢迎在下方留言板或小红书评论区留下离谱痛点蹲奶茶", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 4,  status: "auto", title: "Day 04：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 5,  status: "auto", title: "Day 05：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 6,  status: "auto", title: "Day 06：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 7,  status: "auto", title: "Day 07：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 8,  status: "auto", title: "Day 08：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 9,  status: "auto", title: "Day 09：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 10, status: "auto", title: "Day 10：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 11, status: "auto", title: "Day 11：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 12, status: "auto", title: "Day 12：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 13, status: "auto", title: "Day 13：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 14, status: "auto", title: "Day 14：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 15, status: "auto", title: "Day 15：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 16, status: "auto", title: "Day 16：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 17, status: "auto", title: "Day 17：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 18, status: "auto", title: "Day 18：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 19, status: "auto", title: "Day 19：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 20, status: "auto", title: "Day 20：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 21, status: "auto", title: "Day 21：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 22, status: "auto", title: "Day 22：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 23, status: "auto", title: "Day 23：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 24, status: "auto", title: "Day 24：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 25, status: "auto", title: "Day 25：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 26, status: "auto", title: "Day 26：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 27, status: "auto", title: "Day 27：待解锁更新", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
    { day: 28, status: "auto", title: "Day 28：28天护茶军令状收官日", desc: "", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" }
  ]
};
