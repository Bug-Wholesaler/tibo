const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
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

function clampPercent(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function extractQuotaPercents(winObj) {
  if (!winObj || typeof winObj !== 'object') return null;
  if (typeof winObj.remaining_ratio === 'number' && Number.isFinite(winObj.remaining_ratio)) {
    const remainingPercent = clampPercent(winObj.remaining_ratio * 100);
    return { remainingPercent, usedPercent: clampPercent(100 - remainingPercent) };
  }
  if (typeof winObj.used_ratio === 'number' && Number.isFinite(winObj.used_ratio)) {
    const usedPercent = clampPercent(winObj.used_ratio * 100);
    return { usedPercent, remainingPercent: clampPercent(100 - usedPercent) };
  }
  const limitNum = Number(winObj.limit);
  if (Number.isFinite(limitNum) && limitNum > 0) {
    if (winObj.remaining !== undefined && winObj.remaining !== null && Number.isFinite(Number(winObj.remaining))) {
      const remainingPercent = clampPercent((Number(winObj.remaining) / limitNum) * 100);
      return { remainingPercent, usedPercent: clampPercent(100 - remainingPercent) };
    }
    if (winObj.used !== undefined && winObj.used !== null && Number.isFinite(Number(winObj.used))) {
      const usedPercent = clampPercent((Number(winObj.used) / limitNum) * 100);
      return { usedPercent, remainingPercent: clampPercent(100 - usedPercent) };
    }
  }
  return null;
}

function cleanSubagentBrief(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText
    .replace(/<\/?SYSTEM_MESSAGE>/gi, '')
    .trim();
  const msgMatch = text.match(/\[Message\][^\r\n]*?content=([\s\S]*)$/i);
  if (msgMatch) {
    text = msgMatch[1].trim();
  }
  if (/^\[swarm\]\s*new board message/i.test(text) || /^\[board\]\s*the latest message/i.test(text)) {
    return '';
  }
  text = text
    .replace(/^You have just started\.\s*Your assignment\s*\([^)]*\):\s*/i, '')
    .trim();
  return cleanUserContent(text) || text.split(/\r?\n/).find((l) => l.trim().length > 4)?.trim() || '';
}

function peekAgyTranscriptSubagentMeta(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(24576);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    if (!bytes) return null;
    const raw = buf.subarray(0, bytes).toString('utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 4);
    if (lines.length === 0) return null;

    const parsedLines = [];
    for (const line of lines) {
      try {
        parsedLines.push(JSON.parse(line));
      } catch {
        break;
      }
    }
    if (parsedLines.length === 0) return null;
    if (parsedLines.some((item) => item.type === 'USER_INPUT' || item.source === 'USER_EXPLICIT')) {
      return { isSubagent: false };
    }

    for (const item of parsedLines) {
      if (item.type !== 'SYSTEM_MESSAGE' || typeof item.content !== 'string') continue;
      const c = item.content;
      const swarmAssign = c.match(
        /sender=([0-9a-f-]{36})[\s\S]*?You have just started\.\s*Your assignment\s*\(recorded on the board as #\d+\s+for\s+@([a-zA-Z0-9_-]+)\):\s*([\s\S]*)/i
      );
      if (swarmAssign) {
        return {
          isSubagent: true,
          parentConvId: swarmAssign[1],
          subagentKind: 'swarm',
          subagentRole: swarmAssign[2],
          initialBrief: cleanSubagentBrief(swarmAssign[3])
        };
      }
    }

    const first = parsedLines[0];
    if (first.type === 'SYSTEM_MESSAGE' && typeof first.content === 'string') {
      const c = first.content;
      if (/\[swarm\]\s*new board message/i.test(c)) {
        const senderMatch = c.match(/sender=([0-9a-f-]{36})/i);
        return {
          isSubagent: true,
          parentConvId: senderMatch ? senderMatch[1] : null,
          subagentKind: 'swarm',
          subagentRole: 'worker',
          initialBrief: ''
        };
      }
      const subMatch = c.match(/\[Message\][^\r\n]*sender=([0-9a-f-]{36})[^\r\n]*content=([\s\S]*)/i);
      if (subMatch) {
        return {
          isSubagent: true,
          parentConvId: subMatch[1],
          subagentKind: 'subagent',
          subagentRole: 'subagent',
          initialBrief: cleanSubagentBrief(subMatch[2])
        };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

function peekClaudeFirstLineMeta(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16384);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    if (!bytes) return null;
    const text = buf.subarray(0, bytes).toString('utf8');
    const nl = text.indexOf('\n');
    const firstLine = (nl >= 0 ? text.slice(0, nl) : text).trim();
    if (!firstLine) return null;
    return JSON.parse(firstLine);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

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
    estimatedCostCny: 0,
    estimatedCostUsd: 0,
    savedCostCny: 0,
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
    this.cachedKimiQuota = null;
    this.cachedKimiQuotaTime = 0;
    this.kimiConfigCache = new Map();
    this.agyPeekCache = new Map();
    this.discoveredSubagentParents = new Map();
    this.lastOrphanSubagents = [];
    this.pollTimer = null;
  }

  getKimiCodeRoots() {
    const roots = [];
    if (process.env.YPOD_KIMI_DIR) {
      roots.push(process.env.YPOD_KIMI_DIR);
      if (process.env.KIMI_SHARE_DIR && process.env.KIMI_SHARE_DIR !== process.env.YPOD_KIMI_DIR) {
        roots.push(process.env.KIMI_SHARE_DIR);
      }
      return roots;
    }
    const primary = process.env.KIMI_CODE_HOME || path.join(this.homeDir, '.kimi-code');
    const secondary = process.env.KIMI_SHARE_DIR || path.join(this.homeDir, '.kimi');
    roots.push(primary);
    if (secondary && path.resolve(secondary) !== path.resolve(primary)) {
      roots.push(secondary);
    }
    return roots;
  }

  loadKimiConfigMeta(kimiRoot) {
    const cfgPath = path.join(kimiRoot, 'config.toml');
    if (!fs.existsSync(cfgPath)) return null;
    let st;
    try {
      st = fs.statSync(cfgPath);
    } catch {
      return null;
    }
    const cached = this.kimiConfigCache.get(cfgPath);
    if (cached && cached.mtimeMs === st.mtimeMs) {
      return cached;
    }
    let raw = '';
    try {
      raw = fs.readFileSync(cfgPath, 'utf8');
    } catch {
      return null;
    }

    let defaultModel = '';
    let baseUrl = 'https://api.kimi.com/coding/v1';
    const modelLimits = new Map();
    let currentSection = '';
    let currentModelAlias = '';

    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trim();
      if (!line) continue;
      const secMatch = line.match(/^\[(.+)\]$/);
      if (secMatch) {
        currentSection = secMatch[1].trim();
        const modelMatch = currentSection.match(/^models\.(?:"([^"]+)"|'([^']+)'|([^\s.]+))$/);
        currentModelAlias = modelMatch ? modelMatch[1] || modelMatch[2] || modelMatch[3] || '' : '';
        continue;
      }
      if (!currentSection) {
        const dm = line.match(/^default_model\s*=\s*["']([^"']+)["']/);
        if (dm) defaultModel = dm[1].trim();
      } else if (currentModelAlias) {
        const cs = line.match(/^max_context_size\s*=\s*(\d+)/);
        if (cs) {
          const n = Number(cs[1]);
          if (n > 0) {
            modelLimits.set(currentModelAlias, n);
            modelLimits.set(currentModelAlias.replace(/^kimi-code\//, ''), n);
          }
        }
      } else if (/^providers\..*kimi-code/i.test(currentSection)) {
        const bu = line.match(/^base_url\s*=\s*["']([^"']+)["']/);
        if (bu) baseUrl = bu[1].trim().replace(/\/+$/, '');
      }
    }

    const meta = { mtimeMs: st.mtimeMs, defaultModel, baseUrl, modelLimits };
    this.kimiConfigCache.set(cfgPath, meta);
    return meta;
  }

  resolveKimiContextLimit(modelName = '', modelLimits = null) {
    const raw = String(modelName || '').trim();
    const short = raw.replace(/^kimi-code\//, '');
    if (modelLimits instanceof Map) {
      if (raw && modelLimits.has(raw)) return modelLimits.get(raw);
      if (short && modelLimits.has(short)) return modelLimits.get(short);
    }
    if (/256k|kimi-for-coding-highspeed/i.test(raw)) return 262144;
    if (/128k/i.test(raw)) return 131072;
    if (/k3|kimi-for-coding|kimi-code/i.test(raw)) return 1048576;
    return 262144;
  }

  async refreshKimiQuota() {
    if (this.cachedKimiQuotaTime && Date.now() - this.cachedKimiQuotaTime < 60000) {
      return this.cachedKimiQuota;
    }
    const roots = this.getKimiCodeRoots();
    let targetRoot = null;
    let credPath = null;
    for (const r of roots) {
      const candidate = path.join(r, 'credentials', 'kimi-code.json');
      if (fs.existsSync(candidate)) {
        targetRoot = r;
        credPath = candidate;
        break;
      }
    }
    if (!credPath || !targetRoot) return null;

    let credObj;
    try {
      credObj = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    } catch {
      return null;
    }
    const token = credObj && typeof credObj.access_token === 'string' ? credObj.access_token.trim() : '';
    if (!token) return null;
    if (credObj.expires_at) {
      const expNum = Number(credObj.expires_at);
      const expMs = expNum > 0 && expNum < 1e12 ? expNum * 1000 : expNum;
      if (expMs > 0 && expMs < Date.now()) {
        return null;
      }
    }

    const cfgMeta = this.loadKimiConfigMeta(targetRoot);
    const baseUrl = (cfgMeta?.baseUrl || 'https://api.kimi.com/coding/v1').replace(/\/+$/, '');
    let urlObj;
    try {
      urlObj = new URL(`${baseUrl}/usages`);
    } catch {
      return null;
    }
    const isHttps = urlObj.protocol === 'https:';
    this.cachedKimiQuotaTime = Date.now();

    return new Promise((resolve) => {
      const req = (isHttps ? https : http).request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'User-Agent': 'YPod/1.0'
          },
          timeout: 2500
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 400) {
                return resolve(this.cachedKimiQuota);
              }
              const parsed = JSON.parse(data);
              const rawUsages = parsed?.usages;
              let limit5h = null;
              let sec = null;
              let secLabel = '月度限额';

              if (Array.isArray(rawUsages)) {
                const codingEntry =
                  rawUsages.find((u) => /coding/i.test(String(u?.scope || u?.type || ''))) ||
                  rawUsages[0];
                if (codingEntry) {
                  const subLimits = Array.isArray(codingEntry.limits) ? codingEntry.limits : [];
                  const win5hItem = subLimits.find(
                    (l) => Number(l?.window?.duration) === 300 || Number(l?.window_minutes) === 300
                  );
                  if (win5hItem) {
                    limit5h = win5hItem.detail || win5hItem;
                    sec = codingEntry.detail || null;
                    secLabel = '周期总限额';
                  } else {
                    limit5h = codingEntry.detail || codingEntry;
                  }
                }
              } else if (rawUsages && typeof rawUsages === 'object') {
                limit5h = rawUsages.limit_5h || null;
                sec =
                  rawUsages.limit_7d ||
                  rawUsages.limit_month_code ||
                  rawUsages.limit_month_total ||
                  null;
                secLabel = rawUsages.limit_7d ? '7d 周限额' : '月度限额';
              }

              const priStats = extractQuotaPercents(limit5h);
              if (!priStats) {
                return resolve(this.cachedKimiQuota);
              }
              const secStats = extractQuotaPercents(sec);
              const priResetRaw = limit5h?.reset_time || limit5h?.resetTime || 0;
              const secResetRaw = sec?.reset_time || sec?.resetTime || 0;

              this.cachedKimiQuota = {
                isKimiNative: true,
                planType: 'KIMI CODE',
                primaryUsedPercent: priStats.usedPercent,
                primaryRemainingPercent: priStats.remainingPercent,
                primaryWindowMinutes: 300,
                primaryResetsAt: priResetRaw ? Date.parse(priResetRaw) || Number(priResetRaw) || 0 : 0,
                secondaryUsedPercent: secStats ? secStats.usedPercent : null,
                secondaryRemainingPercent: secStats ? secStats.remainingPercent : null,
                secondaryLabel: secLabel,
                secondaryResetsAt: secResetRaw ? Date.parse(secResetRaw) || Number(secResetRaw) || 0 : 0
              };
              this.cachedKimiQuotaTime = Date.now();
              resolve(this.cachedKimiQuota);
            } catch {
              resolve(this.cachedKimiQuota);
            }
          });
        }
      );
      req.on('error', () => resolve(this.cachedKimiQuota));
      req.on('timeout', () => {
        req.destroy();
        resolve(this.cachedKimiQuota);
      });
      req.end();
    });
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
                    const remPct = clampPercent(rem * 100);
                    primaryQuota = {
                      model: m.label || m.modelId,
                      remainingFraction: rem,
                      usedPercent: clampPercent(100 - remPct),
                      remainingPercent: remPct,
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
    this.refreshKimiQuota();
    this.scanAntigravityLogs();
    this.scanCodexLogs();
    this.scanClaudeCodeLogs();
    this.scanKimiCodeLogs();
  }

  scanAntigravityLogs() {
    const brainRoot = path.join(this.homeDir, '.gemini', 'antigravity', 'brain');
    if (!fs.existsSync(brainRoot)) return;

    const entries = [];
    const entryByConvId = new Map();
    const subagentMetaMap = new Map();
    const swarmTitleMap = new Map();

    try {
      const dirs = fs.readdirSync(brainRoot, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const convDir = path.join(brainRoot, d.name);
        const sysGenDir = path.join(convDir, '.system_generated');
        const transcriptPath = path.join(sysGenDir, 'logs', 'transcript.jsonl');

        if (fs.existsSync(transcriptPath)) {
          try {
            const stat = fs.statSync(transcriptPath);
            const entry = {
              conversationId: d.name,
              filePath: transcriptPath,
              mtimeMs: stat.mtimeMs,
              size: stat.size
            };
            entries.push(entry);
            entryByConvId.set(d.name, entry);
          } catch {}
        }

        // Layer A: Swarm roster (.system_generated/swarm/members.json)
        const membersPath = path.join(sysGenDir, 'swarm', 'members.json');
        if (fs.existsSync(membersPath)) {
          try {
            const mObj = JSON.parse(fs.readFileSync(membersPath, 'utf8'));
            const members = mObj?.members && typeof mObj.members === 'object' ? mObj.members : {};
            const coordId = String(members.coordinator?.conversation_id || d.name).trim();
            if (typeof mObj?.title === 'string' && mObj.title.trim()) {
              swarmTitleMap.set(coordId, mObj.title.trim());
            }
            for (const [memberName, info] of Object.entries(members)) {
              if (!info || typeof info !== 'object') continue;
              const childConvId = String(info.conversation_id || '').trim();
              if (!childConvId || childConvId === coordId || memberName === 'coordinator' || info.role === 'coordinator') {
                continue;
              }
              const isKilled = Boolean(
                info.killed ||
                  info.phase === 'KILLED' ||
                  info.phase === 'STOPPED' ||
                  info.desired_state === 'KILLED' ||
                  info.desired_state === 'STOPPED'
              );
              subagentMetaMap.set(childConvId, {
                parentConvId: coordId,
                subagentKind: 'swarm',
                subagentRole: memberName,
                model: String(info.model || '').trim(),
                killed: isKilled,
                initialBrief: ''
              });
            }
          } catch {}
        }

        // Layer B: Unified subagents registry (.system_generated/subagents/<child>.json)
        const subagentsDir = path.join(sysGenDir, 'subagents');
        if (fs.existsSync(subagentsDir)) {
          try {
            const subFiles = fs.readdirSync(subagentsDir, { withFileTypes: true });
            for (const sf of subFiles) {
              if (!sf.isFile() || !sf.name.endsWith('.json')) continue;
              try {
                const sObj = JSON.parse(fs.readFileSync(path.join(subagentsDir, sf.name), 'utf8'));
                const childConvId = String(sObj?.conversationId || path.basename(sf.name, '.json')).trim();
                if (!childConvId || childConvId === d.name) continue;
                const desc = sObj?.subagentDescriptor || {};
                const rawRole = String(desc.role || desc.typeName || '').trim();
                const swarmRoleMatch = rawRole.match(/Swarm Worker\s*\(([^)]+)\)/i);
                const isSwarmDesc = Boolean(swarmRoleMatch) || desc.typeName === 'worker';
                const parsedRole = swarmRoleMatch
                  ? swarmRoleMatch[1].trim()
                  : rawRole || desc.typeName || 'subagent';
                const isKilled = sObj?.state === 'SUBAGENT_STATE_KILLED';

                const existingMeta = subagentMetaMap.get(childConvId);
                if (existingMeta) {
                  if (!existingMeta.parentConvId) existingMeta.parentConvId = d.name;
                  if (isKilled) existingMeta.killed = true;
                  if (!existingMeta.subagentRole || existingMeta.subagentRole === 'worker') {
                    existingMeta.subagentRole = parsedRole;
                  }
                } else {
                  subagentMetaMap.set(childConvId, {
                    parentConvId: d.name,
                    subagentKind: isSwarmDesc ? 'swarm' : 'subagent',
                    subagentRole: parsedRole,
                    model: '',
                    killed: isKilled,
                    initialBrief: ''
                  });
                }
              } catch {}
            }
          } catch {}
        }
      }
    } catch {
      return;
    }

    // Merge parent -> child links discovered in parent transcript GENERIC outputs
    for (const [childId, parentId] of this.discoveredSubagentParents.entries()) {
      if (!subagentMetaMap.has(childId)) {
        subagentMetaMap.set(childId, {
          parentConvId: parentId,
          subagentKind: 'subagent',
          subagentRole: 'subagent',
          model: '',
          killed: false,
          initialBrief: ''
        });
      }
    }

    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const nowMs = Date.now();
    const initialActive = entries.filter(
      (entry) => nowMs - entry.mtimeMs < ACTIVE_WINDOW_MS || this.fileOffsets.has(entry.filePath)
    );
    const inspectCandidates = initialActive.length > 0 ? initialActive : entries.slice(0, 4);

    // Layer C: Fallback peek into first lines of transcript.jsonl for subagents without registry files
    const peekEntry = (entry) => {
      const cached = this.agyPeekCache.get(entry.filePath);
      if (cached && cached.meta && (cached.meta.isSubagent === false || cached.meta.initialBrief || cached.size === entry.size)) {
        return cached.meta;
      }
      const meta = peekAgyTranscriptSubagentMeta(entry.filePath);
      this.agyPeekCache.set(entry.filePath, { size: entry.size, meta });
      return meta;
    };

    for (const entry of inspectCandidates) {
      const known = subagentMetaMap.get(entry.conversationId);
      if (!known) {
        const peeked = peekEntry(entry);
        if (peeked && peeked.isSubagent) {
          subagentMetaMap.set(entry.conversationId, {
            parentConvId: peeked.parentConvId || null,
            subagentKind: peeked.subagentKind || 'subagent',
            subagentRole: peeked.subagentRole || 'subagent',
            model: '',
            killed: false,
            initialBrief: peeked.initialBrief || ''
          });
        }
      } else if (!known.initialBrief) {
        const peeked = peekEntry(entry);
        if (peeked && peeked.isSubagent) {
          if (!known.parentConvId && peeked.parentConvId) known.parentConvId = peeked.parentConvId;
          if (peeked.initialBrief) known.initialBrief = peeked.initialBrief;
          if ((!known.subagentRole || known.subagentRole === 'subagent') && peeked.subagentRole) {
            known.subagentRole = peeked.subagentRole;
          }
        }
      }
    }

    const resolveRootAgyConv = (convId) => {
      let cur = convId;
      const visited = new Set([cur]);
      for (let hop = 0; hop < 8; hop++) {
        const meta = subagentMetaMap.get(cur);
        if (!meta || !meta.parentConvId || visited.has(meta.parentConvId)) break;
        cur = meta.parentConvId;
        visited.add(cur);
      }
      return cur !== convId ? cur : subagentMetaMap.get(convId)?.parentConvId || null;
    };

    // Parent keep-alive + include sibling subagents for active root conversations
    const selectedIds = new Set(initialActive.map((e) => e.conversationId));
    for (const convId of Array.from(selectedIds)) {
      if (subagentMetaMap.has(convId)) {
        const rootConvId = resolveRootAgyConv(convId);
        if (rootConvId && entryByConvId.has(rootConvId)) {
          selectedIds.add(rootConvId);
        }
      }
    }
    for (const [childConvId] of subagentMetaMap.entries()) {
      const rootConvId = resolveRootAgyConv(childConvId);
      if (rootConvId && selectedIds.has(rootConvId) && entryByConvId.has(childConvId)) {
        selectedIds.add(childConvId);
        const childMeta = subagentMetaMap.get(childConvId);
        if (childMeta && !childMeta.initialBrief) {
          const peeked = peekEntry(entryByConvId.get(childConvId));
          if (peeked && peeked.initialBrief) childMeta.initialBrief = peeked.initialBrief;
        }
      }
    }

    const toProcess = entries
      .filter((entry) => selectedIds.has(entry.conversationId))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const item of toProcess) {
      const sessionId = `agy:${item.conversationId}`;
      const subMeta = subagentMetaMap.get(item.conversationId) || null;
      const rootParentConv = subMeta ? resolveRootAgyConv(item.conversationId) : null;
      const isInitialRead = !this.sessions.has(sessionId);

      if (isInitialRead) {
        const initSession = {
          id: sessionId,
          rawId: item.conversationId,
          agentType: 'agy',
          agentName: 'Antigravity (AGY)',
          badgeColor: '#38bdf8',
          filePath: item.filePath,
          updatedAt: null,
          status: 'ACTIVE',
          isSubagent: Boolean(subMeta),
          parentSessionId: rootParentConv ? `agy:${rootParentConv}` : null,
          subagentKind: subMeta ? subMeta.subagentKind : null,
          subagentRole: subMeta ? subMeta.subagentRole : null,
          subagentRunState: subMeta ? (subMeta.killed ? 'killed' : 'working') : null,
          model: subMeta?.model || '',
          swarmTitle: swarmTitleMap.get(item.conversationId) || '',
          _subagentKilled: Boolean(subMeta?.killed),
          _parkedOnSwarmWait: false,
          steps: [],
          tokenStats: createEmptyTokenStats(),
          analysis: null
        };
        if (subMeta?.initialBrief) {
          initSession.originTopic = subMeta.initialBrief;
        }
        this.sessions.set(sessionId, initSession);
      } else {
        const existing = this.sessions.get(sessionId);
        if (existing) {
          if (swarmTitleMap.has(item.conversationId)) {
            existing.swarmTitle = swarmTitleMap.get(item.conversationId);
          }
          if (subMeta) {
            existing.isSubagent = true;
            if (rootParentConv) existing.parentSessionId = `agy:${rootParentConv}`;
            if (subMeta.subagentKind) existing.subagentKind = subMeta.subagentKind;
            if (subMeta.subagentRole) existing.subagentRole = subMeta.subagentRole;
            if (subMeta.model) existing.model = subMeta.model;
            if (subMeta.initialBrief && !existing.originTopic) {
              existing.originTopic = subMeta.initialBrief;
            }
            existing._subagentKilled = Boolean(subMeta.killed);
          }
        }
      }

      this.readIncrementalJsonl(
        sessionId,
        item.filePath,
        (lineObj, idx, isLiveAppend) =>
          this.parseAntigravityLine(sessionId, lineObj, idx, isLiveAppend),
        !isInitialRead
      );

      // Reconcile worker sleep / kill state even when transcript had no newly appended bytes
      const sess = this.sessions.get(sessionId);
      if (sess && sess.isSubagent) {
        const prevStatus = sess.status;
        const prevRunState = sess.subagentRunState;
        if (sess._subagentKilled) {
          sess.status = 'IDLE';
          sess.subagentRunState = 'killed';
        } else if (sess._parkedOnSwarmWait) {
          sess.status = 'IDLE';
          sess.subagentRunState = 'waiting';
        } else {
          sess.subagentRunState =
            sess.status === 'WORKING' || sess.status === 'ACTIVE' ? 'working' : 'idle';
        }
        if (prevStatus !== sess.status || prevRunState !== sess.subagentRunState) {
          sess.analysis = analyzeSessionTrajectory(sess);
        }
      }
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

    // Inspect active rollouts; keep internal safety guardian reviews excluded, fold real subagents under parent.
    const metaCache = new Map();
    const getMeta = (fp) => {
      if (metaCache.has(fp)) return metaCache.get(fp);
      const m = readCodexMetadata(fp);
      metaCache.set(fp, m);
      return m;
    };

    const isGuardianMeta = (meta) =>
      Boolean(
        meta &&
          (meta.thread_source === 'guardian_review' ||
            (meta.source &&
              typeof meta.source === 'object' &&
              (meta.source.subagent === 'guardian' ||
                meta.source.subagent?.other === 'guardian')))
      );

    const activeCandidates = rolloutFiles.filter(
      (item) => Date.now() - item.mtimeMs < ACTIVE_WINDOW_MS || this.fileOffsets.has(item.filePath)
    );
    const neededParentRawIds = new Set();
    for (const item of activeCandidates) {
      const meta = getMeta(item.filePath);
      if (!meta || !meta.id || isGuardianMeta(meta)) continue;
      const parentRaw =
        meta.source?.subagent?.thread_spawn?.parent_thread_id ||
        meta.parent_thread_id ||
        (typeof meta.source?.subagent?.parent_thread_id === 'string'
          ? meta.source.subagent.parent_thread_id
          : '');
      if (parentRaw) neededParentRawIds.add(parentRaw);
    }

    const candidateSet = new Set(activeCandidates.map((c) => c.filePath));
    if (neededParentRawIds.size > 0) {
      for (const item of rolloutFiles) {
        if (candidateSet.has(item.filePath)) continue;
        const meta = getMeta(item.filePath);
        if (meta && meta.id && neededParentRawIds.has(meta.id) && !isGuardianMeta(meta)) {
          candidateSet.add(item.filePath);
        }
      }
    }

    const candidates = rolloutFiles
      .filter((item) => candidateSet.has(item.filePath))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const item of candidates) {
      const meta = getMeta(item.filePath);
      if (!meta || !meta.id || isGuardianMeta(meta)) continue;

      const threadSpawn = meta.source?.subagent?.thread_spawn || null;
      const parentRawId = String(
        threadSpawn?.parent_thread_id ||
          meta.parent_thread_id ||
          meta.source?.subagent?.parent_thread_id ||
          ''
      ).trim();
      const isCodexSubagent = Boolean(
        parentRawId ||
          (meta.source && typeof meta.source === 'object' && meta.source.subagent) ||
          (meta.thread_source && meta.thread_source !== 'user')
      );
      const subRole = String(
        threadSpawn?.agent_nickname ||
          threadSpawn?.agent_role ||
          meta.agent_nickname ||
          meta.agent_role ||
          (typeof meta.source?.subagent === 'string' ? meta.source.subagent : '') ||
          'subagent'
      ).trim();

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
          model: String(meta.model || '').trim(),
          updatedAt: null,
          status: 'IDLE',
          isGuardianSubthread: false,
          isSubagent: isCodexSubagent,
          parentSessionId: parentRawId ? `codex:${parentRawId}` : null,
          subagentKind: isCodexSubagent ? 'subagent' : null,
          subagentRole: isCodexSubagent ? subRole : null,
          subagentRunState: isCodexSubagent ? 'idle' : null,
          steps: [],
          tokenStats: createEmptyTokenStats(),
          analysis: null
        });
      } else {
        const existing = this.sessions.get(sessionId);
        if (existing) {
          if (meta.model && !existing.model) existing.model = String(meta.model).trim();
          if (isCodexSubagent) {
            existing.isSubagent = true;
            if (parentRawId) existing.parentSessionId = `codex:${parentRawId}`;
            if (!existing.subagentKind) existing.subagentKind = 'subagent';
            if (subRole) existing.subagentRole = subRole;
          }
        }
      }
      this.readIncrementalJsonl(
        sessionId,
        item.filePath,
        (lineObj, idx, isLiveAppend) =>
          this.parseCodexLine(sessionId, lineObj, idx, isLiveAppend),
        this.fileOffsets.has(item.filePath)
      );
      const sess = this.sessions.get(sessionId);
      if (sess && sess.isSubagent) {
        sess.subagentRunState = sess.status === 'WORKING' ? 'working' : 'idle';
      }
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
            const parentDir = path.dirname(full);
            const isSubagentsDir = path.basename(parentDir) === 'subagents';
            const isAgentFile = entry.name.startsWith('agent-') || isSubagentsDir;
            const parentDirUuid = isSubagentsDir ? path.basename(path.dirname(parentDir)) : '';
            ccFiles.push({
              filePath: full,
              fileName: entry.name,
              isSubagent: isAgentFile,
              parentDirUuid,
              mtimeMs: st.mtimeMs,
              size: st.size
            });
          } catch {}
        }
      }
    };

    walk(projectsRoot, 0);
    const activeCandidates = ccFiles.filter(
      (item) => Date.now() - item.mtimeMs < ACTIVE_WINDOW_MS || this.fileOffsets.has(item.filePath)
    );

    const neededParentUuids = new Set();
    for (const item of activeCandidates) {
      if (!item.isSubagent) continue;
      const firstLine = peekClaudeFirstLineMeta(item.filePath);
      item._firstMeta = firstLine;
      const pUuid = String(firstLine?.sessionId || item.parentDirUuid || '').trim();
      if (pUuid) neededParentUuids.add(pUuid);
    }

    const candidateSet = new Set(activeCandidates.map((c) => c.filePath));
    if (neededParentUuids.size > 0) {
      for (const item of ccFiles) {
        if (item.isSubagent || candidateSet.has(item.filePath)) continue;
        const rawUuid = path.basename(item.fileName, '.jsonl');
        if (neededParentUuids.has(rawUuid)) {
          candidateSet.add(item.filePath);
        }
      }
    }

    const candidates = ccFiles
      .filter((item) => candidateSet.has(item.filePath))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const item of candidates) {
      const rawUuid = path.basename(item.fileName, '.jsonl');
      const sessionId = `claude:${rawUuid}`;
      const isInitialRead = !this.sessions.has(sessionId);
      const firstMeta = item.isSubagent ? item._firstMeta || peekClaudeFirstLineMeta(item.filePath) : null;
      const parentUuid = item.isSubagent
        ? String(firstMeta?.sessionId || item.parentDirUuid || '').trim()
        : '';
      const subRole = item.isSubagent
        ? String(firstMeta?.slug || firstMeta?.agentId || rawUuid.replace(/^agent-/, '') || 'subagent').trim()
        : null;

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
          isSubagent: Boolean(item.isSubagent),
          parentSessionId: parentUuid ? `claude:${parentUuid}` : null,
          subagentKind: item.isSubagent ? 'subagent' : null,
          subagentRole: subRole,
          subagentRunState: item.isSubagent ? 'idle' : null,
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
      const sess = this.sessions.get(sessionId);
      if (sess && sess.isSubagent) {
        sess.subagentRunState = sess.status === 'WORKING' ? 'working' : 'idle';
      }
    }
  }

  scanKimiCodeLogs() {
    const roots = this.getKimiCodeRoots();
    const kimiFiles = [];

    for (const kimiRoot of roots) {
      if (!kimiRoot || !fs.existsSync(kimiRoot)) continue;
      const sessionsRoot = path.join(kimiRoot, 'sessions');
      if (!fs.existsSync(sessionsRoot)) continue;

      const configMeta = this.loadKimiConfigMeta(kimiRoot);
      const projectsMap = new Map();
      const projectsPath = path.join(kimiRoot, 'projects.json');
      if (fs.existsSync(projectsPath)) {
        try {
          const pj = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
          const projs = pj?.projects;
          if (Array.isArray(projs)) {
            for (const proj of projs) {
              if (proj && Array.isArray(proj.workspaces)) {
                for (const ws of proj.workspaces) {
                  const wsKey = ws?.id || ws?.key;
                  const wsPath = ws?.path || ws?.root;
                  if (wsKey && typeof wsPath === 'string' && wsPath.trim()) {
                    projectsMap.set(wsKey, wsPath.trim());
                  }
                }
              }
            }
          } else if (projs && typeof projs === 'object') {
            for (const [wmKey, info] of Object.entries(projs)) {
              const rootVal = info?.root || info?.path;
              if (typeof rootVal === 'string' && rootVal.trim()) {
                projectsMap.set(wmKey, rootVal.trim());
              }
            }
          }
        } catch {}
      }

      const v1HashMap = new Map();
      const v1MetaPath = path.join(kimiRoot, 'kimi.json');
      if (fs.existsSync(v1MetaPath)) {
        try {
          const kj = JSON.parse(fs.readFileSync(v1MetaPath, 'utf8'));
          const workDirs = Array.isArray(kj?.work_dirs) ? kj.work_dirs : [];
          for (const wd of workDirs) {
            if (wd && typeof wd.path === 'string' && wd.path.trim()) {
              const pStr = wd.path.trim();
              const h1 = crypto.createHash('md5').update(pStr).digest('hex');
              v1HashMap.set(h1, pStr);
              const normP = pStr.replace(/\\+/g, '/');
              v1HashMap.set(crypto.createHash('md5').update(normP).digest('hex'), pStr);
            }
          }
        } catch {}
      }

      const walk = (dir, depth = 0) => {
        if (depth > 5) return;
        let list = [];
        try {
          list = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of list) {
          if (
            entry.name === '.index-cache' ||
            entry.name === '.index-dirty' ||
            entry.name.startsWith('.')
          ) {
            continue;
          }
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, depth + 1);
          } else if (entry.isFile() && entry.name === 'wire.jsonl') {
            const parentDir = path.dirname(full);
            const parentName = path.basename(parentDir);
            const grandParentDir = path.dirname(parentDir);
            const grandParentName = path.basename(grandParentDir);

            let sessionDir;
            let wmOrHash;
            let isKimiSubagent = false;
            let subagentId = null;
            if (grandParentName === 'agents') {
              isKimiSubagent = parentName !== 'main';
              subagentId = isKimiSubagent ? parentName : null;
              sessionDir = path.dirname(grandParentDir);
              wmOrHash = path.basename(path.dirname(sessionDir));
            } else if (parentName === 'agents') {
              continue;
            } else {
              // Kimi CLI v1: sessions/<md5_hash>/<session_id>/wire.jsonl
              sessionDir = parentDir;
              wmOrHash = grandParentName !== 'sessions' ? grandParentName : '';
            }

            let st;
            try {
              st = fs.statSync(full);
            } catch {
              continue;
            }

            let stateObj = null;
            const stateFile = path.join(sessionDir, 'state.json');
            if (fs.existsSync(stateFile)) {
              try {
                stateObj = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
              } catch {}
            }

            const rawSessionId = String(stateObj?.id || path.basename(sessionDir));
            if (stateObj && stateObj.archived === true) {
              this.sessions.delete(
                isKimiSubagent ? `kimi:${rawSessionId}:sub:${subagentId}` : `kimi:${rawSessionId}`
              );
              continue;
            }

            const stateUpdatedMs = Number(stateObj?.updatedAt || 0);
            const activityMs = isKimiSubagent
              ? st.mtimeMs
              : Math.max(st.mtimeMs, stateUpdatedMs > 1e12 ? stateUpdatedMs : stateUpdatedMs * 1000);
            const resolvedCwd =
              (typeof stateObj?.cwd === 'string' && stateObj.cwd.trim()) ||
              projectsMap.get(wmOrHash) ||
              v1HashMap.get(wmOrHash) ||
              '';

            kimiFiles.push({
              filePath: full,
              rawSessionId,
              isSubagent: isKimiSubagent,
              subagentId,
              cwd: resolvedCwd,
              stateObj,
              configMeta,
              mtimeMs: st.mtimeMs,
              activityMs,
              size: st.size
            });
          }
        }
      };

      walk(sessionsRoot, 0);
    }

    if (kimiFiles.length === 0) return;

    kimiFiles.sort((a, b) => b.activityMs - a.activityMs);
    const activeItems = kimiFiles.filter(
      (item) => Date.now() - item.activityMs < ACTIVE_WINDOW_MS || this.fileOffsets.has(item.filePath)
    );
    let selectedItems;
    if (activeItems.length > 0) {
      const parentRawSet = new Set(
        activeItems.filter((i) => i.isSubagent).map((i) => i.rawSessionId)
      );
      selectedItems = kimiFiles.filter(
        (item) =>
          activeItems.includes(item) || (!item.isSubagent && parentRawSet.has(item.rawSessionId))
      );
    } else {
      const mainFiles = kimiFiles.filter((i) => !i.isSubagent);
      selectedItems = (mainFiles.length > 0 ? mainFiles : kimiFiles).slice(0, 2);
    }
    const candidates = selectedItems.sort((a, b) => a.activityMs - b.activityMs);

    for (const item of candidates) {
      const sessionId = item.isSubagent
        ? `kimi:${item.rawSessionId}:sub:${item.subagentId}`
        : `kimi:${item.rawSessionId}`;
      const isInitialRead = !this.sessions.has(sessionId);
      const defaultAlias = item.configMeta?.defaultModel || '';
      const defaultShortModel = defaultAlias ? defaultAlias.replace(/^kimi-code\//, '') : '';
      const modelLimits = item.configMeta?.modelLimits || null;

      if (isInitialRead) {
        const tStats = createEmptyTokenStats();
        tStats.contextWindowLimit = this.resolveKimiContextLimit(defaultAlias || 'kimi-code', modelLimits);
        const initSession = {
          id: sessionId,
          rawId: item.isSubagent ? `${item.rawSessionId}:${item.subagentId}` : item.rawSessionId,
          agentType: 'kimi',
          agentName: 'Kimi Code',
          badgeColor: '#ec4899',
          filePath: item.filePath,
          cwd: item.cwd || '',
          model: defaultShortModel,
          rawModelAlias: defaultAlias,
          sessionTitle:
            !item.isSubagent && typeof item.stateObj?.title === 'string'
              ? item.stateObj.title.trim()
              : '',
          updatedAt: null,
          status: 'IDLE',
          isSubagent: Boolean(item.isSubagent),
          parentSessionId: item.isSubagent ? `kimi:${item.rawSessionId}` : null,
          subagentKind: item.isSubagent ? 'subagent' : null,
          subagentRole: item.isSubagent ? item.subagentId : null,
          subagentRunState: item.isSubagent ? 'idle' : null,
          steps: [],
          tokenStats: tStats,
          analysis: null,
          _kimiModelLimits: modelLimits,
          _kimiTurnState: null,
          _kimiTurnReason: ''
        };
        if (
          !item.isSubagent &&
          typeof item.stateObj?.lastPrompt === 'string' &&
          item.stateObj.lastPrompt.trim()
        ) {
          const cleanLast = cleanUserContent(item.stateObj.lastPrompt);
          if (cleanLast) initSession.originTopic = cleanLast;
        }
        this.sessions.set(sessionId, initSession);
      } else {
        const existing = this.sessions.get(sessionId);
        if (existing) {
          if (item.cwd && !existing.cwd) existing.cwd = item.cwd;
          if (
            !item.isSubagent &&
            typeof item.stateObj?.title === 'string' &&
            item.stateObj.title.trim()
          ) {
            existing.sessionTitle = item.stateObj.title.trim();
          }
          if (modelLimits) existing._kimiModelLimits = modelLimits;
        }
      }

      const wasTracked = this.fileOffsets.has(item.filePath);
      this.readIncrementalJsonl(
        sessionId,
        item.filePath,
        (lineObj, idx, isLiveAppend) =>
          this.parseKimiWireLine(sessionId, lineObj, idx, isLiveAppend),
        wasTracked
      );

      // Reconcile interrupted/completed state from state.json if wire ended mid-step on historical load
      const sess = this.sessions.get(sessionId);
      if (
        sess &&
        !item.isSubagent &&
        !wasTracked &&
        item.stateObj?.lastTurnReason &&
        sess._kimiTurnState === 'WORKING' &&
        Date.now() - item.activityMs > 60000
      ) {
        const reason = String(item.stateObj.lastTurnReason).toLowerCase();
        sess._kimiTurnReason = reason;
        sess._kimiTurnState = reason === 'error' ? 'WARNING' : 'IDLE';
        sess.status = sess._kimiTurnState;
        sess.analysis = analyzeSessionTrajectory(sess);
      }
      if (sess && sess.isSubagent) {
        sess.subagentRunState = sess.status === 'WORKING' ? 'working' : 'idle';
      }
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
    let stateChanged = false;

    for (const line of lines) {
      lineCount += 1;
      try {
        const obj = JSON.parse(line);
        const sessRef = this.sessions.get(sessionId);
        const beforeTotal = sessRef?.tokenStats?.totalTokens || 0;
        const beforeCtx = sessRef?.tokenStats?.contextUsedTokens || 0;
        const beforeTurnState = sessRef?._kimiTurnState || null;
        const beforeParked = Boolean(sessRef?._parkedOnSwarmWait);
        const beforeModel = sessRef?.model || '';
        const parsedList = parserFn(obj, lineCount, isLiveAppend);
        const afterTotal = sessRef?.tokenStats?.totalTokens || 0;
        const afterCtx = sessRef?.tokenStats?.contextUsedTokens || 0;
        const afterTurnState = sessRef?._kimiTurnState || null;
        const afterParked = Boolean(sessRef?._parkedOnSwarmWait);
        const afterModel = sessRef?.model || '';
        if (afterTotal !== beforeTotal || afterCtx !== beforeCtx) tokensChanged = true;
        if (
          afterTurnState !== beforeTurnState ||
          afterParked !== beforeParked ||
          afterModel !== beforeModel
        ) {
          stateChanged = true;
        }
        if (Array.isArray(parsedList) && parsedList.length > 0) {
          addedSteps.push(...parsedList);
        }
      } catch {}
    }
    this.lineCounters.set(filePath, lineCount);

    if (addedSteps.length > 0 || tokensChanged || stateChanged) {
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

        if (session._subagentKilled) {
          session.status = 'IDLE';
          session.subagentRunState = 'killed';
        } else if (session._parkedOnSwarmWait) {
          session.status = 'IDLE';
          session.subagentRunState = 'waiting';
        } else if (session.agentType === 'kimi' && session._kimiTurnState) {
          session.status = session._kimiTurnState;
        } else {
          const lastStep = session.steps[session.steps.length - 1];
          if (lastStep) {
            session.status =
              lastStep.kind === 'reply'
                ? 'IDLE'
                : lastStep.kind === 'error'
                ? 'WARNING'
                : 'WORKING';
          }
        }
        if (session.isSubagent && !session._subagentKilled && !session._parkedOnSwarmWait) {
          session.subagentRunState =
            session.status === 'WORKING' || session.status === 'ACTIVE' ? 'working' : 'idle';
        }

        session.analysis = analyzeSessionTrajectory(session);

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
      if (session) session._parkedOnSwarmWait = false;
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

      if (item.type === 'GENERIC' && typeof item.content === 'string' && session?.rawId) {
        const subCreated = item.content.match(
          /Created the following subagent:[\s\S]*?"conversationId"\s*:\s*"([0-9a-f-]{36})"/i
        );
        if (subCreated && subCreated[1]) {
          this.discoveredSubagentParents.set(subCreated[1], session.rawId);
        }
      }

      if (item.type === 'SYSTEM_MESSAGE') {
        if (session) session._parkedOnSwarmWait = false;
        if (session?.isSubagent && lineNum <= 3 && typeof item.content === 'string') {
          const roleMatch = item.content.match(
            /Your assignment\s*\(recorded on the board as #\d+\s+for\s+@([a-zA-Z0-9_-]+)\)/i
          );
          if (roleMatch && roleMatch[1]) {
            session.subagentRole = roleMatch[1];
            session.subagentKind = 'swarm';
          }
          const brief = cleanSubagentBrief(item.content);
          if (brief) {
            session.userGoals = [...(session.userGoals || []), brief].slice(-12);
            if (!session.originTopic) session.originTopic = brief;
            results.push({
              id: `${sessionId}-step-${stepIndex}-brief`,
              stepIndex,
              kind: 'user',
              icon: '🐝',
              category: '子代理任务',
              title: `分配任务：${brief.slice(0, 32)}`,
              humanSummary: `🐝 收到协同任务分配：${brief.slice(0, 120)}`,
              rawDetail: brief.slice(0, 500),
              timestamp: tsStr,
              risk: { level: 'LOW', label: '任务分配', score: 0 }
            });
          }
        }
      }
    } else if (item.type === 'PLANNER_RESPONSE') {
      const callsSwarmWait =
        Array.isArray(item.tool_calls) &&
        item.tool_calls.some((tc) => tc && tc.name === 'swarm_wait');
      if (session) {
        session._parkedOnSwarmWait = Boolean(callsSwarmWait);
      }
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
        const priUsedPct =
          typeof rl.primary?.remaining_percent === 'number'
            ? clampPercent(100 - rl.primary.remaining_percent)
            : clampPercent(rl.primary?.used_percent ?? 0);
        const priRemPct =
          typeof rl.primary?.remaining_percent === 'number'
            ? clampPercent(rl.primary.remaining_percent)
            : clampPercent(100 - priUsedPct);
        const secUsedPct =
          typeof rl.secondary?.remaining_percent === 'number'
            ? clampPercent(100 - rl.secondary.remaining_percent)
            : clampPercent(rl.secondary?.used_percent ?? 0);
        const secRemPct =
          typeof rl.secondary?.remaining_percent === 'number'
            ? clampPercent(rl.secondary.remaining_percent)
            : clampPercent(100 - secUsedPct);
        const parsedRl = {
          planType: String(rl.plan_type || 'plus').toUpperCase(),
          primaryUsedPercent: priUsedPct,
          primaryRemainingPercent: priRemPct,
          primaryWindowMinutes: Number(rl.primary?.window_minutes || 300),
          primaryResetsAt: Number(rl.primary?.resets_at || 0),
          secondaryUsedPercent: secUsedPct,
          secondaryRemainingPercent: secRemPct,
          secondaryWindowMinutes: Number(rl.secondary?.window_minutes || 10080),
          secondaryResetsAt: Number(rl.secondary?.resets_at || 0),
          limitReached: Boolean(rl.rate_limit_reached_type || rl.spend_control_reached),
          isCodexNative: true
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
    if (!session || (!session.isSubagent && item.isSidechain === true)) return results;

    const ts = item.timestamp || item.createdAt || new Date().toISOString();
    const eventMs = Date.parse(ts) || Date.now();
    const tStats = session.tokenStats;

    if (item.cwd && typeof item.cwd === 'string') {
      session.cwd = item.cwd;
    }

    const msg = item.message || {};
    if (msg.model && typeof msg.model === 'string' && !session.model) {
      session.model = msg.model;
    }
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

  parseKimiCliV1Line(sessionId, item, lineNum) {
    const results = [];
    const session = this.sessions.get(sessionId);
    if (!session) return results;

    const rawTs = Number(item.timestamp || 0);
    const stepMs =
      rawTs > 0
        ? rawTs < 1e12
          ? Math.round(rawTs * 1000)
          : Math.round(rawTs)
        : Date.now();
    const tsStr = new Date(stepMs).toISOString();
    const tStats = session.tokenStats;
    const msg = item.message || {};
    const mType = msg.type || '';
    const p = msg.payload || {};

    if (mType === 'TurnBegin') {
      let rawInput = '';
      if (typeof p.user_input === 'string') {
        rawInput = p.user_input;
      } else if (Array.isArray(p.user_input)) {
        rawInput = p.user_input
          .filter((part) => part && part.type === 'text' && part.text)
          .map((part) => part.text)
          .join('\n');
      }
      const clean = cleanUserContent(rawInput);
      if (tStats) tStats.lastRequestReadyMs = stepMs;
      session._kimiTurnState = 'WORKING';
      session._kimiTurnReason = '';
      session._curKimiStep = { textParts: [], createdSteps: [], hasToolCall: false, startMs: stepMs };
      if (clean) {
        session.userGoals = [...(session.userGoals || []), clean].slice(-12);
        if (!session.originTopic && clean.length > 6) {
          session.originTopic = clean;
        }
        results.push({
          id: `${sessionId}-kv1-${lineNum}-user`,
          stepIndex: lineNum,
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
      return results;
    }

    if (mType === 'StepBegin') {
      session._curKimiStep = { textParts: [], createdSteps: [], hasToolCall: false, startMs: stepMs };
      session._kimiTurnState = 'WORKING';
      return results;
    }

    if (!session._curKimiStep) {
      session._curKimiStep = { textParts: [], createdSteps: [], hasToolCall: false, startMs: stepMs };
    }
    const cur = session._curKimiStep;

    if (mType === 'ThinkPart') {
      const thinkText = String(p.think || p.thinking || '').trim();
      if (thinkText) {
        const summary = summarizeThinking(thinkText);
        const st = {
          id: `${sessionId}-kv1-${lineNum}-think`,
          stepIndex: lineNum,
          kind: 'thinking',
          icon: '🧠',
          category: '思考规划',
          title: 'Kimi Code 深度思考与推理',
          humanSummary: summary || `🧠 思考摘要：${thinkText.slice(0, 90)}`,
          rawDetail: thinkText.slice(0, 400),
          timestamp: tsStr,
          risk: { level: 'LOW', label: '内部推理', score: 5 }
        };
        results.push(st);
        cur.createdSteps.push(st);
      }
    } else if (mType === 'TextPart') {
      if (p.text) cur.textParts.push(String(p.text));
    } else if (mType === 'ToolCall') {
      cur.hasToolCall = true;
      if (cur.textParts.length > 0) {
        const note = cur.textParts.join('').trim();
        cur.textParts = [];
        if (note) {
          const noteSt = {
            id: `${sessionId}-kv1-${lineNum}-note`,
            stepIndex: lineNum,
            kind: 'thinking',
            icon: '💭',
            category: '思考规划',
            title: 'Kimi Code 阶段说明',
            humanSummary: `💭 ${note.replace(/\s+/g, ' ').slice(0, 95)}`,
            rawDetail: note.slice(0, 400),
            timestamp: tsStr,
            risk: { level: 'LOW', label: '内部推理', score: 5 }
          };
          results.push(noteSt);
          cur.createdSteps.push(noteSt);
        }
      }
      const fn = p.function || p;
      const toolName = fn.name || p.name || 'Tool';
      let parsedArgs = fn.arguments ?? p.args ?? p.input ?? {};
      if (typeof parsedArgs === 'string') {
        try {
          parsedArgs = JSON.parse(parsedArgs);
        } catch {
          parsedArgs = { input: parsedArgs };
        }
      }
      const translated = translateToolCall(toolName, parsedArgs);
      const toolSt = {
        id: `${sessionId}-kv1-${lineNum}-tool`,
        stepIndex: lineNum,
        kind: 'tool',
        toolName,
        toolInput: formatToolInput(parsedArgs),
        ...translated,
        timestamp: tsStr
      };
      results.push(toolSt);
      cur.createdSteps.push(toolSt);
    } else if (mType === 'ToolResult') {
      if (tStats) tStats.lastRequestReadyMs = stepMs;
      const ret = p.return_value || p;
      if (ret.is_error === true || ret.isError === true) {
        const errTxt = String(ret.output || ret.message || '工具执行错误').trim();
        const firstLine = errTxt.split(/\r?\n/)[0] || errTxt;
        results.push({
          id: `${sessionId}-kv1-${lineNum}-err`,
          stepIndex: lineNum,
          kind: 'error',
          icon: '⚠️',
          category: '异常告警',
          title: 'Kimi Code 工具执行异常',
          humanSummary: `⚠️ 异常详情：${firstLine.slice(0, 90)}`,
          rawDetail: errTxt.slice(0, 400),
          timestamp: tsStr,
          risk: { level: 'MEDIUM', label: '执行异常', score: 50, reason: firstLine.slice(0, 120) }
        });
      }
    } else if (mType === 'StatusUpdate' && tStats) {
      const tu = p.token_usage || p.usage || {};
      const inTok = Number(tu.input_other ?? tu.input_tokens ?? 0);
      const cacheTok =
        Number(tu.input_cache_read ?? 0) + Number(tu.input_cache_creation ?? 0);
      const outTok = Number(tu.output ?? tu.output_tokens ?? 0);
      const stepTotal = inTok + cacheTok + outTok;
      if (stepTotal > 0) {
        tStats.inputTokens += inTok;
        tStats.cachedTokens += cacheTok;
        tStats.outputTokens += outTok;
        tStats.totalTokens = tStats.inputTokens + tStats.cachedTokens + tStats.outputTokens;
        const totalPrompt = tStats.inputTokens + tStats.cachedTokens;
        tStats.cacheHitRate =
          totalPrompt > 0 ? Math.round((tStats.cachedTokens / totalPrompt) * 100) : 0;
        tStats.contextUsedTokens = Number(p.context_tokens || stepTotal);
        if (Number(p.max_context_tokens) > 0) {
          tStats.contextWindowLimit = Number(p.max_context_tokens);
        } else if (!tStats.contextWindowLimit) {
          tStats.contextWindowLimit = 262144;
        }
        tStats.contextUsedPercent =
          typeof p.context_usage === 'number' && p.context_usage > 0 && p.context_usage <= 1
            ? Math.min(100, Math.round(p.context_usage * 100))
            : Math.min(100, Math.round((stepTotal / tStats.contextWindowLimit) * 100));

        let recTtft = 0;
        if (outTok > 0 && tStats.lastRequestReadyMs > 0 && stepMs > tStats.lastRequestReadyMs) {
          const dtSec = (stepMs - tStats.lastRequestReadyMs) / 1000;
          if (dtSec >= 0.1 && dtSec <= 240) {
            recTtft = this.pushTtft(
              tStats,
              this.computeTurnTtftSec(dtSec, inTok, cacheTok, outTok, 0)
            );
            this.pushTokenRate(tStats, outTok / Math.max(0.25, dtSec - recTtft));
          }
        }
        const stepTokens = {
          inputTokens: inTok,
          cachedTokens: cacheTok,
          outputTokens: outTok,
          totalTokens: stepTotal,
          ...(recTtft > 0 ? { ttftSec: recTtft } : {})
        };
        for (const st of cur.createdSteps) {
          st.tokens = stepTokens;
        }
        tStats.lastRequestReadyMs = stepMs;
      }
    } else if (mType === 'TurnEnd' || mType === 'StepInterrupted') {
      if (cur.textParts.length > 0) {
        const fullText = cur.textParts.join('').trim();
        cur.textParts = [];
        if (fullText) {
          const cleanText = fullText.replace(/\s+/g, ' ').trim();
          results.push({
            id: `${sessionId}-kv1-${lineNum}-reply`,
            stepIndex: lineNum,
            kind: cur.hasToolCall ? 'thinking' : 'reply',
            icon: cur.hasToolCall ? '💭' : '💬',
            category: cur.hasToolCall ? '思考规划' : '完成汇报',
            title: cur.hasToolCall
              ? 'Kimi Code 阶段说明'
              : `Kimi Code 汇报：${cleanText.slice(0, 28)}`,
            humanSummary: cur.hasToolCall
              ? `💭 ${cleanText.slice(0, 95)}`
              : `💬 回复摘要：${cleanText.slice(0, 95)}`,
            rawDetail: fullText.slice(0, 400),
            timestamp: tsStr,
            risk: { level: 'LOW', label: '正常汇报', score: 0 }
          });
        }
      }
      session._kimiTurnReason = mType === 'StepInterrupted' ? 'interrupted' : 'completed';
      session._kimiTurnState = 'IDLE';
      if (stepMs > (Date.parse(session.updatedAt) || 0)) {
        session.updatedAt = tsStr;
      }
    }

    return results;
  }

  parseKimiWireLine(sessionId, rawItem, lineNum) {
    const results = [];
    const session = this.sessions.get(sessionId);
    if (!session || !rawItem || typeof rawItem !== 'object') return results;

    // CLI v1 wire fallback: { timestamp: <sec>, message: { type: "TurnBegin"|..., payload } }
    if (
      !rawItem.type &&
      rawItem.message &&
      typeof rawItem.message === 'object' &&
      !String(rawItem.message.type || '').includes('.')
    ) {
      return this.parseKimiCliV1Line(sessionId, rawItem, lineNum);
    }

    let item = rawItem;
    if (!item.type && item.message && typeof item.message === 'object') {
      const msgPayload =
        item.message.payload && typeof item.message.payload === 'object'
          ? item.message.payload
          : {};
      item = {
        ...msgPayload,
        ...item.message,
        time: item.time ?? item.timestamp
      };
    } else if (item.payload && typeof item.payload === 'object' && !item.event) {
      item = { ...item.payload, ...item };
    }

    // Subagent safety guard: skip embedded subagent records on main session wire
    if (!session.isSubagent && item.agentId && item.agentId !== 'main') {
      return results;
    }

    const rawTime =
      typeof item.time === 'number'
        ? item.time
        : typeof item.timestamp === 'number'
        ? item.timestamp
        : typeof item.metadata?.created_at === 'number'
        ? item.metadata.created_at
        : Date.parse(item.timestamp || '') || Date.now();
    const stepMs = rawTime > 1e9 && rawTime < 1e12 ? Math.round(rawTime * 1000) : rawTime;
    const tsStr = new Date(stepMs || Date.now()).toISOString();
    const tStats = session.tokenStats;

    // 1. Model & environment bind
    if (item.type === 'profile.bind') {
      const alias = String(
        item.model_name || item.modelName || item.modelAlias || item.model_alias || item.model || ''
      ).trim();
      const limitHint = String(item.modelAlias || item.model_alias || alias).trim();
      if (alias) {
        session.rawModelAlias = limitHint || alias;
        session.model = alias.replace(/^kimi-code\//, '');
        if (tStats) {
          tStats.contextWindowLimit = this.resolveKimiContextLimit(
            limitHint || alias,
            session._kimiModelLimits
          );
        }
      }
      const envCwd = item.environmentDisclosure?.cwd || item.cwd;
      if (typeof envCwd === 'string' && envCwd.trim() && !session.cwd) {
        session.cwd = envCwd.trim();
      }
      return results;
    }

    if (item.type === 'llm.request') {
      const reqModel = String(item.model || item.modelAlias || '').trim();
      if (reqModel) {
        session.rawModelAlias = reqModel;
        session.model = reqModel.replace(/^kimi-code\//, '');
        if (tStats) {
          tStats.contextWindowLimit = this.resolveKimiContextLimit(
            reqModel,
            session._kimiModelLimits
          );
        }
      }
      if (tStats && stepMs > 0) {
        tStats.lastRequestReadyMs = stepMs;
        tStats.awaitingFirstToken = true;
      }
      session._kimiTurnState = 'WORKING';
      return results;
    }

    // 2. Authoritative User Prompt (ignore skill_activation / system injection)
    if (item.type === 'turn.prompt') {
      if (item.origin && item.origin.kind && item.origin.kind !== 'user') {
        return results;
      }
      let rawText = item.origin?.clientMetadata?.[0]?.display_text || '';
      if (!rawText && Array.isArray(item.input)) {
        rawText = item.input
          .filter((p) => p && p.type === 'text' && p.text)
          .map((p) => p.text)
          .join('\n');
      } else if (!rawText && typeof item.input === 'string') {
        rawText = item.input;
      } else if (!rawText && typeof item.text === 'string') {
        rawText = item.text;
      }
      const clean = cleanUserContent(rawText);
      session._turnUserStartMs = stepMs;
      session._kimiTurnState = 'WORKING';
      session._kimiTurnReason = '';
      if (tStats && stepMs > 0) {
        tStats.lastRequestReadyMs = stepMs;
        tStats.awaitingFirstToken = true;
      }
      if (clean) {
        session.userGoals = [...(session.userGoals || []), clean].slice(-12);
        if (!session.originTopic && clean.length > 6) {
          session.originTopic = clean;
        }
        results.push({
          id: `${sessionId}-kimi-${lineNum}-user`,
          stepIndex: lineNum,
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
      return results;
    }

    // 3. Authoritative Loop Events (do NOT also parse agent.message.appended / context.append_message / usage.record)
    if (item.type === 'context.append_loop_event') {
      const rawEv = item.event || item.payload?.event || {};
      const evPayload =
        rawEv.payload && typeof rawEv.payload === 'object' ? rawEv.payload : {};
      const ev = {
        ...evPayload,
        ...rawEv,
        type: rawEv.type || rawEv.kind || ''
      };
      if (!session.isSubagent && ev.agentId && ev.agentId !== 'main') {
        return results;
      }
      if (ev.type === 'step.begin') {
        session._curKimiStep = {
          uuid: ev.uuid || '',
          stepNum: ev.step ?? ev.stepNo ?? lineNum,
          textParts: [],
          createdSteps: [],
          hasToolCall: false,
          startMs: stepMs
        };
        session._kimiTurnState = 'WORKING';
        return results;
      }

      if (!session._curKimiStep) {
        session._curKimiStep = {
          uuid: '',
          stepNum: lineNum,
          textParts: [],
          createdSteps: [],
          hasToolCall: false,
          startMs: stepMs
        };
      }
      const cur = session._curKimiStep;

      if (ev.type === 'content.part') {
        const part = ev.part || {};
        if (part.type === 'think' && (part.think || part.thinking)) {
          const thinkText = String(part.think || part.thinking).trim();
          if (thinkText) {
            const summary = summarizeThinking(thinkText);
            const thinkSt = {
              id: `${sessionId}-kimi-${lineNum}-think`,
              stepIndex: lineNum,
              kind: 'thinking',
              icon: '🧠',
              category: '思考规划',
              title: 'Kimi Code 深度思考与推理',
              humanSummary: summary || `🧠 思考摘要：${thinkText.slice(0, 90)}`,
              rawDetail: thinkText.slice(0, 400),
              timestamp: tsStr,
              risk: { level: 'LOW', label: '内部推理', score: 5 }
            };
            results.push(thinkSt);
            cur.createdSteps.push(thinkSt);
          }
        } else if (part.type === 'text' && part.text) {
          cur.textParts.push(String(part.text));
        }
        return results;
      }

      if (ev.type === 'tool.call') {
        cur.hasToolCall = true;
        if (cur.textParts.length > 0) {
          const noteText = cur.textParts.join('').trim();
          cur.textParts = [];
          if (noteText) {
            const cleanNote = noteText.replace(/\s+/g, ' ').trim();
            const noteSt = {
              id: `${sessionId}-kimi-${lineNum}-note`,
              stepIndex: lineNum,
              kind: 'thinking',
              icon: '💭',
              category: '思考规划',
              title: 'Kimi Code 阶段说明',
              humanSummary: `💭 ${cleanNote.slice(0, 95)}`,
              rawDetail: noteText.slice(0, 400),
              timestamp: tsStr,
              risk: { level: 'LOW', label: '内部推理', score: 5 }
            };
            results.push(noteSt);
            cur.createdSteps.push(noteSt);
          }
        }

        const tc = ev.toolCall || ev.tool_call || {};
        const tcFn = tc.function || {};
        const toolName = ev.name || tcFn.name || tc.name || 'Tool';
        let parsedArgs = ev.args ?? tcFn.arguments ?? tc.arguments ?? tc.args ?? {};
        if (typeof parsedArgs === 'string') {
          try {
            parsedArgs = JSON.parse(parsedArgs);
          } catch {
            parsedArgs = { input: parsedArgs };
          }
        }
        const translated = translateToolCall(toolName, parsedArgs);
        const toolSt = {
          id: `${sessionId}-kimi-${lineNum}-tool-${ev.toolCallId || tc.id || 0}`,
          stepIndex: lineNum,
          kind: 'tool',
          toolName,
          toolInput: formatToolInput(parsedArgs),
          ...translated,
          timestamp: tsStr
        };
        const lowerTool = toolName.toLowerCase();
        if (lowerTool === 'askuserquestion' || lowerTool === 'ask_user_question') {
          session._kimiTurnState = 'WAITING_CONFIRM';
        } else {
          session._kimiTurnState = 'WORKING';
        }
        results.push(toolSt);
        cur.createdSteps.push(toolSt);
        return results;
      }

      if (ev.type === 'tool.result') {
        if (tStats && stepMs > 0) {
          tStats.lastRequestReadyMs = stepMs;
        }
        if (session._kimiTurnState === 'WAITING_CONFIRM') {
          session._kimiTurnState = 'WORKING';
        }
        const resObj = ev.result || {};
        if (resObj.isError === true) {
          const rawErr = String(resObj.output || resObj.error || '工具执行返回错误').trim();
          const firstLine = rawErr.split(/\r?\n/)[0] || rawErr;
          results.push({
            id: `${sessionId}-kimi-${lineNum}-err`,
            stepIndex: lineNum,
            kind: 'error',
            icon: '⚠️',
            category: '异常告警',
            title: 'Kimi Code 工具执行返回报错',
            humanSummary: `⚠️ 异常详情：${firstLine.slice(0, 90)}`,
            rawDetail: rawErr.slice(0, 400),
            timestamp: tsStr,
            risk: {
              level: 'MEDIUM',
              label: '执行异常',
              score: 50,
              reason: firstLine.slice(0, 120)
            }
          });
        }
        return results;
      }

      if (ev.type === 'step.end') {
        if (cur.textParts.length > 0) {
          const fullText = cur.textParts.join('').trim();
          cur.textParts = [];
          if (fullText) {
            const cleanText = fullText.replace(/\s+/g, ' ').trim();
            const isFinalReply =
              !cur.hasToolCall &&
              ev.finishReason !== 'tool_use' &&
              ev.finishReason !== 'tool_calls';
            const textSt = isFinalReply
              ? {
                  id: `${sessionId}-kimi-${lineNum}-reply`,
                  stepIndex: lineNum,
                  kind: 'reply',
                  icon: '💬',
                  category: '完成汇报',
                  title: `Kimi Code 汇报：${cleanText.slice(0, 28)}`,
                  humanSummary: `💬 回复摘要：${cleanText.slice(0, 95)}`,
                  rawDetail: fullText.slice(0, 400),
                  timestamp: tsStr,
                  risk: { level: 'LOW', label: '正常汇报', score: 0 }
                }
              : {
                  id: `${sessionId}-kimi-${lineNum}-note`,
                  stepIndex: lineNum,
                  kind: 'thinking',
                  icon: '💭',
                  category: '思考规划',
                  title: 'Kimi Code 阶段说明',
                  humanSummary: `💭 ${cleanText.slice(0, 95)}`,
                  rawDetail: fullText.slice(0, 400),
                  timestamp: tsStr,
                  risk: { level: 'LOW', label: '内部推理', score: 5 }
                };
            results.push(textSt);
            cur.createdSteps.push(textSt);
          }
        }

        const usage = ev.usage || {};
        const inTok = Number(usage.inputOther ?? usage.input_other ?? usage.input_tokens ?? 0);
        const cacheTok =
          Number(usage.inputCacheRead ?? usage.input_cache_read ?? 0) +
          Number(usage.inputCacheCreation ?? usage.input_cache_creation ?? 0);
        const outTok = Number(usage.output ?? usage.output_tokens ?? 0);
        const reasonTok = Number(usage.reasoning ?? usage.reasoning_tokens ?? 0);
        const stepTotal = inTok + cacheTok + outTok;

        if (tStats) {
          let recTtft = 0;
          const nativeTtftMs = Number(ev.llmFirstTokenLatencyMs || 0);
          if (nativeTtftMs > 0) {
            const ttftSec = Math.round((nativeTtftMs / 1000) * 100) / 100;
            recTtft = this.pushTtft(tStats, ttftSec);
          } else if (outTok > 0 && tStats.lastRequestReadyMs > 0 && stepMs > tStats.lastRequestReadyMs) {
            const dtSec = (stepMs - tStats.lastRequestReadyMs) / 1000;
            if (dtSec >= 0.1 && dtSec <= 240) {
              recTtft = this.pushTtft(
                tStats,
                this.computeTurnTtftSec(dtSec, inTok, cacheTok, outTok, 0)
              );
            }
          }

          const nativeStreamMs = Number(ev.llmStreamDurationMs || 0);
          if (outTok > 0 && nativeStreamMs >= 80) {
            this.pushTokenRate(tStats, outTok / (nativeStreamMs / 1000));
          } else if (outTok > 0 && cur.startMs > 0 && stepMs > cur.startMs) {
            const dtSec = (stepMs - cur.startMs) / 1000;
            if (dtSec >= 0.2 && dtSec <= 300) {
              this.pushTokenRate(tStats, outTok / Math.max(0.25, dtSec - recTtft));
            }
          }

          if (stepTotal > 0) {
            tStats.inputTokens += inTok;
            tStats.cachedTokens += cacheTok;
            tStats.outputTokens += outTok;
            tStats.reasoningTokens += reasonTok;
            tStats.totalTokens = tStats.inputTokens + tStats.cachedTokens + tStats.outputTokens;
            const totalPrompt = tStats.inputTokens + tStats.cachedTokens;
            tStats.cacheHitRate =
              totalPrompt > 0 ? Math.round((tStats.cachedTokens / totalPrompt) * 100) : 0;

            tStats.contextUsedTokens = stepTotal;
            if (!tStats.contextWindowLimit) {
              tStats.contextWindowLimit = this.resolveKimiContextLimit(
                session.rawModelAlias || session.model || '',
                session._kimiModelLimits
              );
            }
            if (stepTotal > tStats.contextWindowLimit) {
              tStats.contextWindowLimit = 1048576;
            }
            tStats.contextUsedPercent = Math.min(
              100,
              Math.round((stepTotal / tStats.contextWindowLimit) * 100)
            );

            const stepTokens = {
              inputTokens: inTok,
              cachedTokens: cacheTok,
              outputTokens: outTok,
              totalTokens: stepTotal,
              ...(recTtft > 0 ? { ttftSec: recTtft } : {})
            };
            for (const st of cur.createdSteps) {
              st.tokens = stepTokens;
            }
          }
          tStats.awaitingFirstToken = false;
          tStats.lastRequestReadyMs = stepMs;
        }

        session._curKimiStep = null;
        return results;
      }

      return results;
    }

    // 4. Context window exact calibration & turn completion
    if (item.type === 'token_counting.measured') {
      const measured = Number(item.tokens ?? item.total_tokens ?? item.totalTokens ?? 0);
      if (measured > 0 && tStats) {
        tStats.contextUsedTokens = measured;
        if (!tStats.contextWindowLimit) {
          tStats.contextWindowLimit = this.resolveKimiContextLimit(
            session.rawModelAlias || session.model || '',
            session._kimiModelLimits
          );
        }
        if (measured > tStats.contextWindowLimit) {
          tStats.contextWindowLimit = 1048576;
        }
        tStats.contextUsedPercent = Math.min(
          100,
          Math.round((measured / tStats.contextWindowLimit) * 100)
        );
      }
      return results;
    }

    if (
      item.type === 'turn.ended' ||
      item.type === 'agent.turn.ended' ||
      item.type === 'prompt.completed'
    ) {
      if (session._curKimiStep && session._curKimiStep.textParts.length > 0) {
        const leftover = session._curKimiStep.textParts.join('').trim();
        session._curKimiStep.textParts = [];
        if (leftover) {
          const cleanLeft = leftover.replace(/\s+/g, ' ').trim();
          results.push({
            id: `${sessionId}-kimi-${lineNum}-final`,
            stepIndex: lineNum,
            kind: session._curKimiStep.hasToolCall ? 'thinking' : 'reply',
            icon: session._curKimiStep.hasToolCall ? '💭' : '💬',
            category: session._curKimiStep.hasToolCall ? '思考规划' : '完成汇报',
            title: session._curKimiStep.hasToolCall
              ? 'Kimi Code 阶段说明'
              : `Kimi Code 汇报：${cleanLeft.slice(0, 28)}`,
            humanSummary: session._curKimiStep.hasToolCall
              ? `💭 ${cleanLeft.slice(0, 95)}`
              : `💬 回复摘要：${cleanLeft.slice(0, 95)}`,
            rawDetail: leftover.slice(0, 400),
            timestamp: tsStr,
            risk: { level: 'LOW', label: '正常汇报', score: 0 }
          });
        }
      }
      session._curKimiStep = null;
      const reason = String(item.reason || item.outcome || 'completed').toLowerCase();
      session._kimiTurnReason = reason;
      if (reason === 'error' || reason === 'failed') {
        session._kimiTurnState = 'WARNING';
        if (item.error) {
          const errStr = typeof item.error === 'string' ? item.error : JSON.stringify(item.error);
          results.push({
            id: `${sessionId}-kimi-${lineNum}-turnerr`,
            stepIndex: lineNum,
            kind: 'error',
            icon: '⚠️',
            category: '异常告警',
            title: 'Kimi Code 回合异常终止',
            humanSummary: `⚠️ 异常详情：${errStr.slice(0, 90)}`,
            rawDetail: errStr.slice(0, 400),
            timestamp: tsStr,
            risk: { level: 'MEDIUM', label: '运行异常', score: 50, reason: errStr.slice(0, 120) }
          });
        }
      } else {
        session._kimiTurnState = 'IDLE';
      }
      if (stepMs > (Date.parse(session.updatedAt) || 0)) {
        session.updatedAt = tsStr;
      }
      return results;
    }

    return results;
  }

  resolveRootParentId(sessionId) {
    const start = this.sessions.get(sessionId);
    if (!start || !start.isSubagent) return sessionId;
    let curId = start.parentSessionId || null;
    const visited = new Set([sessionId]);
    for (let hop = 0; hop < 8; hop++) {
      if (!curId || visited.has(curId)) break;
      visited.add(curId);
      const parentSess = this.sessions.get(curId);
      if (!parentSess || !parentSess.isSubagent || !parentSess.parentSessionId) {
        return curId;
      }
      curId = parentSess.parentSessionId;
    }
    return curId;
  }

  getOrphanSubagents() {
    return this.lastOrphanSubagents || [];
  }

  getAllSessions() {
    const valid = Array.from(this.sessions.values()).filter(
      (s) => s.steps.length > 0 && !s.isGuardianSubthread
    );
    valid.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    // Aggregate 5-hour rolling window and today's total tokens per agent type (including subagents)
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
        const inTok = Number(s.tokenStats.inputTokens || 0);
        const cacheTok = Number(s.tokenStats.cachedTokens || 0);
        const outTok = Number(s.tokenStats.outputTokens || 0);
        const costCny = inTok * 1e-6 * 1.0 + cacheTok * 1e-6 * 0.1 + outTok * 1e-6 * 2.0;
        const savedCny = cacheTok * 1e-6 * 0.9;
        s.tokenStats.estimatedCostCny = Number(costCny.toFixed(4));
        s.tokenStats.estimatedCostUsd = Number((costCny / 7.2).toFixed(4));
        s.tokenStats.savedCostCny = Number(savedCny.toFixed(4));
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
        } else if (aType === 'kimi' && this.cachedKimiQuota) {
          s.tokenStats.rateLimits = this.cachedKimiQuota;
        }
      }

      if (s.isSubagent) {
        if (s._subagentKilled) {
          s.status = 'IDLE';
          s.subagentRunState = 'killed';
        } else if (s._parkedOnSwarmWait) {
          s.status = 'IDLE';
          s.subagentRunState = 'waiting';
        } else {
          s.subagentRunState =
            s.status === 'WORKING' || s.status === 'ACTIVE' ? 'working' : 'idle';
        }
        const firstMs = Date.parse(s.steps[0]?.timestamp || '') || 0;
        const lastMs =
          Date.parse(s.updatedAt || s.steps[s.steps.length - 1]?.timestamp || '') || firstMs;
        const endMs =
          s.subagentRunState === 'working' && firstMs > 0
            ? Math.max(lastMs, Math.min(nowMs, lastMs + 300000))
            : lastMs;
        s.durationSec =
          firstMs > 0 && endMs >= firstMs ? Math.max(1, Math.round((endMs - firstMs) / 1000)) : 0;
      }
    }

    const rootMap = new Map();
    const subagentsList = [];
    for (const s of valid) {
      if (s.isSubagent) {
        subagentsList.push(s);
      } else {
        s.subagents = [];
        s.subagentCount = 0;
        s.activeSubagents = 0;
        s.waitingSubagents = 0;
        s._latestTreeMs = Date.parse(s.updatedAt || 0) || 0;
        rootMap.set(s.id, s);
      }
    }

    const orphans = [];
    for (const sub of subagentsList) {
      const rootId = this.resolveRootParentId(sub.id);
      if (rootId && rootMap.has(rootId)) {
        const root = rootMap.get(rootId);
        sub.rootParentSessionId = rootId;
        root.subagents.push(sub);
        const subMs = Date.parse(sub.updatedAt || 0) || 0;
        if (subMs > root._latestTreeMs) {
          root._latestTreeMs = subMs;
        }
      } else if ((Date.parse(sub.updatedAt || 0) || 0) > nowMs - ACTIVE_WINDOW_MS) {
        orphans.push(sub);
      }
    }

    const stateOrder = { working: 0, waiting: 1, idle: 2, killed: 3 };
    for (const root of rootMap.values()) {
      if (root.subagents.length > 0) {
        root.subagents.sort((a, b) => {
          const oa = stateOrder[a.subagentRunState] ?? 2;
          const ob = stateOrder[b.subagentRunState] ?? 2;
          if (oa !== ob) return oa - ob;
          return (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0);
        });
        root.subagentCount = root.subagents.length;
        root.activeSubagents = root.subagents.filter((c) => c.subagentRunState === 'working').length;
        root.waitingSubagents = root.subagents.filter((c) => c.subagentRunState === 'waiting').length;
      }
    }

    orphans.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    this.lastOrphanSubagents = orphans;

    const roots = Array.from(rootMap.values()).sort((a, b) => b._latestTreeMs - a._latestTreeMs);
    const activeRoots = roots.filter((s) => s._latestTreeMs > nowMs - ACTIVE_WINDOW_MS);
    if (activeRoots.length > 0) {
      return activeRoots;
    }
    // Fallback: when no root sessions in last 2 hours, keep latest 2 historical root sessions so screen is never empty
    return roots.slice(0, 2).map((s) => {
      s.isHistoricalFallback = true;
      return s;
    });
  }
}

module.exports = { MultiAgentLogWatcher, createEmptyTokenStats, ACTIVE_WINDOW_MS };
