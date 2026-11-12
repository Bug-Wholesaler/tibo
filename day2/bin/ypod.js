#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      'YPod - 桌面置顶 Coding Agent 监工悬浮舱',
      '支持监控：Antigravity (AGY) / OpenAI Codex / Claude Code / Kimi Code',
      '',
      '用法：',
      '  ypod                启动桌面置顶悬浮舱',
      '  ypod --server-only  仅启动本地 HTTP/SSE 监工服务',
      '  ypod --status       在终端打印当前四端会话与算力状态摘要',
      '  ypod --help         查看帮助'
    ].join('\n')
  );
  process.exit(0);
}

if (args.includes('--status')) {
  const { MultiAgentLogWatcher } = require(path.join(appRoot, 'src', 'log-watcher.js'));
  const { buildAgentSummary } = require(path.join(appRoot, 'src', 'server.js'));
  const watcher = new MultiAgentLogWatcher();
  watcher.scanAllSources();
  const sessions = watcher.getAllSessions();
  const summary = buildAgentSummary(sessions);
  const labels = [
    ['agy', 'Antigravity'],
    ['codex', 'OpenAI Codex'],
    ['claude', 'Claude Code'],
    ['kimi', 'Kimi Code']
  ];

  console.log(
    `[YPod] 活跃/最近会话: ${summary.totalSessions} 个 | 运行中: ${summary.workingSessions} 个 | 累计 Token: ${summary.totalTokens.toLocaleString()}`
  );
  for (const [key, title] of labels) {
    const item = summary.byAgent[key] || { sessions: 0, working: 0, totalTokens: 0 };
    console.log(
      `  - ${title.padEnd(13)} 会话 ${String(item.sessions).padStart(2)} | 运行中 ${item.working} | Token ${item.totalTokens.toLocaleString()}`
    );
  }
  if (sessions.length > 0) {
    console.log('\n最近动态：');
    for (const s of sessions.slice(0, 6)) {
      const topic =
        (s.analysis && s.analysis.topicTitle) || s.sessionTitle || s.originTopic || s.rawId || s.id;
      const ttft =
        s.tokenStats && typeof s.tokenStats.currentTtftSec === 'number' && s.tokenStats.currentTtftSec > 0
          ? ` | 首字 ${s.tokenStats.currentTtftSec}s`
          : '';
      const remPct = s.tokenStats?.rateLimits?.primaryRemainingPercent;
      const quotaInfo = typeof remPct === 'number' ? ` | 剩余 ${Math.round(remPct)}%` : '';
      const swarmInfo =
        s.subagentCount > 0
          ? ` | 🐝 ${s.activeSubagents > 0 ? `${s.activeSubagents}运行/` : ''}${s.subagentCount}子代理`
          : '';
      console.log(`  [${s.agentName}] (${s.status}) ${topic}${ttft}${quotaInfo}${swarmInfo}`);
    }
  }
  process.exit(0);
}

if (args.includes('--server-only')) {
  require(path.join(appRoot, 'src', 'server.js'));
} else {
  let electronBin;
  try {
    electronBin = require('electron');
  } catch {
    console.error('[YPod] Electron binary not found. Run `npm install` first.');
    process.exit(1);
  }

  const child = spawn(electronBin, [appRoot], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
}
