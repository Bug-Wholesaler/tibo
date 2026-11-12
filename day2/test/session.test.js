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
  ensureStandaloneHookBridge,
  buildHookConfigSnippets,
  buildAgentSummary
} = require('../src/server');
const {
  normalizeHookPayload,
  formatHookDecision
} = require('../src/hook-bridge');

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

test('Kimi Code v2 wire.jsonl parsing, mini Diff, Token/cache billing, native TTFT, and subagent/archive filtering', (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ypod-kimi-v2-'));
  const prevEnv = process.env.YPOD_KIMI_DIR;
  process.env.YPOD_KIMI_DIR = tmpRoot;
  t.after(() => {
    if (prevEnv === undefined) delete process.env.YPOD_KIMI_DIR;
    else process.env.YPOD_KIMI_DIR = prevEnv;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // 1. config.toml with 1M context window
  fs.writeFileSync(
    path.join(tmpRoot, 'config.toml'),
    [
      'default_model = "kimi-code/kimi-for-coding"',
      '',
      '[models."kimi-code/kimi-for-coding"]',
      'provider = "managed:kimi-code"',
      'model = "kimi-for-coding"',
      'max_context_size = 1048576'
    ].join('\n'),
    'utf8'
  );

  // 2. projects.json mapping wm_demo_01 -> /workspace/demo-app
  fs.writeFileSync(
    path.join(tmpRoot, 'projects.json'),
    JSON.stringify({
      version: 1,
      projects: [
        {
          id: 'proj_demo_01',
          name: 'demo-app',
          workspaces: [
            { id: 'wm_demo_01', path: '/workspace/demo-app' }
          ]
        }
      ]
    }),
    'utf8'
  );

  // 3. Active main session + subagent (must be ignored) + archived session (must be ignored)
  const sessDir = path.join(tmpRoot, 'sessions', 'wm_demo_01', 'session_demo_001');
  const mainAgentDir = path.join(sessDir, 'agents', 'main');
  const subAgentDir = path.join(sessDir, 'agents', 'sub_worker_1');
  const archivedDir = path.join(tmpRoot, 'sessions', 'wm_demo_01', 'session_archived_002', 'agents', 'main');
  fs.mkdirSync(mainAgentDir, { recursive: true });
  fs.mkdirSync(subAgentDir, { recursive: true });
  fs.mkdirSync(archivedDir, { recursive: true });

  const nowSec = Date.now() / 1000;
  fs.writeFileSync(
    path.join(sessDir, 'state.json'),
    JSON.stringify({
      version: 1,
      session_id: 'session_demo_001',
      title: '重构 Kimi 实时监控面板',
      archived: false,
      custom_title: false
    }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(tmpRoot, 'sessions', 'wm_demo_01', 'session_archived_002', 'state.json'),
    JSON.stringify({
      version: 1,
      session_id: 'session_archived_002',
      title: '已归档旧任务',
      archived: true
    }),
    'utf8'
  );

  const wireRecords = [
    { type: 'metadata', protocol_version: '1.5' },
    {
      timestamp: nowSec - 18,
      message: {
        type: 'profile.bind',
        payload: { model_alias: 'k3', model_name: 'kimi-for-coding' }
      }
    },
    {
      timestamp: nowSec - 17,
      message: {
        type: 'turn.prompt',
        payload: {
          text: '给状态面板加上迷你 Diff 和 TTFT 指标',
          origin: { kind: 'user' }
        }
      }
    },
    {
      timestamp: nowSec - 16,
      message: {
        type: 'context.append_loop_event',
        payload: {
          event: {
            seq: 1,
            timestamp: nowSec - 16,
            kind: 'step.begin',
            payload: { stepNo: 1, agentId: 'main' }
          }
        }
      }
    },
    {
      timestamp: nowSec - 15,
      message: {
        type: 'context.append_loop_event',
        payload: {
          event: {
            seq: 2,
            timestamp: nowSec - 15,
            kind: 'content.part',
            payload: {
              stepNo: 1,
              part: { type: 'think', think: '先检查 panel.js 的渲染函数，然后替换对应代码并跑单测。' }
            }
          }
        }
      }
    },
    {
      timestamp: nowSec - 14,
      message: {
        type: 'context.append_loop_event',
        payload: {
          event: {
            seq: 3,
            timestamp: nowSec - 14,
            kind: 'tool.call',
            payload: {
              stepNo: 1,
              toolCall: {
                id: 'call_edit_1',
                type: 'function',
                function: {
                  name: 'Edit',
                  arguments: JSON.stringify({
                    file_path: '/workspace/demo-app/src/panel.js',
                    old_string: 'const showTtft = false;\n',
                    new_string: 'const showTtft = true;\nconst unit = "s";\n'
                  })
                }
              }
            }
          }
        }
      }
    },
    {
      timestamp: nowSec - 13.5,
      message: {
        type: 'context.append_loop_event',
        payload: {
          event: {
            seq: 4,
            timestamp: nowSec - 13.5,
            kind: 'tool.call',
            payload: {
              stepNo: 1,
              toolCall: {
                id: 'call_bash_1',
                type: 'function',
                function: {
                  name: 'Bash',
                  arguments: JSON.stringify({
                    command: 'npm test',
                    description: '运行面板单元测试'
                  })
                }
              }
            }
          }
        }
      }
    },
    // Duplicate usage event that must NOT double-count step.end tokens
    {
      timestamp: nowSec - 13,
      message: {
        type: 'usage.record',
        payload: {
          input_other: 2000,
          input_cache_read: 8000,
          input_cache_creation: 0,
          output: 500
        }
      }
    },
    {
      timestamp: nowSec - 12,
      message: {
        type: 'context.append_loop_event',
        payload: {
          event: {
            seq: 5,
            timestamp: nowSec - 12,
            kind: 'step.end',
            payload: {
              stepNo: 1,
              status: 'completed',
              llmFirstTokenLatencyMs: 1420,
              llmStreamDurationMs: 2500,
              usage: {
                inputOther: 2000,
                inputCacheRead: 8000,
                inputCacheCreation: 0,
                output: 500
              }
            }
          }
        }
      }
    },
    {
      timestamp: nowSec - 11.5,
      message: {
        type: 'token_counting.measured',
        payload: { total_tokens: 10500 }
      }
    },
    {
      timestamp: nowSec - 11,
      message: {
        type: 'turn.ended',
        payload: { status: 'completed' }
      }
    }
  ];

  fs.writeFileSync(
    path.join(mainAgentDir, 'wire.jsonl'),
    wireRecords.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );
  // Subagent wire.jsonl and archived wire.jsonl should both be ignored
  fs.writeFileSync(
    path.join(subAgentDir, 'wire.jsonl'),
    wireRecords.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(archivedDir, 'wire.jsonl'),
    wireRecords.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );

  const watcher = new MultiAgentLogWatcher();
  watcher.scanKimiCodeLogs();

  const sessions = watcher.getAllSessions();
  assert.equal(sessions.length, 1);
  const s = sessions[0];
  assert.equal(s.id, 'kimi:session_demo_001');
  assert.equal(s.agentType, 'kimi');
  assert.equal(s.agentName, 'Kimi Code');
  assert.equal(s.model, 'kimi-for-coding');
  assert.equal(s.cwd, '/workspace/demo-app');
  assert.equal(s.status, 'IDLE');
  assert.equal(s.analysis.projectName, 'demo-app');
  assert.equal(s.analysis.orbState, 'IDLE');

  // Token & billing & context watermark & native TTFT checks
  const ts = s.tokenStats;
  assert.equal(ts.inputTokens, 2000);
  assert.equal(ts.cachedTokens, 8000);
  assert.equal(ts.outputTokens, 500);
  assert.equal(ts.totalTokens, 10500);
  assert.equal(ts.cacheHitRate, 80);
  assert.ok(ts.estimatedCostCny > 0);
  assert.ok(ts.savedCostCny > 0);
  assert.equal(ts.contextWindowLimit, 1048576);
  assert.equal(ts.contextUsedTokens, 10500);
  assert.equal(ts.currentTtftSec, 1.42);
  assert.equal(ts.avgTtftSec, 1.42);
  assert.equal(ts.currentTokPerSec, 200); // 500 output tokens / 2.5s stream duration

  // Mini Diff check on Edit step
  const editStep = s.steps.find((st) => st.toolName === 'Edit');
  assert.ok(editStep);
  assert.ok(editStep.diff);
  assert.equal(editStep.diff.addedCount, 2);
  assert.equal(editStep.diff.removedCount, 1);
  assert.equal(editStep.tokens.ttftSec, 1.42);
  assert.equal(editStep.tokens.totalTokens, 10500);

  // Incremental append using flat Kimi v2.5 Wire format ({ type, time, event: { type, ... } })
  const flatStepRecords = [
    {
      type: 'turn.prompt',
      time: nowSec - 5,
      origin: { kind: 'user', clientMetadata: [{ display_text: '再加一个等待确认状态测试' }] },
      input: [{ type: 'text', text: '再加一个等待确认状态测试' }]
    },
    {
      type: 'context.append_loop_event',
      time: nowSec - 4,
      event: {
        type: 'tool.call',
        toolCallId: 'call_ask_1',
        name: 'AskUserQuestion',
        args: JSON.stringify({
          questions: [{ question: '是否启用自动巡检？', options: [{ label: '是' }, { label: '否' }] }]
        })
      }
    }
  ];
  fs.appendFileSync(
    path.join(mainAgentDir, 'wire.jsonl'),
    flatStepRecords.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );
  watcher.scanKimiCodeLogs();
  assert.equal(s.status, 'WAITING_CONFIRM');
  assert.equal(s.analysis.phase, '等待确认中');
});

test('Kimi Code CLI v1 fallback, StrReplaceFile/WriteFile mini Diff, official /usages quota probe, and Hook bridge', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ypod-kimi-v1-'));
  const prevEnv = process.env.YPOD_KIMI_DIR;
  delete process.env.YPOD_KIMI_DIR;
  t.after(() => {
    if (prevEnv !== undefined) process.env.YPOD_KIMI_DIR = prevEnv;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  // Mock local Kimi /usages endpoint
  const resetIso = new Date(Date.now() + 7200 * 1000).toISOString();
  const quotaServer = http.createServer((req, res) => {
    if (req.url === '/coding/v1/usages') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          usages: {
            limit_5h: { used_ratio: 0.24, reset_time: resetIso },
            limit_7d: { used_ratio: 0.4, reset_time: resetIso }
          }
        })
      );
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise((resolve) => quotaServer.listen(0, '127.0.0.1', resolve));
  t.after(() => quotaServer.close());
  const port = quotaServer.address().port;

  // Set up ~/.kimi-code credentials + config pointing to mock localhost server
  const kimiCodeDir = path.join(tmpHome, '.kimi-code');
  fs.mkdirSync(path.join(kimiCodeDir, 'credentials'), { recursive: true });
  fs.writeFileSync(
    path.join(kimiCodeDir, 'config.toml'),
    `[providers."managed:kimi-code"]\nbase_url = "http://127.0.0.1:${port}/coding/v1"\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(kimiCodeDir, 'credentials', 'kimi-code.json'),
    JSON.stringify({
      access_token: 'synthetic-test-token-000',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    }),
    'utf8'
  );

  // Set up ~/.kimi CLI v1 session with StrReplaceFile and WriteFile
  const kimiV1Dir = path.join(tmpHome, '.kimi');
  const workDirPath = '/workspace/v1-service';
  const md5Hash = require('node:crypto').createHash('md5').update(workDirPath).digest('hex');
  const v1SessDir = path.join(kimiV1Dir, 'sessions', md5Hash, 'v1_sess_100');
  fs.mkdirSync(v1SessDir, { recursive: true });
  fs.writeFileSync(
    path.join(kimiV1Dir, 'kimi.json'),
    JSON.stringify({ work_dirs: [{ path: workDirPath }] }),
    'utf8'
  );

  const nowSec = Date.now() / 1000;
  const v1Records = [
    { type: 'metadata', protocol_version: '1.3' },
    {
      timestamp: nowSec - 10,
      message: { type: 'TurnBegin', payload: { user_input: '修改服务配置并新增健康检查' } }
    },
    {
      timestamp: nowSec - 8.5,
      message: {
        type: 'ToolCall',
        payload: {
          id: 'tc_v1_1',
          function: {
            name: 'StrReplaceFile',
            arguments: JSON.stringify({
              path: '/workspace/v1-service/config.js',
              edit: [{ old: 'port: 3000\n', new: 'port: 8080\n' }]
            })
          }
        }
      }
    },
    {
      timestamp: nowSec - 8.0,
      message: {
        type: 'ToolCall',
        payload: {
          id: 'tc_v1_2',
          function: {
            name: 'WriteFile',
            arguments: JSON.stringify({
              path: '/workspace/v1-service/health.js',
              content: 'module.exports = () => ({ ok: true });\n'
            })
          }
        }
      }
    },
    {
      timestamp: nowSec - 7.5,
      message: {
        type: 'StatusUpdate',
        payload: {
          context_tokens: 4200,
          max_context_tokens: 262144,
          token_usage: {
            input_other: 1000,
            input_cache_read: 3000,
            input_cache_creation: 0,
            output: 200
          }
        }
      }
    },
    { timestamp: nowSec - 7.0, message: { type: 'TurnEnd', payload: {} } }
  ];
  fs.writeFileSync(
    path.join(v1SessDir, 'wire.jsonl'),
    v1Records.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8'
  );

  const watcher = new MultiAgentLogWatcher();
  watcher.homeDir = tmpHome;
  await watcher.refreshKimiQuota();
  watcher.scanKimiCodeLogs();

  const sessions = watcher.getAllSessions();
  assert.equal(sessions.length, 1);
  const s = sessions[0];
  assert.equal(s.id, 'kimi:v1_sess_100');
  assert.equal(s.cwd, workDirPath);
  assert.equal(s.tokenStats.totalTokens, 4200);
  assert.equal(s.tokenStats.contextWindowLimit, 262144);
  assert.ok(s.tokenStats.rateLimits?.isKimiNative);
  assert.equal(s.tokenStats.rateLimits.primaryUsedPercent, 24);
  assert.equal(s.tokenStats.rateLimits.primaryRemainingPercent, 76);
  assert.equal(s.tokenStats.rateLimits.secondaryRemainingPercent, 60);
  // Ensure credential token is never leaked into session or rateLimits objects
  assert.equal(JSON.stringify(s).includes('synthetic-test-token-000'), false);

  const replaceStep = s.steps.find((st) => st.toolName === 'StrReplaceFile');
  assert.ok(replaceStep?.diff);
  assert.equal(replaceStep.diff.addedCount, 1);
  assert.equal(replaceStep.diff.removedCount, 1);

  const writeStep = s.steps.find((st) => st.toolName === 'WriteFile');
  assert.ok(writeStep?.diff);
  assert.equal(writeStep.diff.addedCount, 1);

  // Hook bridge auto-detection, blocking payload, snippets & summary
  const normHook = normalizeHookPayload(
    {
      hook_event_name: 'PreToolUse',
      session_id: 'session_demo_hook',
      cwd: '/workspace/demo-app',
      client_type: 'cli',
      session_title: 'Hook 测试',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf build' }
    },
    { agent: 'auto' }
  );
  assert.equal(normHook.agent, 'kimi');
  assert.equal(normHook.conversationId, 'session_demo_hook');
  assert.equal(normHook.sessionTitle, 'Hook 测试');

  const denyOut = formatHookDecision(normHook, { decision: 'deny', reason: '高危删除拦截' });
  assert.equal(denyOut.exitCode, 0);
  const parsedDeny = JSON.parse(denyOut.stdout);
  assert.equal(parsedDeny.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(parsedDeny.hookSpecificOutput.permissionDecisionReason, '高危删除拦截');

  const snippets = buildHookConfigSnippets('/opt/ypod/hook-bridge.js');
  assert.match(snippets.kimi, /\[\[hooks\]\]/);
  assert.match(snippets.kimi, /--agent kimi --event PreToolUse/);

  const summary = buildAgentSummary(sessions);
  assert.equal(summary.byAgent.kimi.sessions, 1);
  assert.equal(summary.byAgent.kimi.totalTokens, 4200);
});

test('Quota watermarks across Kimi array schema, AGY, and Codex unify remainingPercent = clamp(100 - usedPercent)', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ypod-quota-unify-'));
  const prevKimiEnv = process.env.YPOD_KIMI_DIR;

  let usagePort = 0;
  const usageServer = http.createServer((req, res) => {
    if (req.url === '/coding/v1/usages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          usages: [
            {
              scope: 'FEATURE_CODING',
              detail: {
                limit: '1000',
                used: '350',
                remaining: '650',
                resetTime: new Date(Date.now() + 86400 * 1000).toISOString()
              },
              limits: [
                {
                  window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
                  detail: {
                    limit: '100',
                    used: '7',
                    remaining: '93',
                    resetTime: new Date(Date.now() + 7800 * 1000).toISOString()
                  }
                }
              ]
            }
          ]
        })
      );
      return;
    }
    res.writeHead(404);
    res.end('{}');
  });

  await new Promise((resolve) => {
    usageServer.listen(0, '127.0.0.1', () => {
      usagePort = usageServer.address().port;
      resolve();
    });
  });

  t.after(() => {
    usageServer.close();
    if (prevKimiEnv === undefined) delete process.env.YPOD_KIMI_DIR;
    else process.env.YPOD_KIMI_DIR = prevKimiEnv;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  const kimiDir = path.join(tmpHome, '.kimi');
  process.env.YPOD_KIMI_DIR = kimiDir;
  fs.mkdirSync(path.join(kimiDir, 'credentials'), { recursive: true });
  fs.writeFileSync(
    path.join(kimiDir, 'config.toml'),
    `[providers.kimi-code]\nbase_url = "http://127.0.0.1:${usagePort}/coding/v1"\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(kimiDir, 'credentials', 'kimi-code.json'),
    JSON.stringify({ access_token: 'synthetic-quota-token' }),
    'utf8'
  );

  // Codex rollout with rate_limits
  const codexDir = path.join(tmpHome, '.codex', 'sessions', '2026', '11', '12');
  fs.mkdirSync(codexDir, { recursive: true });
  const nowIso = new Date().toISOString();
  fs.writeFileSync(
    path.join(codexDir, 'rollout-quota.jsonl'),
    [
      { type: 'session_meta', payload: { id: 'codex-quota-1', thread_source: 'user', cwd: 'D:/demo' } },
      {
        type: 'event_msg',
        timestamp: nowIso,
        payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ text: '检查配额统一' }] } }
      },
      {
        type: 'event_msg',
        timestamp: nowIso,
        payload: {
          type: 'token_count',
          info: { total_token_usage: { input_tokens: 1000, output_tokens: 200, total_tokens: 1200 } },
          rate_limits: {
            plan_type: 'pro',
            primary: { used_percent: 18, window_minutes: 300, resets_at: Math.floor(Date.now() / 1000) + 3600 },
            secondary: { used_percent: 42, window_minutes: 10080 }
          }
        }
      }
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
    'utf8'
  );

  // Antigravity root session
  const agyConvDir = path.join(
    tmpHome,
    '.gemini',
    'antigravity',
    'brain',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '.system_generated',
    'logs'
  );
  fs.mkdirSync(agyConvDir, { recursive: true });
  fs.writeFileSync(
    path.join(agyConvDir, 'transcript.jsonl'),
    JSON.stringify({
      step_index: 1,
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      created_at: nowIso,
      content: '统一剩余配额展示'
    }) + '\n',
    'utf8'
  );

  const watcher = new MultiAgentLogWatcher();
  watcher.homeDir = tmpHome;
  watcher.cachedAgyQuota = {
    provider: 'Antigravity',
    plan: 'Google AI Ultra',
    isUnlimited: false,
    quota: {
      model: 'Claude Opus 4.6',
      remainingPercent: 91,
      usedPercent: 9,
      resetTime: new Date(Date.now() + 5400 * 1000).toISOString()
    }
  };

  const kimiRl = await watcher.refreshKimiQuota();
  assert.ok(kimiRl?.isKimiNative);
  assert.equal(kimiRl.primaryUsedPercent, 7);
  assert.equal(kimiRl.primaryRemainingPercent, 93);
  assert.equal(kimiRl.secondaryUsedPercent, 35);
  assert.equal(kimiRl.secondaryRemainingPercent, 65);

  watcher.scanCodexLogs();
  watcher.scanAntigravityLogs();
  const sessions = watcher.getAllSessions();

  const codexSess = sessions.find((s) => s.agentType === 'codex');
  assert.ok(codexSess?.tokenStats?.rateLimits?.isCodexNative);
  assert.equal(codexSess.tokenStats.rateLimits.primaryUsedPercent, 18);
  assert.equal(codexSess.tokenStats.rateLimits.primaryRemainingPercent, 82);
  assert.equal(codexSess.tokenStats.rateLimits.secondaryRemainingPercent, 58);

  const agySess = sessions.find((s) => s.agentType === 'agy');
  assert.ok(agySess?.tokenStats?.rateLimits?.isAntigravityNative);
  assert.equal(agySess.tokenStats.rateLimits.primaryRemainingPercent, 91);
  assert.equal(agySess.tokenStats.rateLimits.primaryUsedPercent, 9);
});

test('AGY Swarm + invoke_subagent and Codex subagents fold into parent session and reconcile worker states', (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ypod-swarm-fold-'));
  t.after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

  const now = Date.now();
  const t0 = new Date(now - 90000).toISOString();
  const t1 = new Date(now - 45000).toISOString();
  const t2 = new Date(now - 15000).toISOString();

  const brainRoot = path.join(tmpHome, '.gemini', 'antigravity', 'brain');
  const rootId = '11111111-1111-4111-8111-111111111111';
  const scoutId = '22222222-2222-4222-8222-222222222222';
  const uxId = '33333333-3333-4333-8333-333333333333';
  const killedId = '44444444-4444-4444-8444-444444444444';
  const invokeId = '55555555-5555-4555-8555-555555555555';
  const orphanId = '66666666-6666-4666-8666-666666666666';

  function writeAgyTranscript(convId, lines) {
    const dir = path.join(brainRoot, convId, '.system_generated', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'transcript.jsonl'),
      lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
      'utf8'
    );
  }

  // Root Coordinator
  writeAgyTranscript(rootId, [
    {
      step_index: 1,
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      created_at: t0,
      content: '重构 YPod 配额展示并支持 Swarm 子代理折叠'
    },
    {
      step_index: 2,
      type: 'PLANNER_RESPONSE',
      created_at: t1,
      input_tokens: 2000,
      output_tokens: 250,
      tool_calls: [{ name: 'swarm', args: { action: 'add', name: 'kimi-scout', brief: '侦察日志结构' } }]
    },
    {
      step_index: 3,
      type: 'GENERIC',
      created_at: t2,
      content: `Created the following subagent:\n{\n  "conversationId": "${invokeId}"\n}`
    }
  ]);

  const swarmDir = path.join(brainRoot, rootId, '.system_generated', 'swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  fs.writeFileSync(
    path.join(swarmDir, 'members.json'),
    JSON.stringify({
      title: 'YPod UX Swarm',
      members: {
        coordinator: { conversation_id: rootId, role: 'coordinator' },
        'kimi-scout': {
          conversation_id: scoutId,
          role: 'worker',
          model: 'Gemini 3.1 Pro',
          phase: 'RUNNING',
          killed: false
        },
        'ypod-ux-author': {
          conversation_id: uxId,
          role: 'worker',
          model: 'Claude Opus 4.6',
          phase: 'RUNNING',
          killed: false
        },
        'done-helper': {
          conversation_id: killedId,
          role: 'worker',
          model: 'Gemini 3 Flash',
          phase: 'KILLED',
          killed: true
        }
      }
    }),
    'utf8'
  );

  // Worker 1: actively running tool
  writeAgyTranscript(scoutId, [
    {
      step_index: 1,
      type: 'SYSTEM_MESSAGE',
      created_at: t0,
      content: `[Message] sender=${rootId} content=You have just started. Your assignment (recorded on the board as #1 for @kimi-scout):\n侦察 Kimi 与 Swarm 日志字段`
    },
    {
      step_index: 2,
      type: 'PLANNER_RESPONSE',
      created_at: t2,
      input_tokens: 1500,
      output_tokens: 180,
      tool_calls: [{ name: 'read_file', args: { Path: 'D:/demo/src/log-watcher.js' } }]
    }
  ]);

  // Worker 2: parked on swarm_wait -> must reconcile to waiting / IDLE (not WORKING!)
  writeAgyTranscript(uxId, [
    {
      step_index: 1,
      type: 'SYSTEM_MESSAGE',
      created_at: t0,
      content: `[Message] sender=${rootId} content=You have just started. Your assignment (recorded on the board as #2 for @ypod-ux-author):\n实现子代理折叠抽屉`
    },
    {
      step_index: 2,
      type: 'PLANNER_RESPONSE',
      created_at: t1,
      input_tokens: 3000,
      output_tokens: 400,
      tool_calls: [
        { name: 'post_message', args: { text: '@verifier 已完成构建' } },
        { name: 'swarm_wait', args: { since: 5 } }
      ]
    },
    {
      step_index: 3,
      type: 'GENERIC',
      created_at: t1,
      content: '{"seq":6}'
    },
    {
      step_index: 4,
      type: 'GENERIC',
      created_at: t1,
      content: '{}'
    }
  ]);

  // Worker 3: killed in members.json -> must reconcile to killed / IDLE
  writeAgyTranscript(killedId, [
    {
      step_index: 1,
      type: 'SYSTEM_MESSAGE',
      created_at: t0,
      content: `[Message] sender=${rootId} content=You have just started. Your assignment (recorded on the board as #3 for @done-helper):\n清理临时缓存`
    },
    {
      step_index: 2,
      type: 'PLANNER_RESPONSE',
      created_at: t1,
      input_tokens: 800,
      output_tokens: 90,
      tool_calls: [{ name: 'run_command', args: { CommandLine: 'npm test' } }]
    }
  ]);

  // Subagent 4: invoke_subagent child discovered from GENERIC + subagents/<id>.json
  const subRegDir = path.join(brainRoot, rootId, '.system_generated', 'subagents');
  fs.mkdirSync(subRegDir, { recursive: true });
  fs.writeFileSync(
    path.join(subRegDir, `${invokeId}.json`),
    JSON.stringify({
      conversationId: invokeId,
      subagentDescriptor: { typeName: 'research', role: 'research-helper' },
      state: 'SUBAGENT_STATE_ALIVE'
    }),
    'utf8'
  );
  writeAgyTranscript(invokeId, [
    {
      step_index: 1,
      type: 'SYSTEM_MESSAGE',
      created_at: t1,
      content: `[Message] timestamp=${t1} sender=${rootId} content=检查渲染尺寸边界`
    },
    {
      step_index: 2,
      type: 'PLANNER_RESPONSE',
      created_at: t2,
      input_tokens: 600,
      output_tokens: 100,
      tool_calls: [{ name: 'read_file', args: { Path: 'D:/demo/test/renderer-check.js' } }]
    }
  ]);

  // Orphan subagent (parent missing) -> must be hidden from getAllSessions() and available in getOrphanSubagents()
  writeAgyTranscript(orphanId, [
    {
      step_index: 1,
      type: 'SYSTEM_MESSAGE',
      created_at: t2,
      content: `[Message] sender=99999999-9999-4999-8999-999999999999 content=You have just started. Your assignment (recorded on the board as #9 for @bg-orphan):\n独立后台巡检`
    }
  ]);

  // Codex main session + real thread_spawn subagent + internal guardian subagent
  const codexDir = path.join(tmpHome, '.codex', 'sessions', '2026', '11', '12');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(
    path.join(codexDir, 'rollout-main.jsonl'),
    [
      { type: 'session_meta', payload: { id: 'codex-root-1', thread_source: 'user', cwd: 'D:/codex-proj' } },
      {
        type: 'event_msg',
        timestamp: t1,
        payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ text: '主会话并行重构模块' }] } }
      }
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(codexDir, 'rollout-sub.jsonl'),
    [
      {
        type: 'session_meta',
        payload: {
          id: 'codex-child-1',
          model: 'gpt-5-codex',
          thread_source: 'subagent',
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: 'codex-root-1',
                agent_nickname: 'api-auditor',
                agent_role: 'explorer'
              }
            }
          },
          cwd: 'D:/codex-proj'
        }
      },
      {
        type: 'event_msg',
        timestamp: t2,
        payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ text: '扫描接口定义' }] } }
      }
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(codexDir, 'rollout-guardian.jsonl'),
    [
      {
        type: 'session_meta',
        payload: {
          id: 'codex-guard-1',
          parent_thread_id: 'codex-root-1',
          thread_source: 'guardian_review',
          source: { subagent: { other: 'guardian' } },
          cwd: 'D:/codex-proj'
        }
      },
      {
        type: 'event_msg',
        timestamp: t2,
        payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ text: '安全审核' }] } }
      }
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
    'utf8'
  );

  const watcher = new MultiAgentLogWatcher();
  watcher.homeDir = tmpHome;
  watcher.scanAntigravityLogs();
  watcher.scanCodexLogs();

  const rootSessions = watcher.getAllSessions();
  assert.equal(rootSessions.length, 2);
  assert.equal(rootSessions.some((s) => s.isSubagent), false);

  const agyRoot = rootSessions.find((s) => s.id === `agy:${rootId}`);
  assert.ok(agyRoot);
  assert.equal(agyRoot.swarmTitle, 'YPod UX Swarm');
  assert.equal(agyRoot.subagentCount, 4);
  assert.equal(agyRoot.activeSubagents, 2);
  assert.equal(agyRoot.waitingSubagents, 1);

  const scoutSub = agyRoot.subagents.find((c) => c.subagentRole === 'kimi-scout');
  assert.ok(scoutSub);
  assert.equal(scoutSub.isSubagent, true);
  assert.equal(scoutSub.subagentKind, 'swarm');
  assert.equal(scoutSub.subagentRunState, 'working');
  assert.equal(scoutSub.model, 'Gemini 3.1 Pro');

  const uxSub = agyRoot.subagents.find((c) => c.subagentRole === 'ypod-ux-author');
  assert.ok(uxSub);
  assert.equal(uxSub.subagentRunState, 'waiting');
  assert.equal(uxSub.status, 'IDLE');
  assert.equal(uxSub.analysis.orbState, 'IDLE');

  const killedSub = agyRoot.subagents.find((c) => c.subagentRole === 'done-helper');
  assert.ok(killedSub);
  assert.equal(killedSub.subagentRunState, 'killed');
  assert.equal(killedSub.status, 'IDLE');

  const researchSub = agyRoot.subagents.find((c) => c.subagentRole === 'research-helper');
  assert.ok(researchSub);
  assert.equal(researchSub.subagentKind, 'subagent');
  assert.equal(researchSub.subagentRunState, 'working');

  const orphans = watcher.getOrphanSubagents();
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].subagentRole, 'bg-orphan');

  const codexRoot = rootSessions.find((s) => s.id === 'codex:codex-root-1');
  assert.ok(codexRoot);
  assert.equal(codexRoot.subagentCount, 1);
  assert.equal(codexRoot.subagents[0].subagentRole, 'api-auditor');
  assert.equal(codexRoot.subagents[0].model, 'gpt-5-codex');
});
