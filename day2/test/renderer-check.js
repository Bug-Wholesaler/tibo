// Standalone Electron renderer check with synthetic data. Run with Electron, not Node.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

app.whenReady().then(async () => {
  const long = '这是用于检查文字是否完整换行的模拟内容。'.repeat(12);
  const session = {
    id: 'test-session', agentType: 'codex', updatedAt: new Date().toISOString(),
    steps: Array.from({ length: 8 }, (_, i) => ({
      id: 'step-' + i, kind: 'tool', category: '终端', toolName: 'exec',
      title: '示例步骤 ' + i, humanSummary: '测试步骤 ' + i,
      rawDetail: '命令详情 <不应被解释为标签>', toolInput: '{"command":"test"}',
      timestamp: new Date().toISOString()
    })),
    analysis: {
      projectName: '测试项目', topicTitle: '测试任务', longTermGoal: long, shortTermGoal: long,
      alignmentReason: long, alignmentStatus: 'aligned', touchedFiles: [],
      stats: { toolCalls: 8 }, stageIndex: 1, phase: '测试', macroSummary: '测试中'
    }, tokenStats: {
      totalTokens: 12000,
      contextUsedTokens: 12000,
      contextWindowLimit: 200000,
      rateLimits: {
        isCodexNative: true,
        planType: 'PRO',
        primaryUsedPercent: 16,
        primaryRemainingPercent: 84,
        primaryWindowMinutes: 300,
        primaryResetsAt: Math.floor(Date.now() / 1000) + 3900,
        secondaryUsedPercent: 30,
        secondaryRemainingPercent: 70
      }
    }
  };
  const kimiSession = {
    id: 'kimi:session_check', agentType: 'kimi', model: 'kimi-for-coding', updatedAt: new Date().toISOString(),
    steps: [{
      id: 'kimi-step-1', kind: 'tool', category: '代码修改', toolName: 'Edit',
      title: 'Kimi 修改文件', humanSummary: '修改 src/app.js',
      tokens: { inputTokens: 1200, cachedTokens: 4800, outputTokens: 300, totalTokens: 6300, ttftSec: 1.35 },
      timestamp: new Date().toISOString()
    }],
    analysis: {
      projectName: 'kimi-demo', topicTitle: 'Kimi 监控验证', longTermGoal: '验证 Kimi 渲染', shortTermGoal: '检查配额与 TTFT',
      alignmentReason: '正常推进', alignmentStatus: 'aligned', touchedFiles: [],
      stats: { toolCalls: 1 }, stageIndex: 2, phase: '代码修改', macroSummary: 'Kimi 正在修改代码'
    },
    tokenStats: {
      totalTokens: 6300, inputTokens: 1200, cachedTokens: 4800, outputTokens: 300, cacheHitRate: 80,
      currentTtftSec: 1.35, avgTtftSec: 1.35, minTtftSec: 1.35, maxTtftSec: 1.35,
      contextUsedTokens: 6300, contextWindowLimit: 1048576,
      rateLimits: {
        isKimiNative: true,
        primaryUsedPercent: 22,
        primaryRemainingPercent: 78,
        primaryResetsAt: Date.now() + 7200 * 1000,
        secondaryRemainingPercent: 65,
        secondaryUsedPercent: 35
      }
    }
  };
  const agySwarmSession = {
    id: 'agy:swarm-root-1',
    agentType: 'agy',
    swarmTitle: 'YPod Swarm',
    updatedAt: new Date().toISOString(),
    status: 'WORKING',
    subagentCount: 2,
    activeSubagents: 1,
    waitingSubagents: 1,
    subagents: [
      {
        id: 'agy:worker-scout',
        rawId: 'worker-scout',
        agentType: 'agy',
        isSubagent: true,
        parentSessionId: 'agy:swarm-root-1',
        subagentKind: 'swarm',
        subagentRole: 'kimi-scout',
        subagentRunState: 'working',
        status: 'WORKING',
        model: 'Gemini 3.1 Pro',
        durationSec: 42,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: 'scout-step-1',
            kind: 'tool',
            category: '代码编辑',
            toolName: 'edit_file',
            targetFile: 'log-watcher.js',
            title: '编辑 log-watcher.js',
            humanSummary: '正在更新子代理扫描逻辑',
            diff: { addedCount: 3, removedCount: 1, lines: [{ type: 'add', text: 'isSubagent: true' }] },
            timestamp: new Date().toISOString()
          }
        ],
        analysis: {
          projectName: 'ypod',
          topicTitle: '侦察 Swarm 日志结构',
          longTermGoal: '完成日志字段摸底',
          shortTermGoal: '输出侦察报告',
          alignmentStatus: 'aligned',
          alignmentReason: '正在扫描目录',
          touchedFiles: [{ name: 'log-watcher.js', mode: 'WRITE', count: 1, hasDiff: true, lastStepId: 'scout-step-1' }],
          stats: { toolCalls: 1, totalSteps: 1 },
          stageIndex: 2,
          phase: '动刀编码中',
          macroSummary: '正在更新子代理扫描逻辑'
        },
        tokenStats: { totalTokens: 4500, contextUsedTokens: 4500, contextWindowLimit: 200000 }
      },
      {
        id: 'agy:worker-verifier',
        rawId: 'worker-verifier',
        agentType: 'agy',
        isSubagent: true,
        parentSessionId: 'agy:swarm-root-1',
        subagentKind: 'swarm',
        subagentRole: 'ship-verifier',
        subagentRunState: 'waiting',
        status: 'IDLE',
        model: 'Claude Opus 4.6',
        durationSec: 15,
        updatedAt: new Date().toISOString(),
        steps: [{ id: 'ver-1', kind: 'tool', category: '看板待命', title: '看板休眠待命', humanSummary: '💤 已挂起并监听看板唤醒消息', timestamp: new Date().toISOString() }],
        analysis: {
          projectName: 'ypod',
          topicTitle: '等待主作者完成验证',
          longTermGoal: '整体验收',
          shortTermGoal: '看板休眠待命',
          alignmentStatus: 'unknown',
          alignmentReason: '',
          touchedFiles: [],
          stats: { toolCalls: 1, totalSteps: 1 },
          stageIndex: 4,
          phase: '看板待命中',
          macroSummary: '子代理 @ship-verifier 已汇报并在看板休眠待命'
        },
        tokenStats: { totalTokens: 1800, contextUsedTokens: 1800, contextWindowLimit: 200000 }
      }
    ],
    steps: [
      {
        id: 'agy-root-step-1',
        kind: 'tool',
        category: '子智能体调度',
        toolName: 'swarm',
        title: '调度 Swarm 编队',
        humanSummary: '🐝 正在调度子代理 @kimi-scout',
        timestamp: new Date().toISOString()
      }
    ],
    analysis: {
      projectName: 'ypod',
      topicTitle: '主对话统筹 YPod 升级',
      longTermGoal: '完成 YPod 升级',
      shortTermGoal: '统筹子代理推进',
      alignmentStatus: 'aligned',
      alignmentReason: '正常协同',
      touchedFiles: [],
      stats: { toolCalls: 1, totalSteps: 1 },
      stageIndex: 1,
      phase: '探查检索中',
      macroSummary: '🐝 正在调度子代理 @kimi-scout'
    },
    tokenStats: {
      totalTokens: 9800,
      contextUsedTokens: 9800,
      contextWindowLimit: 200000,
      agentTier: { provider: 'Antigravity', plan: 'Google AI Ultra' },
      rateLimits: {
        isAntigravityNative: true,
        planType: 'Google AI Ultra',
        modelName: 'Claude Opus 4.6',
        primaryRemainingPercent: 93,
        primaryUsedPercent: 7,
        primaryResetsAt: Date.now() + 7800 * 1000
      }
    }
  };
  const fixture = `<script>
    window.fetch = async () => ({ json: async () => (${JSON.stringify({ sessions: [session, kimiSession, agySwarmSession], orphanSubagents: [], pendingIntercepts: [], config: {} })}) });
    window.EventSource = class { addEventListener() {} };
  </script>`;
  const html = fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'), 'utf8')
    .replace('  <script>', fixture + '  <script>');
  const win = new BrowserWindow({ width: 530, height: 700, show: false, webPreferences: { contextIsolation: true } });
  win.webContents.on('console-message', (_event, _level, message) => console.error('renderer:', message));
  try {
    await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
    const results = await win.webContents.executeJavaScript(`(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
      document.getElementById('agentBadgeText').textContent = 'Codex · 一个很长很长很长的项目目录名称';
      document.getElementById('capTokSpeed').textContent = '1234.5';
      document.getElementById('capTokTotal').textContent = '999.99M';
      const measureHeader = () => {
        const stage = document.getElementById('stageTrack').getBoundingClientRect();
        const right = document.querySelector('.capsule-right').getBoundingClientRect();
        const center = document.querySelector('.capsule-center').getBoundingClientRect();
        const last = document.querySelector('.stage-node:last-child').getBoundingClientRect();
        return { clear: stage.right <= right.left && stage.right <= center.right + 1,
          allStagesVisible: last.right <= stage.right + 1 };
      };
      const cockpitHeader = measureHeader();
      toggleCockpit();
      const capsuleHeader = measureHeader();
      toggleCockpit();
      document.getElementById('goalExpandButton').click();
      const goals = document.getElementById('goalDetails');
      const goal = document.getElementById('gaugeGoalText');
      const expanded = goals.classList.contains('expanded');
      const wraps = goal.scrollHeight > 20 && goal.scrollWidth <= goal.clientWidth + 1;
      switchTab('radar');
      document.getElementById('stepsExpandButton').click();
      const count = document.querySelectorAll('.step-toggle').length;
      if (!count) return { expanded, wraps, count, body: document.getElementById('recentMiniList').textContent,
        summary: document.getElementById('liveSubtitle').textContent };
      document.querySelector('.step-toggle').click();
      const detail = document.querySelector('.step-detail');
      const safeText = detail && detail.textContent.includes('命令详情 <不应被解释为标签>');
      const input = detail && detail.textContent.includes('"command":"test"');
      renderPod();
      const preserved = !!document.querySelector('.step-detail');
      setAgentFilter('kimi');
      switchTab('token');
      const kimiPlanText = document.getElementById('quotaPlanType').textContent;
      const kimiTtftText = document.getElementById('tokTtftNow').textContent;
      const kimiPlatText = document.getElementById('idBarPlat').textContent;
      const kimiQuotaVal = document.getElementById('quotaRateLimitVal').textContent;
      const kimiQuotaBarW = document.getElementById('quotaRateLimitBar').style.width;
      const kimiCapQuota = document.getElementById('capTokQuota').textContent;
      const kimiSub1 = document.getElementById('quotaSubLabel1').textContent;
      const kimiCheckOk = kimiPlanText.includes('Kimi Code') && !kimiPlanText.includes('Codex') &&
        kimiTtftText === '1.35' && kimiPlatText === 'Kimi Code' &&
        kimiQuotaVal.startsWith('剩余 78%') && kimiQuotaVal.includes('重置') &&
        kimiQuotaBarW === '78%' && kimiCapQuota === '余78%' && kimiSub1.includes('已用 22%');

      // Check Codex unified remaining quota
      setAgentFilter('codex');
      const codexQuotaVal = document.getElementById('quotaRateLimitVal').textContent;
      const codexQuotaBarW = document.getElementById('quotaRateLimitBar').style.width;
      const codexCapQuota = document.getElementById('capTokQuota').textContent;
      const codexQuotaOk = codexQuotaVal.startsWith('剩余 84%') && codexQuotaBarW === '84%' && codexCapQuota === '余84%';

      // Check AGY unified remaining quota + Swarm micro-capsule + drawer + subagent inspection + return bar
      setAgentFilter('agy');
      const agyFilterCount = document.getElementById('filterCnt-agy').textContent;
      const agyQuotaVal = document.getElementById('quotaRateLimitVal').textContent;
      const agyQuotaBarW = document.getElementById('quotaRateLimitBar').style.width;
      const agyCapQuota = document.getElementById('capTokQuota').textContent;
      const agySwarmHeader = measureHeader();
      const swarmPillText = document.getElementById('idBarSwarmPill').textContent;
      document.getElementById('idBarSwarmPill').click();
      const drawerOpen = document.getElementById('subagentDrawer').classList.contains('show');
      const drawerText = document.getElementById('subagentDrawerList').textContent;
      document.querySelector('#subagentDrawerList .subagent-row').click();
      const returnBarShown = document.getElementById('subagentReturnBar').classList.contains('show');
      const returnBtnText = document.getElementById('btnReturnMainSession').textContent;
      const subTopicNow = document.getElementById('idBarTopic').textContent;
      document.getElementById('btnReturnMainSession').click();
      const returnedClean = !document.getElementById('subagentReturnBar').classList.contains('show') &&
        document.getElementById('idBarTopic').textContent.includes('主对话统筹');
      const swarmFlowOk = agyFilterCount === '1' &&
        agyQuotaVal.startsWith('剩余 93%') && agyQuotaBarW === '93%' && agyCapQuota === '余93%' &&
        agySwarmHeader.clear && agySwarmHeader.allStagesVisible &&
        swarmPillText.includes('1运行/2子代理') && drawerOpen &&
        drawerText.includes('@kimi-scout') && drawerText.includes('@ship-verifier') &&
        returnBarShown && returnBtnText.includes('返回主对话') &&
        subTopicNow.includes('侦察 Swarm 日志结构') && returnedClean;

      setAgentFilter('all');
      selectSessionById('test-session');
      switchTab('radar');
      return { expanded, wraps, count, safeText, input, preserved, kimiCheckOk, codexQuotaOk, swarmFlowOk, cockpitHeader, capsuleHeader,
        detailCount: document.querySelectorAll('.step-detail').length };
    })()`);
    const output = path.join(os.tmpdir(), 'ypod-renderer-check.png');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const image = await win.capturePage();
    fs.writeFileSync(output, image.toPNG());
    console.log(JSON.stringify({ ...results, screenshot: output, screenshotSize: image.getSize() }));
    if (!results.expanded || !results.wraps || results.count !== 8 || !results.safeText || !results.input || !results.preserved ||
        !results.kimiCheckOk || !results.codexQuotaOk || !results.swarmFlowOk ||
        !results.cockpitHeader?.clear || !results.cockpitHeader?.allStagesVisible ||
        !results.capsuleHeader?.clear || !results.capsuleHeader?.allStagesVisible) return app.exit(1);
  } catch (error) {
    console.error(error);
    return app.exit(1);
  }
  app.quit();
});
