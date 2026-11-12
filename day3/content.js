(function () {
  'use strict';

  if (window.parent !== window) return;

  const isWlxt = /\/f\/wlxt\//i.test(location.pathname);
  const isYkt = /\.yuketang\.cn$/i.test(location.hostname);
  if (!isWlxt && !isYkt) return;

  const Core = globalThis.CourseHubCore;
  if (!Core) return;

  const isWlxtPortalHome = isWlxt && /\/f\/wlxt\/index\/course\/student\/?(?:index(?:\.html)?)?$/i.test(location.pathname);
  const isYktPortalHome = isYkt && /^\/v2\/web\/(index|studentCards)\/?$/i.test(location.pathname);
  const isLoginLike = /login|auth|roaming/i.test(location.pathname + location.search) || location.hash.includes('chub-native');

  function readCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function detectWlxtCsrfFromDom() {
    if (!isWlxt) return '';
    const input = document.querySelector('input[name="_csrf"]');
    if (input && input.value) return input.value;
    const html = document.documentElement ? document.documentElement.innerHTML : '';
    const m = html.match(/[?&]_csrf=([a-zA-Z0-9_-]{16,64})/) || html.match(/_csrf\s*[:=]\s*["']([a-zA-Z0-9_-]{16,64})["']/);
    return m ? m[1] : '';
  }

  function detectYktHint() {
    if (!isYkt) return null;
    let uvId = readCookie('university_id') || readCookie('uv_id') || '';
    let xtbz = '';
    try {
      uvId = uvId || localStorage.getItem('university_id') || localStorage.getItem('uv_id') || '';
      xtbz = localStorage.getItem('xtbz') || '';
    } catch (_) {}
    return {
      uvId: String(uvId || ''),
      csrfToken: readCookie('csrftoken') || '',
      xtbz: xtbz || (location.hostname.includes('pro.yuketang.cn') ? 'cloud' : 'ykt')
    };
  }

  chrome.runtime.sendMessage({
    type: 'REGISTER_CONTEXT',
    platform: isWlxt ? 'wlxt' : 'ykt',
    origin: location.origin,
    csrf: detectWlxtCsrfFromDom(),
    yktHint: detectYktHint()
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;

    if (msg.type === 'CHUB_PAGE_FETCH') {
      (async () => {
        try {
          const opts = msg.options || {};
          const fetchInit = {
            method: opts.method || 'GET',
            credentials: 'include',
            redirect: 'follow',
            headers: { ...(opts.headers || {}) }
          };
          if (opts.formFields) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(opts.formFields)) {
              params.set(k, v);
            }
            fetchInit.body = params.toString();
            fetchInit.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
          } else if (opts.body) {
            fetchInit.body = opts.body;
          }
          const res = await fetch(msg.url, fetchInit);
          const text = await res.text();
          sendResponse({
            ok: true,
            status: res.status,
            finalUrl: res.url || msg.url,
            text
          });
        } catch (err) {
          sendResponse({
            ok: false,
            error: err ? err.message : 'FETCH_ERROR'
          });
        }
      })();
      return true;
    }

    if (msg.type === 'CHUB_PAGE_FETCH_BINARY') {
      (async () => {
        try {
          const res = await fetch(msg.url, { credentials: 'include', redirect: 'follow' });
          if (!res.ok) throw new Error('HTTP_' + res.status);
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html')) throw new Error('NOT_IMAGE');
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            sendResponse({ ok: true, dataUrl: reader.result });
          };
          reader.onerror = () => {
            sendResponse({ ok: false, error: 'READER_FAILED' });
          };
          reader.readAsDataURL(blob);
        } catch (err) {
          sendResponse({ ok: false, error: err ? err.message : 'BINARY_FETCH_ERROR' });
        }
      })();
      return true;
    }

    if (msg.type === 'CHUB_TOGGLE') {
      toggleWorkspace(msg.forceOpen !== undefined ? Boolean(msg.forceOpen) : !state.isOpen);
      sendResponse({ ok: true, isOpen: state.isOpen });
      return false;
    }

    return false;
  });

  // ─── UI Host & Shadow DOM ──────────────────────────────────
  const host = document.createElement('div');
  host.id = 'coursehub-overlay-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483640;pointer-events:none;';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const esc = s =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const CSS = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif;
      color: #1d1d1f;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }

    .ch-fab {
      position: fixed;
      right: 24px;
      bottom: 26px;
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 11px 18px;
      border-radius: 999px;
      border: 1px solid rgba(99, 102, 241, 0.25);
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(79, 70, 229, 0.32), 0 2px 6px rgba(0, 0, 0, 0.08);
      transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
      font-family: inherit;
      z-index: 10;
    }
    .ch-fab:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 28px rgba(79, 70, 229, 0.42);
    }
    .ch-fab-badge {
      padding: 2px 7px;
      border-radius: 999px;
      background: #ff4d4f;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.3;
    }

    .ch-dashboard {
      position: fixed;
      inset: 0;
      background: #f5f6fa;
      display: flex;
      flex-direction: column;
      opacity: 0;
      visibility: hidden;
      transform: scale(0.992);
      transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
      pointer-events: none;
    }
    .ch-dashboard.active {
      opacity: 1;
      visibility: visible;
      transform: scale(1);
      pointer-events: auto;
    }

    .ch-header {
      height: 60px;
      padding: 0 24px;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid rgba(15, 23, 42, 0.07);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-shrink: 0;
    }
    .ch-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .ch-brand-title {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.2px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    }
    .ch-brand-sep {
      color: #cbd5e1;
      font-weight: 400;
    }
    .ch-brand-sub {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      white-space: nowrap;
    }
    .ch-sem-select {
      padding: 5px 10px;
      border-radius: 8px;
      border: 1px solid rgba(99, 102, 241, 0.28);
      background: rgba(99, 102, 241, 0.07);
      color: #4f46e5;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      outline: none;
      font-family: inherit;
    }

    .ch-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: nowrap;
    }
    .ch-sync-time {
      font-size: 12px;
      color: #64748b;
      margin-right: 4px;
      white-space: nowrap;
    }
    .ch-conn-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: #fff;
      color: #334155;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      font-family: inherit;
      white-space: nowrap;
    }
    .ch-conn-pill:hover {
      background: #f8fafc;
      border-color: rgba(99, 102, 241, 0.35);
    }
    .ch-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #94a3b8;
    }
    .ch-dot.ok {
      background: #10b981;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.16);
    }
    .ch-dot.warn {
      background: #f59e0b;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
    }

    .ch-btn-ghost {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border-radius: 9px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      background: #fff;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
      white-space: nowrap;
    }
    .ch-btn-ghost:hover {
      border-color: #6366f1;
      color: #4f46e5;
      background: rgba(99, 102, 241, 0.04);
    }
    .ch-btn-ghost.active-pref {
      border-color: rgba(16, 185, 129, 0.35);
      background: rgba(16, 185, 129, 0.08);
      color: #059669;
    }
    .ch-btn-ghost:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .ch-btn-exit {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 7px 15px;
      border-radius: 999px;
      border: none;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 3px 10px rgba(239, 68, 68, 0.25);
      transition: opacity 0.15s, transform 0.15s;
      font-family: inherit;
      white-space: nowrap;
    }
    .ch-btn-exit:hover {
      opacity: 0.92;
      transform: translateY(-1px);
    }

    .ch-main {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1.16fr) minmax(390px, 0.94fr);
      gap: 0;
    }

    .ch-left {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-right: 1px solid rgba(15, 23, 42, 0.07);
      background: #f5f6fa;
    }
    .ch-toolbar {
      padding: 16px 22px 12px;
      background: #fff;
      border-bottom: 1px solid rgba(15, 23, 42, 0.06);
      flex-shrink: 0;
    }
    .ch-search-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .ch-search {
      width: 100%;
      padding: 10px 36px 10px 14px;
      border-radius: 11px;
      border: 1.5px solid rgba(15, 23, 42, 0.09);
      background: #f8fafc;
      font-size: 13px;
      color: #0f172a;
      outline: none;
      transition: border-color 0.15s, background 0.15s;
      font-family: inherit;
    }
    .ch-search:focus {
      background: #fff;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
    }
    .ch-search-clear {
      position: absolute;
      right: 10px;
      border: none;
      background: rgba(15, 23, 42, 0.08);
      color: #475569;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      font-size: 11px;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .ch-search-clear.show {
      display: inline-flex;
    }

    .ch-chips {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
      margin-top: 10px;
    }
    .ch-chip {
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid rgba(15, 23, 42, 0.09);
      background: #fff;
      color: #475569;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .ch-chip:hover {
      border-color: #6366f1;
      color: #4f46e5;
    }
    .ch-chip.on {
      background: #4f46e5;
      border-color: #4f46e5;
      color: #fff;
      box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
    }

    .ch-course-list {
      flex: 1;
      overflow-y: auto;
      padding: 16px 22px 28px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ch-card {
      background: #fff;
      border-radius: 15px;
      padding: 16px 18px;
      border: 1px solid rgba(15, 23, 42, 0.06);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
      transition: box-shadow 0.16s ease, border-color 0.16s ease;
    }
    .ch-card:hover {
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
      border-color: rgba(99, 102, 241, 0.22);
    }
    .ch-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .ch-card-title-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
    .ch-card-title {
      font-size: 15.5px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.35;
    }
    .ch-meta-tag {
      padding: 2px 8px;
      border-radius: 6px;
      background: #f1f5f9;
      color: #475569;
      font-size: 11px;
      font-weight: 500;
    }
    .ch-platform-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .ch-plat {
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .ch-plat.merged {
      background: linear-gradient(135deg, rgba(79, 70, 229, 0.12), rgba(16, 185, 129, 0.12));
      color: #4338ca;
    }
    .ch-plat.wlxt {
      background: rgba(37, 99, 235, 0.1);
      color: #1d4ed8;
    }
    .ch-plat.ykt {
      background: rgba(5, 150, 105, 0.11);
      color: #047857;
    }

    .ch-card-alerts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 9px;
    }
    .ch-alert-pill {
      padding: 3px 9px;
      border-radius: 7px;
      font-size: 11px;
      font-weight: 600;
    }
    .ch-alert-pill.ddl {
      background: rgba(239, 68, 68, 0.1);
      color: #dc2626;
    }
    .ch-alert-pill.live {
      background: rgba(239, 68, 68, 0.14);
      color: #dc2626;
      border: 1px solid rgba(239, 68, 68, 0.28);
      animation: chlivepulse 2.2s ease-in-out infinite;
    }
    .ch-alert-pill.notice {
      background: rgba(245, 158, 11, 0.12);
      color: #b45309;
    }
    .ch-alert-pill.replay {
      background: rgba(124, 58, 237, 0.1);
      color: #6d28d9;
    }
    .ch-alert-pill.mat {
      background: rgba(16, 185, 129, 0.1);
      color: #047857;
    }

    .ch-card-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
      padding-top: 11px;
      border-top: 1px solid rgba(15, 23, 42, 0.05);
    }
    .ch-subtabs {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ch-subtab {
      padding: 5px 10px;
      border-radius: 8px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: #f8fafc;
      color: #334155;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.14s;
      font-family: inherit;
    }
    .ch-subtab:hover {
      background: rgba(99, 102, 241, 0.07);
      border-color: rgba(99, 102, 241, 0.3);
      color: #4f46e5;
    }
    .ch-subtab.on {
      background: #4f46e5;
      border-color: #4f46e5;
      color: #fff;
    }

    .ch-jump-links {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ch-jump {
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 600;
      text-decoration: none;
      transition: opacity 0.14s, transform 0.14s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .ch-jump:hover {
      opacity: 0.85;
      transform: translateY(-1px);
    }
    .ch-jump.wlxt {
      background: rgba(37, 99, 235, 0.09);
      color: #1d4ed8;
    }
    .ch-jump.ykt {
      background: rgba(5, 150, 105, 0.1);
      color: #047857;
    }

    .ch-drawer {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px dashed rgba(15, 23, 42, 0.1);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ch-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 11px;
      border-radius: 10px;
      background: #f8fafc;
      font-size: 12.5px;
      transition: background 0.14s;
    }
    .ch-item-row:hover {
      background: #f1f5f9;
    }
    .ch-item-row.is-live {
      background: #fff8f8;
      border: 1px solid rgba(239, 68, 68, 0.24);
    }
    .ch-item-row.is-live:hover {
      background: #fff1f2;
    }
    .ch-item-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .ch-src-mini {
      padding: 2px 6px;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .ch-src-mini.wlxt {
      background: rgba(37, 99, 235, 0.12);
      color: #1d4ed8;
    }
    .ch-src-mini.ykt {
      background: rgba(5, 150, 105, 0.13);
      color: #047857;
    }
    .ch-src-mini.replay {
      background: rgba(124, 58, 237, 0.12);
      color: #6d28d9;
    }
    .ch-src-mini.live {
      background: rgba(239, 68, 68, 0.14);
      color: #dc2626;
      border: 1px solid rgba(239, 68, 68, 0.28);
    }
    .ch-item-title {
      font-weight: 600;
      color: #1e293b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ch-item-sub {
      font-size: 11px;
      color: #64748b;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .ch-item-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .ch-mini-link {
      padding: 3px 9px;
      border-radius: 6px;
      border: none;
      background: rgba(79, 70, 229, 0.1);
      color: #4f46e5;
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }
    .ch-mini-link:hover {
      background: rgba(79, 70, 229, 0.18);
    }
    .ch-mini-link.green {
      background: rgba(16, 185, 129, 0.12);
      color: #047857;
    }
    .ch-mini-link.purple {
      background: rgba(124, 58, 237, 0.12);
      color: #6d28d9;
    }
    .ch-mini-link.live {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: #fff;
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(239, 68, 68, 0.28);
      animation: chlivepulse 2s ease-in-out infinite;
    }
    .ch-mini-link.live:hover {
      background: linear-gradient(135deg, #dc2626, #b91c1c);
      color: #fff;
    }
    @keyframes chlivepulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.36); }
      50% { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
    }

    /* Inline Notice Expansion Box */
    .ch-inline-notice-body {
      margin: 2px 4px 6px;
      padding: 12px 14px;
      border-radius: 10px;
      background: #fff;
      border: 1px solid rgba(99, 102, 241, 0.18);
      font-size: 13px;
      line-height: 1.65;
      color: #1e293b;
      overflow-x: auto;
    }

    /* Rich HTML Rendering (Announcements & Images) */
    .ch-rich-html {
      word-break: break-word;
      overflow-wrap: anywhere;
      line-height: 1.7;
      color: #1e293b;
    }
    .ch-rich-html p {
      margin: 0 0 10px;
    }
    .ch-rich-html p:last-child {
      margin-bottom: 0;
    }
    .ch-rich-html a {
      color: #4f46e5;
      text-decoration: underline;
    }
    .ch-rich-html img {
      max-width: 100% !important;
      height: auto !important;
      border-radius: 10px;
      display: block;
      margin: 10px 0;
      box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
      cursor: zoom-in;
      background: #f8fafc;
    }
    .ch-rich-html table {
      border-collapse: collapse;
      max-width: 100%;
      display: block;
      overflow-x: auto;
      margin: 8px 0;
    }
    .ch-rich-html td, .ch-rich-html th {
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      font-size: 12.5px;
    }

    /* Right Column */
    .ch-right {
      overflow-y: auto;
      background: #f8f9fc;
      display: flex;
      flex-direction: column;
    }
    .ch-live-sec {
      padding: 14px 22px;
      background: linear-gradient(135deg, #fff5f5 0%, #ffffff 100%);
      border-bottom: 1px solid rgba(239, 68, 68, 0.18);
      display: none;
    }
    .ch-live-sec.show {
      display: block;
    }
    .ch-live-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 9px;
      font-size: 13.5px;
      font-weight: 700;
      color: #dc2626;
    }
    .ch-sec {
      padding: 16px 22px;
      border-bottom: 1px solid rgba(15, 23, 42, 0.06);
    }
    .ch-sec-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 11px;
    }
    .ch-sec-title {
      font-size: 14.5px;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .ch-stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .ch-stat-card {
      background: #fff;
      border-radius: 13px;
      padding: 11px 8px;
      text-align: center;
      border: 1px solid rgba(15, 23, 42, 0.05);
      box-shadow: 0 1px 5px rgba(15, 23, 42, 0.03);
      cursor: pointer;
      transition: transform 0.14s, border-color 0.14s;
    }
    .ch-stat-card:hover {
      transform: translateY(-1px);
      border-color: rgba(99, 102, 241, 0.3);
    }
    .ch-stat-num {
      font-size: 21px;
      font-weight: 800;
      color: #4f46e5;
      line-height: 1.2;
    }
    .ch-stat-num.danger {
      color: #ef4444;
    }
    .ch-stat-num.purple {
      color: #7c3aed;
    }
    .ch-stat-lbl {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      font-weight: 500;
    }

    .ch-cd {
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .ch-cd.critical {
      background: rgba(239, 68, 68, 0.12);
      color: #dc2626;
    }
    .ch-cd.warn {
      background: rgba(245, 158, 11, 0.14);
      color: #b45309;
    }
    .ch-cd.calm {
      background: rgba(79, 70, 229, 0.1);
      color: #4f46e5;
    }
    .ch-cd.overdue {
      background: rgba(100, 116, 139, 0.14);
      color: #475569;
    }
    .ch-cd.done {
      background: rgba(16, 185, 129, 0.12);
      color: #047857;
    }

    .ch-radar-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ch-radar-item {
      background: #fff;
      border-radius: 12px;
      padding: 10px 13px;
      border: 1px solid rgba(15, 23, 42, 0.05);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: border-color 0.14s, box-shadow 0.14s;
    }
    .ch-radar-item:hover {
      border-color: rgba(99, 102, 241, 0.25);
      box-shadow: 0 3px 10px rgba(15, 23, 42, 0.04);
    }
    .ch-radar-item.is-live {
      background: #fffafa;
      border-color: rgba(239, 68, 68, 0.28);
      box-shadow: 0 3px 12px rgba(239, 68, 68, 0.07);
    }
    .ch-radar-item.is-live:hover {
      border-color: rgba(239, 68, 68, 0.45);
    }
    .ch-radar-body {
      min-width: 0;
      flex: 1;
    }
    .ch-radar-top {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }
    .ch-radar-course {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      background: #f1f5f9;
      padding: 1px 7px;
      border-radius: 5px;
      max-width: 165px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ch-radar-title {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ch-radar-desc {
      font-size: 11.5px;
      color: #64748b;
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ch-mini-select {
      padding: 4px 8px;
      border-radius: 7px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      background: #fff;
      color: #334155;
      font-size: 11.5px;
      font-weight: 600;
      max-width: 175px;
      outline: none;
      font-family: inherit;
      cursor: pointer;
    }

    .ch-pill-tabs {
      display: flex;
      gap: 4px;
      background: rgba(15, 23, 42, 0.05);
      padding: 3px;
      border-radius: 8px;
    }
    .ch-pill-tab {
      border: none;
      background: transparent;
      color: #64748b;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 9px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
    }
    .ch-pill-tab.on {
      background: #fff;
      color: #0f172a;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .ch-empty {
      padding: 24px 16px;
      text-align: center;
      color: #64748b;
      font-size: 12.5px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 12px;
      border: 1px dashed rgba(15, 23, 42, 0.1);
    }

    .ch-modal-mask {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.38);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 30;
      padding: 24px;
    }
    .ch-modal-mask.show {
      display: flex;
    }
    .ch-modal {
      width: 100%;
      max-width: 720px;
      max-height: 85vh;
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ch-modal-head {
      padding: 16px 22px;
      border-bottom: 1px solid rgba(15, 23, 42, 0.07);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .ch-modal-title {
      font-size: 15.5px;
      font-weight: 700;
      color: #0f172a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ch-modal-close {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: none;
      background: #f1f5f9;
      color: #475569;
      font-size: 15px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .ch-modal-body {
      padding: 18px 22px;
      overflow-y: auto;
      font-size: 13.5px;
      line-height: 1.65;
      color: #1e293b;
    }
    .ch-input {
      width: 100%;
      padding: 8px 12px;
      border-radius: 9px;
      border: 1px solid rgba(15, 23, 42, 0.14);
      font-size: 12.5px;
      font-family: inherit;
      outline: none;
    }
    .ch-input:focus {
      border-color: #6366f1;
    }
    .ch-select {
      padding: 7px 10px;
      border-radius: 8px;
      border: 1px solid rgba(15, 23, 42, 0.14);
      font-size: 12.5px;
      font-family: inherit;
      background: #fff;
      flex: 1;
      min-width: 160px;
    }
    .ch-pair-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      background: #f8fafc;
      border-radius: 9px;
      margin-bottom: 6px;
      font-size: 12.5px;
    }

    .ch-spin {
      display: inline-block;
      width: 13px;
      height: 13px;
      border: 2px solid rgba(79, 70, 229, 0.22);
      border-top-color: #4f46e5;
      border-radius: 50%;
      animation: chspin 0.65s linear infinite;
    }
    @keyframes chspin {
      to { transform: rotate(360deg); }
    }

    .ch-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.9);
      color: #fff;
      padding: 9px 18px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      z-index: 50;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }
    .ch-toast.show {
      opacity: 1;
    }

    @media (max-width: 1040px) {
      .ch-main {
        grid-template-columns: 1fr;
        overflow-y: auto;
      }
      .ch-left, .ch-right {
        overflow-y: visible;
      }
      .ch-stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;

  const HTML = `
    <button class="ch-fab" id="ch-fab" title="展开双平台课程工作台 (快捷键 Alt + K)">
      <span>✨ 合一工作台</span>
      <span class="ch-fab-badge" id="ch-fab-badge" style="display:none">0</span>
    </button>

    <div class="ch-dashboard" id="ch-dashboard">
      <header class="ch-header">
        <div class="ch-brand">
          <span class="ch-brand-title">✨ 学堂 × 雨课堂</span>
          <span class="ch-brand-sep">|</span>
          <span class="ch-brand-sub">双平台课程工作台</span>
          <select class="ch-sem-select" id="ch-sem-select" title="切换学期" style="display:none"></select>
        </div>
        <div class="ch-header-actions">
          <span class="ch-sync-time" id="ch-sync-time">准备就绪</span>
          <button class="ch-conn-pill" id="ch-conn-wlxt" title="查看或配置学堂连接">
            <span class="ch-dot" id="ch-dot-wlxt"></span>
            <span id="ch-lbl-wlxt">📘 学堂</span>
          </button>
          <button class="ch-conn-pill" id="ch-conn-ykt" title="查看或配置雨课堂连接">
            <span class="ch-dot" id="ch-dot-ykt"></span>
            <span id="ch-lbl-ykt">🌧️ 雨课堂</span>
          </button>
          <button class="ch-btn-ghost" id="ch-btn-pair" title="手动配对课程与连接设置">🔗 课程配对</button>
          <button class="ch-btn-ghost" id="ch-btn-auto" title="打开学堂或雨课堂主页时自动展开此工作台">⚡ 首页自动展开</button>
          <button class="ch-btn-ghost" id="ch-btn-sync">🔄 同步刷新</button>
          <button class="ch-btn-exit" id="ch-btn-exit">✕ 返回原网页</button>
        </div>
      </header>

      <div class="ch-main">
        <section class="ch-left">
          <div class="ch-toolbar">
            <div class="ch-search-wrap">
              <input type="text" class="ch-search" id="ch-search" placeholder="🔍 搜索课程名、课堂回放、作业、PPT课件、课程文件、公告或老师…" />
              <button class="ch-search-clear" id="ch-search-clear" title="清空搜索">✕</button>
            </div>
            <div class="ch-chips" id="ch-chips">
              <button class="ch-chip on" data-filter="all">全部课程</button>
              <button class="ch-chip" data-filter="merged">🔗 双端合体</button>
              <button class="ch-chip" data-filter="ddl">⏰ 有待交DDL</button>
              <button class="ch-chip" data-filter="replay">🎬 课堂回放</button>
              <button class="ch-chip" data-filter="unread">🆕 有未读/新课件</button>
              <button class="ch-chip" data-filter="wlxt">📘 仅学堂</button>
              <button class="ch-chip" data-filter="ykt">🌧️ 仅雨课堂</button>
            </div>
          </div>
          <div class="ch-course-list" id="ch-course-list">
            <div class="ch-empty"><span class="ch-spin"></span> 正在汇总双平台课程数据…</div>
          </div>
        </section>

        <aside class="ch-right">
          <div class="ch-live-sec" id="ch-live-sec">
            <div class="ch-live-head">
              <span id="ch-live-head-title">🔴 正在上课提醒</span>
              <span style="font-size:11.5px;font-weight:500;color:#ef4444">点右侧直达直播间</span>
            </div>
            <div class="ch-radar-list" id="ch-live-list"></div>
          </div>

          <div class="ch-sec">
            <div class="ch-sec-head">
              <div class="ch-sec-title">📊 本周待办与资源概览</div>
            </div>
            <div class="ch-stats-grid">
              <div class="ch-stat-card" data-jump-filter="ddl">
                <div class="ch-stat-num" id="ch-st-ddl">0</div>
                <div class="ch-stat-lbl">待交作业 / 测验</div>
              </div>
              <div class="ch-stat-card" data-jump-filter="unread">
                <div class="ch-stat-num" id="ch-st-notice">0</div>
                <div class="ch-stat-lbl">未读课程公告</div>
              </div>
              <div class="ch-stat-card" data-jump-filter="replay">
                <div class="ch-stat-num purple" id="ch-st-replay">0</div>
                <div class="ch-stat-lbl">课堂回放整理</div>
              </div>
              <div class="ch-stat-card" data-jump-filter="merged">
                <div class="ch-stat-num" id="ch-st-merged">0/0</div>
                <div class="ch-stat-lbl">双端自动对齐</div>
              </div>
            </div>
          </div>

          <div class="ch-sec">
            <div class="ch-sec-head">
              <div class="ch-sec-title">⏰ 跨平台 DDL 倒计时</div>
              <div class="ch-pill-tabs" id="ch-ddl-tabs">
                <button class="ch-pill-tab on" data-mode="pending">待完成</button>
                <button class="ch-pill-tab" data-mode="completed">已交核对</button>
              </div>
            </div>
            <div class="ch-radar-list" id="ch-ddl-list">
              <div class="ch-empty">暂无待交 DDL，今天可以安心喝杯奶茶</div>
            </div>
          </div>

          <div class="ch-sec">
            <div class="ch-sec-head">
              <div class="ch-sec-title">🎬 课堂回放速查中心</div>
              <select class="ch-mini-select" id="ch-replay-course-filter">
                <option value="all">全部课程回放</option>
              </select>
            </div>
            <div class="ch-radar-list" id="ch-replay-list">
              <div class="ch-empty">暂未检测到课堂回放记录</div>
            </div>
          </div>

          <div class="ch-sec" style="border-bottom:none;flex:1">
            <div class="ch-sec-head">
              <div class="ch-sec-title">⚡ 最新公告与课件流</div>
              <div class="ch-pill-tabs" id="ch-feed-tabs">
                <button class="ch-pill-tab on" data-feed="all">全部</button>
                <button class="ch-pill-tab" data-feed="notice">公告</button>
                <button class="ch-pill-tab" data-feed="material">课件/文件</button>
              </div>
            </div>
            <div class="ch-radar-list" id="ch-feed-list">
              <div class="ch-empty">等待同步最新课程动态…</div>
            </div>
          </div>
        </aside>
      </div>

      <!-- Notice Instant Reader Modal -->
      <div class="ch-modal-mask" id="ch-notice-modal">
        <div class="ch-modal">
          <div class="ch-modal-head">
            <div class="ch-modal-title" id="ch-notice-modal-title">课程公告</div>
            <button class="ch-modal-close" id="ch-notice-modal-close">✕</button>
          </div>
          <div class="ch-modal-body" id="ch-notice-modal-body"></div>
        </div>
      </div>

      <!-- Course Pairing & Connection Settings Modal -->
      <div class="ch-modal-mask" id="ch-pair-modal">
        <div class="ch-modal">
          <div class="ch-modal-head">
            <div class="ch-modal-title">🔗 课程手动配对与连接设置</div>
            <button class="ch-modal-close" id="ch-pair-modal-close">✕</button>
          </div>
          <div class="ch-modal-body" id="ch-pair-modal-body"></div>
        </div>
      </div>

      <!-- Image Zoom Lightbox -->
      <div class="ch-modal-mask" id="ch-img-lightbox" style="z-index:45;cursor:zoom-out">
        <img id="ch-img-lightbox-el" alt="放大预览" style="max-width:92vw;max-height:88vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.45);background:#fff;object-fit:contain" />
      </div>

      <div class="ch-toast" id="ch-toast"></div>
    </div>
  `;

  shadow.innerHTML = `<style>${CSS}</style>${HTML}`;
  const $ = id => shadow.getElementById(id);

  // ─── UI State ────────────────────────────────────────────
  const state = {
    isOpen: false,
    syncing: false,
    snapshot: null,
    filter: 'all',
    search: '',
    ddlMode: 'pending',
    replayCourseId: 'all',
    feedFilter: 'all',
    expandedTabs: {},
    inlineNotices: {},
    imageDataCache: {},
    prevDocOverflow: ''
  };

  let toastTimer = null;
  function showToast(text) {
    const el = $('ch-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function toggleWorkspace(open) {
    state.isOpen = Boolean(open);
    const dash = $('ch-dashboard');
    const fab = $('ch-fab');
    if (state.isOpen) {
      state.prevDocOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      dash.classList.add('active');
      fab.style.display = 'none';
      if (!state.snapshot || !state.snapshot.syncedAt) {
        triggerSync();
      } else if (Date.now() - state.snapshot.syncedAt > 5 * 60 * 1000) {
        triggerSync(true);
      }
    } else {
      document.documentElement.style.overflow = state.prevDocOverflow || '';
      dash.classList.remove('active');
      fab.style.display = 'inline-flex';
    }
  }

  function isReplayLive(r) {
    return Boolean(r && (r.isLive || r.subLabel === '正在上课' || r.sourceLabel === '正在上课'));
  }

  function updateFabBadge() {
    const badge = $('ch-fab-badge');
    const stats = state.snapshot && state.snapshot.radar ? state.snapshot.radar.stats : null;
    const pending = stats ? stats.pendingTaskCount : 0;
    const liveCount = stats ? (stats.liveCount || 0) : 0;
    if (liveCount > 0) {
      badge.textContent = pending > 0 ? `🔴 直播 · ${pending} 待办` : `🔴 ${liveCount} 直播中`;
      badge.style.display = 'inline-block';
    } else if (pending > 0) {
      badge.textContent = `${pending} 待办`;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  function hydrateRichImages(containerEl, baseOrigin = '') {
    if (!containerEl) return;
    const imgs = containerEl.querySelectorAll('img');
    imgs.forEach(img => {
      const rawSrc = img.getAttribute('src') || '';
      if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) return;

      const resolvedSrc = Core.resolveRelativeUrl(rawSrc, baseOrigin);
      if (resolvedSrc !== rawSrc) {
        img.setAttribute('src', resolvedSrc);
      }

      img.onclick = () => {
        const zoomEl = $('ch-img-lightbox-el');
        const box = $('ch-img-lightbox');
        if (zoomEl && box) {
          zoomEl.src = img.src || resolvedSrc;
          box.classList.add('show');
        }
      };

      const loadViaProxy = () => {
        if (img.dataset.proxied === '1') return;
        img.dataset.proxied = '1';
        if (state.imageDataCache[resolvedSrc]) {
          img.src = state.imageDataCache[resolvedSrc];
          return;
        }
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_DATA_URL', url: resolvedSrc }, res => {
          if (res && res.ok && res.dataUrl) {
            state.imageDataCache[resolvedSrc] = res.dataUrl;
            img.src = res.dataUrl;
          }
        });
      };

      img.onerror = loadViaProxy;

      // Proactively proxy cross-origin images so SameSite cookies never break announcement images
      try {
        const imgOrigin = new URL(resolvedSrc).origin;
        if (imgOrigin !== location.origin) {
          loadViaProxy();
        }
      } catch (_) {}
    });
  }

  function renderHeader() {
    const snap = state.snapshot;
    if (!snap) return;

    const syncEl = $('ch-sync-time');
    if (state.syncing) {
      syncEl.innerHTML = '<span class="ch-spin"></span> 正在同步双端接口…';
    } else if (snap.syncedAt) {
      syncEl.textContent = `同步于 ${Core.formatRelativeTime(snap.syncedAt)}`;
    } else {
      syncEl.textContent = '尚未同步';
    }

    const semSelect = $('ch-sem-select');
    if (snap.semesters && snap.semesters.length > 0) {
      semSelect.style.display = 'inline-block';
      semSelect.innerHTML = snap.semesters
        .map(s => `<option value="${esc(s)}" ${s === snap.activeSemester ? 'selected' : ''}>${esc(s)}</option>`)
        .join('');
    } else if (snap.activeSemester) {
      semSelect.style.display = 'inline-block';
      semSelect.innerHTML = `<option value="${esc(snap.activeSemester)}" selected>${esc(snap.activeSemester)}</option>`;
    } else {
      semSelect.style.display = 'none';
    }

    const wSt = snap.wlxtStatus || {};
    $('ch-dot-wlxt').className = 'ch-dot ' + (wSt.connected ? 'ok' : 'warn');
    $('ch-lbl-wlxt').textContent = wSt.connected
      ? `📘 学堂 · ${snap.radar.stats.wlxtCount}门`
      : (wSt.configured ? '📘 学堂未登录' : '📘 待绑定学堂');

    const ySt = snap.yktStatus || {};
    $('ch-dot-ykt').className = 'ch-dot ' + (ySt.connected ? 'ok' : 'warn');
    $('ch-lbl-ykt').textContent = ySt.connected
      ? `🌧️ 雨课堂 · ${snap.radar.stats.yktCount}门`
      : '🌧️ 雨课堂未登录';

    const autoOpen = !snap.prefs || snap.prefs.autoOpenHome !== false;
    const autoBtn = $('ch-btn-auto');
    autoBtn.textContent = autoOpen ? '⚡ 首页自动展开: 开' : '⚡ 首页自动展开: 关';
    autoBtn.classList.toggle('active-pref', autoOpen);

    $('ch-btn-sync').disabled = state.syncing;
  }

  function renderStats() {
    const snap = state.snapshot;
    if (!snap || !snap.radar) return;
    const st = snap.radar.stats;

    const ddlEl = $('ch-st-ddl');
    ddlEl.textContent = String(st.pendingTaskCount);
    ddlEl.classList.toggle('danger', st.urgent48hCount > 0 || st.pendingTaskCount > 0);

    $('ch-st-notice').textContent = String(st.unreadNoticeCount);
    $('ch-st-replay').textContent = String(st.totalReplaysCount || 0);
    $('ch-st-merged').textContent = `${st.mergedCount}/${st.totalCourses}`;
  }

  function renderDdlRadar() {
    const snap = state.snapshot;
    const listEl = $('ch-ddl-list');
    if (!snap || !snap.radar) return;

    const items = state.ddlMode === 'pending'
      ? snap.radar.urgentTasks
      : snap.radar.completedTasks;

    if (!items.length) {
      listEl.innerHTML = state.ddlMode === 'pending'
        ? '<div class="ch-empty">🎉 当前没有待交作业或未完成测验</div>'
        : '<div class="ch-empty">暂无近期已提交记录</div>';
      return;
    }

    listEl.innerHTML = items.slice(0, 14).map(t => {
      const cd = t.submitted
        ? { text: t.graded && t.grade ? `已批改 · ${t.grade}` : '✅ 已提交', level: 'done' }
        : Core.formatCountdown(t.deadlineMs);
      const srcBadge = t.source === 'wlxt'
        ? '<span class="ch-src-mini wlxt">学堂</span>'
        : '<span class="ch-src-mini ykt">雨课堂</span>';

      return `
        <div class="ch-radar-item">
          <div class="ch-radar-body">
            <div class="ch-radar-top">
              ${srcBadge}
              <span class="ch-radar-course">${esc(t.courseName)}</span>
              <span class="ch-cd ${cd.level}">${esc(cd.text)}</span>
            </div>
            <div class="ch-radar-title" title="${esc(t.title)}">${esc(t.title)}</div>
            ${t.deadlineMs ? `<div class="ch-radar-desc">截止：${esc(new Date(t.deadlineMs).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }))}</div>` : ''}
          </div>
          <a class="ch-mini-link" href="${esc(t.url)}" target="_blank" rel="noopener">${t.submitted ? '查看 ↗' : '去完成 ↗'}</a>
        </div>
      `;
    }).join('');
  }

  function renderLiveBanner() {
    const snap = state.snapshot;
    const secEl = $('ch-live-sec');
    const listEl = $('ch-live-list');
    const headTitleEl = $('ch-live-head-title');
    if (!secEl || !listEl) return;
    if (!snap || !snap.radar) {
      secEl.classList.remove('show');
      return;
    }

    const liveItems = Array.isArray(snap.radar.liveLessons) && snap.radar.liveLessons.length > 0
      ? snap.radar.liveLessons
      : (snap.radar.recentReplays || []).filter(isReplayLive);

    if (!liveItems.length) {
      secEl.classList.remove('show');
      listEl.innerHTML = '';
      return;
    }

    secEl.classList.add('show');
    if (headTitleEl) {
      headTitleEl.textContent = liveItems.length > 1
        ? `🔴 当前有 ${liveItems.length} 门课正在直播`
        : '🔴 当前有课程正在直播';
    }

    listEl.innerHTML = liveItems.map(r => {
      const relTime = r.timeMs ? Core.formatRelativeTime(r.timeMs) : '';
      return `
        <div class="ch-radar-item is-live">
          <div class="ch-radar-body">
            <div class="ch-radar-top">
              <span class="ch-src-mini live">🔴 正在直播</span>
              <span class="ch-radar-course">${esc(r.courseName)}</span>
              ${relTime ? `<span class="ch-item-sub">${esc(relTime)}</span>` : ''}
            </div>
            <div class="ch-radar-title" title="${esc(r.title)}">${esc(r.title)}</div>
          </div>
          <div class="ch-item-right">
            <a class="ch-mini-link live" href="${esc(r.url)}" target="_blank" rel="noopener">🔴 进入直播 ↗</a>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderReplayHub() {
    const snap = state.snapshot;
    const listEl = $('ch-replay-list');
    const selEl = $('ch-replay-course-filter');
    if (!snap || !snap.radar) return;

    const coursesWithReplays = (snap.mergedCourses || []).filter(c => (c.counts.totalReplays || 0) > 0);
    const prevVal = state.replayCourseId;
    selEl.innerHTML = `<option value="all">全部课程回放 (${snap.radar.stats.totalReplaysCount || 0})</option>` +
      coursesWithReplays.map(c => `<option value="${esc(c.id)}" ${c.id === prevVal ? 'selected' : ''}>${esc(c.name)} (${c.counts.totalReplays})</option>`).join('');

    if (prevVal !== 'all' && !coursesWithReplays.some(c => c.id === prevVal)) {
      state.replayCourseId = 'all';
    }

    let replays = snap.radar.recentReplays || [];
    if (state.replayCourseId !== 'all') {
      replays = replays.filter(r => r.courseId === state.replayCourseId);
    }

    if (!replays.length) {
      listEl.innerHTML = '<div class="ch-empty">暂无课堂实录或视频回放记录</div>';
      return;
    }

    listEl.innerHTML = replays.slice(0, 12).map(r => {
      const live = isReplayLive(r);
      const relTime = r.timeMs ? Core.formatRelativeTime(r.timeMs) : '';
      const srcTag = live
        ? '<span class="ch-src-mini live">🔴 正在直播</span>'
        : `<span class="ch-src-mini replay">${esc(r.sourceLabel || '课堂回放')}</span>`;
      const actionBtn = live
        ? `<a class="ch-mini-link live" href="${esc(r.url)}" target="_blank" rel="noopener">🔴 进入直播 ↗</a>`
        : `<a class="ch-mini-link purple" href="${esc(r.url)}" target="_blank" rel="noopener">▶ 看回放 ↗</a>`;
      return `
        <div class="ch-radar-item${live ? ' is-live' : ''}">
          <div class="ch-radar-body">
            <div class="ch-radar-top">
              ${srcTag}
              <span class="ch-radar-course">${esc(r.courseName)}</span>
              ${!live && !r.hasRead ? '<span class="ch-cd warn">未看</span>' : ''}
              ${relTime ? `<span class="ch-item-sub">${esc(relTime)}</span>` : ''}
            </div>
            <div class="ch-radar-title" title="${esc(r.title)}">${esc(r.title)}</div>
            ${r.description ? `<div class="ch-radar-desc">${esc(r.description)}</div>` : ''}
          </div>
          <div class="ch-item-right">
            ${r.downloadUrl ? `<a class="ch-mini-link green" href="${esc(r.downloadUrl)}" target="_blank" rel="noopener">⬇ 下载</a>` : ''}
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderFeed() {
    const snap = state.snapshot;
    const listEl = $('ch-feed-list');
    if (!snap || !snap.radar) return;

    let items = snap.radar.feedItems || [];
    if (state.feedFilter !== 'all') {
      items = items.filter(i => i.feedType === state.feedFilter);
    }

    if (!items.length) {
      listEl.innerHTML = '<div class="ch-empty">暂无匹配的动态条目</div>';
      return;
    }

    listEl.innerHTML = items.slice(0, 24).map(item => {
      const srcBadge = item.source === 'wlxt'
        ? `<span class="ch-src-mini wlxt">${esc(item.sourceLabel)}</span>`
        : `<span class="ch-src-mini ykt">${esc(item.sourceLabel)}</span>`;
      const unreadPill = item.badge
        ? `<span class="ch-cd ${item.unread ? 'warn' : 'calm'}">${esc(item.badge)}</span>`
        : '';
      const relTime = item.timeMs ? Core.formatRelativeTime(item.timeMs) : '';

      const actionHtml = item.feedType === 'notice'
        ? `<button class="ch-mini-link" data-open-notice="${esc(item.id)}">📖 速览</button>
           <a class="ch-mini-link" href="${esc(item.url)}" target="_blank" rel="noopener">原页 ↗</a>`
        : `${item.downloadUrl ? `<a class="ch-mini-link green" href="${esc(item.downloadUrl)}" target="_blank" rel="noopener">⬇ 下载</a>` : ''}
           <a class="ch-mini-link" href="${esc(item.url)}" target="_blank" rel="noopener">打开 ↗</a>`;

      return `
        <div class="ch-radar-item">
          <div class="ch-radar-body">
            <div class="ch-radar-top">
              ${srcBadge}
              <span class="ch-radar-course">${esc(item.courseName)}</span>
              ${unreadPill}
              ${relTime ? `<span class="ch-item-sub">${esc(relTime)}</span>` : ''}
            </div>
            <div class="ch-radar-title" title="${esc(item.title)}">${esc(item.title)}</div>
            ${item.subtitle ? `<div class="ch-radar-desc">${esc(item.subtitle)}</div>` : ''}
          </div>
          <div class="ch-item-right">${actionHtml}</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-open-notice]').forEach(btn => {
      btn.onclick = () => openNoticeById(btn.getAttribute('data-open-notice'));
    });
  }

  function courseMatchesQuery(course, q) {
    if (!q) return { matched: true, matchedTab: '' };
    const hayCourse = `${course.name} ${course.teacher} ${course.courseNumber} ${course.className}`.toLowerCase();
    if (hayCourse.includes(q)) return { matched: true, matchedTab: '' };

    if (course.tasks.some(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))) {
      return { matched: true, matchedTab: 'tasks' };
    }
    if ((course.replays || []).some(r => r.title.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))) {
      return { matched: true, matchedTab: 'replays' };
    }
    if (course.materials.some(m => m.title.toLowerCase().includes(q) || (m.categoryName || '').toLowerCase().includes(q))) {
      return { matched: true, matchedTab: 'materials' };
    }
    if (course.announcements.some(n => n.title.toLowerCase().includes(q) || (n.plainText || '').toLowerCase().includes(q))) {
      return { matched: true, matchedTab: 'announcements' };
    }
    return { matched: false, matchedTab: '' };
  }

  function renderDrawerContent(course, tab, q) {
    if (tab === 'tasks') {
      let list = course.tasks;
      if (q) list = list.filter(t => t.title.toLowerCase().includes(q) || course.name.toLowerCase().includes(q));
      if (!list.length) return '<div class="ch-empty" style="padding:14px">该课程暂无作业或习题记录</div>';
      return list.slice(0, 20).map(t => {
        const cd = t.submitted
          ? { text: t.graded && t.grade ? `已批改: ${t.grade}` : '✅ 已提交', level: 'done' }
          : Core.formatCountdown(t.deadlineMs);
        return `
          <div class="ch-item-row">
            <div class="ch-item-left">
              <span class="ch-src-mini ${t.source}">${t.source === 'wlxt' ? '学堂' : '雨课堂'}</span>
              <span class="ch-item-title" title="${esc(t.title)}">${esc(t.title)}</span>
              <span class="ch-cd ${cd.level}">${esc(cd.text)}</span>
            </div>
            <div class="ch-item-right">
              ${t.deadlineMs ? `<span class="ch-item-sub">${esc(Core.formatRelativeTime(t.deadlineMs))}</span>` : ''}
              <a class="ch-mini-link" href="${esc(t.url)}" target="_blank" rel="noopener">${t.submitted ? '查看 ↗' : '去提交 ↗'}</a>
            </div>
          </div>
        `;
      }).join('');
    }

    if (tab === 'replays') {
      let list = course.replays || [];
      if (q) list = list.filter(r => r.title.toLowerCase().includes(q) || course.name.toLowerCase().includes(q));
      if (!list.length) return '<div class="ch-empty" style="padding:14px">该课程暂无课堂回放或录像</div>';
      return list.slice(0, 35).map(r => {
        const live = isReplayLive(r);
        const srcTag = live
          ? '<span class="ch-src-mini live">🔴 正在直播</span>'
          : `<span class="ch-src-mini replay">${esc(r.sourceLabel || '课堂回放')}</span>`;
        const actionBtn = live
          ? `<a class="ch-mini-link live" href="${esc(r.url)}" target="_blank" rel="noopener">🔴 进入直播 ↗</a>`
          : `<a class="ch-mini-link purple" href="${esc(r.url)}" target="_blank" rel="noopener">▶ 看回放 ↗</a>`;
        return `
          <div class="ch-item-row${live ? ' is-live' : ''}">
            <div class="ch-item-left">
              ${srcTag}
              <span class="ch-item-title" title="${esc(r.title)}">${esc(r.title)}</span>
              ${!live && !r.hasRead ? '<span class="ch-cd warn">未看</span>' : ''}
            </div>
            <div class="ch-item-right">
              ${r.sizeText ? `<span class="ch-item-sub">${esc(r.sizeText)}</span>` : ''}
              ${r.timeMs ? `<span class="ch-item-sub">${esc(Core.formatRelativeTime(r.timeMs))}</span>` : ''}
              ${r.downloadUrl ? `<a class="ch-mini-link green" href="${esc(r.downloadUrl)}" target="_blank" rel="noopener">⬇ 下载</a>` : ''}
              ${actionBtn}
            </div>
          </div>
        `;
      }).join('');
    }

    if (tab === 'materials') {
      let list = course.materials;
      if (q) list = list.filter(m => m.title.toLowerCase().includes(q) || (m.categoryName || '').toLowerCase().includes(q) || course.name.toLowerCase().includes(q));
      if (!list.length) return '<div class="ch-empty" style="padding:14px">该课程暂无课件或课程文件</div>';
      return list.slice(0, 25).map(m => `
        <div class="ch-item-row">
          <div class="ch-item-left">
            <span class="ch-src-mini ${m.source}">${esc(m.sourceLabel)}</span>
            <span class="ch-item-title" title="${esc(m.title)}">${esc(m.title)}</span>
            ${m.isNew ? '<span class="ch-cd warn">新</span>' : ''}
          </div>
          <div class="ch-item-right">
            ${m.sizeText ? `<span class="ch-item-sub">${esc(m.sizeText)}</span>` : ''}
            ${m.timeMs ? `<span class="ch-item-sub">${esc(Core.formatRelativeTime(m.timeMs))}</span>` : ''}
            ${m.downloadUrl ? `<a class="ch-mini-link green" href="${esc(m.downloadUrl)}" target="_blank" rel="noopener">⬇ 下载</a>` : ''}
            <a class="ch-mini-link" href="${esc(m.url)}" target="_blank" rel="noopener">打开 ↗</a>
          </div>
        </div>
      `).join('');
    }

    if (tab === 'announcements') {
      let list = course.announcements;
      if (q) list = list.filter(n => n.title.toLowerCase().includes(q) || (n.plainText || '').toLowerCase().includes(q) || course.name.toLowerCase().includes(q));
      if (!list.length) return '<div class="ch-empty" style="padding:14px">该课程暂无公告</div>';
      return list.slice(0, 20).map(n => {
        const isInlineOpen = Boolean(state.inlineNotices[n.id]);
        const safeRich = Core.sanitizeRichHtml(n.contentHtml || '', n.origin || '');
        const inlineHtml = isInlineOpen
          ? `<div class="ch-inline-notice-body ch-rich-html" data-notice-origin="${esc(n.origin || '')}">
               ${safeRich || `<div style="white-space:pre-wrap">${esc(n.plainText || '暂无正文内容')}</div>`}
             </div>`
          : '';
        return `
          <div>
            <div class="ch-item-row">
              <div class="ch-item-left" style="cursor:pointer" data-toggle-inline-notice="${esc(n.id)}">
                <span class="ch-src-mini ${n.source}">${n.source === 'wlxt' ? '学堂' : '雨课堂'}</span>
                ${!n.hasRead ? '<span class="ch-cd warn">未读</span>' : ''}
                ${n.important ? '<span class="ch-cd critical">重要</span>' : ''}
                <span class="ch-item-title" title="${esc(n.title)}">${esc(n.title)}</span>
              </div>
              <div class="ch-item-right">
                ${n.timeMs ? `<span class="ch-item-sub">${esc(Core.formatRelativeTime(n.timeMs))}</span>` : ''}
                <button class="ch-mini-link" data-toggle-inline-notice="${esc(n.id)}">${isInlineOpen ? '收起' : '展开'}</button>
                <button class="ch-mini-link" data-open-notice="${esc(n.id)}">📖 弹窗大图</button>
                <a class="ch-mini-link" href="${esc(n.url)}" target="_blank" rel="noopener">原页 ↗</a>
              </div>
            </div>
            ${inlineHtml}
          </div>
        `;
      }).join('');
    }

    return '';
  }

  function renderCourses() {
    const snap = state.snapshot;
    const container = $('ch-course-list');
    if (!snap) return;

    const all = snap.mergedCourses || [];
    const q = state.search.trim().toLowerCase();

    const chips = shadow.querySelectorAll('#ch-chips .ch-chip');
    chips.forEach(chip => {
      const f = chip.getAttribute('data-filter');
      if (f === 'all') chip.textContent = `全部课程 (${all.length})`;
      else if (f === 'merged') chip.textContent = `🔗 双端合体 (${all.filter(c => c.platforms.wlxt && c.platforms.ykt).length})`;
      else if (f === 'ddl') chip.textContent = `⏰ 有待交DDL (${all.filter(c => c.counts.pendingDdl > 0).length})`;
      else if (f === 'replay') chip.textContent = `🎬 课堂回放 (${all.filter(c => (c.counts.totalReplays || 0) > 0).length})`;
      else if (f === 'unread') chip.textContent = `🆕 有未读/新课件 (${all.filter(c => c.counts.unreadNotice + c.counts.recentMaterial > 0).length})`;
    });

    const filtered = [];
    for (const c of all) {
      if (state.filter === 'merged' && !(c.platforms.wlxt && c.platforms.ykt)) continue;
      if (state.filter === 'ddl' && c.counts.pendingDdl === 0) continue;
      if (state.filter === 'replay' && (c.counts.totalReplays || 0) === 0) continue;
      if (state.filter === 'unread' && (c.counts.unreadNotice + c.counts.recentMaterial) === 0) continue;
      if (state.filter === 'wlxt' && !(c.platforms.wlxt && !c.platforms.ykt)) continue;
      if (state.filter === 'ykt' && !(c.platforms.ykt && !c.platforms.wlxt)) continue;

      const m = courseMatchesQuery(c, q);
      if (!m.matched) continue;
      filtered.push({ course: c, matchedTab: m.matchedTab });
    }

    if (!filtered.length) {
      if (all.length === 0) {
        container.innerHTML = `
          <div class="ch-empty">
            <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:6px">暂未拉取到本学期课程</div>
            <div>请确认已在浏览器登录网络学堂或雨课堂，然后点击右上角「🔄 同步刷新」。</div>
          </div>`;
      } else {
        container.innerHTML = '<div class="ch-empty">没有符合当前筛选或搜索条件的课程</div>';
      }
      return;
    }

    container.innerHTML = filtered.map(({ course: c, matchedTab }) => {
      const isDual = c.platforms.wlxt && c.platforms.ykt;
      const defaultFilterTab = state.filter === 'replay' && state.expandedTabs[c.id] === undefined ? 'replays' : '';
      const activeTab = matchedTab || (state.expandedTabs[c.id] !== undefined ? state.expandedTabs[c.id] : defaultFilterTab);

      const badges = [];
      if (isDual) badges.push(`<span class="ch-plat merged">${c.matchType === 'manual' ? '🔗 手动绑定' : '🔗 双端合体'}</span>`);
      if (c.platforms.wlxt) badges.push('<span class="ch-plat wlxt">📘 学堂</span>');
      if (c.platforms.ykt) badges.push('<span class="ch-plat ykt">🌧️ 雨课堂</span>');

      const liveReplays = (c.replays || []).filter(isReplayLive);

      const alerts = [];
      if (liveReplays.length > 0) alerts.push('<span class="ch-alert-pill live">🔴 正在直播</span>');
      if (c.counts.pendingDdl > 0) alerts.push(`<span class="ch-alert-pill ddl">🔥 ${c.counts.pendingDdl} 项待完成作业/测验</span>`);
      if (c.counts.unreadNotice > 0) alerts.push(`<span class="ch-alert-pill notice">📢 ${c.counts.unreadNotice} 条未读公告</span>`);
      if ((c.counts.totalReplays || 0) > 0) alerts.push(`<span class="ch-alert-pill replay">🎬 ${c.counts.totalReplays} 节课堂回放</span>`);
      if (c.counts.recentMaterial > 0) alerts.push(`<span class="ch-alert-pill mat">📑 ${c.counts.recentMaterial} 份近期课件/文件</span>`);

      const jumpLinks = [];
      if (liveReplays.length > 0) {
        jumpLinks.push(`<a class="ch-mini-link live" href="${esc(liveReplays[0].url)}" target="_blank" rel="noopener">🔴 进入直播 ↗</a>`);
      }
      if (c.wlxt && c.wlxt.url) {
        jumpLinks.push(`<a class="ch-jump wlxt" href="${esc(c.wlxt.url)}" target="_blank" rel="noopener">📘 学堂主页 ↗</a>`);
      }
      if (c.ykt && c.ykt.url) {
        jumpLinks.push(`<a class="ch-jump ykt" href="${esc(c.ykt.url)}" target="_blank" rel="noopener">🌧️ 雨课堂日志 ↗</a>`);
      }

      return `
        <article class="ch-card" data-course-id="${esc(c.id)}">
          <div class="ch-card-top">
            <div class="ch-card-title-row">
              <span class="ch-card-title">${esc(c.name)}</span>
              ${c.teacher ? `<span class="ch-meta-tag">${esc(c.teacher)}</span>` : ''}
              ${c.courseNumber ? `<span class="ch-meta-tag">${esc(c.courseNumber)}</span>` : ''}
              ${c.className ? `<span class="ch-meta-tag">${esc(c.className)}</span>` : ''}
            </div>
            <div class="ch-platform-badges">${badges.join('')}</div>
          </div>

          ${alerts.length ? `<div class="ch-card-alerts">${alerts.join('')}</div>` : ''}

          <div class="ch-card-bar">
            <div class="ch-subtabs">
              <button class="ch-subtab ${activeTab === 'tasks' ? 'on' : ''}" data-cid="${esc(c.id)}" data-tab="tasks">
                📝 作业与习题 (${c.counts.totalTasks})
              </button>
              <button class="ch-subtab ${activeTab === 'replays' ? 'on' : ''}" data-cid="${esc(c.id)}" data-tab="replays">
                🎬 课堂回放 (${c.counts.totalReplays || 0})
              </button>
              <button class="ch-subtab ${activeTab === 'materials' ? 'on' : ''}" data-cid="${esc(c.id)}" data-tab="materials">
                📂 课件与文件 (${c.counts.totalMaterials})
              </button>
              <button class="ch-subtab ${activeTab === 'announcements' ? 'on' : ''}" data-cid="${esc(c.id)}" data-tab="announcements">
                📢 公告 (${c.counts.totalAnnouncements})
              </button>
            </div>
            <div class="ch-jump-links">${jumpLinks.join('')}</div>
          </div>

          ${activeTab ? `<div class="ch-drawer">${renderDrawerContent(c, activeTab, q)}</div>` : ''}
        </article>
      `;
    }).join('');

    container.querySelectorAll('.ch-subtab').forEach(btn => {
      btn.onclick = () => {
        const cid = btn.getAttribute('data-cid');
        const tab = btn.getAttribute('data-tab');
        const curDefault = state.filter === 'replay' && state.expandedTabs[cid] === undefined ? 'replays' : (state.expandedTabs[cid] || '');
        state.expandedTabs[cid] = curDefault === tab ? '' : tab;
        renderCourses();
      };
    });

    container.querySelectorAll('[data-toggle-inline-notice]').forEach(el => {
      el.onclick = () => {
        const nid = el.getAttribute('data-toggle-inline-notice');
        state.inlineNotices[nid] = !state.inlineNotices[nid];
        renderCourses();
      };
    });

    container.querySelectorAll('.ch-inline-notice-body').forEach(box => {
      hydrateRichImages(box, box.getAttribute('data-notice-origin') || '');
    });

    container.querySelectorAll('[data-open-notice]').forEach(btn => {
      btn.onclick = () => openNoticeById(btn.getAttribute('data-open-notice'));
    });
  }

  function renderAll() {
    updateFabBadge();
    renderHeader();
    renderLiveBanner();
    renderStats();
    renderDdlRadar();
    renderReplayHub();
    renderFeed();
    renderCourses();
  }

  function openNoticeById(noticeId) {
    if (!state.snapshot) return;
    let found = null;
    for (const c of state.snapshot.mergedCourses || []) {
      const hit = c.announcements.find(n => n.id === noticeId);
      if (hit) {
        found = hit;
        break;
      }
    }
    if (!found) return;

    const noticeOrigin = found.origin ||
      (found.source === 'wlxt' && state.snapshot.wlxtStatus ? state.snapshot.wlxtStatus.origin : '') ||
      '';

    const cleanRich = Core.sanitizeRichHtml(found.contentHtml || '', noticeOrigin);
    $('ch-notice-modal-title').textContent = `${found.courseName} · ${found.title}`;
    const bodyHtml = cleanRich
      ? `<div class="ch-rich-html" id="ch-notice-rich-content">${cleanRich}</div>`
      : `<div style="white-space:pre-wrap" id="ch-notice-rich-content">${esc(found.plainText || '暂无正文内容')}</div>`;

    $('ch-notice-modal-body').innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;color:#64748b;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(15,23,42,.06)">
        <span class="ch-src-mini ${found.source}">${esc(found.sourceLabel)}</span>
        ${found.publisher ? `<span>发布人：${esc(found.publisher)}</span>` : ''}
        ${found.timeMs ? `<span>时间：${esc(new Date(found.timeMs).toLocaleString('zh-CN'))}</span>` : ''}
        <span id="ch-notice-attach-slot">
          ${found.attachmentName ? `<span style="color:#4f46e5;font-weight:600">📎 附件：${esc(found.attachmentName)}</span>` : ''}
        </span>
        <a class="ch-mini-link" href="${esc(found.url)}" target="_blank" rel="noopener" style="margin-left:auto">前往原页面查看 ↗</a>
      </div>
      ${bodyHtml}
      <div id="ch-notice-attach-preview" class="ch-rich-html" style="margin-top:12px"></div>
    `;
    $('ch-notice-modal').classList.add('show');

    hydrateRichImages($('ch-notice-rich-content'), noticeOrigin);

    // If the announcement carries an attachment, resolve its direct download URL & auto-preview image attachments
    if (found.attachmentName && found.url && found.url.startsWith('http')) {
      chrome.runtime.sendMessage(
        { type: 'FETCH_NOTICE_DETAIL', url: found.url, origin: noticeOrigin },
        res => {
          if (!res || !res.ok || !res.detail || !res.detail.attachmentUrl) return;
          const dlUrl = res.detail.attachmentUrl;
          const slot = $('ch-notice-attach-slot');
          if (slot) {
            slot.innerHTML = `<a class="ch-mini-link green" href="${esc(dlUrl)}" target="_blank" rel="noopener">📎 下载附件：${esc(found.attachmentName)}</a>`;
          }
          if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(found.attachmentName)) {
            const pv = $('ch-notice-attach-preview');
            if (pv) {
              pv.innerHTML = `<div style="font-size:12px;color:#64748b;margin-bottom:6px">附图预览：</div><img src="${esc(dlUrl)}" alt="${esc(found.attachmentName)}" />`;
              hydrateRichImages(pv, noticeOrigin);
            }
          }
        }
      );
    }
  }

  function openPairingModal() {
    const snap = state.snapshot;
    if (!snap) return;

    const pairing = snap.pairing || { manualLinks: {}, unlinkedPairs: [] };
    const mergedDual = (snap.mergedCourses || []).filter(c => c.platforms.wlxt && c.platforms.ykt);
    const singleWlxt = (snap.mergedCourses || []).filter(c => c.platforms.wlxt && !c.platforms.ykt);
    const singleYkt = (snap.mergedCourses || []).filter(c => !c.platforms.wlxt && c.platforms.ykt);

    const wOrigin = (snap.wlxtStatus && snap.wlxtStatus.origin) || '';
    const yOrigin = (snap.yktStatus && snap.yktStatus.origin) || 'https://pro.yuketang.cn';
    const includeArch = Boolean(snap.prefs && snap.prefs.includeArchivedYkt);

    $('ch-pair-modal-body').innerHTML = `
      <div style="margin-bottom:18px;padding:13px 15px;border-radius:12px;background:#f8fafc;border:1px solid rgba(15,23,42,.06)">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">🌐 平台地址与同步范围</div>
        <div style="display:grid;grid-template-columns:92px 1fr;gap:8px;align-items:center;margin-bottom:8px;font-size:12.5px">
          <label style="color:#475569;font-weight:600">网络学堂地址</label>
          <input class="ch-input" id="ch-cfg-wlxt" value="${esc(wOrigin)}" placeholder="打开过一次网络学堂会自动填入，也可手动粘贴站点根地址" />
          <label style="color:#475569;font-weight:600">雨课堂地址</label>
          <input class="ch-input" id="ch-cfg-ykt" value="${esc(yOrigin)}" placeholder="https://pro.yuketang.cn" />
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;cursor:pointer">
            <input type="checkbox" id="ch-cfg-archived" ${includeArch ? 'checked' : ''} />
            同步雨课堂时包含往期已结课班级
          </label>
          <button class="ch-btn-ghost" id="ch-cfg-save" style="border-color:#4f46e5;color:#4f46e5">保存并重新同步</button>
        </div>
      </div>

      <div style="margin-bottom:16px">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">➕ 手动绑定同名异构课程</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:8px">如果某门课在两边的名称差异较大（例如一边叫全称、另一边叫简称），可以在这里手动焊死成一张卡片：</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select class="ch-select" id="ch-pair-sel-w">
            <option value="">选择未配对的学堂课程…</option>
            ${singleWlxt.map(c => `<option value="${esc(c.wlxt.id)}">${esc(c.name)} ${c.teacher ? `(${esc(c.teacher)})` : ''}</option>`).join('')}
          </select>
          <select class="ch-select" id="ch-pair-sel-y">
            <option value="">选择未配对的雨课堂班级…</option>
            ${singleYkt.map(c => `<option value="${esc(c.ykt.classroomId)}">${esc(c.name)} ${c.className ? `[${esc(c.className)}]` : ''}</option>`).join('')}
          </select>
          <button class="ch-btn-ghost" id="ch-pair-bind" style="background:#4f46e5;color:#fff;border-color:#4f46e5">绑定合体</button>
        </div>
      </div>

      <div>
        <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">🔗 当前已合体课程 (${mergedDual.length})</div>
        ${mergedDual.length === 0 ? '<div class="ch-empty" style="padding:14px">暂无已合体课程</div>' : mergedDual.map(c => `
          <div class="ch-pair-row">
            <div>
              <strong>📘 ${esc(c.wlxt.name)}</strong>
              <span style="color:#94a3b8;margin:0 6px">⇄</span>
              <strong>🌧️ ${esc(c.ykt.name)}</strong>
              <span style="font-size:11px;color:#64748b;margin-left:6px">(${c.matchType === 'manual' ? '手动绑定' : '智能匹配'})</span>
            </div>
            <button class="ch-mini-link" data-unlink-w="${esc(c.wlxt.id)}" data-unlink-y="${esc(c.ykt.classroomId)}" style="color:#dc2626;background:rgba(239,68,68,.1)">拆分</button>
          </div>
        `).join('')}
      </div>
    `;

    $('ch-pair-modal').classList.add('show');

    $('ch-cfg-save').onclick = () => {
      const nextW = $('ch-cfg-wlxt').value.trim();
      const nextY = $('ch-cfg-ykt').value.trim();
      const nextArch = $('ch-cfg-archived').checked;
      $('ch-pair-modal').classList.remove('show');
      state.syncing = true;
      renderHeader();
      chrome.runtime.sendMessage(
        { type: 'SAVE_ORIGINS', wlxtOrigin: nextW, yktOrigin: nextY },
        () => {
          chrome.runtime.sendMessage(
            { type: 'SYNC_NOW', options: { includeArchivedYkt: nextArch } },
            res => {
              state.syncing = false;
              if (res && res.ok && res.data) {
                state.snapshot = res.data;
                renderAll();
                showToast('设置已保存并完成同步');
              }
            }
          );
        }
      );
    };

    $('ch-pair-bind').onclick = () => {
      const wId = $('ch-pair-sel-w').value;
      const yId = $('ch-pair-sel-y').value;
      if (!wId || !yId) {
        showToast('请同时选择一门学堂课程和一个雨课堂班级');
        return;
      }
      const nextManual = { ...(pairing.manualLinks || {}), [wId]: yId };
      const nextUnlinked = (pairing.unlinkedPairs || []).filter(k => k !== `${wId}:${yId}`);
      chrome.runtime.sendMessage(
        { type: 'SAVE_PAIRING', pairing: { manualLinks: nextManual, unlinkedPairs: nextUnlinked } },
        res => {
          if (res && res.ok && res.data) {
            state.snapshot = res.data;
            renderAll();
            openPairingModal();
            showToast('已合并为同一门课程');
          }
        }
      );
    };

    $('ch-pair-modal-body').querySelectorAll('[data-unlink-w]').forEach(btn => {
      btn.onclick = () => {
        const wId = btn.getAttribute('data-unlink-w');
        const yId = btn.getAttribute('data-unlink-y');
        const nextManual = { ...(pairing.manualLinks || {}) };
        delete nextManual[wId];
        const nextUnlinked = Array.from(new Set([...(pairing.unlinkedPairs || []), `${wId}:${yId}`]));
        chrome.runtime.sendMessage(
          { type: 'SAVE_PAIRING', pairing: { manualLinks: nextManual, unlinkedPairs: nextUnlinked } },
          res => {
            if (res && res.ok && res.data) {
              state.snapshot = res.data;
              renderAll();
              openPairingModal();
              showToast('已拆分为独立课程卡片');
            }
          }
        );
      };
    });
  }

  function triggerSync(silent = false, options = {}) {
    if (state.syncing) return;
    state.syncing = true;
    renderHeader();
    chrome.runtime.sendMessage({ type: 'SYNC_NOW', options }, res => {
      state.syncing = false;
      if (res && res.ok && res.data) {
        state.snapshot = res.data;
        renderAll();
        if (!silent) showToast('双平台数据已同步更新');
      } else {
        renderHeader();
        if (!silent) showToast('同步未完成，请检查网络或登录状态');
      }
    });
  }

  // ─── Event Listeners ─────────────────────────────────────
  $('ch-fab').onclick = () => toggleWorkspace(true);
  $('ch-btn-exit').onclick = () => toggleWorkspace(false);
  $('ch-btn-sync').onclick = () => triggerSync(false);
  $('ch-btn-pair').onclick = openPairingModal;

  $('ch-conn-wlxt').onclick = () => {
    const st = state.snapshot && state.snapshot.wlxtStatus;
    if (st && !st.connected && st.loginUrl) {
      window.open(st.loginUrl + '#chub-native', '_blank');
    } else {
      openPairingModal();
    }
  };

  $('ch-conn-ykt').onclick = () => {
    const st = state.snapshot && state.snapshot.yktStatus;
    if (st && !st.connected && st.loginUrl) {
      window.open(st.loginUrl + '#chub-native', '_blank');
    } else {
      openPairingModal();
    }
  };

  $('ch-btn-auto').onclick = () => {
    const cur = !state.snapshot || !state.snapshot.prefs || state.snapshot.prefs.autoOpenHome !== false;
    const next = !cur;
    chrome.runtime.sendMessage({ type: 'SAVE_PREFS', prefs: { autoOpenHome: next } }, res => {
      if (state.snapshot && res && res.prefs) {
        state.snapshot.prefs = res.prefs;
        renderHeader();
        showToast(next ? '已开启：打开主页时自动展开工作台' : '已关闭：仅显示右下角悬浮入口');
      }
    });
  };

  $('ch-sem-select').onchange = e => {
    const sem = e.target.value;
    triggerSync(false, { preferredSemester: sem });
  };

  $('ch-replay-course-filter').onchange = e => {
    state.replayCourseId = e.target.value || 'all';
    renderReplayHub();
  };

  $('ch-search').oninput = e => {
    state.search = e.target.value || '';
    $('ch-search-clear').classList.toggle('show', Boolean(state.search));
    renderCourses();
  };

  $('ch-search-clear').onclick = () => {
    state.search = '';
    $('ch-search').value = '';
    $('ch-search-clear').classList.remove('show');
    renderCourses();
  };

  shadow.querySelectorAll('#ch-chips .ch-chip').forEach(chip => {
    chip.onclick = () => {
      shadow.querySelectorAll('#ch-chips .ch-chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      state.filter = chip.getAttribute('data-filter') || 'all';
      renderCourses();
    };
  });

  shadow.querySelectorAll('[data-jump-filter]').forEach(card => {
    card.onclick = () => {
      const targetFilter = card.getAttribute('data-jump-filter');
      state.filter = targetFilter;
      shadow.querySelectorAll('#ch-chips .ch-chip').forEach(c => {
        c.classList.toggle('on', c.getAttribute('data-filter') === targetFilter);
      });
      renderCourses();
    };
  });

  shadow.querySelectorAll('#ch-ddl-tabs .ch-pill-tab').forEach(tab => {
    tab.onclick = () => {
      shadow.querySelectorAll('#ch-ddl-tabs .ch-pill-tab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      state.ddlMode = tab.getAttribute('data-mode') || 'pending';
      renderDdlRadar();
    };
  });

  shadow.querySelectorAll('#ch-feed-tabs .ch-pill-tab').forEach(tab => {
    tab.onclick = () => {
      shadow.querySelectorAll('#ch-feed-tabs .ch-pill-tab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      state.feedFilter = tab.getAttribute('data-feed') || 'all';
      renderFeed();
    };
  });

  $('ch-notice-modal-close').onclick = () => $('ch-notice-modal').classList.remove('show');
  $('ch-notice-modal').onclick = e => {
    if (e.target === $('ch-notice-modal')) $('ch-notice-modal').classList.remove('show');
  };

  $('ch-pair-modal-close').onclick = () => $('ch-pair-modal').classList.remove('show');
  $('ch-pair-modal').onclick = e => {
    if (e.target === $('ch-pair-modal')) $('ch-pair-modal').classList.remove('show');
  };

  $('ch-img-lightbox').onclick = () => $('ch-img-lightbox').classList.remove('show');

  window.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      toggleWorkspace(!state.isOpen);
    } else if (e.key === 'Escape') {
      if ($('ch-img-lightbox').classList.contains('show')) {
        $('ch-img-lightbox').classList.remove('show');
      } else if ($('ch-notice-modal').classList.contains('show')) {
        $('ch-notice-modal').classList.remove('show');
      } else if ($('ch-pair-modal').classList.contains('show')) {
        $('ch-pair-modal').classList.remove('show');
      }
    }
  });

  chrome.runtime.sendMessage({ type: 'GET_SNAPSHOT' }, res => {
    if (res && res.ok && res.data) {
      state.snapshot = res.data;
      renderAll();

      const autoPref = !res.data.prefs || res.data.prefs.autoOpenHome !== false;
      const yktHasLoginCookie = !isYkt || Boolean(readCookie('sessionid') || readCookie('csrftoken'));
      const wlxtHasCsrf = !isWlxt || Boolean(detectWlxtCsrfFromDom());

      if ((isWlxtPortalHome || isYktPortalHome) && !isLoginLike && autoPref && yktHasLoginCookie && wlxtHasCsrf) {
        toggleWorkspace(true);
      }

      if (!res.data.syncedAt || (res.data.schemaVersion || 0) < 4 || Date.now() - res.data.syncedAt > 5 * 60 * 1000) {
        triggerSync(true);
      }
    }
  });
})();
