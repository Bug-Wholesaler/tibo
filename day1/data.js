/**
 * Yttrium的28天护茶监控台 — 官方数据配置文件 (data.js)
 * 
 * 说明：
 * 1. 本文件由博主（Yttrium）单方维护，访客在网页上只能查看和点击跳转，无法篡改状态。
 * 2. 网页会自动读取真实北京时间（UTC+8），将 Day 01 ~ Day 28 与真实日历日期对齐。
 * 3. 状态字段 status 取值说明：
 *    - "done"  : 🚀 已交作业（点亮薄荷绿，访客点击可跳转 GitHub 或下载作品）
 *    - "reset" : 🧋 触发断更（点亮奶茶暖橙，访客点击可查看抽到的评论区锦鲤用户图片）
 *    - "auto"  : 🕒 自动对齐时间（未来日期显示「待解锁」，当日未更新时显示「今日手搓中」）
 */

window.YTTRIUM_CONFIG = {
  // 挑战启动第一天日期（北京时间 YYYY-MM-DD）
  startDate: "2026-11-10",

  // 账号与站点基础信息（严格遵循防开盒脱敏规范）
  profile: {
    title: "Yttrium的28天护茶监控台",
    subtitle: "THU某天坑牛马 · 28天AI手搓军令状",
    ruleText: "断更一天，评论区随机请喝一杯奶茶🧋",
    githubHome: "https://github.com/Bug-Wholesaler/yttrium"
  },

  // 28天排期与交付数据（每天更新这里即可）
  days: [
    {
      day: 1,
      status: "done", // "done" | "reset" | "auto"
      title: "Day 01：手搓本护茶监控台网站，卡Bug保住第一杯奶茶",
      desc: "纯前端清爽亮色监控面板，对接真实日历时间，支持作品跳转与断更锦鲤公示。",
      githubUrl: "https://github.com/Bug-Wholesaler/yttrium/tree/main/day1", // GitHub 仓库地址
      downloadUrl: "./index.html",        // 作品下载链接或在线体验地址
      winnerName: "",
      winnerImage: ""
    },
    {
      day: 2,
      status: "auto",
      title: "Day 02：待解锁更新",
      desc: "欢迎在小红书评论区留下离谱痛点蹲奶茶",
      githubUrl: "",
      downloadUrl: "",
      winnerName: "",
      winnerImage: ""
    },
    // Day 03 ~ Day 28 默认自动根据真实时间对齐锁定状态
    // 如果某天断更了，只需把对应 day 的 status 改为 "reset"，并放入中奖截图路径（如 "./images/day3-winner.png"）
    { day: 3,  status: "auto", title: "Day 03：待从评论区奇葩痛点池解锁", desc: "欢迎在小红书评论区留下离谱痛点蹲奶茶", githubUrl: "", downloadUrl: "", winnerName: "", winnerImage: "" },
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
