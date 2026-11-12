#!/usr/bin/env node
/**
 * Universal Agent Hook Bridge (Supports Antigravity AGY, OpenAI Codex, Claude Code, Kimi Code, Cursor)
 * Reads hook JSON from stdin (or argv for Codex notify), forwards to the Desktop Floating Supervisor,
 * and returns the allow/deny decision to the host agent.
 */
const http = require('http');

const SUPERVISOR_PORT = process.env.YPOD_SUPERVISOR_PORT || 17530;

function parseArgs() {
  const args = process.argv.slice(2);
  let agent = 'auto';
  let eventType = 'PreToolUse';
  let inlinePayload = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      agent = args[++i];
    } else if (args[i] === '--event' && args[i + 1]) {
      eventType = args[++i];
    } else if (args[i].startsWith('{') && args[i].endsWith('}')) {
      inlinePayload = args[i];
    }
  }
  return { agent, eventType, inlinePayload };
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      return resolve('');
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    setTimeout(() => resolve(data), 1500);
  });
}

function normalizeHookPayload(rawObj, cliMeta = {}) {
  let agent = (cliMeta.agent || 'auto').toLowerCase();
  if (agent === 'cc') agent = 'claude';
  if (agent === 'kimi-code') agent = 'kimi';
  if (agent === 'auto') {
    const rawTranscript = String(rawObj.transcriptPath || rawObj.transcript_path || '');
    const rawSessionId = String(rawObj.session_id || rawObj.conversationId || '');
    if (rawTranscript.includes('antigravity')) {
      agent = 'agy';
    } else if (rawObj['last-assistant-message'] || rawObj.type === 'agent-turn-complete') {
      agent = 'codex';
    } else if (
      rawSessionId.startsWith('session_') ||
      rawObj.client_type ||
      rawObj.session_title !== undefined ||
      rawTranscript.includes('.kimi')
    ) {
      agent = 'kimi';
    } else if (
      rawObj.hook_event_name ||
      rawObj.session_id ||
      rawObj.tool_input ||
      rawTranscript.includes('.claude')
    ) {
      agent = 'claude';
    } else {
      agent = 'agy';
    }
  }

  const toolCall = rawObj.toolCall || rawObj.tool_call || {};
  const toolName =
    toolCall.name ||
    rawObj.tool_name ||
    rawObj.toolName ||
    (rawObj.type === 'agent-turn-complete' ? 'TurnComplete' : 'unknown_tool');

  const toolArgs =
    toolCall.args ||
    toolCall.arguments ||
    rawObj.tool_input ||
    rawObj.toolArgs ||
    rawObj;

  return {
    agent,
    eventType: cliMeta.eventType || rawObj.hook_event_name || 'PreToolUse',
    conversationId:
      rawObj.conversationId || rawObj.session_id || rawObj['thread-id'] || 'live-hook-session',
    sessionTitle: rawObj.session_title || rawObj.sessionTitle || '',
    transcriptPath: rawObj.transcriptPath || rawObj.transcript_path || '',
    cwd: rawObj.cwd || '',
    toolName,
    toolArgs,
    lastUserInput: rawObj.lastUserInput || '',
    stepIdx: rawObj.stepIdx ?? 0,
    timestamp: new Date().toISOString()
  };
}

function postToSupervisor(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: SUPERVISOR_PORT,
        path: '/api/hook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 24000
      },
      (res) => {
        let resData = '';
        res.on('data', (c) => (resData += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(resData));
          } catch {
            resolve({ decision: 'allow' });
          }
        });
      }
    );

    // Fail-open if desktop supervisor is not running
    req.on('error', () => resolve({ decision: 'allow' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ decision: 'allow' });
    });
    req.write(body);
    req.end();
  });
}

function formatHookDecision(normalized, result = {}) {
  if (normalized.eventType === 'PostToolUse') {
    return { exitCode: 0, stdout: '{}\n' };
  }

  const decision = result.decision || 'allow';
  const reason = result.reason || '';

  if (normalized.agent === 'cursor' && decision === 'deny') {
    return {
      exitCode: 2, // Cursor uses exit code 2 to block tool execution
      stdout: JSON.stringify({ decision: 'deny', reason }) + '\n'
    };
  }

  if ((normalized.agent === 'claude' || normalized.agent === 'kimi') && decision === 'deny') {
    return {
      exitCode: 0,
      stdout:
        JSON.stringify({
          decision: 'block',
          reason,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason
          }
        }) + '\n'
    };
  }

  const out = { decision };
  if (reason) out.reason = reason;
  return { exitCode: 0, stdout: JSON.stringify(out) + '\n' };
}

async function main() {
  const cliMeta = parseArgs();
  const stdinText = await readStdin();
  const rawText = stdinText.trim() || cliMeta.inlinePayload || '{}';

  let rawObj = {};
  try {
    rawObj = JSON.parse(rawText);
  } catch {
    rawObj = { raw: rawText };
  }

  const normalized = normalizeHookPayload(rawObj, cliMeta);
  const result = await postToSupervisor(normalized);
  const formatted = formatHookDecision(normalized, result);
  process.stdout.write(formatted.stdout);
  process.exit(formatted.exitCode);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  normalizeHookPayload,
  formatHookDecision
};
