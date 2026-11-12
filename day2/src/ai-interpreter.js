const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');

function detectCommandBlastRadius(cmd) {
  if (!cmd || typeof cmd !== 'string') return null;
  const c = cmd.trim();

  // 1. Git branch / checkout / commit / destructive
  const gitBranchMatch = c.match(/git\s+(?:checkout|switch)\s+(-b\s+)?([a-zA-Z0-9_\-\.\/]+)/i);
  if (gitBranchMatch) {
    return { badge: `🌿 分支: ${gitBranchMatch[2]}`, level: 'INFO', scope: 'Git' };
  }
  if (/git\s+reset\s+--hard/i.test(c)) {
    return { badge: '💥 强制回退工作区所有未提交', level: 'DANGER', scope: 'Git' };
  }
  if (/git\s+clean\s+-fd/i.test(c)) {
    return { badge: '🗑️ 清理所有未跟踪文件', level: 'DANGER', scope: 'Git' };
  }
  if (/git\s+(commit|push)/i.test(c)) {
    return { badge: '📦 同步代码至版本库', level: 'INFO', scope: 'Git' };
  }

  // 2. Package manager dependencies
  if (/npm\s+(?:i|install|add|uninstall|remove)|yarn\s+(?:add|remove)|pnpm\s+(?:add|remove)/i.test(c)) {
    return { badge: '📁 影响目录: node_modules', level: 'WARN', scope: 'Dependencies' };
  }
  if (/pip\s+install|conda\s+install|poetry\s+add/i.test(c)) {
    return { badge: '🐍 影响 Python 全局/虚拟环境', level: 'WARN', scope: 'Dependencies' };
  }
  if (/cargo\s+(?:add|build)|go\s+(?:get|build)/i.test(c)) {
    return { badge: '⚙️ 产生二进制编译产物与缓存', level: 'INFO', scope: 'Build' };
  }

  // 3. Deletion and filesystem changes
  const rmMatch = c.match(/(?:Remove-Item|rm\s+-rf|del\s+\/[sqf]|rmdir\s+\/s)\s+["']?([^"'\s]+)/i);
  if (rmMatch) {
    const target = path.basename(rmMatch[1].replace(/\\+/g, '/')) || rmMatch[1];
    return { badge: `🗑️ 擦除目录/文件: ${target}`, level: 'DANGER', scope: 'Filesystem' };
  }
  const mkdirMatch = c.match(/(?:mkdir|New-Item\s+-ItemType\s+Directory)\s+["']?([^"'\s]+)/i);
  if (mkdirMatch) {
    const target = path.basename(mkdirMatch[1].replace(/\\+/g, '/')) || mkdirMatch[1];
    return { badge: `📂 创建目录: ${target}`, level: 'INFO', scope: 'Filesystem' };
  }

  // 4. Test and Build Execution
  if (/npm\s+test|pytest|cargo\s+test|go\s+test|jest|vitest/i.test(c)) {
    return { badge: '🧪 执行自动化单测套件', level: 'INFO', scope: 'Test' };
  }
  if (/npm\s+run\s+build|webpack|vite\s+build|tsc\b/i.test(c)) {
    return { badge: '📦 生产环境打包编译', level: 'INFO', scope: 'Build' };
  }

  return null;
}

function detectCrossSessionConflicts(sessions = []) {
  if (!Array.isArray(sessions) || sessions.length < 2) return [];
  const fileToWriters = new Map();

  for (const session of sessions) {
    // Check active or recent sessions
    const ageMs = Date.now() - (Date.parse(session.updatedAt) || 0);
    if (ageMs > 25 * 60 * 1000) continue;

    const touched = session.analysis?.touchedFiles || [];
    for (const f of touched) {
      if (!f.name || f.mode === 'READ') continue;
      const key = (f.fullPath || f.name).toLowerCase();
      const list = fileToWriters.get(key) || [];
      list.push({
        sessionId: session.id,
        agentType: session.agentType,
        agentName: session.agentName || session.agentType,
        projectName: session.analysis?.projectName || '工作区',
        fileName: f.name,
        fullPath: f.fullPath,
        mode: f.mode,
        count: f.count,
        updatedAt: session.updatedAt
      });
      fileToWriters.set(key, list);
    }
  }

  const conflicts = [];
  for (const [key, writers] of fileToWriters.entries()) {
    if (writers.length >= 2) {
      const uniqueSessions = new Set(writers.map((w) => w.sessionId));
      if (uniqueSessions.size >= 2) {
        conflicts.push({
          key,
          fileName: writers[0].fileName,
          fullPath: writers[0].fullPath,
          agents: writers.map((w) => `${w.agentName} (📂 ${w.projectName})`).join(' 与 '),
          writers
        });
      }
    }
  }
  return conflicts;
}

function cleanUserContent(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const match = raw.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i);
  if (match) return match[1].trim();
  if (
    raw.includes('<environment_context>') ||
    raw.includes('<permissions instructions>') ||
    raw.includes('<multi_agent_role>') ||
    raw.includes('<multi_agent_mode>') ||
    raw.includes('<codex_apps_') ||
    raw.includes('<external_codex_apps_') ||
    raw.startsWith('You are judging one planned coding-agent action.') ||
    raw.startsWith('The following is the Codex agent history')
  ) {
    return '';
  }
  return raw
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, '')
    .trim();
}

function cleanArgString(val) {
  if (val === undefined || val === null) return '';
  let s = typeof val === 'string' ? val : JSON.stringify(val);
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      s = JSON.parse(s);
    } catch {
      s = s.slice(1, -1);
    }
  }
  return String(s);
}

function formatToolInput(value) {
  if (value == null || value === '') return '';
  let text;
  try {
    if (typeof value === 'string') {
      try { text = JSON.stringify(JSON.parse(value), null, 2); }
      catch { text = value; }
    } else {
      text = JSON.stringify(value, null, 2);
    }
  } catch {
    text = String(value);
  }
  const limit = 50000;
  return text.length > limit ? text.slice(0, limit) + '\n…（输入过长，已截断）' : text;
}

/**
 * Compute a compact line-by-line diff between oldText and newText (GitHub style)
 */
function computeLineDiff(oldText, newText, maxLines = 56) {
  const oldLines = typeof oldText === 'string' && oldText.length > 0 ? oldText.split(/\r?\n/) : [];
  const newLines = typeof newText === 'string' && newText.length > 0 ? newText.split(/\r?\n/) : [];

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const midOld = oldLines.slice(prefix, oldLines.length - suffix);
  const midNew = newLines.slice(prefix, newLines.length - suffix);

  const rawOps = [];
  if (prefix > 2) {
    rawOps.push({ type: 'meta', text: `@@ 前略 ${prefix - 2} 行未改动代码 @@` });
  }
  const startCtx = Math.max(0, prefix - 2);
  for (let i = startCtx; i < prefix; i++) {
    rawOps.push({ type: 'ctx', text: oldLines[i] });
  }

  let addedCount = 0;
  let removedCount = 0;

  if (midOld.length * midNew.length <= 14400 && (midOld.length > 0 || midNew.length > 0)) {
    const m = midOld.length;
    const n = midNew.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (midOld[i] === midNew[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }
    let i = 0;
    let j = 0;
    let ctxRun = [];
    const flushCtx = () => {
      if (ctxRun.length <= 4) {
        for (const line of ctxRun) rawOps.push({ type: 'ctx', text: line });
      } else {
        rawOps.push({ type: 'ctx', text: ctxRun[0] });
        rawOps.push({ type: 'meta', text: `@@ 省略 ${ctxRun.length - 2} 行未改动上下文 @@` });
        rawOps.push({ type: 'ctx', text: ctxRun[ctxRun.length - 1] });
      }
      ctxRun = [];
    };
    while (i < m || j < n) {
      if (i < m && j < n && midOld[i] === midNew[j]) {
        ctxRun.push(midOld[i]);
        i++;
        j++;
      } else {
        if (ctxRun.length > 0) flushCtx();
        if (j < n && (i === m || dp[i][j + 1] >= dp[i + 1][j])) {
          rawOps.push({ type: 'add', text: midNew[j] });
          addedCount++;
          j++;
        } else {
          rawOps.push({ type: 'del', text: midOld[i] });
          removedCount++;
          i++;
        }
      }
    }
    if (ctxRun.length > 0) flushCtx();
  } else {
    for (const line of midOld) {
      rawOps.push({ type: 'del', text: line });
      removedCount++;
    }
    for (const line of midNew) {
      rawOps.push({ type: 'add', text: line });
      addedCount++;
    }
  }

  const endStart = oldLines.length - suffix;
  const endCtxCount = Math.min(2, suffix);
  for (let i = 0; i < endCtxCount; i++) {
    rawOps.push({ type: 'ctx', text: oldLines[endStart + i] });
  }
  if (suffix > 2) {
    rawOps.push({ type: 'meta', text: `@@ 后略 ${suffix - 2} 行未改动代码 @@` });
  }

  const truncated = rawOps.length > maxLines;
  return {
    addedCount,
    removedCount,
    lines: rawOps.slice(0, maxLines),
    truncated
  };
}

/**
 * Parse Codex apply_patch or unified diff text into structured diff + file list
 */
function parseApplyPatchDiff(patchText, maxLines = 56) {
  if (!patchText || typeof patchText !== 'string') return null;
  const rawLines = patchText.split(/\r?\n/);
  const files = [];
  const diffLines = [];
  let addedCount = 0;
  let removedCount = 0;

  for (const line of rawLines) {
    if (/^\*\*\*\s+(Begin|End)\s+Patch/i.test(line)) continue;
    const fileMatch = line.match(/^\*\*\*\s+(Update|Add|Delete)\s+File:\s*(.+)$/i);
    if (fileMatch) {
      const action = fileMatch[1].toUpperCase();
      const fp = fileMatch[2].trim();
      files.push({
        filePath: fp,
        name: path.basename(fp.replace(/\\+/g, '/')),
        mode: action === 'DELETE' ? 'DELETE' : 'WRITE'
      });
      diffLines.push({ type: 'meta', text: `📄 ${action}: ${fp}` });
      continue;
    }
    if (line.startsWith('@@')) {
      diffLines.push({ type: 'meta', text: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      addedCount++;
      diffLines.push({ type: 'add', text: line.slice(1) });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedCount++;
      diffLines.push({ type: 'del', text: line.slice(1) });
    } else if (line.startsWith(' ')) {
      diffLines.push({ type: 'ctx', text: line.slice(1) });
    }
  }

  if (diffLines.length === 0 && files.length === 0) return null;
  return {
    kind: 'patch',
    files,
    filePath: files[0]?.filePath || '',
    addedCount,
    removedCount,
    lines: diffLines.slice(0, maxLines),
    truncated: diffLines.length > maxLines
  };
}

/**
 * Extract structured Red/Green Mini Diff from tool call arguments
 */
function extractStepDiff(toolName, rawArgs = {}) {
  const lower = (toolName || '').trim().toLowerCase();
  let args = rawArgs;
  if (typeof rawArgs === 'string') {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      args = { input: rawArgs };
    }
  }
  args = args || {};

  if (lower === 'apply_patch') {
    const patchStr = cleanArgString(args.input || args.patch || args.cmd || rawArgs || '');
    return parseApplyPatchDiff(patchStr);
  }

  const editList = Array.isArray(args.edits)
    ? args.edits
    : Array.isArray(args.edit)
    ? args.edit
    : null;
  if (
    (lower === 'multiedit' || lower === 'strreplacefile' || lower === 'str_replace_file') &&
    editList
  ) {
    const filePath = cleanArgString(args.file_path || args.Path || args.path || '');
    let totalAdded = 0;
    let totalRemoved = 0;
    const allLines = [];
    for (let idx = 0; idx < editList.length; idx++) {
      const ed = editList[idx] || {};
      const oldPart =
        typeof ed.old_string === 'string'
          ? ed.old_string
          : typeof ed.old === 'string'
          ? ed.old
          : typeof ed.old_str === 'string'
          ? ed.old_str
          : '';
      const newPart =
        typeof ed.new_string === 'string'
          ? ed.new_string
          : typeof ed.new === 'string'
          ? ed.new
          : typeof ed.new_str === 'string'
          ? ed.new_str
          : '';
      const sub = computeLineDiff(oldPart, newPart, 28);
      totalAdded += sub.addedCount;
      totalRemoved += sub.removedCount;
      if (editList.length > 1) {
        allLines.push({ type: 'meta', text: `@@ 变更块 #${idx + 1} @@` });
      }
      allLines.push(...sub.lines);
    }
    if (allLines.length === 0) return null;
    return {
      kind: 'edit',
      filePath,
      addedCount: totalAdded,
      removedCount: totalRemoved,
      lines: allLines.slice(0, 56),
      truncated: allLines.length > 56
    };
  }

  if (
    lower === 'edit_file' ||
    lower === 'str_replace' ||
    lower === 'strreplace' ||
    lower === 'strreplacefile' ||
    lower === 'str_replace_file' ||
    lower === 'edit'
  ) {
    const filePath = cleanArgString(args.Path || args.file_path || args.path || '');
    const nestedEdit =
      args.edit && typeof args.edit === 'object' && !Array.isArray(args.edit) ? args.edit : null;
    const oldStr =
      typeof args.Target === 'string'
        ? args.Target
        : typeof args.old_string === 'string'
        ? args.old_string
        : typeof args.old_str === 'string'
        ? args.old_str
        : typeof args.old === 'string'
        ? args.old
        : nestedEdit && typeof nestedEdit.old === 'string'
        ? nestedEdit.old
        : nestedEdit && typeof nestedEdit.old_string === 'string'
        ? nestedEdit.old_string
        : '';
    const newStr =
      typeof args.Replacement === 'string'
        ? args.Replacement
        : typeof args.new_string === 'string'
        ? args.new_string
        : typeof args.new_str === 'string'
        ? args.new_str
        : typeof args.new === 'string'
        ? args.new
        : nestedEdit && typeof nestedEdit.new === 'string'
        ? nestedEdit.new
        : nestedEdit && typeof nestedEdit.new_string === 'string'
        ? nestedEdit.new_string
        : '';

    if (!oldStr && !newStr) return null;
    const computed = computeLineDiff(oldStr, newStr);
    return {
      kind: 'edit',
      filePath,
      ...computed
    };
  }

  if (
    lower === 'write_file' ||
    lower === 'create_file' ||
    lower === 'write' ||
    lower === 'writefile'
  ) {
    const filePath = cleanArgString(args.Path || args.file_path || args.path || '');
    const content =
      typeof args.Content === 'string'
        ? args.Content
        : typeof args.content === 'string'
        ? args.content
        : typeof args.file_text === 'string'
        ? args.file_text
        : '';
    if (!content) return null;
    const allLines = content.replace(/\r?\n$/, '').split(/\r?\n/);
    const maxPreview = 36;
    return {
      kind: 'write',
      filePath,
      addedCount: allLines.length,
      removedCount: 0,
      lines: allLines.slice(0, maxPreview).map((l) => ({ type: 'add', text: l })),
      truncated: allLines.length > maxPreview
    };
  }

  return null;
}

/**
 * Filter out trivial 1-word replies ("1", "继续", "现在呢") when picking a session's main topic title
 */
function isTrivialPrompt(text) {
  const t = (text || '').trim();
  return !t || /^(1|2|ok|yes|好|好的|继续|现在呢|再来|行|可以|嗯)[。！!？?\s]*$/i.test(t);
}

function summarizeTopicTitle(rawPrompt) {
  const clean = (rawPrompt || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '未命名会话任务';
  return clean.length > 18 ? clean.slice(0, 18) + '…' : clean;
}

function assessRisk(toolName, args = {}, rawText = '') {
  const name = (toolName || '').toLowerCase();
  const cmd = cleanArgString(
    args.CommandLine || args.command || args.cmd || args.input || rawText || ''
  );
  const targetPath = cleanArgString(args.Path || args.file_path || args.path || '');
  const combined = `${name} ${cmd} ${targetPath}`;

  const criticalPatterns = [
    {
      regex: /(\brm\s+-rf\b|\bRemove-Item\b[\s\S]*?(-Recurse|-Force)|\bdel\s+\/[sqf]|\brmdir\s+\/s|\bFormat-Volume|\bClear-Content)/i,
      reason: '递归/强制删除或清空目录，可能导致数据永久丢失',
      advice: '请核对路径后再决定是否放行'
    },
    {
      regex: /(\bDROP\s+TABLE\b|\bDROP\s+DATABASE\b|\bTRUNCATE\s+TABLE\b)/i,
      reason: '检测到销毁数据库表结构的高危 SQL 指令',
      advice: '建议立即拦截'
    },
    {
      regex: /(\bgit\s+reset\s+--hard\b|\bgit\s+push\s+(--force|-f)\b|\bgit\s+clean\s+-fd)/i,
      reason: '强制重置或覆盖 Git 代码历史，可能丢失未提交代码',
      advice: '请确认代码已备份'
    }
  ];

  for (const item of criticalPatterns) {
    if (item.regex.test(combined)) {
      return {
        level: 'CRITICAL',
        label: '高危阻断',
        score: 95,
        reason: item.reason,
        advice: item.advice
      };
    }
  }

  const highPatterns = [
    {
      regex: /(\bRemove-Item\b|\brm\s+|\bdel\s+|\bStop-Process\b|\btaskkill\b)/i,
      reason: '正在删除文件或强制终止系统进程',
      advice: '确认目标无误后放行'
    },
    {
      regex: /(\.env\b|id_rsa|auth\.json|credentials|secret)/i,
      reason: '正在触碰密钥或敏感凭证文件',
      advice: '注意私密信息安全'
    }
  ];

  for (const item of highPatterns) {
    if (item.regex.test(combined)) {
      return {
        level: 'HIGH',
        label: '敏感操作',
        score: 75,
        reason: item.reason,
        advice: item.advice
      };
    }
  }

  if (name.includes('write') || name.includes('edit') || name.includes('replace')) {
    return {
      level: 'LOW',
      label: '修改代码',
      score: 22,
      reason: '正在对项目文件进行编码写入',
      advice: '正常编码操作'
    };
  }

  if (
    name.includes('run_command') ||
    name.includes('exec') ||
    name.includes('bash') ||
    name.includes('shell')
  ) {
    return {
      level: 'LOW',
      label: '终端执行',
      score: 28,
      reason: '正在运行本地终端构建或探查指令',
      advice: '常规命令调用'
    };
  }

  return {
    level: 'LOW',
    label: '安全只读',
    score: 6,
    reason: '仅读取分析，无系统改动副作用',
    advice: '安全'
  };
}

function translateToolCall(toolName, rawArgs = {}) {
  const name = (toolName || '').trim();
  const lower = name.toLowerCase();
  const args = typeof rawArgs === 'string' ? { input: rawArgs } : rawArgs || {};

  if (
    lower === 'read_file' ||
    lower === 'view_file' ||
    lower === 'read' ||
    lower === 'readfile' ||
    lower === 'readmediafile' ||
    lower === 'read_media_file'
  ) {
    const filePath = cleanArgString(args.Path || args.file_path || args.path || '');
    const base = filePath ? path.basename(filePath.replace(/\\+/g, '/')) : '未知文件';
    const isMedia = lower === 'readmediafile' || lower === 'read_media_file';
    return {
      icon: isMedia ? '🖼️' : '📖',
      actionType: 'READ',
      targetFile: base,
      filePath,
      workspaceHint: extractWorkspaceFromPath(filePath),
      category: isMedia ? '读取媒体' : '读取文件',
      title: isMedia ? `查看媒体 ${base}` : `查阅 ${base}`,
      humanSummary: isMedia
        ? `正在解析媒体资源「${base}」内容`
        : `正在阅读「${base}」的代码结构与配置细节`,
      rawDetail: filePath,
      risk: assessRisk(name, args)
    };
  }

  if (
    lower === 'write_file' ||
    lower === 'create_file' ||
    lower === 'write' ||
    lower === 'writefile'
  ) {
    const filePath = cleanArgString(args.Path || args.file_path || args.path || '');
    const base = filePath ? path.basename(filePath.replace(/\\+/g, '/')) : '新文件';
    const diff = extractStepDiff(name, rawArgs);
    return {
      icon: '✨',
      actionType: 'WRITE',
      targetFile: base,
      filePath,
      diff,
      workspaceHint: extractWorkspaceFromPath(filePath),
      category: '编写代码',
      title: `写入 ${base}`,
      humanSummary: `正在编写并保存「${base}」的完整代码实现`,
      rawDetail: filePath,
      risk: assessRisk(name, args)
    };
  }

  if (
    lower === 'edit_file' ||
    lower === 'edit' ||
    lower === 'multiedit' ||
    lower === 'str_replace' ||
    lower === 'strreplace' ||
    lower === 'strreplacefile' ||
    lower === 'str_replace_file' ||
    lower === 'apply_patch'
  ) {
    const diff = extractStepDiff(name, rawArgs);
    let filePath = cleanArgString(args.Path || args.file_path || args.path || '');
    let touchedFileList = null;

    if (!filePath && diff?.filePath) {
      filePath = diff.filePath;
    }
    if (Array.isArray(diff?.files) && diff.files.length > 0) {
      touchedFileList = diff.files;
    }

    const base = filePath ? path.basename(filePath.replace(/\\+/g, '/')) : '源码文件';
    const extraCount = touchedFileList && touchedFileList.length > 1 ? ` 等 ${touchedFileList.length} 个文件` : '';
    return {
      icon: '🔧',
      actionType: 'WRITE',
      targetFile: base,
      filePath,
      touchedFileList,
      diff,
      workspaceHint: extractWorkspaceFromPath(filePath),
      category: '修改代码',
      title: `修改 ${base}${extraCount}`,
      humanSummary: `正在调整「${base}${extraCount}」中的核心逻辑代码`,
      rawDetail: filePath || cleanArgString(args.input || '').slice(0, 240),
      risk: assessRisk(name, args)
    };
  }

  if (lower === 'glob' || lower === 'grep' || lower === 'ls') {
    const pattern = cleanArgString(args.pattern || args.query || args.path || '');
    const dirPath = cleanArgString(args.path || '');
    const base = pattern || (dirPath ? path.basename(dirPath.replace(/\\+/g, '/')) : '代码库');
    return {
      icon: '🔍',
      actionType: 'READ',
      targetFile: '本地文件系统',
      filePath: dirPath,
      workspaceHint: extractWorkspaceFromPath(dirPath),
      category: '检索代码',
      title: `检索 ${base.slice(0, 22)}`,
      humanSummary: `正在代码库中搜索定位「${base.slice(0, 32)}」相关文件与符号`,
      rawDetail: `${pattern} ${dirPath}`.trim(),
      risk: assessRisk(name, args)
    };
  }

  if (
    lower === 'askuserquestion' ||
    lower === 'ask_user_question' ||
    lower === 'ask_question'
  ) {
    const q = cleanArgString(
      args.question || (Array.isArray(args.questions) && args.questions[0]?.question) || args.prompt || ''
    );
    return {
      icon: '❓',
      actionType: 'EXPLORE',
      targetFile: name,
      category: '等待确认',
      title: q ? `询问: ${q.slice(0, 20)}` : '等待用户确认',
      humanSummary: q ? `⏳ 正在等待用户确认：「${q.slice(0, 36)}」` : '⏳ 正在等待用户确认选项',
      rawDetail: q || cleanArgString(args).slice(0, 180),
      risk: assessRisk(name, args)
    };
  }

  if (lower === 'skill') {
    const skillName = cleanArgString(args.skill || args.name || args.skill_name || '');
    return {
      icon: '🧩',
      actionType: 'EXPLORE',
      targetFile: name,
      category: '技能加载',
      title: skillName ? `加载技能: ${skillName.slice(0, 18)}` : '加载专属技能',
      humanSummary: skillName ? `正在启用技能模块「${skillName.slice(0, 30)}」` : '正在加载技能工作流指令',
      rawDetail: skillName || cleanArgString(args).slice(0, 160),
      risk: assessRisk(name, args)
    };
  }

  if (
    lower === 'swarm' ||
    lower === 'invoke_subagent' ||
    lower === 'define_subagent' ||
    lower === 'post_message' ||
    lower === 'read_board' ||
    lower === 'swarm_wait'
  ) {
    if (lower === 'swarm_wait') {
      return {
        icon: '💤',
        actionType: 'EXPLORE',
        targetFile: 'Swarm 看板',
        category: '看板待命',
        title: '看板休眠待命',
        humanSummary: '💤 已挂起并监听看板唤醒消息',
        rawDetail: cleanArgString(args).slice(0, 160),
        risk: assessRisk(name, args)
      };
    }
    if (lower === 'post_message') {
      const msgTxt = cleanArgString(args.text || args.message || '').replace(/\s+/g, ' ');
      return {
        icon: '📨',
        actionType: 'EXPLORE',
        targetFile: 'Swarm 看板',
        category: '协同汇报',
        title: msgTxt ? `发帖: ${msgTxt.slice(0, 20)}` : '看板汇报结果',
        humanSummary: msgTxt ? `📨 向协同看板发送汇报：${msgTxt.slice(0, 40)}` : '📨 向协同看板同步当前进展',
        rawDetail: msgTxt.slice(0, 240),
        risk: assessRisk(name, args)
      };
    }
    if (lower === 'read_board') {
      return {
        icon: '📋',
        actionType: 'READ',
        targetFile: 'Swarm 看板',
        category: '协同同步',
        title: '读取协同看板动态',
        humanSummary: '📋 正在读取子代理协同看板最新消息',
        rawDetail: cleanArgString(args).slice(0, 160),
        risk: assessRisk(name, args)
      };
    }
    const targetWorker = cleanArgString(args.name || args.subagent_name || args.agent_name || '');
    const actionLabel = cleanArgString(args.action || (lower === 'invoke_subagent' ? 'invoke' : 'define'));
    const briefTxt = cleanArgString(args.brief || args.prompt || args.title || '').replace(/\s+/g, ' ');
    return {
      icon: '🐝',
      actionType: 'EXPLORE',
      targetFile: targetWorker ? `@${targetWorker}` : 'Swarm 编排',
      category: '子智能体调度',
      title: targetWorker
        ? `子代理 @${targetWorker} (${actionLabel || '调度'})`
        : `Swarm 协同 (${actionLabel || name})`,
      humanSummary: targetWorker
        ? `🐝 正在调度子代理 @${targetWorker}${briefTxt ? `：${briefTxt.slice(0, 30)}` : ''}`
        : `🐝 正在编排多智能体协同动作 (${actionLabel || name})`,
      rawDetail: briefTxt || cleanArgString(args).slice(0, 200),
      risk: assessRisk(name, args)
    };
  }

  if (
    lower === 'todowrite' ||
    lower === 'todolist' ||
    lower === 'todo_list' ||
    lower === 'creategoal' ||
    lower === 'create_goal' ||
    lower === 'updategoal' ||
    lower === 'update_goal' ||
    lower === 'enterplanmode' ||
    lower === 'enter_plan_mode' ||
    lower === 'exitplanmode' ||
    lower === 'exit_plan_mode' ||
    lower === 'task' ||
    lower === 'subagent' ||
    lower === 'agentswarm' ||
    lower === 'agent_swarm'
  ) {
    let desc = cleanArgString(args.description || args.title || args.goal || args.prompt || '');
    if (!desc && Array.isArray(args.todos) && args.todos.length > 0) {
      const activeTodo =
        args.todos.find((t) => t && (t.status === 'in_progress' || t.status === 'doing')) ||
        args.todos[0];
      desc = cleanArgString(activeTodo?.title || activeTodo?.content || `共 ${args.todos.length} 项待办`);
    }
    if (!desc && lower.includes('planmode')) {
      desc = lower.includes('enter') ? '进入方案规划模式' : '完成方案规划准备执行';
    }
    const isSwarm = lower === 'task' || lower === 'subagent' || lower === 'agentswarm' || lower === 'agent_swarm';
    return {
      icon: isSwarm ? '🐝' : '📋',
      actionType: 'EXPLORE',
      targetFile: name,
      category: isSwarm ? '子智能体调度' : '任务规划',
      title: desc ? `${isSwarm ? '调度' : '规划'}: ${desc.slice(0, 22)}` : `更新任务清单 (${name})`,
      humanSummary: desc
        ? `正在${isSwarm ? '拆解并调度子智能体' : '更新任务进度清单'}：「${desc.slice(0, 38)}」`
        : `正在更新会话任务进度清单`,
      rawDetail: desc || cleanArgString(args).slice(0, 180),
      risk: assessRisk(name, args)
    };
  }

  if (
    lower === 'search_web' ||
    lower === 'web_search' ||
    lower === 'websearch' ||
    lower === 'webfetch' ||
    lower === 'fetchurl' ||
    lower === 'fetch_url'
  ) {
    const query = cleanArgString(args.query || args.q || args.url || '');
    return {
      icon: '🌐',
      actionType: 'SEARCH',
      targetFile: 'Web 搜索',
      category: '联网检索',
      title: `检索: ${query.slice(0, 22)}`,
      humanSummary: `正在联网检索「${query.slice(0, 32)}」相关技术资料`,
      rawDetail: query,
      risk: assessRisk(name, args)
    };
  }

  if (
    lower === 'run_command' ||
    lower === 'exec' ||
    lower === 'exec_command' ||
    lower === 'bash' ||
    lower === 'shell'
  ) {
    let cmd = cleanArgString(
      args.CommandLine || args.command || args.cmd || args.input || ''
    );
    const codexMatch = cmd.match(/cmd\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (codexMatch) {
      try {
        cmd = JSON.parse(`"${codexMatch[1]}"`);
      } catch {
        cmd = codexMatch[1];
      }
    }
    const summaryHint = cleanArgString(args.toolSummary || args.description || '');
    const cwdHint = cleanArgString(args.cwd || '');
    const risk = assessRisk(name, { CommandLine: cmd });

    let humanSummary = `正在终端执行：${summaryHint || cmd.slice(0, 42)}`;
    let actionType = 'VERIFY';
    let targetFile = 'Terminal';

    if (/Remove-Item|\brm\b|\bdel\b/i.test(cmd)) {
      humanSummary = `⚠️ 正在请求删除本地文件或清空目录`;
      actionType = 'DELETE';
      targetFile = '目录清理';
    } else if (/git\s+(init|add|commit|push|remote)/i.test(cmd)) {
      humanSummary = `📦 正在执行 Git 版本提交与远程仓库同步`;
      actionType = 'VERIFY';
      targetFile = 'Git 仓库';
    } else if (/npm\s+start|electron\b/i.test(cmd)) {
      humanSummary = `🚀 正在启动桌面悬浮舱应用程序`;
      actionType = 'VERIFY';
      targetFile = 'Electron App';
    } else if (/npm\s+install/i.test(cmd)) {
      humanSummary = `📦 正在下载并安装项目依赖环境`;
      actionType = 'CODING';
      targetFile = 'node_modules';
    } else if (/Get-ChildItem|Get-Content|Test-Path|\bls\b/i.test(cmd)) {
      humanSummary = `🔍 正在扫描本地目录结构与会话日志文件`;
      actionType = 'READ';
      targetFile = '本地文件系统';
    } else if (/Invoke-RestMethod|node\s+-e/i.test(cmd)) {
      humanSummary = `🧪 正在运行自检脚本验证服务状态`;
      actionType = 'VERIFY';
      targetFile = 'API 自检';
    }

    const blastRadius = detectCommandBlastRadius(cmd);
    return {
      icon: risk.score >= 70 ? '🚨' : '⚡',
      actionType,
      targetFile,
      workspaceHint: extractWorkspaceFromPath(cwdHint) || extractWorkspaceFromPath(cmd),
      category: '终端指令',
      title: summaryHint || cmd.slice(0, 26),
      humanSummary,
      rawDetail: cmd,
      blastRadius,
      risk
    };
  }

  return {
    icon: '🛸',
    actionType: 'EXPLORE',
    targetFile: name,
    category: '系统工具',
    title: name,
    humanSummary: `正在调用系统工具 ${name} 推进任务`,
    rawDetail: cleanArgString(args).slice(0, 160),
    risk: assessRisk(name, args)
  };
}

const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  '.agents',
  '.cursor'
];

function extractWorkspaceFromPath(str) {
  if (!str || typeof str !== 'string') return '';
  const norm = str.replace(/\\+/g, '/');

  // Ignore internal agent telemetry/config paths
  if (/\/(\.gemini|\.codex|\.claude|\.kimi-code|\.kimi|\.kimi-work|\.kimi-webbridge|\.ypod|AppData\/Local\/Temp)\//i.test(norm)) {
    return '';
  }

  // Extract first absolute path candidate (Windows drive or POSIX /Users, /home, /workspace, etc.)
  const winMatch = norm.match(/([a-zA-Z]:\/[^"'<>|?*\r\n\s]+)/);
  const posixMatch = !winMatch && norm.match(/(\/(?:Users|home|workspace|workspaces|projects|repos|var|opt|srv)\/[^"'<>|?*\r\n\s]+)/);
  const candidate = (winMatch ? winMatch[1] : posixMatch ? posixMatch[1] : '').replace(/[,:;)]+$/, '');
  if (!candidate) return '';

  // 1. Try walking up on disk to find a real project root (.git, package.json, etc.)
  try {
    const homeNorm = os.homedir().replace(/\\+/g, '/').toLowerCase();
    let curr = candidate;
    try {
      if (fs.existsSync(curr) && fs.statSync(curr).isFile()) {
        curr = path.dirname(curr);
      }
    } catch {
      curr = path.dirname(curr);
    }

    for (let depth = 0; depth < 6; depth++) {
      const currNorm = curr.replace(/\\+/g, '/').replace(/\/+$/, '');
      if (!currNorm || /^[a-zA-Z]:$/.test(currNorm) || currNorm.toLowerCase() === homeNorm) {
        break;
      }
      for (const marker of PROJECT_MARKERS) {
        if (fs.existsSync(path.join(curr, marker))) {
          return currNorm;
        }
      }
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
  } catch {}

  // 2. Fallback heuristic for non-existent/synthetic paths across any machine
  const parts = candidate.split('/').filter(Boolean);
  // e.g. C:/Users/alice/projects/my-app/src/index.js -> C:/Users/alice/projects/my-app
  if (/^[a-zA-Z]:$/.test(parts[0])) {
    if (parts[1]?.toLowerCase() === 'users' && parts.length >= 5) {
      return parts.slice(0, 5).join('/');
    }
    if (parts.length >= 3) {
      return parts.slice(0, 3).join('/');
    }
    if (parts.length === 2) {
      return parts.slice(0, 2).join('/');
    }
  } else if ( (parts[0] === 'Users' || parts[0] === 'home') && parts.length >= 4) {
    return '/' + parts.slice(0, 4).join('/');
  } else if (parts.length >= 3) {
    return '/' + parts.slice(0, 3).join('/');
  }
  return '';
}

function summarizeThinking(thinkingText) {
  if (!thinkingText || typeof thinkingText !== 'string') return '';
  const clean = thinkingText.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return `🧠 正在内部推演下一步方案与代码架构...`;
}

function analyzeSessionTrajectory(session) {
  const steps = session.steps || [];
  const userSteps = steps.filter((s) => s.kind === 'user');

  // Find meaningful user prompts (skip "1", "继续", etc.)
  const meaningfulPrompts = (session.userGoals || userSteps.map((s) => s.rawDetail || ''))
    .filter((txt) => !isTrivialPrompt(txt));

  const latestMeaningfulGoal =
    meaningfulPrompts[meaningfulPrompts.length - 1] ||
    userSteps[userSteps.length - 1]?.rawDetail ||
    session.originTopic ||
    session.sessionTitle ||
    '等待用户指令';

  const topicTitle = summarizeTopicTitle(latestMeaningfulGoal);

  // Detect workspace project folder name
  let workspacePath = session.cwd || '';
  if (!workspacePath) {
    for (const s of steps) {
      if (s.workspaceHint) {
        workspacePath = s.workspaceHint;
        break;
      }
    }
  }
  const projectName = workspacePath
    ? path.basename(workspacePath.replace(/\\+/g, '/'))
    : session.agentType === 'agy'
    ? '当前工作区'
    : '默认目录';

  const recentSteps = steps.slice(-12);
  const lastStep = recentSteps[recentSteps.length - 1];
  const toolSteps = recentSteps.filter((s) => s.kind === 'tool');
  const errorSteps = recentSteps.filter((s) => s.kind === 'error');

  // 1. Build File Blast-Radius Map (with resolved fullPath & latest step reference)
  const resolveFileFullPath = (rawP) => {
    const p = (rawP || '').trim();
    if (!p) return '';
    if (path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p)) return p;
    if (workspacePath && (path.isAbsolute(workspacePath) || /^[a-zA-Z]:[\\/]/.test(workspacePath))) {
      return path.resolve(workspacePath, p);
    }
    return p;
  };

  const ignoredTargets = new Set([
    '未知文件',
    '新文件',
    '源码文件',
    'Terminal',
    'Web 搜索',
    '本地文件系统',
    'API 自检',
    'Git 仓库',
    'Electron App',
    'node_modules',
    '目录清理'
  ]);

  const fileMap = new Map();
  const recordFileTouch = (fileName, rawFilePath, modeHint, stepObj) => {
    if (!fileName || ignoredTargets.has(fileName)) return;
    const prev = fileMap.get(fileName) || {
      name: fileName,
      fullPath: '',
      mode: 'READ',
      count: 0,
      lastStepId: null,
      hasDiff: false
    };
    prev.count += 1;
    const candidatePath = resolveFileFullPath(rawFilePath);
    if (candidatePath) prev.fullPath = candidatePath;
    if (stepObj?.id) prev.lastStepId = stepObj.id;
    if (stepObj?.diff) prev.hasDiff = true;

    if (modeHint === 'DELETE' || (stepObj?.risk && stepObj.risk.score >= 70)) {
      prev.mode = 'DELETE';
    } else if (modeHint === 'WRITE' && prev.mode !== 'DELETE') {
      prev.mode = 'WRITE';
    }
    fileMap.set(fileName, prev);
  };

  for (const s of steps.slice(-25)) {
    if (Array.isArray(s.touchedFileList) && s.touchedFileList.length > 0) {
      for (const f of s.touchedFileList) {
        recordFileTouch(f.name, f.filePath, f.mode || s.actionType, s);
      }
    } else if (s.targetFile && s.actionType !== 'EXPLORE' && s.actionType !== 'SEARCH') {
      const candidateRaw =
        s.filePath ||
        (s.actionType === 'READ' || s.actionType === 'WRITE' ? s.rawDetail : '');
      recordFileTouch(s.targetFile, candidateRaw, s.actionType, s);
    }
  }
  const touchedFiles = Array.from(fileMap.values()).slice(-8);

  // 2. Detect Loop
  let loopAlert = null;
  let loopCount = 1;
  if (toolSteps.length >= 3) {
    const lastTitle = toolSteps[toolSteps.length - 1].title;
    let streak = 0;
    for (let i = toolSteps.length - 1; i >= 0; i--) {
      if (toolSteps[i].title === lastTitle) streak++;
      else break;
    }
    loopCount = streak;
    if (streak >= 4) {
      loopAlert = {
        isLooping: true,
        message: `连续 ${streak} 次重复「${lastTitle}」，疑似陷入死循环`
      };
    }
  }
  if (!loopAlert && errorSteps.length >= 2) {
    loopAlert = {
      isLooping: true,
      message: `近期连续出现 ${errorSteps.length} 次执行报错，推进受阻`
    };
  }

  // 3. Determine 5-Stage Pipeline Index & Orb State
  let stageIndex = 1;
  let stageName = '探查代码中';
  let orbState = 'EXPLORING';
  let liveBroadcast = '正在扫描项目上下文与相关文件...';

  if (lastStep) {
    if (session._subagentKilled) {
      stageIndex = 4;
      stageName = '子代理已结束';
      orbState = 'IDLE';
      liveBroadcast = `子代理 @${session.subagentRole || 'worker'} 已完成退出`;
    } else if (session._parkedOnSwarmWait) {
      stageIndex = 4;
      stageName = '看板待命中';
      orbState = 'IDLE';
      liveBroadcast = `子代理 @${session.subagentRole || 'worker'} 已汇报并在看板休眠待命`;
    } else if (session._kimiTurnState === 'IDLE') {
      stageIndex = 4;
      stageName = session._kimiTurnReason === 'interrupted' ? '回合已中断' : '回合已交付';
      orbState = 'IDLE';
      liveBroadcast =
        session._kimiTurnReason === 'interrupted'
          ? `「${topicTitle}」已中断待命，等待新指令`
          : `已完成「${topicTitle}」当前回合，等待新指令`;
    } else if (
      session._kimiTurnState === 'WAITING_CONFIRM' ||
      lastStep.category === '等待确认'
    ) {
      stageIndex = 2;
      stageName = '等待确认中';
      orbState = 'THINKING';
      liveBroadcast = lastStep.humanSummary || `⏳ 等待用户确认「${topicTitle}」下一步操作`;
    } else if (lastStep.kind === 'user') {
      stageIndex = 0;
      stageName = '解析需求';
      orbState = 'THINKING';
      liveBroadcast = `收到指令：「${latestMeaningfulGoal.slice(0, 26)}」`;
    } else if (lastStep.kind === 'reply') {
      stageIndex = 4;
      stageName = '回合已交付';
      orbState = 'IDLE';
      liveBroadcast = `已完成「${topicTitle}」当前回合，等待新指令`;
    } else if (lastStep.risk && lastStep.risk.score >= 70) {
      stageIndex = 2;
      stageName = '高危待审';
      orbState = 'DANGER';
      liveBroadcast = `🚨 警报：${lastStep.humanSummary}`;
    } else if (loopAlert?.isLooping) {
      stageIndex = 2;
      stageName = '异常循环';
      orbState = 'LOOP_WARN';
      liveBroadcast = `⚠️ ${loopAlert.message}`;
    } else if (lastStep.actionType === 'WRITE') {
      stageIndex = 2;
      stageName = '动刀编码中';
      orbState = 'CODING';
      liveBroadcast = lastStep.humanSummary;
    } else if (lastStep.actionType === 'VERIFY') {
      stageIndex = 3;
      stageName = '验证运行中';
      orbState = 'VERIFYING';
      liveBroadcast = lastStep.humanSummary;
    } else if (lastStep.kind === 'thinking') {
      stageIndex = Math.max(1, stageIndex);
      stageName = '深度推演中';
      orbState = 'THINKING';
      liveBroadcast = lastStep.humanSummary;
    } else {
      stageIndex = 1;
      stageName = '探查检索中';
      orbState = 'EXPLORING';
      liveBroadcast = lastStep.humanSummary;
    }
  }

  if (session.aiLiveBroadcast && session.aiBroadcastStepCount === steps.length) {
    liveBroadcast = session.aiLiveBroadcast;
  }

  let maxRisk = { level: 'LOW', label: '安全平稳', score: 8, reason: '无高危副作用' };
  for (const s of recentSteps.slice(-4)) {
    if (s.risk && s.risk.score > maxRisk.score) {
      maxRisk = s.risk;
    }
  }

  const assessment = session.aiGoalAssessment;
  const assessmentCurrent = assessment && assessment.revision === session.activityRevision;

  // Step Token Breakdown Metrics + Important Event Steps Collection
  let maxStepTokens = 0;
  let maxStepTitle = '';
  let sumStepTokens = 0;
  let stepsWithTokens = 0;
  const importantEvents = [];

  for (let idx = 0; idx < steps.length; idx++) {
    const st = steps[idx];
    if (st.tokens && st.tokens.totalTokens > 0) {
      stepsWithTokens++;
      sumStepTokens += st.tokens.totalTokens;
      if (st.tokens.totalTokens > maxStepTokens) {
        maxStepTokens = st.tokens.totalTokens;
        maxStepTitle = st.humanSummary || st.title || st.toolName || '步骤';
      }
    }

    // Preserve AI-marked importance or compute local heuristic milestone importance
    if (!st.aiImportant) {
      if (st.risk && st.risk.score >= 70) {
        st.aiImportant = {
          tag: '高危动作',
          level: 'critical',
          reason: st.risk.reason || '涉及敏感或破坏性系统操作',
          source: 'RULE'
        };
      } else if (st.kind === 'error') {
        st.aiImportant = {
          tag: '异常报错',
          level: 'critical',
          reason: (st.humanSummary || st.rawDetail || '执行过程发生异常').slice(0, 60),
          source: 'RULE'
        };
      } else if (st.diff && (Number(st.diff.addedCount || 0) + Number(st.diff.removedCount || 0) >= 35)) {
        st.aiImportant = {
          tag: '核心动刀',
          level: 'high',
          reason: `单步大幅重构 ${st.targetFile || '源码'} (+${st.diff.addedCount || 0}/-${st.diff.removedCount || 0} 行)`,
          source: 'RULE'
        };
      } else if (st.blastRadius && (st.blastRadius.level === 'DANGER' || st.blastRadius.scope === 'Git' || st.blastRadius.scope === 'Test')) {
        st.aiImportant = {
          tag: st.blastRadius.scope === 'Test' ? '测试验证' : st.blastRadius.scope === 'Git' ? '版本节点' : '关键指令',
          level: st.blastRadius.level === 'DANGER' ? 'critical' : 'milestone',
          reason: st.blastRadius.badge,
          source: 'RULE'
        };
      }
    }

    if (st.aiImportant) {
      importantEvents.push({
        stepId: st.id,
        stepArrayIndex: idx,
        stepIndex: st.stepIndex ?? idx + 1,
        title: st.humanSummary || st.title,
        targetFile: st.targetFile || '',
        tag: st.aiImportant.tag,
        level: st.aiImportant.level || 'high',
        reason: st.aiImportant.reason || '',
        source: st.aiImportant.source || 'AI',
        timestamp: st.timestamp
      });
    }
  }
  const avgStepTokens = stepsWithTokens > 0 ? Math.round(sumStepTokens / stepsWithTokens) : 0;

  return {
    topicTitle,
    projectName,
    workspacePath: workspacePath || projectName,
    userGoal: latestMeaningfulGoal,
    longTermGoal: assessmentCurrent ? assessment.longTermGoal : '待结合近期对话判断',
    shortTermGoal: assessmentCurrent ? assessment.shortTermGoal : latestMeaningfulGoal,
    alignmentStatus: assessmentCurrent ? assessment.status : 'unknown',
    alignmentReason: assessmentCurrent ? assessment.reason : '缺少足够证据判断是否偏离',
    stageIndex,
    phase: stageName,
    orbState,
    macroSummary: liveBroadcast,
    touchedFiles,
    importantEvents: importantEvents.slice(-10),
    loopAlert,
    loopCount,
    maxRisk,
    stats: {
      totalSteps: steps.length,
      toolCalls: steps.filter((s) => s.kind === 'tool').length,
      errors: steps.filter((s) => s.kind === 'error').length,
      importantCount: importantEvents.length,
      maxStepTokens,
      maxStepTitle,
      avgStepTokens,
      stepsWithTokens
    }
  };
}

function parseAiJsonResponse(rawReply) {
  if (!rawReply || typeof rawReply !== 'string') return null;
  // 1. Strip <think>...</think> reasoning blocks and markdown code fences
  let cleaned = rawReply
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        // Lenient repair: remove trailing commas before } or ] and control chars
        const repaired = candidate
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u0000-\u0019]+/g, ' ');
        return JSON.parse(repaired);
      } catch {}
    }
  }

  // Fallback field extraction if JSON was truncated by token limit
  const extractStr = (key) => {
    const m = cleaned.match(new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`));
    return m ? m[1] : undefined;
  };
  const headline = extractStr('headline');
  const cockpitDiagnosis = extractStr('cockpitDiagnosis');
  if (headline || cockpitDiagnosis) {
    return {
      headline,
      cockpitDiagnosis,
      longTermGoal: extractStr('longTermGoal'),
      shortTermGoal: extractStr('shortTermGoal'),
      alignmentStatus: extractStr('alignmentStatus'),
      alignmentReason: extractStr('alignmentReason')
    };
  }
  return null;
}

async function generateDeepAIInsight(session, llmConfig = {}) {
  const analysis = analyzeSessionTrajectory(session);
  const revision = session.activityRevision;
  const recentSteps = (session.steps || []).slice(-10);

  const hasEndpoint =
    llmConfig &&
    llmConfig.aiEnabled !== false &&
    llmConfig.providerPreset !== 'none' &&
    llmConfig.apiUrl &&
    (llmConfig.apiKey ||
      /^http:\/\//i.test(llmConfig.apiUrl) ||
      llmConfig.apiUrl.includes('11434') ||
      llmConfig.apiUrl.includes('localhost') ||
      llmConfig.apiUrl.includes('127.0.0.1'));

  if (hasEndpoint) {
    try {
      const stepLines = recentSteps
        .map((s, i) => `#${i + 1} [${s.category || s.kind}] ${s.title}: ${s.humanSummary}`)
        .join('\n');

      const prompt = `你是桌面悬浮舱内置的「AI 监工」。请根据以下 Coding Agent 的实时动作日志，输出一段纯 JSON（严禁输出 markdown 代码块或额外解释）：
所属项目：${analysis.projectName} (${analysis.topicTitle})
用户近期指令（从早到晚，后续指令可能修正或替换先前目标）：${JSON.stringify(session.userGoals || [])}
最近动作日志（带步骤编号 #1 ~ #${recentSteps.length}）：
${stepLines || '暂无步骤'}

返回 JSON 格式：
{
  "headline": "不超过24个字的一句话实时人话弹幕（告诉用户它现在正在干嘛）",
  "cockpitDiagnosis": "不超过60个字的座舱诊断（总结进度、是否跑偏、安全建议）",
  "longTermGoal": "根据近期指令推断当前长期目标，无法确定时写待判断",
  "shortTermGoal": "当前短期目标，考虑用户的修正和新指令",
  "alignmentStatus": "aligned、uncertain、off_track 三选一，证据不足用 uncertain",
  "alignmentReason": "根据近期行为与长期、短期目标给出简短依据，不要因风险或循环直接判断偏离",
  "importantSteps": [
    {
      "step": 1,
      "tag": "2~4字标签，如 核心动刀 / 架构关键 / 根因定位 / 关键验证 / 风险操作",
      "level": "critical 或 high 或 milestone",
      "reason": "不超过24字说明该步为何关键"
    }
  ]
}
注意：importantSteps 挑出最近动作中最关键的 1~3 个重要事件步骤（若无特别重要的可为空数组 []），step 填上面的步骤编号数字（如 1、2）。`;

      const rawReply = await callUniversalChatAPI(llmConfig, prompt);
      const parsed = parseAiJsonResponse(rawReply);
      if (parsed) {
        if (revision !== session.activityRevision) return null;
        if (['aligned', 'uncertain', 'off_track'].includes(parsed.alignmentStatus) &&
            typeof parsed.alignmentReason === 'string' &&
            typeof parsed.longTermGoal === 'string' && typeof parsed.shortTermGoal === 'string') {
          session.aiGoalAssessment = {
            revision, status: parsed.alignmentStatus, reason: parsed.alignmentReason.slice(0, 120),
            longTermGoal: parsed.longTermGoal.slice(0, 160), shortTermGoal: parsed.shortTermGoal.slice(0, 160)
          };
        }
        if (Array.isArray(parsed.importantSteps)) {
          for (const imp of parsed.importantSteps) {
            const num = Number(imp?.step ?? imp?.stepNumber);
            const targetStep = Number.isFinite(num) && num >= 1 && num <= recentSteps.length
              ? recentSteps[num - 1]
              : (session.steps || []).find((st) => st.id === imp?.stepId);
            if (targetStep) {
              targetStep.aiImportant = {
                tag: String(imp.tag || 'AI重点').slice(0, 10),
                level: ['critical', 'high', 'milestone'].includes(imp.level) ? imp.level : 'high',
                reason: String(imp.reason || targetStep.humanSummary || '').slice(0, 64),
                source: 'AI'
              };
            }
          }
        }
        if (parsed.headline) {
          session.aiLiveBroadcast = `🤖 ${parsed.headline}`;
          session.aiBroadcastStepCount = (session.steps || []).length;
          if (session.analysis) {
            session.analysis.macroSummary = session.aiLiveBroadcast;
          }
        }
        session.lastAiAnalyzedRevision = revision;
        session.lastAiAnalyzedAt = Date.now();
        session.analysis = analyzeSessionTrajectory(session);
        return {
          ok: true,
          source: `通用 AI 接口 (${llmConfig.model || 'LLM'})`,
          headline: parsed.headline || analysis.macroSummary,
          text: parsed.cockpitDiagnosis || rawReply.slice(0, 120),
          importantCount: session.analysis.importantEvents?.length || 0,
          timestamp: new Date().toISOString()
        };
      }
      if (revision !== session.activityRevision) return null;
      const fallbackText = String(rawReply || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim().slice(0, 120);
      if (fallbackText) {
        session.lastAiAnalyzedRevision = revision;
        session.lastAiAnalyzedAt = Date.now();
        return {
          ok: true,
          source: `通用 AI 接口 (${llmConfig.model || 'LLM'})`,
          headline: analysis.macroSummary,
          text: fallbackText,
          timestamp: new Date().toISOString()
        };
      }
    } catch (err) {
      if (revision !== session.activityRevision) return null;
      return {
        ok: false,
        source: '通用 AI 接口调用异常 (已回退内置引擎)',
        headline: analysis.macroSummary,
        text: `接口提示: ${err.message}。当前处于「${analysis.phase}」，偏离情况待判断。`,
        timestamp: new Date().toISOString()
      };
    }
  }

  const fileNames = analysis.touchedFiles.map((f) => f.name).join('、') || '暂无文件变更';
  return {
    ok: true,
    source: '内置实时解析核',
    headline: analysis.macroSummary,
    text: `项目「${analysis.projectName}」· 阶段「${analysis.phase}」· 涉及：${fileNames}（${
      analysis.loopAlert ? analysis.loopAlert.message : '暂无循环告警；偏离情况待判断'
    }）`,
    timestamp: new Date().toISOString()
  };
}

function normalizeChatCompletionsUrl(rawUrl) {
  let endpoint = String(rawUrl || '').trim();
  if (!endpoint) return '';
  if (/\/chat\/completions\/?$/i.test(endpoint)) {
    return endpoint.replace(/\/+$/, '');
  }
  endpoint = endpoint.replace(/\/+$/, '');
  try {
    const u = new URL(endpoint);
    if (!u.pathname || u.pathname === '/') {
      return `${endpoint}/v1/chat/completions`;
    }
  } catch {}
  return `${endpoint}/chat/completions`;
}

function callUniversalChatAPI(config, userPrompt, redirectDepth = 0) {
  return new Promise((resolve, reject) => {
    const endpoint = normalizeChatCompletionsUrl(config.apiUrl);
    if (!endpoint) {
      return reject(new Error('未填写有效的 API 地址'));
    }
    let urlObj;
    try {
      urlObj = new URL(endpoint);
    } catch {
      return reject(new Error(`API 地址格式不合法: ${endpoint}`));
    }
    const isHttps = urlObj.protocol === 'https:';
    const body = JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一个极简、精准的 AI 监工座舱核心，只返回合法 JSON，不要使用 markdown 代码块。'
        },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 800
    });

    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (err) reject(err);
      else resolve(val);
    };

    const req = (isHttps ? https : http).request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'YPod/1.0',
          'Content-Length': Buffer.byteLength(body),
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
        },
        timeout: 25000
      },
      (res) => {
        if (
          [301, 302, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          redirectDepth < 2
        ) {
          res.resume();
          const redirectedUrl = new URL(res.headers.location, endpoint).toString();
          callUniversalChatAPI({ ...config, apiUrl: redirectedUrl }, userPrompt, redirectDepth + 1)
            .then((v) => finish(null, v))
            .catch((e) => finish(e));
          return;
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400 || parsed.error) {
              const errMsg =
                parsed.error?.message ||
                parsed.message ||
                parsed.detail ||
                (typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error || parsed));
              return finish(new Error(`HTTP ${res.statusCode || 400}: ${errMsg}`));
            }
            const msg = parsed.choices?.[0]?.message || {};
            const content =
              msg.content ||
              msg.reasoning_content ||
              parsed.choices?.[0]?.text ||
              parsed.content?.[0]?.text ||
              parsed.output_text ||
              '';
            finish(null, content);
          } catch (e) {
            if (res.statusCode >= 400) {
              const snippet = String(data || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
              return finish(new Error(`HTTP ${res.statusCode} 错误 (${snippet || '非 JSON 响应'})`));
            }
            finish(new Error(`响应非合法 JSON: ${String(data || '').slice(0, 80)}`));
          }
        });
      }
    );

    const hardTimer = setTimeout(() => {
      req.destroy();
      finish(new Error('API 响应超时 (25s)，请检查网络或模型名称'));
    }, 25000);

    req.on('error', (err) => finish(err));
    req.on('timeout', () => {
      req.destroy();
      finish(new Error('API 连接超时，请检查接口地址或网络'));
    });
    req.write(body);
    req.end();
  });
}

module.exports = {
  cleanUserContent,
  formatToolInput,
  computeLineDiff,
  parseApplyPatchDiff,
  extractStepDiff,
  extractWorkspaceFromPath,
  detectCommandBlastRadius,
  detectCrossSessionConflicts,
  assessRisk,
  translateToolCall,
  summarizeThinking,
  analyzeSessionTrajectory,
  normalizeChatCompletionsUrl,
  generateDeepAIInsight
};
