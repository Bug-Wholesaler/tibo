const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { MultiAgentLogWatcher } = require('../src/log-watcher');
const {
  analyzeSessionTrajectory,
  generateDeepAIInsight,
  normalizeChatCompletionsUrl,
  formatToolInput,
  translateToolCall,
  extractStepDiff,
  extractWorkspaceFromPath,
  detectCommandBlastRadius,
  detectCrossSessionConflicts
} = require('../src/ai-interpreter');
const {
  openLocalFileTarget,
  getConfigFilePath,
  ensureStandaloneHookBridge
} = require('../src/server');

test('deliverable packaging: universal workspace detection and standalone ~/.ypod data dir', (t) => {
  // Works on arbitrary user paths across Windows and POSIX
  assert.equal(
    extractWorkspaceFromPath('C:/Users/Alice/projects/my-saas/src/index.ts'),
    'C:/Users/Alice/projects/my-saas'
  );
  assert.equal(
    extractWorkspaceFromPath('/Users/bob/repos/agent-ui/main.py'),
    '/Users/bob/repos/agent-ui'
  );
  // Real project root detection via package.json marker
  const thisFile = path.resolve(__dirname, 'session.test.js');
  assert.equal(
    path.basename(extractWorkspaceFromPath(thisFile)),
    path.basename(path.resolve(__dirname, '..'))
  );

  // Standalone ~/.ypod config and hook-bridge extraction
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ypod-home-'));
  const prevHome = process.env.YPOD_HOME;
  process.env.YPOD_HOME = tmpHome;
  t.after(() => {
    if (prevHome === undefined) delete process.env.YPOD_HOME;
    else process.env.YPOD_HOME = prevHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  assert.equal(getConfigFilePath(), path.join(tmpHome, 'ai-config.json'));
  const bridgeOut = ensureStandaloneHookBridge();
  assert.equal(bridgeOut, path.join(tmpHome, 'hook-bridge.js'));
  assert.equal(fs.existsSync(bridgeOut), true);
});

test('tool details preserve structured input and label very long values', () => {
  assert.match(formatToolInput({ command: 'echo test' }), /"command": "echo test"/);
  assert.match(formatToolInput('x'.repeat(50001)), /已截断/);
  assert.equal(formatToolInput(null), '');
});

test('Red/Green Mini Diff extracts line changes for edit_file, apply_patch, and resolves clickable file paths', () => {
  const editStep = {
    id: 'step-edit-1',
    kind: 'tool',
    ...translateToolCall('edit_file', {
      Path: 'src/server.js',
      Target: 'const a = 1;\nconst b = 2;\n',
      Replacement: 'const a = 1;\nconst b = 42;\nconst c = 3;\n'
    })
  };
  assert.ok(editStep.diff);
  assert.equal(editStep.diff.addedCount, 2);
  assert.equal(editStep.diff.removedCount, 1);
  assert.ok(editStep.diff.lines.some((l) => l.type === 'del' && l.text.includes('const b = 2;')));
  assert.ok(editStep.diff.lines.some((l) => l.type === 'add' && l.text.includes('const b = 42;')));

  const patchInput = [
    '*** Begin Patch',
    '*** Update File: ui/index.html',
    '@@',
    '-<div class="old"></div>',
    '+<div class="new"></div>',
    '*** End Patch'
  ].join('\n');
  const patchStep = {
    id: 'step-patch-2',
    kind: 'tool',
    ...translateToolCall('apply_patch', patchInput)
  };
  assert.equal(patchStep.targetFile, 'index.html');
  assert.ok(patchStep.diff);
  assert.equal(patchStep.diff.addedCount, 1);
  assert.equal(patchStep.diff.removedCount, 1);

  const trajectory = analyzeSessionTrajectory({
    agentType: 'codex',
    cwd: path.resolve(__dirname, '..'),
    steps: [editStep, patchStep]
  });
  const serverBubble = trajectory.touchedFiles.find((f) => f.name === 'server.js');
  assert.ok(serverBubble);
  assert.equal(serverBubble.lastStepId, 'step-edit-1');
  assert.equal(serverBubble.hasDiff, true);
  assert.match(serverBubble.fullPath, /server\.js$/);

  const openRes = openLocalFileTarget('src/server.js', path.resolve(__dirname, '..'), 'open', true);
  assert.equal(openRes.ok, true);
  assert.match(openRes.resolvedPath, /server\.js$/);
});

test('Codex rollouts use conversation identity, exclude subagents, and expire by activity', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ypod-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dir = path.join(home, '.codex', 'sessions', '2026', '01', '01');
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  function write(name, id, source, age, text, parent) {
    const timestamp = new Date(now - age).toISOString();
    const records = [
      { type: 'session_meta', payload: { id, source, parent_thread_id: parent, thread_source: source === 'vscode' ? 'user' : 'subagent', cwd: 'D:/same' } },
      { type: 'event_msg', timestamp, payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ text }] } } }
    ];
    fs.writeFileSync(path.join(dir, name + '.jsonl'), records.map(JSON.stringify).join('\n') + '\n');
  }
  write('rollout-1', 'conversation-a', 'vscode', 60000, '实现悬浮舱的会话管理');
  write('rollout-2', 'conversation-a', 'vscode', 30000, '接下来修复对话去重');
  write('rollout-3', 'conversation-b', 'vscode', 20000, '另一条独立的用户对话');
  write('rollout-4', 'review', { subagent: { other: 'guardian' } }, 10000, '内部审核', 'conversation-a');
  write('rollout-5', 'old', 'vscode', 3 * 60 * 60 * 1000, '已经不活跃的对话');
  const watcher = new MultiAgentLogWatcher();
  watcher.homeDir = home;
  watcher.scanCodexLogs();
  const sessions = watcher.getAllSessions();
  assert.equal(sessions.length, 2);
  const a = sessions.find((s) => s.rawId === 'conversation-a');
  assert.equal(a.steps.length, 2);
  assert.equal(a.analysis.shortTermGoal, '接下来修复对话去重');
  assert.equal(a.analysis.alignmentStatus, 'unknown');
  watcher.scanCodexLogs();
  assert.equal(a.steps.length, 2);
  a.updatedAt = new Date(now - 2 * 60 * 60 * 1000 - 1).toISOString();
  assert.equal(watcher.getAllSessions().length, 1);
});

test('AI assessment uses recent goals and rejects an outdated response', async (t) => {
  let requestBody = '';
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const server = http.createServer(async (req, res) => {
    for await (const chunk of req) requestBody += chunk;
    await wait;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      headline: '正在处理', cockpitDiagnosis: '继续当前任务',
      longTermGoal: '改进悬浮舱', shortTermGoal: '修复会话识别',
      alignmentStatus: 'aligned', alignmentReason: '正在处理会话识别'
    }) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const session = { agentType: 'codex', activityRevision: 1, userGoals: ['改进悬浮舱', '修复会话识别'],
    steps: [{ kind: 'user', rawDetail: '修复会话识别' }] };
  assert.equal(analyzeSessionTrajectory(session).alignmentStatus, 'unknown');
  const result = generateDeepAIInsight(session, { apiUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'test' });
  while (!requestBody) await new Promise((resolve) => setTimeout(resolve, 5));
  session.activityRevision++;
  release();
  assert.equal(await result, null);
  assert.equal(session.aiGoalAssessment, undefined);
  assert.match(requestBody, /修复会话识别/);
  const fresh = await generateDeepAIInsight(session, { apiUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'test' });
  assert.ok(fresh);
  const analysis = analyzeSessionTrajectory(session);
  assert.equal(analysis.longTermGoal, '改进悬浮舱');
  assert.equal(analysis.shortTermGoal, '修复会话识别');
  assert.equal(analysis.alignmentStatus, 'aligned');
  session.activityRevision++;
  assert.equal(analyzeSessionTrajectory(session).alignmentStatus, 'unknown');
});

test('blast radius, cross-agent conflict, and historical fallback sessions', () => {
  // 1. Blast Radius
  const gitBlast = detectCommandBlastRadius('git checkout -b feat/pod');
  assert.ok(gitBlast);
  assert.equal(gitBlast.scope, 'Git');
  assert.match(gitBlast.badge, /feat\/pod/);

  const npmBlast = detectCommandBlastRadius('npm install electron-builder');
  assert.ok(npmBlast);
  assert.equal(npmBlast.scope, 'Dependencies');

  const rmBlast = detectCommandBlastRadius('rm -rf dist');
  assert.ok(rmBlast);
  assert.equal(rmBlast.level, 'DANGER');
  assert.match(rmBlast.badge, /dist/);

  // 2. Cross-agent conflicts
  const now = new Date().toISOString();
  const session1 = {
    id: 's1',
    agentName: 'Antigravity',
    updatedAt: now,
    analysis: {
      projectName: 'ypod',
      touchedFiles: [{ name: 'main.js', fullPath: 'd:/ypod/main.js', mode: 'WRITE', count: 1 }]
    }
  };
  const session2 = {
    id: 's2',
    agentName: 'Codex',
    updatedAt: now,
    analysis: {
      projectName: 'ypod',
      touchedFiles: [{ name: 'main.js', fullPath: 'd:/ypod/main.js', mode: 'WRITE', count: 1 }]
    }
  };
  const conflicts = detectCrossSessionConflicts([session1, session2]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].fileName, 'main.js');
  assert.match(conflicts[0].agents, /Antigravity/);
  assert.match(conflicts[0].agents, /Codex/);

  // Read-only session does not trigger conflict
  const sessionReadOnly = {
    id: 's3',
    agentName: 'Reviewer',
    updatedAt: now,
    analysis: {
      projectName: 'ypod',
      touchedFiles: [{ name: 'main.js', fullPath: 'd:/ypod/main.js', mode: 'READ', count: 1 }]
    }
  };
  assert.equal(detectCrossSessionConflicts([session1, sessionReadOnly]).length, 0);

  // 3. Historical fallback sessions when all sessions are expired (>2 hours)
  const watcher = new MultiAgentLogWatcher();
  const expiredTime = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  watcher.sessions.set('old-1', {
    id: 'old-1',
    agentName: 'Antigravity',
    updatedAt: expiredTime,
    steps: [{ kind: 'tool', title: 'historical step' }]
  });
  const fallbackList = watcher.getAllSessions();
  assert.equal(fallbackList.length, 1);
  assert.equal(fallbackList[0].id, 'old-1');
  assert.equal(fallbackList[0].isHistoricalFallback, true);
});

test('step token statistics and trajectory token metrics', () => {
  const steps = [
    {
      id: 'step-1',
      kind: 'tool',
      title: '读取主文件',
      toolName: 'read_file',
      tokens: { inputTokens: 1000, cachedTokens: 500, outputTokens: 200, totalTokens: 1700 }
    },
    {
      id: 'step-2',
      kind: 'tool',
      title: '重构组件',
      toolName: 'edit_file',
      tokens: { inputTokens: 5000, cachedTokens: 2000, outputTokens: 800, totalTokens: 7800 }
    }
  ];
  const trajectory = analyzeSessionTrajectory({
    steps,
    agentType: 'agy',
    userGoals: ['测试步骤 Token']
  });
  assert.equal(trajectory.stats.maxStepTokens, 7800);
  assert.equal(trajectory.stats.maxStepTitle, '重构组件');
  assert.equal(trajectory.stats.avgStepTokens, Math.round((1700 + 7800) / 2));
  assert.equal(trajectory.stats.stepsWithTokens, 2);
});

test('custom AI endpoint URL normalization and local-only mode', async () => {
  assert.equal(
    normalizeChatCompletionsUrl('https://my-relay.example.com'),
    'https://my-relay.example.com/v1/chat/completions'
  );
  assert.equal(
    normalizeChatCompletionsUrl('https://my-relay.example.com/v1/'),
    'https://my-relay.example.com/v1/chat/completions'
  );
  assert.equal(
    normalizeChatCompletionsUrl('https://openrouter.ai/api/v1'),
    'https://openrouter.ai/api/v1/chat/completions'
  );
  assert.equal(
    normalizeChatCompletionsUrl('http://192.168.1.50:8000/v1/chat/completions'),
    'http://192.168.1.50:8000/v1/chat/completions'
  );

  const session = {
    agentName: 'Antigravity',
    userGoals: ['重构按钮布局'],
    steps: [{ kind: 'tool', title: '修改 UI', toolName: 'edit_file' }],
    analysis: { phase: '代码修改', macroSummary: '正在重构按钮布局' }
  };

  const localRes = await generateDeepAIInsight(session, {
    providerPreset: 'none',
    aiEnabled: false,
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    apiKey: 'test-placeholder-token'
  });
  assert.equal(localRes.source, '内置实时解析核');
});

test('Claude Code (CC) log adaptation and AI important step annotation', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ypod-cc-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const ccProjDir = path.join(home, '.claude', 'projects', 'workspace-ypod');
  fs.mkdirSync(ccProjDir, { recursive: true });

  const now = Date.now();
  const ts1 = new Date(now - 20000).toISOString();
  const ts2 = new Date(now - 15000).toISOString();
  const ts3 = new Date(now - 10000).toISOString();

  const ccRecords = [
    {
      type: 'user',
      timestamp: ts1,
      cwd: '/workspace/ypod',
      sessionId: 'cc-sess-001',
      message: { role: 'user', content: '适配 Claude Code 日志并让 AI 标注重要事件步骤' }
    },
    {
      type: 'assistant',
      timestamp: ts2,
      cwd: '/workspace/ypod',
      sessionId: 'cc-sess-001',
      message: {
        role: 'assistant',
        usage: {
          input_tokens: 1200,
          cache_read_input_tokens: 4800,
          cache_creation_input_tokens: 0,
          output_tokens: 350
        },
        content: [
          { type: 'thinking', thinking: '先设计 Claude Code 的 JSONL 解析器与 MultiEdit Diff 提取。' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'MultiEdit',
            input: {
              file_path: '/workspace/ypod/src/log-watcher.js',
              edits: [
                { old_string: 'this.scanCodexLogs();', new_string: 'this.scanCodexLogs();\nthis.scanClaudeCodeLogs();' }
              ]
            }
          },
          {
            type: 'tool_use',
            id: 'toolu_2',
            name: 'Bash',
            input: {
              command: 'npm test',
              description: '运行单元测试验证 CC 适配'
            }
          }
        ]
      }
    },
    // Sidechain record should be ignored
    {
      type: 'assistant',
      isSidechain: true,
      timestamp: ts3,
      cwd: '/workspace/ypod',
      message: { role: 'assistant', content: [{ type: 'text', text: 'internal subagent' }] }
    }
  ];

  fs.writeFileSync(
    path.join(ccProjDir, 'cc-sess-001.jsonl'),
    ccRecords.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );
  // Subagent file agent-*.jsonl should also be ignored
  fs.writeFileSync(
    path.join(ccProjDir, 'agent-sub1.jsonl'),
    JSON.stringify(ccRecords[0]) + '\n',
    'utf8'
  );

  const watcher = new MultiAgentLogWatcher();
  watcher.homeDir = home;
  watcher.scanClaudeCodeLogs();

  const sessions = watcher.getAllSessions();
  assert.equal(sessions.length, 1);
  const ccSession = sessions[0];
  assert.equal(ccSession.agentType, 'claude');
  assert.equal(ccSession.id, 'claude:cc-sess-001');
  assert.equal(ccSession.analysis.projectName, 'ypod');
  assert.equal(ccSession.tokenStats.totalTokens, 6350);
  assert.equal(ccSession.tokenStats.cacheHitRate, 80);
  assert.ok(ccSession.tokenStats.currentTtftSec > 0);
  assert.ok(ccSession.tokenStats.avgTtftSec > 0);

  const multiEditStep = ccSession.steps.find((s) => s.toolName === 'MultiEdit');
  assert.ok(multiEditStep);
  assert.ok(multiEditStep.tokens.ttftSec > 0);
  assert.ok(multiEditStep.diff);
  assert.equal(multiEditStep.diff.addedCount, 1);

  // Test AI important step annotation with <think> block + markdown fences
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: `<think>分析最近步骤...</think>\n\`\`\`json\n${JSON.stringify({
                headline: '正在适配 Claude Code 并跑单测',
                cockpitDiagnosis: '已完成 log-watcher 核心修改并启动单测验证，进度正常。',
                longTermGoal: '适配 Claude Code 日志并让 AI 标注重要事件步骤',
                shortTermGoal: '运行单元测试验证 CC 适配',
                alignmentStatus: 'aligned',
                alignmentReason: '代码修改与测试均围绕 CC 适配展开',
                importantSteps: [
                  {
                    step: 3,
                    tag: '核心架构',
                    level: 'critical',
                    reason: '接入 Claude Code 多块编辑与日志解析'
                  }
                ]
              })}\n\`\`\``
            }
          }
        ]
      })
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const insight = await generateDeepAIInsight(ccSession, {
    providerPreset: 'custom',
    aiEnabled: true,
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    model: 'DeepSeek-V4.1-Flash'
  });

  assert.ok(insight);
  assert.equal(insight.ok, true);
  assert.ok(multiEditStep.aiImportant);
  assert.equal(multiEditStep.aiImportant.tag, '核心架构');
  assert.equal(multiEditStep.aiImportant.source, 'AI');
  assert.ok(ccSession.analysis.importantEvents.some((ev) => ev.tag === '核心架构'));
});

test('quota, platform rate limits, and context window telemetry', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ypod-quota-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const dir = path.join(home, '.codex', 'sessions', '2026', '01', '01');
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const timestamp = new Date(now - 10000).toISOString();

  const records = [
    {
      type: 'session_meta',
      payload: { id: 'quota-conv-1', cwd: 'D:/test' }
    },
    {
      type: 'event_msg',
      timestamp,
      payload: {
        type: 'item_completed',
        item: { type: 'UserMessage', content: [{ text: '测试配额显示' }] }
      }
    },
    {
      type: 'event_msg',
      timestamp,
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 50000, cached_input_tokens: 20000, output_tokens: 4000 },
          last_token_usage: { input_tokens: 15000, cached_input_tokens: 5000, output_tokens: 1200 },
          model_context_window: 128000
        },
        rate_limits: {
          plan_type: 'plus',
          primary: { used_percent: 15, window_minutes: 300, resets_at: now + 3600000 },
          secondary: { used_percent: 25, window_minutes: 10080, resets_at: now + 86400000 }
        }
      }
    }
  ];

  fs.writeFileSync(path.join(dir, 'rollout-quota.jsonl'), records.map(JSON.stringify).join('\n') + '\n');

  const watcher = new MultiAgentLogWatcher();
  watcher.homeDir = home;
  watcher.scanCodexLogs();

  const sessions = watcher.getAllSessions();
  assert.equal(sessions.length, 1);
  const s = sessions[0];
  const tStats = s.tokenStats;
  assert.ok(tStats);
  assert.equal(tStats.contextWindowLimit, 128000);
  assert.equal(tStats.contextUsedTokens, 16200);
  assert.ok(tStats.contextUsedPercent > 0);
  assert.ok(tStats.rateLimits);
  assert.equal(tStats.rateLimits.planType, 'PLUS');
  assert.equal(tStats.rateLimits.primaryUsedPercent, 15);
  assert.equal(tStats.rateLimits.primaryRemainingPercent, 85);
  assert.ok(tStats.window5hTokens >= 34000);
  assert.ok(tStats.todayTokens >= 34000);
});
