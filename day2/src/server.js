const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { MultiAgentLogWatcher, createEmptyTokenStats } = require('./log-watcher');
const {
  translateToolCall,
  formatToolInput,
  computeLineDiff,
  detectCrossSessionConflicts,
  analyzeSessionTrajectory,
  generateDeepAIInsight
} = require('./ai-interpreter');

const DEFAULT_PORT = Number(process.env.YPOD_SUPERVISOR_PORT || 17530);

function getYPodDataDir() {
  return process.env.YPOD_HOME || path.join(os.homedir(), '.ypod');
}

function getConfigFilePath() {
  return path.join(getYPodDataDir(), 'ai-config.json');
}

function ensureStandaloneHookBridge() {
  const srcBridge = path.join(__dirname, 'hook-bridge.js');
  const dataDir = getYPodDataDir();
  const destBridge = path.join(dataDir, 'hook-bridge.js');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(srcBridge)) {
      const content = fs.readFileSync(srcBridge, 'utf8');
      fs.writeFileSync(destBridge, content, 'utf8');
      return destBridge;
    }
  } catch {}
  return srcBridge;
}

function buildHookConfigSnippets(customBridgePath = '') {
  const extractedBridge = customBridgePath || ensureStandaloneHookBridge();
  const bridgePath = path.resolve(extractedBridge).replace(/\\/g, '/');
  return {
    bridgePath,
    agy: JSON.stringify(
      {
        'ypod-ai-supervisor': {
          PreToolUse: [
            {
              matcher: 'run_command',
              hooks: [
                {
                  type: 'command',
                  command: `node ${bridgePath} --agent agy --event PreToolUse`,
                  timeout: 25
                }
              ]
            }
          ]
        }
      },
      null,
      2
    ),
    codex: `# ~/.codex/config.toml\nnotify = ["node", "${bridgePath}", "--agent", "codex", "--event", "notify"]`,
    claude: JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash|Edit|MultiEdit|Write',
              hooks: [
                {
                  type: 'command',
                  command: `node "${bridgePath}" --agent claude --event PreToolUse`,
                  timeout: 25
                }
              ]
            }
          ]
        }
      },
      null,
      2
    ),
    kimi: `# ~/.kimi-code/config.toml\n[[hooks]]\nevent = "PreToolUse"\nmatcher = "Bash|Write|Edit"\ncommand = "node \\"${bridgePath}\\" --agent kimi --event PreToolUse"\ntimeout = 25`,
    cursor: JSON.stringify(
      {
        version: 1,
        hooks: {
          preToolUse: [
            {
              command: `node ${bridgePath} --agent cursor --event PreToolUse`,
              matcher: 'Shell|Write',
              failClosed: false,
              timeout: 25
            }
          ]
        }
      },
      null,
      2
    )
  };
}

function buildAgentSummary(sessions = []) {
  const supportedAgents = ['agy', 'codex', 'claude', 'kimi', 'cursor'];
  const byAgent = {};
  for (const key of supportedAgents) {
    byAgent[key] = {
      sessions: 0,
      working: 0,
      totalTokens: 0,
      estimatedCostUsd: 0
    };
  }
  let totalTokens = 0;
  let totalCostUsd = 0;
  let workingSessions = 0;

  for (const s of sessions) {
    if (!s) continue;
    let key = String(s.agentType || 'other').toLowerCase();
    if (key === 'cc') key = 'claude';
    if (key === 'kimi-code') key = 'kimi';
    if (!byAgent[key]) {
      byAgent[key] = { sessions: 0, working: 0, totalTokens: 0, estimatedCostUsd: 0 };
    }
    const ts = s.tokenStats || {};
    const tok = Number(ts.totalTokens || 0);
    const cost = Number(ts.estimatedCostUsd || 0);
    const isWorking = s.status === 'WORKING' || s.status === 'INTERCEPTED';

    byAgent[key].sessions += 1;
    if (isWorking) {
      byAgent[key].working += 1;
      workingSessions += 1;
    }
    byAgent[key].totalTokens += tok;
    byAgent[key].estimatedCostUsd = Number((byAgent[key].estimatedCostUsd + cost).toFixed(4));
    totalTokens += tok;
    totalCostUsd += cost;
  }

  return {
    totalSessions: sessions.length,
    workingSessions,
    totalTokens,
    estimatedCostUsd: Number(totalCostUsd.toFixed(4)),
    byAgent
  };
}

function resolveTargetFileOnDisk(rawPath, workspacePath = '') {
  const clean = String(rawPath || '').trim();
  if (!clean) return null;

  const candidates = [];
  if (path.isAbsolute(clean) || /^[a-zA-Z]:[\\/]/.test(clean)) {
    candidates.push(path.normalize(clean));
  } else {
    if (
      workspacePath &&
      (path.isAbsolute(workspacePath) || /^[a-zA-Z]:[\\/]/.test(workspacePath))
    ) {
      candidates.push(path.resolve(workspacePath, clean));
    }
    candidates.push(path.resolve(process.cwd(), clean));
    candidates.push(path.resolve(__dirname, '..', clean));
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

function findAvailableEditorCli(agentType = '') {
  const localAppData = process.env.LOCALAPPDATA || '';
  if (process.platform === 'win32' && agentType === 'agy' && localAppData) {
    const agyExe = path.join(localAppData, 'Programs', 'antigravity', 'Antigravity.exe');
    try {
      if (fs.existsSync(agyExe)) return { bin: agyExe, isExe: true, name: 'Antigravity' };
    } catch {}
  }

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (process.platform === 'win32' && localAppData) {
    pathDirs.push(path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin'));
    pathDirs.push(path.join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'bin'));
  }

  const bins =
    process.platform === 'win32'
      ? agentType === 'cursor'
        ? ['cursor.cmd', 'code.cmd']
        : ['code.cmd', 'cursor.cmd']
      : ['code', 'cursor', 'agy'];

  for (const bin of bins) {
    for (const dir of pathDirs) {
      const full = path.join(dir, bin);
      try {
        if (fs.existsSync(full)) {
          return { bin: full, isExe: full.endsWith('.exe'), name: path.basename(full) };
        }
      } catch {}
    }
  }
  return null;
}

function openLocalFileTarget(
  rawPath,
  workspacePath = '',
  mode = 'open',
  dryRun = false,
  agentType = ''
) {
  const resolvedPath = resolveTargetFileOnDisk(rawPath, workspacePath);
  if (!resolvedPath) {
    return {
      ok: false,
      error: `本地未找到文件: ${rawPath || '未知路径'}`
    };
  }

  let isDir = false;
  try {
    isDir = fs.statSync(resolvedPath).isDirectory();
  } catch {}

  const effectiveMode = isDir || mode === 'reveal' ? 'reveal' : 'open';
  if (dryRun) {
    return { ok: true, resolvedPath, action: effectiveMode };
  }

  try {
    if (process.platform === 'win32') {
      if (effectiveMode === 'reveal') {
        const args = isDir ? [resolvedPath] : [`/select,${resolvedPath}`];
        const child = spawn('explorer.exe', args, {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        child.unref();
        return { ok: true, resolvedPath, action: 'reveal' };
      }

      const editor = findAvailableEditorCli(agentType);
      if (editor) {
        if (editor.isExe) {
          const child = spawn(editor.bin, [resolvedPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false
          });
          child.unref();
        } else {
          const child = spawn(
            'cmd.exe',
            ['/d', '/s', '/c', `"${editor.bin}" -g "${resolvedPath}"`],
            {
              detached: true,
              stdio: 'ignore',
              windowsHide: true
            }
          );
          child.unref();
        }
        return { ok: true, resolvedPath, action: 'editor', editor: editor.name };
      }

      // Safe fallback on Windows: open text/code in Notepad (never execute .bat/.js via ShellExecute)
      const child = spawn('notepad.exe', [resolvedPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();
      return { ok: true, resolvedPath, action: 'notepad' };
    } else {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      const args =
        effectiveMode === 'reveal' && process.platform === 'darwin'
          ? ['-R', resolvedPath]
          : [effectiveMode === 'reveal' ? path.dirname(resolvedPath) : resolvedPath];
      const child = spawn(opener, args, { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true, resolvedPath, action: effectiveMode };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function loadSavedConfig() {
  const userConfig = getConfigFilePath();
  try {
    if (fs.existsSync(userConfig)) {
      return JSON.parse(fs.readFileSync(userConfig, 'utf8'));
    }
  } catch {}
  return {};
}

function saveConfigToDisk(cfg) {
  try {
    const dir = getYPodDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getConfigFilePath(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch {}
}

function createSupervisorServer(options = {}) {
  const port = options.port || DEFAULT_PORT;
  const watcher = new MultiAgentLogWatcher();
  const sseClients = new Set();
  const pendingIntercepts = new Map();
  const aiDebounceTimers = new Map();
  const aiInFlight = new Set();
  let periodicAiTimer = null;

  const BUILTIN_PRESET_URLS = {
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    kimi: 'https://api.moonshot.cn/v1/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    ollama: 'http://127.0.0.1:11434/v1/chat/completions'
  };

  const saved = loadSavedConfig();
  const initialApiUrl = saved.apiUrl ?? process.env.OPENAI_BASE_URL ?? '';
  const initialModel = saved.model ?? process.env.OPENAI_MODEL ?? '';
  let initialPreset = saved.providerPreset || (initialApiUrl ? 'custom' : 'none');
  // Fix legacy preset mismatch where a custom URL was saved under a preset tag like 'deepseek'
  if (
    initialPreset !== 'none' &&
    initialPreset !== 'custom' &&
    initialApiUrl &&
    BUILTIN_PRESET_URLS[initialPreset] &&
    BUILTIN_PRESET_URLS[initialPreset] !== initialApiUrl
  ) {
    initialPreset = 'custom';
  }

  let config = {
    interceptHighRisk: saved.interceptHighRisk ?? true,
    autoFeedAi: saved.autoFeedAi ?? true,
    aiPollIntervalSec: Number(saved.aiPollIntervalSec || 25),
    aiEnabled: saved.aiEnabled ?? (initialPreset !== 'none' && Boolean(initialApiUrl)),
    providerPreset: initialPreset,
    apiUrl: initialApiUrl,
    apiKey: saved.apiKey || process.env.OPENAI_API_KEY || '',
    model: initialModel,
    customApiUrl: saved.customApiUrl || (initialPreset === 'custom' ? initialApiUrl : ''),
    customModel: saved.customModel || (initialPreset === 'custom' ? initialModel : '')
  };

  function hasLiveApiConfig() {
    return Boolean(
      config.aiEnabled !== false &&
        config.providerPreset !== 'none' &&
        config.apiUrl &&
        (config.apiKey ||
          /^http:\/\//i.test(config.apiUrl) ||
          config.apiUrl.includes('11434') ||
          config.apiUrl.includes('localhost') ||
          config.apiUrl.includes('127.0.0.1'))
    );
  }

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  function triggerAutoAISynthesis(sessionId, session, delayMs = 900) {
    if (!hasLiveApiConfig() || config.autoFeedAi === false) return;

    if (aiDebounceTimers.has(sessionId)) {
      clearTimeout(aiDebounceTimers.get(sessionId));
    }
    aiDebounceTimers.set(
      sessionId,
      setTimeout(async () => {
        aiDebounceTimers.delete(sessionId);
        if (aiInFlight.has(sessionId)) return;
        aiInFlight.add(sessionId);
        try {
          const insight = await generateDeepAIInsight(session, config);
          if (!insight) {
            // Revision changed while AI request was in flight; schedule a follow-up pass
            triggerAutoAISynthesis(sessionId, session, 1400);
            return;
          }
          session.latestAiInsight = insight;
          broadcast('ai-insight', { sessionId, insight, session });
        } finally {
          aiInFlight.delete(sessionId);
        }
      }, delayMs)
    );
  }

  function runPeriodicAiPatrol() {
    if (!hasLiveApiConfig() || config.autoFeedAi === false) return;
    const allSessions = watcher.getAllSessions();
    if (allSessions.length === 0) return;

    const intervalMs = Math.max(10, Number(config.aiPollIntervalSec || 25)) * 1000;
    const now = Date.now();
    // Patrol up to 2 most recent active sessions
    for (const session of allSessions.slice(0, 2)) {
      if (!session || !session.steps || session.steps.length === 0) continue;
      if (aiInFlight.has(session.id) || aiDebounceTimers.has(session.id)) continue;

      const hasUnanalyzedSteps = session.lastAiAnalyzedRevision !== session.activityRevision;
      const recentlyActive = now - (Date.parse(session.updatedAt) || 0) < 10 * 60 * 1000;
      const dueForPeriodicReview =
        recentlyActive && now - (session.lastAiAnalyzedAt || 0) >= intervalMs;

      if (hasUnanalyzedSteps || dueForPeriodicReview) {
        triggerAutoAISynthesis(session.id, session, 150);
      }
    }
  }

  watcher.on('session-updated', ({ sessionId, newSteps, session }) => {
    const allSessions = watcher.getAllSessions();
    const orphanSubagents = watcher.getOrphanSubagents();
    const conflicts = detectCrossSessionConflicts(allSessions);

    if (session && session.isSubagent) {
      const rootId = session.rootParentSessionId || watcher.resolveRootParentId(session.id);
      const rootParent = rootId ? allSessions.find((s) => s.id === rootId) : null;
      if (rootParent) {
        broadcast('session-updated', {
          sessionId: rootParent.id,
          updatedSubagentId: session.id,
          newSteps,
          session: rootParent,
          orphanSubagents,
          conflicts
        });
      } else {
        broadcast('session-updated', {
          sessionId,
          isOrphanSubagent: true,
          newSteps,
          session,
          orphanSubagents,
          conflicts
        });
      }
      return;
    }

    broadcast('session-updated', {
      sessionId,
      newSteps,
      session,
      orphanSubagents,
      conflicts
    });
    triggerAutoAISynthesis(sessionId, session);
  });

  function readJsonBody(req) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          resolve({});
        }
      });
    });
  }

  function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
  }

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = urlObj.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const htmlPath = path.join(__dirname, '..', 'ui', 'index.html');
      try {
        const html = fs.readFileSync(htmlPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch (e) {
        res.writeHead(500);
        return res.end('UI error: ' + e.message);
      }
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`event: connected\ndata: {"ok":true}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      const allSessions = watcher.getAllSessions();
      return sendJson(res, 200, {
        sessions: allSessions,
        orphanSubagents: watcher.getOrphanSubagents(),
        agentSummary: buildAgentSummary(allSessions),
        conflicts: detectCrossSessionConflicts(allSessions),
        pendingIntercepts: Array.from(pendingIntercepts.values()).map((p) => p.item),
        config: {
          interceptHighRisk: config.interceptHighRisk,
          autoFeedAi: config.autoFeedAi !== false,
          aiPollIntervalSec: config.aiPollIntervalSec || 25,
          aiEnabled: config.aiEnabled,
          providerPreset: config.providerPreset,
          apiUrl: config.apiUrl,
          customApiUrl: config.customApiUrl || '',
          customModel: config.customModel || '',
          hasApiKey: Boolean(config.apiKey),
          maskedKey: config.apiKey
            ? config.apiKey.slice(0, 5) + '••••' + config.apiKey.slice(-3)
            : '',
          model: config.model
        },
        hookConfigs: buildHookConfigSnippets()
      });
    }

    if (req.method === 'POST' && pathname === '/api/hook') {
      const payload = await readJsonBody(req);
      let agentKey = (payload.agent || 'agy').toLowerCase();
      if (agentKey === 'cc') agentKey = 'claude';
      if (agentKey === 'kimi-code') agentKey = 'kimi';
      const sessionId = `${agentKey}:${payload.conversationId || 'live-hook'}`;

      let session = watcher.sessions.get(sessionId);
      if (!session) {
        const agentNames = {
          agy: 'Antigravity (AGY)',
          codex: 'OpenAI Codex',
          cursor: 'Cursor Agent',
          claude: 'Claude Code',
          kimi: 'Kimi Code'
        };
        const badgeColors = {
          agy: '#38bdf8',
          codex: '#10b981',
          cursor: '#a855f7',
          claude: '#f59e0b',
          kimi: '#ec4899'
        };
        session = {
          id: sessionId,
          rawId: payload.conversationId || 'live-hook',
          agentType: agentKey,
          agentName: agentNames[agentKey] || `Agent (${agentKey})`,
          badgeColor: badgeColors[agentKey] || '#38bdf8',
          filePath: payload.transcriptPath || 'Hook Live',
          cwd: payload.cwd || '',
          sessionTitle: payload.sessionTitle || '',
          updatedAt: new Date().toISOString(),
          status: 'WORKING',
          steps: [],
          tokenStats: createEmptyTokenStats(),
          analysis: null
        };
        watcher.sessions.set(sessionId, session);
      } else {
        if (payload.cwd && !session.cwd) session.cwd = payload.cwd;
        if (payload.sessionTitle && !session.sessionTitle) {
          session.sessionTitle = payload.sessionTitle;
        }
      }

      const translated = translateToolCall(payload.toolName, payload.toolArgs);
      const stepObj = {
        id: `${sessionId}-hook-${Date.now()}`,
        stepIndex: session.steps.length + 1,
        kind: 'tool',
        viaHook: true,
        hookEvent: payload.eventType || 'PreToolUse',
        toolName: payload.toolName,
        toolInput: formatToolInput(payload.toolArgs),
        ...translated,
        timestamp: new Date().toISOString()
      };

      session.steps.push(stepObj);
      session.activityRevision = (session.activityRevision || 0) + 1;
      session.updatedAt = stepObj.timestamp;
      session.analysis = analyzeSessionTrajectory(session);

      broadcast('session-updated', {
        sessionId,
        newSteps: [stepObj],
        session
      });
      triggerAutoAISynthesis(sessionId, session);

      if (
        (payload.eventType === 'PreToolUse' || payload.eventType === 'preToolUse') &&
        config.interceptHighRisk &&
        translated.risk &&
        translated.risk.score >= 70
      ) {
        const interceptId = `intercept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const interceptItem = {
          id: interceptId,
          sessionId,
          agentName: session.agentName,
          agentType: session.agentType,
          toolName: payload.toolName,
          title: translated.title,
          humanSummary: translated.humanSummary,
          rawDetail: translated.rawDetail,
          risk: translated.risk,
          createdAt: Date.now(),
          timeoutSec: 20
        };

        session.status = 'INTERCEPTED';
        broadcast('intercept-pending', interceptItem);

        const decisionResult = await new Promise((resolve) => {
          const timer = setTimeout(() => {
            pendingIntercepts.delete(interceptId);
            broadcast('intercept-resolved', {
              id: interceptId,
              decision: 'deny',
              reason: '超时自动阻断'
            });
            resolve({
              decision: 'deny',
              reason: 'AI 监工舱：高危操作确认超时，已自动阻断。'
            });
          }, 20000);

          pendingIntercepts.set(interceptId, {
            item: interceptItem,
            resolve,
            timer
          });
        });

        session.status = decisionResult.decision === 'deny' ? 'BLOCKED' : 'WORKING';
        return sendJson(res, 200, decisionResult);
      }

      return sendJson(res, 200, { decision: 'allow' });
    }

    if (req.method === 'POST' && pathname === '/api/intercept-decision') {
      const { id, decision } = await readJsonBody(req);
      const pending = pendingIntercepts.get(id);
      if (!pending) {
        return sendJson(res, 404, { error: 'Expired' });
      }
      clearTimeout(pending.timer);
      pendingIntercepts.delete(id);

      const reason =
        decision === 'deny'
          ? `已被用户在「桌面 AI 监工悬浮舱」手动拦截：${pending.item.risk.reason}`
          : '';

      pending.resolve({ decision, reason });
      broadcast('intercept-resolved', { id, decision, reason });
      return sendJson(res, 200, { ok: true, id, decision });
    }

    if (req.method === 'POST' && pathname === '/api/ai-explain') {
      const { sessionId } = await readJsonBody(req);
      const sessions = watcher.getAllSessions();
      const target = watcher.sessions.get(sessionId) || sessions[0];
      if (!target) {
        return sendJson(res, 404, {
          ok: false,
          source: '暂无活跃会话',
          text: '当前没有可供分析的活跃对话，请先启动 Agent。'
        });
      }
      let insight = await generateDeepAIInsight(target, config);
      // If session.activityRevision changed while the AI call was in flight, retry once on latest state
      if (!insight) {
        insight = await generateDeepAIInsight(target, config);
      }
      if (!insight) {
        insight = {
          ok: true,
          source: '实时同步中',
          headline: target.analysis?.macroSummary || '正在同步最新动作',
          text: 'Agent 正在高频输出新步骤，将在动作稳定后自动刷新 AI 深度诊断与重要事件标注。',
          timestamp: new Date().toISOString()
        };
      }
      target.latestAiInsight = insight;
      broadcast('ai-insight', { sessionId: target.id, insight, session: target });
      return sendJson(res, 200, insight);
    }

    if (req.method === 'POST' && pathname === '/api/open-file') {
      const { filePath, workspacePath, mode, dryRun, agentType } = await readJsonBody(req);
      const result = openLocalFileTarget(
        filePath,
        workspacePath || '',
        mode || 'open',
        Boolean(dryRun),
        agentType || ''
      );
      return sendJson(res, result.ok ? 200 : 404, result);
    }

    if (req.method === 'POST' && pathname === '/api/config') {
      const body = await readJsonBody(req);
      if (typeof body.interceptHighRisk === 'boolean') {
        config.interceptHighRisk = body.interceptHighRisk;
      }
      if (typeof body.autoFeedAi === 'boolean') {
        config.autoFeedAi = body.autoFeedAi;
      }
      if (body.aiPollIntervalSec !== undefined) {
        const sec = Number(body.aiPollIntervalSec);
        if (Number.isFinite(sec) && sec >= 10) {
          config.aiPollIntervalSec = sec;
        }
      }
      if (typeof body.providerPreset === 'string' && body.providerPreset) {
        config.providerPreset = body.providerPreset;
        config.aiEnabled = body.providerPreset !== 'none';
      }
      if (typeof body.aiEnabled === 'boolean') {
        config.aiEnabled = body.aiEnabled;
      }
      if (typeof body.apiUrl === 'string') {
        config.apiUrl = body.apiUrl.trim();
      }
      if (typeof body.model === 'string') {
        config.model = body.model.trim();
      }
      if (
        config.providerPreset !== 'none' &&
        config.providerPreset !== 'custom' &&
        config.apiUrl &&
        BUILTIN_PRESET_URLS[config.providerPreset] &&
        BUILTIN_PRESET_URLS[config.providerPreset] !== config.apiUrl
      ) {
        config.providerPreset = 'custom';
      }
      if (typeof body.customApiUrl === 'string') {
        config.customApiUrl = body.customApiUrl.trim();
      } else if (config.providerPreset === 'custom' && config.apiUrl) {
        config.customApiUrl = config.apiUrl;
      }
      if (typeof body.customModel === 'string') {
        config.customModel = body.customModel.trim();
      } else if (config.providerPreset === 'custom' && config.model) {
        config.customModel = config.model;
      }
      if (body.clearApiKey === true) {
        config.apiKey = '';
      } else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
        config.apiKey = body.apiKey.trim();
      }
      saveConfigToDisk(config);

      // Immediately test/refresh AI insight on current session
      const sessions = watcher.getAllSessions();
      let insight = null;
      if (sessions[0]) {
        insight = await generateDeepAIInsight(sessions[0], config);
        if (!insight) {
          insight = await generateDeepAIInsight(sessions[0], config);
        }
        if (insight) {
          sessions[0].latestAiInsight = insight;
          broadcast('ai-insight', {
            sessionId: sessions[0].id,
            insight,
            session: sessions[0]
          });
        }
      }

      return sendJson(res, 200, {
        ok: true,
        config: {
          interceptHighRisk: config.interceptHighRisk,
          autoFeedAi: config.autoFeedAi !== false,
          aiPollIntervalSec: config.aiPollIntervalSec || 25,
          aiEnabled: config.aiEnabled,
          providerPreset: config.providerPreset,
          apiUrl: config.apiUrl,
          customApiUrl: config.customApiUrl || '',
          customModel: config.customModel || '',
          hasApiKey: Boolean(config.apiKey),
          maskedKey: config.apiKey
            ? config.apiKey.slice(0, 5) + '••••' + config.apiKey.slice(-3)
            : '',
          model: config.model
        },
        insight
      });
    }

    sendJson(res, 404, { error: 'Not Found' });
  });

  function probeExistingYPodServer(testPort) {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${testPort}/api/state`, { timeout: 700 }, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(Array.isArray(parsed.sessions));
          } catch {
            resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  return {
    start() {
      return new Promise((resolve, reject) => {
        ensureStandaloneHookBridge();
        watcher.start();
        if (!periodicAiTimer) {
          periodicAiTimer = setInterval(runPeriodicAiPatrol, 5000);
          if (typeof periodicAiTimer.unref === 'function') {
            periodicAiTimer.unref();
          }
        }
        const onError = async (err) => {
          if (err.code === 'EADDRINUSE') {
            const isYPod = await probeExistingYPodServer(port);
            if (isYPod) {
              resolve({ port, alreadyRunning: true });
            } else {
              // Port is occupied by another non-YPod application; fall back to any available port
              server.removeListener('error', onError);
              server.listen(0, '127.0.0.1', () => {
                resolve({ port: server.address().port, alreadyRunning: false });
              });
            }
          } else {
            reject(err);
          }
        };
        server.on('error', onError);
        server.listen(port, '127.0.0.1', () => {
          resolve({ port: server.address().port, alreadyRunning: false });
        });
      });
    },
    stop() {
      if (periodicAiTimer) {
        clearInterval(periodicAiTimer);
        periodicAiTimer = null;
      }
      for (const timer of aiDebounceTimers.values()) {
        clearTimeout(timer);
      }
      aiDebounceTimers.clear();
      watcher.stop();
      server.close();
    }
  };
}

if (require.main === module) {
  const sup = createSupervisorServer();
  sup.start().then(({ port }) => {
    console.log(`[YPod] Listening at http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createSupervisorServer,
  DEFAULT_PORT,
  getYPodDataDir,
  getConfigFilePath,
  ensureStandaloneHookBridge,
  buildHookConfigSnippets,
  buildAgentSummary,
  resolveTargetFileOnDisk,
  openLocalFileTarget
};
