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
    }, tokenStats: {}
  };
  const fixture = `<script>
    window.fetch = async () => ({ json: async () => (${JSON.stringify({ sessions: [session], pendingIntercepts: [], config: {} })}) });
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
      return { expanded, wraps, count, safeText, input, preserved, cockpitHeader, capsuleHeader,
        detailCount: document.querySelectorAll('.step-detail').length };
    })()`);
    const output = path.join(os.tmpdir(), 'ypod-renderer-check.png');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const image = await win.capturePage();
    fs.writeFileSync(output, image.toPNG());
    console.log(JSON.stringify({ ...results, screenshot: output, screenshotSize: image.getSize() }));
    if (!results.expanded || !results.wraps || results.count !== 8 || !results.safeText || !results.input || !results.preserved ||
        !results.cockpitHeader?.clear || !results.cockpitHeader?.allStagesVisible ||
        !results.capsuleHeader?.clear || !results.capsuleHeader?.allStagesVisible) return app.exit(1);
  } catch (error) {
    console.error(error);
    return app.exit(1);
  }
  app.quit();
});
