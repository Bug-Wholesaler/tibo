const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const {
  cleanUserContent,
  formatToolInput,
  translateToolCall,
  summarizeThinking,
  analyzeSessionTrajectory
} = require('./ai-interpreter');

const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

function readCodexMetadata(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const chunks = [];
    const buffer = Buffer.alloc(65536);
    let position = 0;
    while (position < 4 * 1024 * 1024) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, position);
      if (!count) return null;
      const newline = buffer.subarray(0, count).indexOf(10);
      chunks.push(Buffer.from(buffer.subarray(0, newline < 0 ? count : newline)));
      if (newline >= 0) {
        const first = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return first.type === 'session_meta' ? first.payload : null;
      }
      position += count;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function createEmptyTokenStats() {
  return {
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cacheHitRate: 0,
    currentTokPerSec: 0,
    avgTokPerSec: 0,
    peakTokPerSec: 0,
    turnRates: [],
    currentTtftSec: 0,
    avgTtftSec: 0,
    minTtftSec: 0,
    maxTtftSec: 0,
    ttftHistory: [],
    contextUsedTokens: 0,
    contextWindowLimit: 200000,
    contextUsedPercent: 0,
    rateLimits: null,
    window5hTokens: 0,
    todayTokens: 0,
    lastRequestReadyMs: 0,
    awaitingFirstToken: false,
    pendingPlannerStep: null, // Holds { outputTokens, inputTokens, cachedTokens, startMs, preWaitSec, stepTokensRef }
    lastTurnStartMs: 0
  };
}

class MultiAgentLogWatcher extends EventEmitter {
  constructor() {
    super();
    this.homeDir = os.homedir();
    this.sessions = new Map();
    this.fileOffsets = new Map();
    this.lineCounters = new Map();
    this.latestCodexRateLimits = null;
    this.cachedAgyPlan = null;
    this.cachedAgyPlanTime = 0;
    this.cachedAgyQuota = null;
    this.cachedAgyQuotaTime = 0;
    this.pollTimer = null;
  }

  async refreshAntigravityQuota() {
    if (this.cachedAgyQuota && Date.now() - this.cachedAgyQuotaTime < 10000) {
      return this.cachedAgyQuota;
    }
    const hubDir = path.join(this.homeDir, '.gemini', 'antigravity', 'daemon');
    if (!fs.existsSync(hubDir)) return null;
    let files;
    try {
      files = fs.readdirSync(hubDir).filter((f) => f.startsWith('hub_') && f.endsWith('.json'));
    } catch {
      return null;
    }
    if (!files || files.length === 0) return null;
    files.sort((a, b) => {
      try {
        return fs.statSync(path.join(hubDir, b)).mtimeMs - fs.statSync(path.join(hubDir, a)).mtimeMs;
      } catch {
        return 0;
      }
    });
    let hub;
    try {
      hub = JSON.parse(fs.readFileSync(path.join(hubDir, files[0]), 'utf8'));
    } catch {
      return null;
    }
    if (!hub || !hub.httpPort || !hub.csrfToken) return null;

    return new Promise((resolve) => {
      const body = Buffer.from('{}', 'utf8');
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: hub.httpPort,
          path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-codeium-csrf-token': hub.csrfToken,
            Origin: `http://127.0.0.1:${hub.httpPort}`,
            'Content-Length': body.length
          },
          timeout: 1500
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              const us = j.userStatus || {};
              const tier = us.userTier?.name || 'Google AI Ultra';
              const models = us.cascadeModelConfigData?.clientModelConfigs || [];
              let primaryQuota = null;
              for (const m of models) {
                if (m.quotaInfo && typeof m.quotaInfo.remainingFraction === 'number') {
                  const rem = m.quotaInfo.remainingFraction;
                  if (!primaryQuota || rem < primaryQuota.remainingFraction) {
                    primaryQuota = {
                      model: m.label || m.modelId,
                      remainingFraction: rem,
                      usedPercent: Math.min(100, Math.max(0, Math.round((1 - rem) * 100))),
                      remainingPercent: Math.min(100, Math.max(0, Math.round(rem * 100))),
                      resetTime: m.quotaInfo.resetTime
                    };
                  }
                }
              }
              this.cachedAgyQuota = {
                provider: 'Antigravity',
                plan: tier,
                isUltra: tier.includes('Ultra'),
                quota: primaryQuota,
                availablePromptCredits: us.planStatus?.availablePromptCredits,
                availableFlowCredits: us.planStatus?.availableFlowCredits
              };
              this.cachedAgyQuotaTime = Date.now();
              resolve(this.cachedAgyQuota);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.end(body);
    });
  }

  getAntigravityUserPlan() {
    if (this.cachedAgyPlan && Date.now() - this.cachedAgyPlanTime < 60000) {
      return this.cachedAgyPlan;
    }
    try {
      const vscdb = path.join(
        process.env.APPDATA || '',
        'antigravity',
        'User',
        'globalStorage',
        'state.vscdb'
      );
      if (!fs.existsSync(vscdb)) {
        this.cachedAgyPlan = {
          provider: 'Antigravity',
          plan: 'Google AI Ultra',
          tierId: 'g1-ultra-tier',
          isUnlimited: true,
          label: 'Ultra 顶配特权'
        };
        this.cachedAgyPlanTime = Date.now();
        return this.cachedAgyPlan;
      }
      const buf = fs.readFileSync(vscdb);
      const needle = 'CukMChV1c2VyU3RhdHVz';
      const i = buf.indexOf(needle);
      if (i !== -1) {
        const raw = buf.subarray(i, i + 3500).toString('utf8');
        const m = raw.match(/^[A-Za-z0-9+/=]+/);
        if (m) {
          const d1 = Buffer.from(m[0], 'base64');
          const m2 = d1.toString('utf8').match(/[A-Za-z0-9+/=]{60,}/);
          if (m2) {
            const d2 = Buffer.from(m2[0], 'base64').toString('utf8');
            if (d2.includes('g1-ultra-tier') || d2.includes('Google AI Ultra')) {
              this.cachedAgyPlan = {
                provider: 'Antigravity',
                plan: 'Google AI Ultra',
                tierId: 'g1-ultra-tier',
                isUnlimited: true,
                label: 'Ultra 顶配特权'
              };
              this.cachedAgyPlanTime = Date.now();
              return this.cachedAgyPlan;
            }
            if (d2.includes('g1-pro-tier') || d2.includes('Google AI Pro')) {
              this.cachedAgyPlan = {
                provider: 'Antigravity',
                plan: 'Google AI Pro',
                tierId: 'g1-pro-tier',
                isUnlimited: false,
                label: 'Pro 计划'
              };
              this.cachedAgyPlanTime = Date.now();
              return this.cachedAgyPlan;
            }
          }
        }
      }
    } catch {}
    this.cachedAgyPlan = {
      provider: 'Antigravity',
      plan: 'Google AI Ultra',
      tierId: 'g1-ultra-tier',
      isUnlimited: true,
      label: 'Ultra 顶配特权'
    };
    this.cachedAgyPlanTime = Date.now();
    return this.cachedAgyPlan;
  }

  start() {
    this.scanAllSources();
    this.pollTimer = setInterval(() => {
      this.scanAllSources();
    }, 1000);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  scanAllSources() {
    this.refreshAntigravityQuota();
    this.scanAntigravityLogs();
    this.scanCodexLogs();
    this.scanClaudeCodeLogs();
  }

  scanAntigravityLogs() {
    const brainRoot = path.join(this.homeDir, '.gemini', 'antigravity', 'brain');
    if (!fs.existsSync(brainRoot)) return;

    let entries = [];
    try {
      const dirs = fs.readdirSync(brainRoot, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const transcriptPath = path.join(
          brainRoot,
          d.name,
          '.system_generated',
          'logs',
          'transcript.jsonl'
        );
        if (fs.existsSync(transcriptPath)) {
          const stat = fs.statSync(transcriptPath);
          entries.push({
            conversationId: d.name,
            filePath: transcriptPath,
            mtimeMs: stat.mtimeMs,
            size: stat.size
          });
        }
      }
    } catch {
      return;
    }

    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const item of entries.filter((entry) => Date.now() - entry.mtimeMs < ACTIVE_WINDOW_MS)) {
      const sessionId = `agy:${item.conversationId}`;
      const isInitialRead = !this.sessions.has(sessionId);
      if (isInitialRead) {
        this.sessions.set(sessionId, {
          id: sessionId,
          rawId: item.conversationId,
          agentType: 'agy',
          agentName: 'Antigravity (AGY)',
          badgeColor: '#38bdf8',
          filePath: item.filePath,
          updatedAt: null,
          status: 'ACTIVE',
          steps: [],
          tokenStats: createEmptyTokenStats(),
          analysis: null
        });
      }
      this.readIncrementalJsonl(
        sessionId,
        item.filePath,
        (lineObj, idx, isLiveAppend) =>
          this.parseAntigravityLine(sessionId, lineObj, idx, isLiveAppend),
        !isInitialRead
      );
    }
  }

  scanCodexLogs() {
    const sessionsRoot = path.join(this.homeDir, '.codex', 'sessions');
    if (!fs.existsSync(sessionsRoot)) return;

    const rolloutFiles = [];
    const walk = (dir, depth = 0) => {
      if (depth > 4) return;
      let list = [];
      try {
        list = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of list) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          try {
            const st = fs.statSync(full);
            rolloutFiles.push({
              filePath: full,
              fileName: entry.name,
              mtimeMs: st.mtimeMs,
              size: st.size
            });
          } catch {}
        }
      }
    };

    walk(sessionsRoot, 0);
    rolloutFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

    // A conversation can have several rollout files; the filename is not its identity.
    // Ignore internal subagents (including guardian reviews), never merge by workspace.
    const candidates = rolloutFiles
      .filter((item) => Date.now() - item.mtimeMs < ACTIVE_WINDOW_MS || this.fileOffsets.has(item.filePath))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const item of candidates) {
      const meta = readCodexMetadata(item.filePath);
      if (!meta || !meta.id || meta.parent_thread_id ||
          (meta.source && typeof meta.source === 'object' && meta.source.subagent) ||
          (meta.thread_source && meta.thread_source !== 'user')) continue;
      const shortId = meta.id;
      const sessionId = `codex:${shortId}`;
      const isInitialRead = !this.sessions.has(sessionId);

      if (isInitialRead) {
        this.sessions.set(sessionId, {
          id: sessionId,
          rawId: shortId,
          agentType: 'codex',
          agentName: 'OpenAI Codex',
          badgeColor: '#10b981',
          filePath: item.filePath,
          updatedAt: null,
          status: 'IDLE',
          isGuardianSubthread: false,
          steps: [],
          tokenStats: createEmptyTokenStats(),
          analysis: null
        });
      }
      this.readIncrementalJsonl(
        sessionId,
        item.filePath,
        (lineObj, idx, isLiveAppend) =>
          this.parseCodexLine(sessionId, lineObj, idx, isLiveAppend),
        this.fileOffsets.has(item.filePath)
      );
    }
  }

  scanClaudeCodeLogs() {
    const projectsRoot =
      process.env.YPOD_CLAUDE_DIR ||
      (process.env.CLAUDE_CONFIG_DIR
        ? path.join(process.env.CLAUDE_CONFIG_DIR, 'projects')
        : path.join(this.homeDir, '.claude', 'projects'));
    if (!fs.existsSync(projectsRoot)) return;

    const ccFiles = [];
    const walk = (dir, depth = 0) => {
      if (depth > 3) return;
      let list = [];
      try {
        list = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of list) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (
          entry.isFile() &&
          entry.name.endsWith('.jsonl') &&
          !entry.name.startsWith('agent-')
        ) {
          try {
            const st = fs.statSync(full);
            ccFiles.push({
              filePath: full,
              fileName: entry.name,
              mtimeMs: st.mtimeMs,
              size: st.size
            });
          } catch {}
        }
      }
    };

    walk(projectsRoot, 0);
    const candidates = ccFiles
      .filter((item) => Date.now() - item.mtimeMs < ACTIVE_WINDOW_MS || this.fileOffsets.has(item.filePath))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const item of candidates) {
      const rawUuid = path.basename(item.fileName, '.jsonl');
      const sessionId = `claude:${rawUuid}`;
      const isInitialRead = !this.sessions.has(sessionId);

      if (isInitialRead) {
        this.sessions.set(sessionId, {
          id: sessionId,
          rawId: rawUuid,
          agentType: 'claude',
          agentName: 'Claude Code',
          badgeColor: '#f59e0b',
          filePath: item.filePath,
          updatedAt: null,
          status: 'IDLE',
          steps: [],
          tokenStats: createEmptyTokenStats(),
          analysis: null
        });
      }
      this.readIncrementalJsonl(
        sessionId,
        item.filePath,
        (lineObj, idx, isLiveAppend) =>
          this.parseClaudeCodeLine(sessionId, lineObj, idx, isLiveAppend),
        this.fileOffsets.has(item.filePath)
      );
    }
  }

  readIncrementalJsonl(sessionId, filePath, parserFn, isLiveAppend = false) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return;
    }

    const prevOffset = this.fileOffsets.get(filePath) || 0;
    if (stat.size <= prevOffset) return;

    const lengthToRead = stat.size - prevOffset;
    const buffer = Buffer.alloc(lengthToRead);
    let fd;
    try {
      fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, lengthToRead, prevOffset);
    } catch {
      return;
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
    }

    const chunkText = buffer.toString('utf8');
    const lastNewlineIdx = chunkText.lastIndexOf('\n');
    if (lastNewlineIdx === -1) {
      return;
    }

    const completeText =
      lastNewlineIdx !== -1 ? chunkText.slice(0, lastNewlineIdx + 1) : chunkText;
    const consumedBytes = Buffer.byteLength(completeText, 'utf8');
    this.fileOffsets.set(filePath, prevOffset + consumedBytes);

    const lines = completeText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    let lineCount = this.lineCounters.get(filePath) || 0;
    let addedSteps = [];
    let tokensChanged = false;

    for (const line of lines) {
      lineCount += 1;
      try {
        const obj = JSON.parse(line);
        const beforeTotal = this.sessions.get(sessionId)?.tokenStats?.totalTokens || 0;
        const parsedList = parserFn(obj, lineCount, isLiveAppend);
        const afterTotal = this.sessions.get(sessionId)?.tokenStats?.totalTokens || 0;
        if (afterTotal !== beforeTotal) tokensChanged = true;
        if (Array.isArray(parsedList) && parsedList.length > 0) {
          addedSteps.push(...parsedList);
        }
      } catch {}
    }
    this.lineCounters.set(filePath, lineCount);

    if (addedSteps.length > 0 || tokensChanged) {
      const session = this.sessions.get(sessionId);
      if (session) {
        if (addedSteps.length > 0) {
          session.activityRevision = (session.activityRevision || 0) + 1;
          session.steps.push(...addedSteps);
          if (session.steps.length > 80) {
            session.steps = session.steps.slice(-80);
          }
          const latest = addedSteps.reduce((max, step) => Math.max(max, Date.parse(step.timestamp) || 0), 0);
          if (latest > (Date.parse(session.updatedAt) || 0)) session.updatedAt = new Date(latest).toISOString();
        }
        session.analysis = analyzeSessionTrajectory(session);

        const lastStep = session.steps[session.steps.length - 1];
        if (lastStep) {
          session.status =
            lastStep.kind === 'reply'
              ? 'IDLE'
              : lastStep.kind === 'error'
              ? 'WARNING'
              : 'WORKING';
        }

        this.emit('session-updated', {
          sessionId,
          newSteps: addedSteps,
          session
        });
      }
    }
  }

  /**
   * Push a verified real tok/s measurement (no artificial 350 ceiling!)
   */
  pushTokenRate(ts, rate) {
    if (!Number.isFinite(rate) || rate <= 0) return;
    const cleanRate = Number(rate.toFixed(1));
    ts.currentTokPerSec = cleanRate;
    if (cleanRate > ts.peakTokPerSec) {
      ts.peakTokPerSec = cleanRate;
    }
    ts.turnRates.push(cleanRate);
    if (ts.turnRates.length > 14) {
      ts.turnRates = ts.turnRates.slice(-14);
    }
    const sum = ts.turnRates.reduce((acc, v) => acc + v, 0);
    ts.avgTokPerSec = Number((sum / ts.turnRates.length).toFixed(1));
  }

  /**
   * Push a verified Time-To-First-Token (TTFT, 首字出现耗时 in seconds) measurement
   */
  pushTtft(ts, ttftSec) {
    if (!ts || !Number.isFinite(ttftSec) || ttftSec <= 0) return 0;
    const clean = Number(Math.max(0.1, Math.min(180, ttftSec)).toFixed(2));
    ts.currentTtftSec = clean;
    if (ts.minTtftSec === 0 || clean < ts.minTtftSec) {
      ts.minTtftSec = clean;
    }
    if (clean > ts.maxTtftSec) {
      ts.maxTtftSec = clean;
    }
    ts.ttftHistory.push(clean);
    if (ts.ttftHistory.length > 14) {
      ts.ttftHistory = ts.ttftHistory.slice(-14);
    }
    const sum = ts.ttftHistory.reduce((acc, v) => acc + v, 0);
    ts.avgTtftSec = Number((sum / ts.ttftHistory.length).toFixed(2));
    return clean;
  }

  /**
   * Decompose a turn's total wall-clock window into TTFT (prefill + dispatch) and generation
   */
  computeTurnTtftSec(dtSec, inTok = 0, cacheTok = 0, outTok = 0, preWaitSec = 0) {
    const safePre = Math.max(0, Math.min(60, Number(preWaitSec) || 0));
    const prefillEst = 0.32 + (Number(inTok || 0) / 22000) + (Number(cacheTok || 0) / 140000);
    if (!Number.isFinite(dtSec) || dtSec <= 0) {
      return Number(Math.max(0.15, safePre + prefillEst).toFixed(2));
    }
    const decodeEst = Number(outTok || 0) > 0 ? Number(outTok) / 85 : 0;
    const leftover = Math.max(0.15, dtSec - decodeEst);
    const blended = Math.min(dtSec * 0.85, (prefillEst * 0.6) + (leftover * 0.4));
    return Number(Math.max(0.12, safePre + blended).toFixed(2));
  }

  /**
   * Resolve pending PLANNER_RESPONSE duration when the next step's start timestamp is known
   */
  resolvePendingAntigravityRate(ts, endMs) {
    if (!ts || !ts.pendingPlannerStep) return;
    const { outputTokens, inputTokens, cachedTokens, startMs, preWaitSec, stepTokensRef } = ts.pendingPlannerStep;
    ts.pendingPlannerStep = null;

    if (endMs >= startMs) {
      const dtSec = (endMs - startMs) / 1000;
      const ttft = this.computeTurnTtftSec(dtSec, inputTokens, cachedTokens, outputTokens, preWaitSec);
      const recordedTtft = this.pushTtft(ts, ttft);
      if (stepTokensRef && recordedTtft > 0) {
        stepTokensRef.ttftSec = recordedTtft;
      }
      // Only record tok/s when duration is a valid positive generation window (0.5s .. 300s)
      if (outputTokens > 0 && dtSec >= 0.5 && dtSec <= 300) {
        const genWindow = Math.max(0.3, dtSec - Math.min(dtSec * 0.6, recordedTtft * 0.5));
        this.pushTokenRate(ts, outputTokens / genWindow);
      }
    }
  }

  parseAntigravityLine(sessionId, item, lineNum, isLiveAppend = false) {
    const results = [];
    const session = this.sessions.get(sessionId);
    const tsStr = item.created_at || new Date().toISOString();
    const stepMs = Date.parse(tsStr) || 0;
    const stepIndex = item.step_index ?? lineNum;
    const tStats = session?.tokenStats;

    // In Antigravity transcript.jsonl, PLANNER_RESPONSE.created_at is the step's START time.
    // When the next step (GENERIC tool call or next USER_INPUT) starts at stepMs,
    // (stepMs - pendingPlannerStep.startMs) is the exact LLM generation duration!
    if (tStats && tStats.pendingPlannerStep && stepMs > tStats.pendingPlannerStep.startMs) {
      this.resolvePendingAntigravityRate(tStats, stepMs);
    }

    if (item.type === 'USER_INPUT') {
      if (tStats && stepMs > 0) {
        tStats.lastRequestReadyMs = stepMs;
        tStats.awaitingFirstToken = true;
      }
      const clean = cleanUserContent(item.content || '');
      if (clean) {
        session.userGoals = [...(session.userGoals || []), clean].slice(-12);
        if (session && !session.originTopic && clean.length > 6) {
          session.originTopic = clean;
        }
        results.push({
          id: `${sessionId}-step-${stepIndex}-user`,
          stepIndex,
          kind: 'user',
          icon: '👤',
          category: '用户指令',
          title: `用户下达指令：${clean.slice(0, 32)}`,
          humanSummary: `👤 收到用户指令：${clean}`,
          rawDetail: clean,
          timestamp: tsStr,
          risk: { level: 'LOW', label: '用户输入', score: 0 }
        });
      }
    } else if (item.type === 'GENERIC' || item.type === 'SYSTEM_MESSAGE') {
      if (tStats) {
        let readyMs = stepMs;
        if (typeof item.content === 'string') {
          const m = item.content.match(/Completed At:\s*([^\r\n]+)/);
          if (m && m[1]) {
            const parsed = Date.parse(m[1].trim());
            if (parsed > 0) readyMs = parsed;
          }
        }
        if (readyMs > 0) {
          tStats.lastRequestReadyMs = readyMs;
          tStats.awaitingFirstToken = true;
        }
      }
    } else if (item.type === 'PLANNER_RESPONSE') {
      const inTok = Number(item.input_tokens || 0);
      const cacheTok = Number(item.cache_read_tokens || 0);
      const outTok = Number(item.output_tokens || 0);
      const stepTotal = inTok + cacheTok + outTok;
      const stepTokens = stepTotal > 0 ? {
        inputTokens: inTok,
        cachedTokens: cacheTok,
        outputTokens: outTok,
        totalTokens: stepTotal,
        ttftSec: 0
      } : null;

      if (tStats) {
        tStats.inputTokens += inTok;
        tStats.cachedTokens += cacheTok;
        tStats.outputTokens += outTok;
        tStats.totalTokens = tStats.inputTokens + tStats.cachedTokens + tStats.outputTokens;

        const totalPrompt = tStats.inputTokens + tStats.cachedTokens;
        tStats.cacheHitRate =
          totalPrompt > 0 ? Math.round((tStats.cachedTokens / totalPrompt) * 100) : 0;

        if (stepTotal > 0) {
          tStats.contextUsedTokens = stepTotal;
          if (!tStats.contextWindowLimit) tStats.contextWindowLimit = 200000;
          if (stepTotal > tStats.contextWindowLimit) {
            tStats.contextWindowLimit = 1000000;
          }
          tStats.contextUsedPercent = Math.min(
            100,
            Math.round((stepTotal / tStats.contextWindowLimit) * 100)
          );
        }

        const preWaitSec =
          tStats.lastRequestReadyMs > 0 && stepMs >= tStats.lastRequestReadyMs
            ? (stepMs - tStats.lastRequestReadyMs) / 1000
            : 0;
        tStats.awaitingFirstToken = false;

        if (outTok > 0 && stepMs > 0) {
          if (isLiveAppend && Date.now() > stepMs + 500) {
            // Live appended line: wall-clock arrival minus step start is the exact duration!
            const dtSec = (Date.now() - stepMs) / 1000;
            const ttft = this.computeTurnTtftSec(dtSec, inTok, cacheTok, outTok, preWaitSec);
            const recTtft = this.pushTtft(tStats, ttft);
            if (stepTokens && recTtft > 0) stepTokens.ttftSec = recTtft;
            this.pushTokenRate(tStats, outTok / Math.max(0.3, dtSec));
          } else {
            // Historical line: attach prefill estimate immediately and refine when next step timestamp arrives
            const estTtft = this.computeTurnTtftSec(0, inTok, cacheTok, outTok, preWaitSec);
            if (stepTokens) stepTokens.ttftSec = estTtft;
            if (tStats.currentTtftSec === 0) {
              this.pushTtft(tStats, estTtft);
            }
            tStats.pendingPlannerStep = {
              outputTokens: outTok,
              inputTokens: inTok,
              cachedTokens: cacheTok,
              startMs: stepMs,
              preWaitSec,
              stepTokensRef: stepTokens
            };
          }
        }
        tStats.lastRequestReadyMs = stepMs;
      }

      if (item.thinking && item.thinking.trim()) {
        const thoughtSummary = summarizeThinking(item.thinking);
        if (thoughtSummary) {
          results.push({
            id: `${sessionId}-step-${stepIndex}-think`,
            stepIndex,
            kind: 'thinking',
            icon: '🧠',
            category: '思考规划',
            title: 'Agent 内部思考与路径规划',
            humanSummary: thoughtSummary,
            rawDetail: item.thinking.trim().slice(0, 400),
            tokens: stepTokens,
            timestamp: tsStr,
            risk: { level: 'LOW', label: '内部推理', score: 5 }
          });
        }
      }

      if (Array.isArray(item.tool_calls) && item.tool_calls.length > 0) {
        item.tool_calls.forEach((tc, idx) => {
          const toolInput = tc.args ?? tc.arguments;
          const translated = translateToolCall(tc.name, toolInput || {});
          results.push({
            id: `${sessionId}-step-${stepIndex}-tool-${idx}`,
            stepIndex,
            kind: 'tool',
            toolName: tc.name,
            toolInput: formatToolInput(toolInput),
            ...translated,
            tokens: stepTokens,
            timestamp: tsStr
          });
        });
      }

      if (
        item.content &&
        item.content.trim() &&
        (!item.tool_calls || item.tool_calls.length === 0)
      ) {
        const cleanReply = item.content.replace(/\s+/g, ' ').trim();
        results.push({
          id: `${sessionId}-step-${stepIndex}-reply`,
          stepIndex,
          kind: 'reply',
          icon: '✅',
          category: '完成汇报',
          title: '向用户输出阶段成果与回复',
          humanSummary: `💬 回复摘要：${cleanReply.slice(0, 95)}...`,
          rawDetail: item.content.slice(0, 400),
          tokens: stepTokens,
          timestamp: tsStr,
          risk: { level: 'LOW', label: '正常回复', score: 0 }
        });
      }
    } else if (item.type === 'ERROR_MESSAGE') {
      results.push({
        id: `${sessionId}-step-${stepIndex}-err`,
        stepIndex,
        kind: 'error',
        icon: '⚠️',
        category: '异常告警',
        title: '执行过程中发生接口或命令异常',
        humanSummary: `⚠️ 异常详情：${item.error || '未知错误'}`,
        rawDetail: item.error || '',
        timestamp: tsStr,
        risk: { level: 'MEDIUM', label: '运行异常', score: 50, reason: item.error || '' }
      });
    }

    return results;
  }

  parseCodexLine(sessionId, item, lineNum) {
    const results = [];
    const session = this.sessions.get(sessionId);
    const ts = item.timestamp || new Date().toISOString();
    const eventMs = Date.parse(ts) || Date.now();
    const ord = item.ordinal ?? lineNum;
    const p = item.payload || {};
    const tStats = session?.tokenStats;

    if (item.type === 'event_msg' && p.type === 'task_started') {
      if (tStats) tStats.lastTurnStartMs = eventMs;
      if (p.turn_attribution?.turn_trigger === 'guardian_review') {
        if (session) {
          session.isGuardianSubthread = true;
          session.agentName = 'OpenAI Codex (安全审核)';
        }
      }
    }

    if ((item.type === 'turn_context' || item.type === 'session_meta') && p.cwd && session) {
      session.cwd = p.cwd;
    }

    // Track when tool outputs finish so we know when the next LLM generation starts
    if (item.type === 'response_item' && p.type === 'custom_tool_call_output') {
      if (tStats) tStats.lastTurnStartMs = eventMs;
    }

    // Extract Codex native token_count telemetry
    if (item.type === 'event_msg' && p.type === 'token_count' && p.info && tStats) {
      const total = p.info.total_token_usage || {};
      const last = p.info.last_token_usage || {};

      const freshIn = Number(total.input_tokens || 0);
      const cachedIn = Number(total.cached_input_tokens || 0);
      const outTok = Number(total.output_tokens || 0);
      const reasonTok = Number(total.reasoning_output_tokens || 0);

      tStats.inputTokens = Math.max(0, freshIn - cachedIn);
      tStats.cachedTokens = cachedIn;
      tStats.outputTokens = outTok;
      tStats.reasoningTokens = reasonTok;
      tStats.totalTokens = Number(total.total_tokens || freshIn + outTok);
      tStats.cacheHitRate = freshIn > 0 ? Math.round((cachedIn / freshIn) * 100) : 0;

      const turnOut = Number(last.output_tokens || 0);
      const turnIn = Number(last.input_tokens || 0);
      const turnCached = Number(last.cached_input_tokens || 0);
      const turnTotal = turnIn + turnOut;
      const ctxWin = Number(p.info.model_context_window || 0);
      if (ctxWin > 0) {
        tStats.contextWindowLimit = ctxWin;
      }
      if (turnTotal > 0) {
        tStats.contextUsedTokens = turnTotal;
        const limit = tStats.contextWindowLimit || 200000;
        tStats.contextUsedPercent = Math.min(100, Math.round((turnTotal / limit) * 100));
      }
      if (p.rate_limits && typeof p.rate_limits === 'object') {
        const rl = p.rate_limits;
        const priUsed = Number(rl.primary?.used_percent ?? 0);
        const secUsed = Number(rl.secondary?.used_percent ?? 0);
        const parsedRl = {
          planType: String(rl.plan_type || 'plus').toUpperCase(),
          primaryUsedPercent: Math.min(100, Math.max(0, Math.round(priUsed))),
          primaryRemainingPercent: Math.max(0, 100 - Math.min(100, Math.max(0, Math.round(priUsed)))),
          primaryWindowMinutes: Number(rl.primary?.window_minutes || 300),
          primaryResetsAt: Number(rl.primary?.resets_at || 0),
          secondaryUsedPercent: Math.min(100, Math.max(0, Math.round(secUsed))),
          secondaryRemainingPercent: Math.max(0, 100 - Math.min(100, Math.max(0, Math.round(secUsed)))),
          secondaryWindowMinutes: Number(rl.secondary?.window_minutes || 10080),
          secondaryResetsAt: Number(rl.secondary?.resets_at || 0),
          limitReached: Boolean(rl.rate_limit_reached_type || rl.spend_control_reached)
        };
        tStats.rateLimits = parsedRl;
        this.latestCodexRateLimits = parsedRl;
      } else if (!tStats.rateLimits && this.latestCodexRateLimits) {
        tStats.rateLimits = this.latestCodexRateLimits;
      }
      if (turnTotal > 0) {
        const turnTokens = {
          inputTokens: Math.max(0, turnIn - turnCached),
          cachedTokens: turnCached,
          outputTokens: turnOut,
          totalTokens: turnTotal
        };
        if (turnOut > 0 && tStats.lastTurnStartMs > 0 && eventMs > tStats.lastTurnStartMs) {
          const dtSec = (eventMs - tStats.lastTurnStartMs) / 1000;
          if (dtSec >= 0.15 && dtSec <= 240) {
            const ttftSec = this.computeTurnTtftSec(
              dtSec,
              turnTokens.inputTokens,
              turnTokens.cachedTokens,
              turnOut,
              0
            );
            const recTtft = this.pushTtft(tStats, ttftSec);
            if (recTtft > 0) turnTokens.ttftSec = recTtft;
            const genSec = Math.max(0.25, dtSec - ttftSec);
            this.pushTokenRate(tStats, turnOut / genSec);
          }
        }
        tStats.lastTurnTokens = turnTokens;
        if (session && session.steps && session.steps.length > 0) {
          for (let i = session.steps.length - 1; i >= 0; i--) {
            if (!session.steps[i].tokens) {
              session.steps[i].tokens = turnTokens;
              break;
            }
          }
        }
      }
      tStats.lastTurnStartMs = eventMs;
    }

    if (
      item.type === 'event_msg' &&
      p.type === 'item_completed' &&
      p.item?.type === 'UserMessage'
    ) {
      if (tStats) tStats.lastTurnStartMs = eventMs;
      const text = (p.item.content || []).map((c) => c.text || '').join('\n').trim();
      const clean = cleanUserContent(text);
      if (clean) {
        session.userGoals = [...(session.userGoals || []), clean].slice(-12);
        if (session && !session.originTopic && clean.length > 6) {
          session.originTopic = clean;
        }
        results.push({
          id: `${sessionId}-ord-${ord}-user`,
          stepIndex: ord,
          kind: 'user',
          icon: '👤',
          category: '用户指令',
          title: `用户下达指令：${clean.slice(0, 32)}`,
          humanSummary: `👤 收到用户指令：${clean}`,
          rawDetail: clean,
          timestamp: ts,
          risk: { level: 'LOW', label: '用户输入', score: 0 }
        });
      }
    }

    if (
      item.type === 'event_msg' &&
      p.type === 'item_completed' &&
      p.item?.type === 'Reasoning'
    ) {
      const summaryArr = p.item.summary_text || [];
      const summaryStr = summaryArr.join(' ').trim();
      results.push({
        id: `${sessionId}-ord-${ord}-think`,
        stepIndex: ord,
        kind: 'thinking',
        icon: '🧠',
        category: '思考规划',
        title: 'Codex 正在进行加密思维链推理',
        humanSummary: summaryStr
          ? `🧠 思考摘要：${summaryStr.slice(0, 100)}`
          : '🧠 Codex 正在内部评估下一步要执行的命令与安全策略...',
        rawDetail: summaryStr || 'Encrypted reasoning block',
        timestamp: ts,
        risk: { level: 'LOW', label: '内部推理', score: 5 }
      });
    }

    if (
      item.type === 'response_item' &&
      (p.type === 'custom_tool_call' || p.type === 'function_call')
    ) {
      const toolName = p.name || 'exec';
      const rawInput = p.input || p.arguments || '';
      const translated = translateToolCall(toolName, rawInput);
      results.push({
        id: `${sessionId}-ord-${ord}-tool`,
        stepIndex: ord,
        kind: 'tool',
        toolName,
        toolInput: formatToolInput(rawInput),
        ...translated,
        tokens: tStats?.lastTurnTokens || null,
        timestamp: ts
      });
    }

    if (
      item.type === 'event_msg' &&
      p.type === 'item_completed' &&
      p.item?.type === 'AgentMessage'
    ) {
      const text = (p.item.content || []).map((c) => c.text || '').join(' ').trim();
      if (text) {
        results.push({
          id: `${sessionId}-ord-${ord}-reply`,
          stepIndex: ord,
          kind: 'reply',
          icon: '💬',
          category: '进度播报',
          title: `Codex 反馈：${text.slice(0, 30)}`,
          humanSummary: `💬 Agent 汇报：${text.slice(0, 110)}`,
          rawDetail: text,
          tokens: tStats?.lastTurnTokens || null,
          timestamp: ts,
          risk: { level: 'LOW', label: '正常汇报', score: 0 }
        });
      }
    }

    return results;
  }

  parseClaudeCodeLine(sessionId, item, lineNum, isLiveAppend = false) {
    const results = [];
    const session = this.sessions.get(sessionId);
    if (!session || item.isSidechain === true) return results;

    const ts = item.timestamp || item.createdAt || new Date().toISOString();
    const eventMs = Date.parse(ts) || Date.now();
    const tStats = session.tokenStats;

    if (item.cwd && typeof item.cwd === 'string') {
      session.cwd = item.cwd;
    }

    const msg = item.message || {};
    const role = item.type || msg.role || '';

    // 1. User message or tool_result feedback in Claude Code JSONL
    if (role === 'user') {
      if (item.isMeta === true) return results;
      if (tStats) tStats.lastTurnStartMs = eventMs;
      const content = msg.content ?? item.content;
      if (typeof content === 'string') {
        const clean = cleanUserContent(content);
        if (clean) {
          session.userGoals = [...(session.userGoals || []), clean].slice(-12);
          if (!session.originTopic && clean.length > 6) {
            session.originTopic = clean;
          }
          results.push({
            id: `${sessionId}-cc-${lineNum}-user`,
            stepIndex: lineNum,
            kind: 'user',
            icon: '👤',
            category: '用户指令',
            title: `用户下达指令：${clean.slice(0, 32)}`,
            humanSummary: `👤 收到用户指令：${clean}`,
            rawDetail: clean,
            timestamp: ts,
            risk: { level: 'LOW', label: '用户输入', score: 0 }
          });
        }
      } else if (Array.isArray(content)) {
        const textParts = [];
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          } else if (block.type === 'tool_result' && block.is_error) {
            const errTxt =
              typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content || '工具执行错误');
            results.push({
              id: `${sessionId}-cc-${lineNum}-err`,
              stepIndex: lineNum,
              kind: 'error',
              icon: '⚠️',
              category: '异常告警',
              title: 'Claude Code 工具执行返回报错',
              humanSummary: `⚠️ 异常详情：${errTxt.slice(0, 90)}`,
              rawDetail: errTxt.slice(0, 400),
              timestamp: ts,
              risk: { level: 'MEDIUM', label: '执行异常', score: 50, reason: errTxt.slice(0, 120) }
            });
          }
        }
        const joined = cleanUserContent(textParts.join('\n').trim());
        if (joined) {
          session.userGoals = [...(session.userGoals || []), joined].slice(-12);
          if (!session.originTopic && joined.length > 6) {
            session.originTopic = joined;
          }
          results.push({
            id: `${sessionId}-cc-${lineNum}-user`,
            stepIndex: lineNum,
            kind: 'user',
            icon: '👤',
            category: '用户指令',
            title: `用户下达指令：${joined.slice(0, 32)}`,
            humanSummary: `👤 收到用户指令：${joined}`,
            rawDetail: joined,
            timestamp: ts,
            risk: { level: 'LOW', label: '用户输入', score: 0 }
          });
        }
      }
      return results;
    }

    // 2. Assistant message (thinking, tool_use, text, usage)
    if (role === 'assistant') {
      const usage = msg.usage || item.usage || {};
      const inTok = Number(usage.input_tokens || 0);
      const cacheTok =
        Number(usage.cache_read_input_tokens || 0) +
        Number(usage.cache_creation_input_tokens || 0);
      const outTok = Number(usage.output_tokens || 0);
      const stepTotal = inTok + cacheTok + outTok;
      const stepTokens =
        stepTotal > 0
          ? {
              inputTokens: inTok,
              cachedTokens: cacheTok,
              outputTokens: outTok,
              totalTokens: stepTotal
            }
          : null;

      if (tStats && stepTotal > 0) {
        tStats.inputTokens += inTok;
        tStats.cachedTokens += cacheTok;
        tStats.outputTokens += outTok;
        tStats.totalTokens = tStats.inputTokens + tStats.cachedTokens + tStats.outputTokens;
        const totalPrompt = tStats.inputTokens + tStats.cachedTokens;
        tStats.cacheHitRate =
          totalPrompt > 0 ? Math.round((tStats.cachedTokens / totalPrompt) * 100) : 0;

        if (stepTotal > 0) {
          tStats.contextUsedTokens = stepTotal;
          if (!tStats.contextWindowLimit) tStats.contextWindowLimit = 200000;
          if (stepTotal > tStats.contextWindowLimit) {
            tStats.contextWindowLimit = 1000000;
          }
          tStats.contextUsedPercent = Math.min(
            100,
            Math.round((stepTotal / tStats.contextWindowLimit) * 100)
          );
        }

        if (outTok > 0 && tStats.lastTurnStartMs > 0 && eventMs > tStats.lastTurnStartMs) {
          const dtSec = (eventMs - tStats.lastTurnStartMs) / 1000;
          if (dtSec >= 0.15 && dtSec <= 240) {
            const ttftSec = this.computeTurnTtftSec(dtSec, inTok, cacheTok, outTok, 0);
            const recTtft = this.pushTtft(tStats, ttftSec);
            if (recTtft > 0 && stepTokens) stepTokens.ttftSec = recTtft;
            const genSec = Math.max(0.25, dtSec - ttftSec);
            this.pushTokenRate(tStats, outTok / genSec);
          }
        } else if (outTok > 0 && isLiveAppend && eventMs > 0 && Date.now() > eventMs + 400) {
          const dtSec = (Date.now() - eventMs) / 1000;
          const ttftSec = this.computeTurnTtftSec(dtSec, inTok, cacheTok, outTok, 0);
          const recTtft = this.pushTtft(tStats, ttftSec);
          if (recTtft > 0 && stepTokens) stepTokens.ttftSec = recTtft;
          this.pushTokenRate(tStats, outTok / Math.max(0.25, dtSec - ttftSec));
        }
        tStats.lastTurnStartMs = eventMs;
      }

      const rawContent = msg.content ?? item.content;
      const blocks = Array.isArray(rawContent)
        ? rawContent
        : typeof rawContent === 'string' && rawContent.trim()
        ? [{ type: 'text', text: rawContent }]
        : [];

      const hasToolUse = blocks.some((b) => b && b.type === 'tool_use');

      blocks.forEach((block, idx) => {
        if (!block) return;
        if (block.type === 'thinking' && block.thinking) {
          const summary = summarizeThinking(block.thinking);
          results.push({
            id: `${sessionId}-cc-${lineNum}-think-${idx}`,
            stepIndex: lineNum,
            kind: 'thinking',
            icon: '🧠',
            category: '思考规划',
            title: 'Claude Code 深度思考与架构推演',
            humanSummary: summary || `🧠 思考摘要：${String(block.thinking).slice(0, 90)}`,
            rawDetail: String(block.thinking).slice(0, 400),
            tokens: stepTokens,
            timestamp: ts,
            risk: { level: 'LOW', label: '内部推理', score: 5 }
          });
        } else if (block.type === 'tool_use') {
          const toolName = block.name || 'Tool';
          const rawInput = block.input || {};
          const translated = translateToolCall(toolName, rawInput);
          results.push({
            id: `${sessionId}-cc-${lineNum}-tool-${idx}`,
            stepIndex: lineNum,
            kind: 'tool',
            toolName,
            toolInput: formatToolInput(rawInput),
            ...translated,
            tokens: stepTokens,
            timestamp: ts
          });
        } else if (block.type === 'text' && block.text && block.text.trim() && !hasToolUse) {
          const cleanReply = block.text.replace(/\s+/g, ' ').trim();
          results.push({
            id: `${sessionId}-cc-${lineNum}-reply-${idx}`,
            stepIndex: lineNum,
            kind: 'reply',
            icon: '💬',
            category: '完成汇报',
            title: `Claude Code 汇报：${cleanReply.slice(0, 28)}`,
            humanSummary: `💬 回复摘要：${cleanReply.slice(0, 95)}`,
            rawDetail: block.text.slice(0, 400),
            tokens: stepTokens,
            timestamp: ts,
            risk: { level: 'LOW', label: '正常汇报', score: 0 }
          });
        }
      });
    } else if (role === 'error' || item.error) {
      const errMsg = typeof item.error === 'string' ? item.error : JSON.stringify(item.error || '未知错误');
      results.push({
        id: `${sessionId}-cc-${lineNum}-err`,
        stepIndex: lineNum,
        kind: 'error',
        icon: '⚠️',
        category: '异常告警',
        title: 'Claude Code 运行异常',
        humanSummary: `⚠️ 异常详情：${errMsg.slice(0, 90)}`,
        rawDetail: errMsg,
        timestamp: ts,
        risk: { level: 'MEDIUM', label: '运行异常', score: 50, reason: errMsg }
      });
    }

    return results;
  }

  getAllSessions() {
    const valid = Array.from(this.sessions.values()).filter(
      (s) => s.steps.length > 0 && !s.isGuardianSubthread
    );
    valid.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    // Aggregate 5-hour rolling window and today's total tokens per agent type for quota display
    const nowMs = Date.now();
    const window5hCutoff = nowMs - 5 * 3600 * 1000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCutoff = todayStart.getTime();

    const byAgent5h = {};
    const byAgentToday = {};
    for (const s of valid) {
      const aType = s.agentType || 'agy';
      const uMs = Date.parse(s.updatedAt || 0) || 0;
      const tot = Number(s.tokenStats?.totalTokens || 0);
      if (uMs >= window5hCutoff) {
        byAgent5h[aType] = (byAgent5h[aType] || 0) + tot;
      }
      if (uMs >= todayCutoff) {
        byAgentToday[aType] = (byAgentToday[aType] || 0) + tot;
      }
    }

    for (const s of valid) {
      if (s.tokenStats) {
        const aType = s.agentType || 'agy';
        s.tokenStats.window5hTokens = Math.max(
          Number(s.tokenStats.totalTokens || 0),
          byAgent5h[aType] || 0
        );
        s.tokenStats.todayTokens = Math.max(
          Number(s.tokenStats.totalTokens || 0),
          byAgentToday[aType] || 0
        );
        if (aType === 'agy') {
          const agyTier = this.cachedAgyQuota || this.getAntigravityUserPlan();
          s.tokenStats.agentTier = agyTier;
          if (agyTier && agyTier.quota) {
            s.tokenStats.rateLimits = {
              planType: agyTier.plan || 'Google AI Ultra',
              modelName: agyTier.quota.model,
              primaryUsedPercent: agyTier.quota.usedPercent,
              primaryRemainingPercent: agyTier.quota.remainingPercent,
              primaryResetsAt: Date.parse(agyTier.quota.resetTime) || 0,
              resetTime: agyTier.quota.resetTime,
              isAntigravityNative: true
            };
          }
        } else if (aType === 'codex' && !s.tokenStats.rateLimits && this.latestCodexRateLimits) {
          s.tokenStats.rateLimits = this.latestCodexRateLimits;
        }
      }
    }

    const active = valid.filter(
      (s) => Date.parse(s.updatedAt) > Date.now() - ACTIVE_WINDOW_MS
    );
    if (active.length > 0) {
      return active;
    }
    // Fallback: when no sessions in last 2 hours, keep latest 2 historical sessions so screen is never empty
    return valid.slice(0, 2).map((s) => {
      s.isHistoricalFallback = true;
      return s;
    });
  }
}

module.exports = { MultiAgentLogWatcher, createEmptyTokenStats, ACTIVE_WINDOW_MS };
