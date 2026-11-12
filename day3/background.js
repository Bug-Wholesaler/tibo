importScripts('core.js');

const Core = globalThis.CourseHubCore;
const STORAGE_PREFIX = 'coursehub_';
const DEFAULT_YKT_ORIGIN = 'https://pro.yuketang.cn';
const CACHE_SCHEMA_VERSION = 4;

let syncInFlight = null;

function storageGet(key, fallback = null) {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_PREFIX + key, res => {
      const val = res[STORAGE_PREFIX + key];
      resolve(val !== undefined ? val : fallback);
    });
  });
}

function storageSet(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_PREFIX + key]: value }, () => resolve());
  });
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (err) {
        results[idx] = { __error: err ? err.message : 'Unknown error' };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function cleanOrigin(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.origin;
  } catch (_) {
    return '';
  }
}

async function discoverOriginsFromTabsAndCookies() {
  let wlxtOrigin = await storageGet('wlxtOrigin', '');
  let yktOrigin = await storageGet('yktOrigin', '');

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      const url = tab.url || '';
      if (!wlxtOrigin && /\/f\/wlxt\//.test(url)) {
        wlxtOrigin = cleanOrigin(url);
        if (wlxtOrigin) await storageSet('wlxtOrigin', wlxtOrigin);
      }
      if (!yktOrigin && /\.yuketang\.cn\//.test(url)) {
        yktOrigin = cleanOrigin(url);
        if (yktOrigin) await storageSet('yktOrigin', yktOrigin);
      }
    }
  } catch (_) {}

  if (!yktOrigin) {
    for (const candidate of ['https://pro.yuketang.cn', 'https://changjiang.yuketang.cn', 'https://www.yuketang.cn']) {
      try {
        const ck = await chrome.cookies.getAll({ url: candidate });
        if (ck && ck.some(c => c.name === 'sessionid' || c.name === 'csrftoken')) {
          yktOrigin = candidate;
          await storageSet('yktOrigin', yktOrigin);
          break;
        }
      } catch (_) {}
    }
  }

  if (!yktOrigin) {
    yktOrigin = DEFAULT_YKT_ORIGIN;
  }

  return { wlxtOrigin, yktOrigin };
}

async function findPlatformTab(origin) {
  if (!origin) return null;
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.find(t => t.url && t.url.startsWith(origin + '/')) || null;
  } catch (_) {
    return null;
  }
}

function sendTabMessage(tabId, message, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('TAB_MSG_TIMEOUT'));
      }
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, resp => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        reject(new Error((resp && resp.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'TAB_MSG_FAILED'));
      } else {
        resolve(resp);
      }
    });
  });
}

async function smartRequest(origin, url, options = {}) {
  const tab = await findPlatformTab(origin);
  if (tab && tab.id) {
    try {
      const viaTab = await sendTabMessage(tab.id, { type: 'CHUB_PAGE_FETCH', url, options });
      return {
        status: viaTab.status,
        finalUrl: viaTab.finalUrl || url,
        text: viaTab.text
      };
    } catch (_) {
      // Fall back to direct service worker fetch
    }
  }

  const fetchOpts = {
    method: options.method || 'GET',
    credentials: 'include',
    redirect: 'follow',
    headers: { ...(options.headers || {}) }
  };

  if (options.formFields) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.formFields)) {
      params.set(k, v);
    }
    fetchOpts.body = params.toString();
    fetchOpts.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  } else if (options.body) {
    fetchOpts.body = options.body;
  }

  const resp = await fetch(url, fetchOpts);
  const text = await resp.text();
  return {
    status: resp.status,
    finalUrl: resp.url || url,
    text
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchImageAsDataUrl(rawImageUrl) {
  if (!rawImageUrl) throw new Error('EMPTY_IMAGE_URL');
  const origin = cleanOrigin(rawImageUrl);
  const wlxtOrigin = await storageGet('wlxtOrigin', '');
  const csrfHint = await storageGet('wlxtCsrfHint', '');

  const candidateUrls = [rawImageUrl];
  if (wlxtOrigin && origin === wlxtOrigin && csrfHint && !rawImageUrl.includes('_csrf=')) {
    try {
      const u = new URL(rawImageUrl);
      u.searchParams.set('_csrf', csrfHint);
      candidateUrls.push(u.toString());
    } catch (_) {}
  }

  // Try same-origin tab binary fetch first
  const tab = await findPlatformTab(origin);
  if (tab && tab.id) {
    for (const candidate of candidateUrls) {
      try {
        const res = await sendTabMessage(tab.id, { type: 'CHUB_PAGE_FETCH_BINARY', url: candidate }, 10000);
        if (res && res.dataUrl && res.dataUrl.startsWith('data:image/')) {
          return res.dataUrl;
        }
      } catch (_) {}
    }
  }

  // Fallback to background service worker binary fetch
  for (const candidate of candidateUrls) {
    try {
      const resp = await fetch(candidate, { credentials: 'include', redirect: 'follow' });
      if (!resp.ok) continue;
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) continue;
      const mime = ct.startsWith('image/') ? ct.split(';')[0] : 'image/png';
      const buf = await resp.arrayBuffer();
      if (!buf.byteLength) continue;
      return `data:${mime};base64,${arrayBufferToBase64(buf)}`;
    } catch (_) {}
  }

  throw new Error('IMAGE_FETCH_FAILED');
}

async function fetchNoticeExtraDetail(noticeUrl, origin) {
  if (!noticeUrl) return { attachmentUrl: '' };
  const targetOrigin = origin || cleanOrigin(noticeUrl);
  const wlxtOrigin = await storageGet('wlxtOrigin', '');
  const csrfHint = await storageGet('wlxtCsrfHint', '');

  let finalNoticeUrl = noticeUrl;
  if (wlxtOrigin && targetOrigin === wlxtOrigin && csrfHint && !noticeUrl.includes('_csrf=')) {
    try {
      const u = new URL(noticeUrl);
      u.searchParams.set('_csrf', csrfHint);
      finalNoticeUrl = u.toString();
    } catch (_) {}
  }

  const res = await smartRequest(targetOrigin, finalNoticeUrl);
  const html = res.text || '';

  // Extract attachment download link from Web Learning notice detail page
  let attachmentUrl = '';
  const attachPatterns = [
    /<a[^>]+class=["'][^"']*ml-10[^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*ml-10[^"']*["']/i,
    /<a[^>]+id=["']wjid["'][^>]+href=["']([^"']+)["']/i,
    /href=["']([^"']*\/b\/wlxt\/kj\/wlkc_kjxxb\/[^"']*downloadFile[^"']*)["']/i,
    /href=["']([^"']*downloadFile\?[^"']*wjid=[^"']+)["']/i
  ];
  for (const re of attachPatterns) {
    const m = re.exec(html);
    if (m && m[1]) {
      attachmentUrl = Core.resolveRelativeUrl(m[1], targetOrigin);
      break;
    }
  }

  return { attachmentUrl };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function extractWlxtCsrf(html) {
  if (!html) return '';
  const patterns = [
    /[?&]_csrf=([a-zA-Z0-9_-]{16,64})/,
    /name=["']_csrf["'][^>]*value=["']([a-zA-Z0-9_-]{16,64})["']/i,
    /value=["']([a-zA-Z0-9_-]{16,64})["'][^>]*name=["']_csrf["']/i,
    /_csrf\s*[:=]\s*["']([a-zA-Z0-9_-]{16,64})["']/
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) return m[1];
  }
  return '';
}

function withCsrf(url, csrf) {
  const u = new URL(url);
  u.searchParams.set('_csrf', csrf);
  return u.toString();
}

async function syncWlxt(wlxtOrigin, preferredSemester = '') {
  if (!wlxtOrigin) {
    return {
      status: {
        connected: false,
        configured: false,
        origin: '',
        message: '打开一次网络学堂页面即可自动识别并连接'
      },
      semesters: [],
      activeSemester: '',
      courses: []
    };
  }

  try {
    const homeUrl = `${wlxtOrigin}/f/wlxt/index/course/student/`;
    const homeRes = await smartRequest(wlxtOrigin, homeUrl);
    if (
      homeRes.status === 401 ||
      homeRes.status === 403 ||
      /login|auth\/login|roaming_entry/i.test(homeRes.finalUrl)
    ) {
      return {
        status: {
          connected: false,
          configured: true,
          origin: wlxtOrigin,
          loginUrl: homeUrl,
          message: '网络学堂未登录或会话已过期'
        },
        semesters: [],
        activeSemester: '',
        courses: null
      };
    }

    let csrf = extractWlxtCsrf(homeRes.text);
    if (!csrf) {
      const hintCsrf = await storageGet('wlxtCsrfHint', '');
      csrf = hintCsrf || '';
    } else {
      await storageSet('wlxtCsrfHint', csrf);
    }

    if (!csrf) {
      return {
        status: {
          connected: false,
          configured: true,
          origin: wlxtOrigin,
          loginUrl: homeUrl,
          message: '请先在浏览器登录网络学堂'
        },
        semesters: [],
        activeSemester: '',
        courses: null
      };
    }

    const [semListRes, curSemRes] = await Promise.all([
      smartRequest(wlxtOrigin, withCsrf(`${wlxtOrigin}/b/wlxt/kc/v_wlkc_xs_xktjb_coassb/queryxnxq`, csrf)).catch(() => null),
      smartRequest(wlxtOrigin, withCsrf(`${wlxtOrigin}/b/kc/zhjw_v_code_xnxq/getCurrentAndNextSemester`, csrf)).catch(() => null)
    ]);

    const semListJson = semListRes ? parseJsonSafe(semListRes.text) : null;
    const semesters = Array.isArray(semListJson) ? semListJson.filter(Boolean) : [];
    const curSemJson = curSemRes ? parseJsonSafe(curSemRes.text) : null;
    const detectedCurSem = (curSemJson && curSemJson.result && curSemJson.result.id) || semesters[0] || '';

    let activeSemester = preferredSemester && semesters.includes(preferredSemester)
      ? preferredSemester
      : (preferredSemester || detectedCurSem);

    if (!activeSemester) {
      return {
        status: {
          connected: false,
          configured: true,
          origin: wlxtOrigin,
          loginUrl: homeUrl,
          message: '未能读取当前学期，请刷新网络学堂页面重试'
        },
        semesters,
        activeSemester: '',
        courses: null
      };
    }

    const loadCoursesForSem = async sem => {
      const res = await smartRequest(
        wlxtOrigin,
        withCsrf(`${wlxtOrigin}/b/wlxt/kc/v_wlkc_xs_xkb_kcb_extend/student/loadCourseBySemesterId/${encodeURIComponent(sem)}/zh`, csrf)
      );
      const data = parseJsonSafe(res.text);
      if (!data || !Array.isArray(data.resultList)) return [];
      return data.resultList;
    };

    let rawCourses = await loadCoursesForSem(activeSemester);
    if (!preferredSemester && rawCourses.length === 0 && semesters.length > 0) {
      for (const candidateSem of semesters.slice(0, 3)) {
        if (candidateSem === activeSemester) continue;
        const alt = await loadCoursesForSem(candidateSem);
        if (alt.length > 0) {
          activeSemester = candidateSem;
          rawCourses = alt;
          break;
        }
      }
    }

    const detailedCourses = await runWithConcurrency(rawCourses, 4, async c => {
      const wlkcid = String(c.wlkcid);
      const aoData = JSON.stringify([{ name: 'wlkcid', value: wlkcid }]);

      const postWlxtList = async endpoint => {
        const r = await smartRequest(wlxtOrigin, withCsrf(`${wlxtOrigin}${endpoint}`, csrf), {
          method: 'POST',
          formFields: { aoData }
        });
        const j = parseJsonSafe(r.text);
        return (j && j.object && (j.object.aaData || j.object.resultsList)) || [];
      };

      const [hwNew, hwSub, hwGraded, noticeWgq, noticeYgq, catRes, fileRes] = await Promise.all([
        postWlxtList('/b/wlxt/kczy/zy/student/zyListWj').catch(() => []),
        postWlxtList('/b/wlxt/kczy/zy/student/zyListYjwg').catch(() => []),
        postWlxtList('/b/wlxt/kczy/zy/student/zyListYpg').catch(() => []),
        postWlxtList('/b/wlxt/kcgg/wlkc_ggb/student/pageListXsbyWgq').catch(() => []),
        postWlxtList('/b/wlxt/kcgg/wlkc_ggb/student/pageListXsbyYgq').catch(() => []),
        smartRequest(wlxtOrigin, withCsrf(`${wlxtOrigin}/b/wlxt/kj/wlkc_kjflb/student/pageList?wlkcid=${encodeURIComponent(wlkcid)}`, csrf)).catch(() => null),
        smartRequest(wlxtOrigin, withCsrf(`${wlxtOrigin}/b/wlxt/kj/wlkc_kjxxb/student/kjxxbByWlkcidAndSizeForStudent?wlkcid=${encodeURIComponent(wlkcid)}&size=200`, csrf)).catch(() => null)
      ]);

      const mapHw = (list, submitted, graded) =>
        list.map(h => ({
          id: String(h.xszyid || h.zyid),
          baseId: String(h.zyid || ''),
          title: Core.decodeHtml(h.bt || '课程作业'),
          deadline: h.jzsj || 0,
          lateDeadline: h.bjjzsj || 0,
          publishTime: h.fbsj || h.kssj || 0,
          submitTime: h.scsj || 0,
          submitted,
          graded,
          grade: h.cj !== null && h.cj !== undefined ? h.cj : '',
          graderName: h.jsm ? Core.decodeHtml(h.jsm) : '',
          gradeComment: h.pynr ? Core.decodeHtml(h.pynr) : '',
          viewUrl: `${wlxtOrigin}/f/wlxt/kczy/zy/student/viewCj?wlkcid=${encodeURIComponent(wlkcid)}&xszyid=${encodeURIComponent(h.xszyid)}`,
          submitUrl: `${wlxtOrigin}/f/wlxt/kczy/zy/student/tijiao?wlkcid=${encodeURIComponent(wlkcid)}&xszyid=${encodeURIComponent(h.xszyid)}`,
          url: submitted
            ? `${wlxtOrigin}/f/wlxt/kczy/zy/student/viewCj?wlkcid=${encodeURIComponent(wlkcid)}&xszyid=${encodeURIComponent(h.xszyid)}`
            : `${wlxtOrigin}/f/wlxt/kczy/zy/student/tijiao?wlkcid=${encodeURIComponent(wlkcid)}&xszyid=${encodeURIComponent(h.xszyid)}`
        }));

      const homeworks = [
        ...mapHw(hwNew, false, false),
        ...mapHw(hwSub, true, false),
        ...mapHw(hwGraded, true, true)
      ];

      const seenNotice = new Set();
      const notices = [...noticeWgq, ...noticeYgq]
        .filter(n => {
          const id = String(n.ggid || '');
          if (!id || seenNotice.has(id)) return false;
          seenNotice.add(id);
          return true;
        })
        .map(n => {
          const decodedRaw = n.ggnr ? Core.unwrapEncodedHtmlIfNeeded(Core.decodeBase64Utf8(n.ggnr)) : '';
          const sanitizedBody = Core.sanitizeRichHtml(decodedRaw, wlxtOrigin);
          return {
            id: String(n.ggid),
            title: Core.decodeHtml(n.bt || '课程公告'),
            publisher: n.fbrxm ? Core.decodeHtml(n.fbrxm) : '',
            hasRead: n.sfyd === '是',
            markedImportant: Number(n.sfqd) === 1,
            publishTime: n.fbsj || n.fbsjStr || 0,
            attachmentName: n.fjmc ? Core.decodeHtml(n.fjmc) : '',
            contentHtml: sanitizedBody,
            plainText: Core.htmlToPlainText(decodedRaw),
            url: `${wlxtOrigin}/f/wlxt/kcgg/wlkc_ggb/student/beforeViewXs?wlkcid=${encodeURIComponent(wlkcid)}&id=${encodeURIComponent(n.ggid)}`
          };
        });

      const catMap = new Map();
      const catJson = catRes ? parseJsonSafe(catRes.text) : null;
      const catRows = (catJson && catJson.object && catJson.object.rows) || [];
      catRows.forEach(cat => {
        if (cat && cat.kjflid) catMap.set(String(cat.kjflid), Core.decodeHtml(cat.bt || ''));
      });

      const fileJson = fileRes ? parseJsonSafe(fileRes.text) : null;
      const rawFiles = fileJson && Array.isArray(fileJson.object)
        ? fileJson.object
        : ((fileJson && fileJson.object && fileJson.object.resultsList) || []);

      const files = rawFiles.map(f => {
        const fileId = String(f.wjid || '');
        return {
          id: String(f.kjxxid || fileId),
          fileId,
          categoryName: catMap.get(String(f.kjflid || '')) || '',
          title: Core.decodeHtml(f.bt || '课程资料'),
          description: f.ms ? Core.decodeHtml(f.ms) : '',
          rawSize: f.wjdx || 0,
          size: f.fileSize || Core.formatBytes(f.wjdx),
          uploadTime: f.scsj || 0,
          isNew: Boolean(f.isNew),
          markedImportant: Number(f.sfqd) === 1,
          fileType: f.wjlx || '',
          downloadUrl: `${wlxtOrigin}/b/wlxt/kj/wlkc_kjxxb/student/downloadFile?sfgk=0&wjid=${encodeURIComponent(fileId)}`,
          previewUrl: `${wlxtOrigin}/f/wlxt/kc/wj_wjb/student/beforePlay?wjid=${encodeURIComponent(fileId)}&mk=mk_kcwj&browser=-1&sfgk=0&pageType=all`
        };
      });

      return {
        id: wlkcid,
        origin: wlxtOrigin,
        name: Core.decodeHtml(c.zywkcm || c.kcm || ''),
        chineseName: Core.decodeHtml(c.kcm || c.zywkcm || ''),
        englishName: Core.decodeHtml(c.ywkcm || ''),
        teacher: c.jsm ? Core.decodeHtml(c.jsm) : '',
        courseNumber: c.kch ? String(c.kch) : '',
        courseIndex: c.kxh ? String(c.kxh) : '',
        url: `${wlxtOrigin}/f/wlxt/index/course/student/course?wlkcid=${encodeURIComponent(wlkcid)}`,
        homeworks,
        notices,
        files
      };
    });

    const validCourses = detailedCourses.filter(c => c && !c.__error);

    return {
      status: {
        connected: true,
        configured: true,
        origin: wlxtOrigin,
        loginUrl: homeUrl,
        courseCount: validCourses.length,
        message: `已同步 ${validCourses.length} 门课程`
      },
      semesters,
      activeSemester,
      courses: validCourses
    };
  } catch (err) {
    return {
      status: {
        connected: false,
        configured: true,
        origin: wlxtOrigin,
        loginUrl: `${wlxtOrigin}/f/wlxt/index/course/student/`,
        message: `连接异常：${err.message || '请检查网络或登录状态'}`
      },
      semesters: [],
      activeSemester: '',
      courses: null
    };
  }
}

async function getYktAuthContext(yktOrigin) {
  const hint = await storageGet('yktAuthHint', {});
  let uvId = hint.uvId || '';
  let csrfToken = hint.csrfToken || '';
  let hasSession = false;

  try {
    const cookies = await chrome.cookies.getAll({ url: yktOrigin });
    for (const c of cookies) {
      if (c.name === 'sessionid' && c.value) hasSession = true;
      if ((c.name === 'university_id' || c.name === 'uv_id') && c.value) uvId = c.value;
      if (c.name === 'csrftoken' && c.value) csrfToken = c.value;
    }
  } catch (_) {}

  const branches = yktOrigin.includes('pro.yuketang.cn')
    ? (hint.xtbz ? [hint.xtbz, 'cloud', 'ykt'] : ['cloud', 'ykt'])
    : (hint.xtbz ? [hint.xtbz, 'ykt', 'cloud'] : ['ykt', 'cloud']);

  return {
    uvId: String(uvId || ''),
    csrfToken: String(csrfToken || ''),
    hasSession,
    branches: [...new Set(branches)]
  };
}

async function syncYkt(yktOrigin, wlxtCourses = [], includeArchived = false) {
  const loginUrl = `${yktOrigin}/v2/web/index`;
  try {
    const auth = await getYktAuthContext(yktOrigin);
    let rawList = null;
    let workingBranch = auth.branches[0];

    for (const branch of auth.branches) {
      const headers = {
        Accept: 'application/json, text/plain, */*',
        xtbz: branch
      };
      if (auth.uvId) {
        headers['university-id'] = auth.uvId;
        headers['uv-id'] = auth.uvId;
      }
      if (auth.csrfToken) {
        headers['x-csrftoken'] = auth.csrfToken;
      }

      const res = await smartRequest(
        yktOrigin,
        `${yktOrigin}/v2/api/web/courses/list?identity=2`,
        { headers }
      );

      if (res.status === 401 || res.status === 403 || /login/i.test(res.finalUrl)) {
        continue;
      }

      const json = parseJsonSafe(res.text);
      if (json && (json.errcode === 0 || json.code === 0 || json.success) && json.data && Array.isArray(json.data.list)) {
        rawList = json.data.list;
        workingBranch = branch;
        if (rawList.length > 0) break;
      }
    }

    if (!rawList) {
      return {
        status: {
          connected: false,
          configured: true,
          origin: yktOrigin,
          loginUrl,
          message: '雨课堂未登录或会话已过期'
        },
        courses: null,
        totalFetched: 0
      };
    }

    await storageSet('yktAuthHint', { uvId: auth.uvId, csrfToken: auth.csrfToken, xtbz: workingBranch });

    const wlxtNormSet = new Set(
      (wlxtCourses || []).map(c => Core.normalizeCourseName(c.chineseName || c.name)).filter(Boolean)
    );

    const now = Date.now();
    const recentCutoffMs = now - 190 * 24 * 3600 * 1000;

    const terms = rawList.map(item => item.term || item.academic_year_id || '').filter(Boolean);
    const primaryTerm = terms.length > 0 ? terms[0] : '';

    const selectedClassrooms = includeArchived
      ? rawList.slice(0, 35)
      : rawList.filter((item, idx) => {
          const cName = (item.course && item.course.name) || item.course_name || item.name || '';
          const norm = Core.normalizeCourseName(cName);
          if (norm && wlxtNormSet.has(norm)) return true;
          if (item.is_end === true || item.status === 2) return false;
          const itemTerm = item.term || item.academic_year_id || '';
          if (primaryTerm && itemTerm) return String(itemTerm) === String(primaryTerm);
          const created = Core.normalizeTimestamp(item.create_time || item.start_time);
          if (created > 0) return created >= recentCutoffMs;
          return idx < 14;
        });

    const activeList = selectedClassrooms.length > 0 ? selectedClassrooms : rawList.slice(0, 12);

    const fetchOnLessonPromise = (async () => {
      try {
        const liveHeaders = {
          Accept: 'application/json, text/plain, */*',
          xtbz: workingBranch
        };
        if (auth.uvId) {
          liveHeaders['university-id'] = auth.uvId;
          liveHeaders['uv-id'] = auth.uvId;
        }
        if (auth.csrfToken) {
          liveHeaders['x-csrftoken'] = auth.csrfToken;
        }
        const liveRes = await smartRequest(
          yktOrigin,
          `${yktOrigin}/api/v3/classroom/on-lesson-upcoming-exam`,
          { headers: liveHeaders }
        );
        if (!liveRes || liveRes.status < 200 || liveRes.status >= 300 || /login/i.test(liveRes.finalUrl || '')) {
          return [];
        }
        const liveJson = parseJsonSafe(liveRes.text);
        if (!liveJson) return [];
        return Core.extractOnLessonClassrooms(liveJson, yktOrigin);
      } catch (_) {
        return [];
      }
    })();

    const [liveLessons, detailedClassrooms] = await Promise.all([
      fetchOnLessonPromise,
      runWithConcurrency(activeList, 4, async item => {
        const classroomId = String(item.classroom_id || item.id || '');
        if (!classroomId) return null;
        const courseId = String((item.course && item.course.id) || item.course_id || '');

        const headers = {
          Accept: 'application/json, text/plain, */*',
          xtbz: workingBranch,
          'classroom-id': classroomId
        };
        if (auth.uvId) {
          headers['university-id'] = auth.uvId;
          headers['uv-id'] = auth.uvId;
        }
        if (auth.csrfToken) {
          headers['x-csrftoken'] = auth.csrfToken;
        }

        let rawActivities = [];
        try {
          const logRes = await smartRequest(
            yktOrigin,
            `${yktOrigin}/v2/api/web/logs/learn/${encodeURIComponent(classroomId)}?actype=-1&page=0&offset=50&sort=-1`,
            { headers }
          );
          const logJson = parseJsonSafe(logRes.text);
          if (logJson && logJson.data && Array.isArray(logJson.data.activities)) {
            rawActivities = logJson.data.activities;
          }
        } catch (_) {}

        const courseTitle = Core.decodeHtml(
          (item.course && item.course.name) || item.course_name || item.name || '雨课堂课程'
        );
        const classTitle = Core.decodeHtml(item.name || item.classroom_name || '');
        const teacherName = Core.decodeHtml(
          (item.teacher && item.teacher.name) ||
          (Array.isArray(item.teachers) && item.teachers[0] && item.teachers[0].name) ||
          item.teacher_name ||
          ''
        );

        return {
          classroomId,
          courseId,
          origin: yktOrigin,
          courseName: courseTitle,
          name: courseTitle,
          className: classTitle !== courseTitle ? classTitle : '',
          teacher: teacherName,
          url: `${yktOrigin}/v2/web/studentLog/${encodeURIComponent(classroomId)}`,
          activities: rawActivities.map(act => Core.classifyYktActivity(act, yktOrigin, classroomId, courseId))
        };
      })
    ]);

    const validClassrooms = detailedClassrooms.filter(c => c && !c.__error);
    const mergedClassrooms = Core.applyLiveLessonsToYktCourses(validClassrooms, liveLessons, yktOrigin, now, rawList);

    return {
      status: {
        connected: true,
        configured: true,
        origin: yktOrigin,
        loginUrl,
        courseCount: mergedClassrooms.length,
        totalCount: rawList.length,
        liveCount: liveLessons.length,
        message: liveLessons.length > 0
          ? `已同步 ${mergedClassrooms.length} 个课堂 · ${liveLessons.length} 门正在直播`
          : `已同步 ${mergedClassrooms.length} 个课堂`
      },
      courses: mergedClassrooms,
      liveLessons,
      totalFetched: rawList.length
    };
  } catch (err) {
    return {
      status: {
        connected: false,
        configured: true,
        origin: yktOrigin,
        loginUrl,
        message: `连接异常：${err.message || '请检查雨课堂登录状态'}`
      },
      courses: null,
      totalFetched: 0
    };
  }
}

async function buildSnapshotFromCache() {
  const cached = await storageGet('rawSyncCache', null);
  const pairing = await storageGet('pairingConfig', { manualLinks: {}, unlinkedPairs: [] });
  const prefs = await storageGet('prefs', { autoOpenHome: true, includeArchivedYkt: false, preferredSemester: '' });
  const origins = await discoverOriginsFromTabsAndCookies();

  const wlxtCourses = (cached && cached.wlxtCourses) || [];
  const yktCourses = (cached && cached.yktCourses) || [];
  const mergedCourses = Core.mergeCourses(wlxtCourses, yktCourses, pairing);
  const radar = Core.buildGlobalRadar(mergedCourses);

  return {
    schemaVersion: (cached && cached.schemaVersion) || 0,
    syncedAt: (cached && cached.syncedAt) || 0,
    semesters: (cached && cached.semesters) || [],
    activeSemester: (cached && cached.activeSemester) || '',
    wlxtStatus: (cached && cached.wlxtStatus) || {
      connected: false,
      configured: Boolean(origins.wlxtOrigin),
      origin: origins.wlxtOrigin,
      loginUrl: origins.wlxtOrigin ? `${origins.wlxtOrigin}/f/wlxt/index/course/student/` : '',
      message: origins.wlxtOrigin ? '等待首次同步' : '打开一次网络学堂即可自动绑定'
    },
    yktStatus: (cached && cached.yktStatus) || {
      connected: false,
      configured: true,
      origin: origins.yktOrigin,
      loginUrl: `${origins.yktOrigin}/v2/web/index`,
      message: '等待首次同步'
    },
    wlxtRawList: wlxtCourses.map(c => ({ id: c.id, name: c.chineseName || c.name, teacher: c.teacher })),
    yktRawList: yktCourses.map(c => ({ classroomId: c.classroomId, name: c.courseName || c.name, className: c.className, teacher: c.teacher })),
    pairing,
    prefs,
    mergedCourses,
    radar
  };
}

async function performFullSync(options = {}) {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    try {
      const prefs = await storageGet('prefs', { autoOpenHome: true, includeArchivedYkt: false, preferredSemester: '' });
      if (options.preferredSemester !== undefined) {
        prefs.preferredSemester = options.preferredSemester;
        await storageSet('prefs', prefs);
      }
      if (options.includeArchivedYkt !== undefined) {
        prefs.includeArchivedYkt = Boolean(options.includeArchivedYkt);
        await storageSet('prefs', prefs);
      }

      const prevCache = await storageGet('rawSyncCache', {});
      const { wlxtOrigin, yktOrigin } = await discoverOriginsFromTabsAndCookies();

      const wlxtResult = await syncWlxt(wlxtOrigin, prefs.preferredSemester);
      const effectiveWlxtCourses = wlxtResult.courses !== null
        ? wlxtResult.courses
        : (prevCache.wlxtCourses || []);

      const yktResult = await syncYkt(yktOrigin, effectiveWlxtCourses, prefs.includeArchivedYkt);
      const effectiveYktCourses = yktResult.courses !== null
        ? yktResult.courses
        : (prevCache.yktCourses || []);

      const updatedCache = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        syncedAt: Date.now(),
        semesters: wlxtResult.semesters && wlxtResult.semesters.length ? wlxtResult.semesters : (prevCache.semesters || []),
        activeSemester: wlxtResult.activeSemester || prevCache.activeSemester || '',
        wlxtStatus: wlxtResult.status,
        yktStatus: yktResult.status,
        wlxtCourses: effectiveWlxtCourses,
        yktCourses: effectiveYktCourses
      };

      await storageSet('rawSyncCache', updatedCache);
      return await buildSnapshotFromCache();
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'REGISTER_CONTEXT') {
    (async () => {
      if (msg.platform === 'wlxt' && msg.origin) {
        const clean = cleanOrigin(msg.origin);
        if (clean) await storageSet('wlxtOrigin', clean);
        if (msg.csrf) await storageSet('wlxtCsrfHint', msg.csrf);
      } else if (msg.platform === 'ykt' && msg.origin) {
        const clean = cleanOrigin(msg.origin);
        if (clean) await storageSet('yktOrigin', clean);
        if (msg.yktHint) {
          const prev = await storageGet('yktAuthHint', {});
          await storageSet('yktAuthHint', { ...prev, ...msg.yktHint });
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'GET_SNAPSHOT') {
    buildSnapshotFromCache()
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'SYNC_NOW') {
    performFullSync(msg.options || {})
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'FETCH_IMAGE_DATA_URL') {
    fetchImageAsDataUrl(msg.url)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'FETCH_NOTICE_DETAIL') {
    fetchNoticeExtraDetail(msg.url, msg.origin)
      .then(detail => sendResponse({ ok: true, detail }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'SAVE_PAIRING') {
    (async () => {
      await storageSet('pairingConfig', msg.pairing || { manualLinks: {}, unlinkedPairs: [] });
      const data = await buildSnapshotFromCache();
      sendResponse({ ok: true, data });
    })();
    return true;
  }

  if (msg.type === 'SAVE_PREFS') {
    (async () => {
      const cur = await storageGet('prefs', { autoOpenHome: true, includeArchivedYkt: false, preferredSemester: '' });
      const next = { ...cur, ...(msg.prefs || {}) };
      await storageSet('prefs', next);
      sendResponse({ ok: true, prefs: next });
    })();
    return true;
  }

  if (msg.type === 'SAVE_ORIGINS') {
    (async () => {
      if (msg.wlxtOrigin !== undefined) {
        const cleanW = cleanOrigin(msg.wlxtOrigin);
        if (cleanW) await storageSet('wlxtOrigin', cleanW);
      }
      if (msg.yktOrigin !== undefined) {
        const cleanY = cleanOrigin(msg.yktOrigin);
        if (cleanY) await storageSet('yktOrigin', cleanY);
      }
      const data = await performFullSync();
      sendResponse({ ok: true, data });
    })();
    return true;
  }

  return false;
});
