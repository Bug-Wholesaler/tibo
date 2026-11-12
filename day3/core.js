(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CourseHubCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NAMED_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ldquo: '“',
    rdquo: '”',
    lsquo: '‘',
    rsquo: '’',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    middot: '·',
    bull: '•',
    copy: '©',
    reg: '®'
  };

  function decodeSinglePass(input) {
    return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
      if (entity[0] === '#') {
        const isHex = entity[1] === 'x' || entity[1] === 'X';
        const code = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
        if (!Number.isNaN(code) && code > 0 && code <= 0x10ffff) {
          try {
            return String.fromCodePoint(code);
          } catch (_) {
            return match;
          }
        }
        return match;
      }
      const lower = entity.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)
        ? NAMED_ENTITIES[lower]
        : match;
    });
  }

  function decodeHtml(str) {
    if (!str) return '';
    let cur = String(str);
    for (let i = 0; i < 2; i++) {
      const next = decodeSinglePass(cur);
      if (next === cur) break;
      cur = next;
    }
    return cur.trim();
  }

  function decodeBase64Utf8(b64) {
    if (!b64 || typeof b64 !== 'string') return '';
    const cleaned = b64.replace(/\s+/g, '');
    if (!cleaned) return '';
    try {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        return Buffer.from(cleaned, 'base64').toString('utf8');
      }
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    } catch (_) {
      return '';
    }
  }

  function unwrapEncodedHtmlIfNeeded(html) {
    if (!html) return '';
    let out = String(html);
    // Web Learning Base64 announcement payloads often store HTML tags entity-escaped (&lt;p&gt;&lt;img src=&quot;...&quot;&gt;)
    if (/(?:&lt;|&amp;lt;|&#0*60;|&#x0*3c;)\s*\/?\s*(?:p|div|span|img|figure|section|article|br|table|tbody|tr|td|a|strong|b|em|u|ul|ol|li|h[1-6]|font|blockquote)\b/i.test(out)) {
      out = decodeHtml(out);
    }
    return out;
  }

  function resolveRelativeUrl(rawUrl, baseOrigin) {
    if (!rawUrl) return rawUrl;
    const trimmed = decodeSinglePass(String(rawUrl).trim());
    if (!trimmed) return trimmed;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith('//')) {
      return 'https:' + trimmed;
    }
    if (!baseOrigin) return trimmed;
    try {
      return new URL(trimmed, baseOrigin.endsWith('/') ? baseOrigin : baseOrigin + '/').toString();
    } catch (_) {
      return trimmed;
    }
  }

  function htmlToPlainText(html) {
    if (!html) return '';
    const unwrapped = unwrapEncodedHtmlIfNeeded(html);
    const withoutDangerous = String(unwrapped)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<img\b[^>]*>/gi, ' [图片] ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    return decodeHtml(withoutDangerous)
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function sanitizeRichHtml(html, baseOrigin = '') {
    if (!html) return '';
    let clean = unwrapEncodedHtmlIfNeeded(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[\s\S]*?<\/object>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // Rewrite relative src / href attributes & decode &amp; inside URLs
    clean = clean.replace(
      /\b(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (full, attr, dq, sq, uq) => {
        const val = dq !== undefined ? dq : (sq !== undefined ? sq : (uq || ''));
        if (/^\s*javascript:/i.test(val)) return `${attr}="#"`;
        const resolved = resolveRelativeUrl(val, baseOrigin);
        return `${attr}="${resolved.replace(/"/g, '&quot;')}"`;
      }
    );

    // Prevent oversized fixed-pixel widths/heights on <img> tags from distorting layout inside modal
    clean = clean.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
      let updatedAttrs = attrs
        .replace(/\/\s*$/, '')
        .replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      if (!/\bsrc\s*=/i.test(updatedAttrs)) {
        const altSrcMatch = /\b(?:data-src|data-original|data-cke-saved-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(updatedAttrs);
        if (altSrcMatch) {
          const fallbackVal = altSrcMatch[1] || altSrcMatch[2] || altSrcMatch[3] || '';
          if (fallbackVal) {
            const resolvedFallback = resolveRelativeUrl(fallbackVal, baseOrigin);
            updatedAttrs += ` src="${resolvedFallback.replace(/"/g, '&quot;')}"`;
          }
        }
      }
      updatedAttrs = updatedAttrs.replace(
        /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
        (_, s1, s2) => {
          const st = (s1 !== undefined ? s1 : s2)
            .replace(/(?:^|;)\s*(?:width|height|max-width)\s*:[^;]*/gi, '')
            .trim();
          return st ? `style="${st}"` : '';
        }
      );
      if (!/\bloading\s*=/i.test(updatedAttrs)) {
        updatedAttrs += ' loading="lazy"';
      }
      return `<img${updatedAttrs}>`;
    });

    return clean;
  }

  function toHalfWidth(str) {
    return String(str || '')
      .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/\u3000/g, ' ')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/[【]/g, '[')
      .replace(/[】]/g, ']')
      .replace(/[—－–]/g, '-');
  }

  function normalizeCourseName(rawName) {
    if (!rawName) return '';
    let s = toHalfWidth(decodeHtml(rawName)).toLowerCase();
    s = s.replace(/^\(?\d{4}(?:-\d{4})?(?:学年)?(?:-\d)?(?:春|夏|秋|冬|春季|夏季|秋季|冬季)?(?:学期)?\)?[-_·:\s]*/g, '');
    s = s.replace(/[-_·:\s]*\(?\d{4}(?:-\d{4})?(?:春|夏|秋|冬)\)?$/g, '');
    s = s.replace(/\((?:第?\d+课堂|\d+班|本科生班?|研究生班?|合班|[一二三四五六日]晚?班?)\)/g, '');
    s = s.replace(/[-_·\s]+(?:\d+班|第?\d+课堂)$/g, '');
    s = s.replace(/\s+/g, '');
    return s;
  }

  function extractCoreCourseStem(canonicalName) {
    if (!canonicalName) return '';
    return canonicalName
      .replace(/\([a-z0-9\u4e00-\u9fa5]{1,4}\)$/g, '')
      .replace(/[-_·:]/g, '');
  }

  function normalizeTimestamp(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') {
      if (!Number.isFinite(val) || val <= 0) return 0;
      return val < 1e11 ? Math.round(val * 1000) : Math.round(val);
    }
    const str = String(val).trim();
    if (!str) return 0;
    if (/^\d+$/.test(str)) {
      const num = Number(str);
      return num < 1e11 ? Math.round(num * 1000) : Math.round(num);
    }
    const parsed = Date.parse(str.replace(/\./g, '-'));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function teachersOverlap(t1, t2) {
    const a = String(t1 || '').trim();
    const b = String(t2 || '').trim();
    if (!a || !b) return false;
    const splitNames = s =>
      s
        .split(/[,，、/\s;；]+/)
        .map(x => x.trim())
        .filter(Boolean);
    const setA = splitNames(a);
    const setB = splitNames(b);
    return setA.some(na => setB.some(nb => na === nb || (na.length >= 2 && nb.includes(na)) || (nb.length >= 2 && na.includes(nb))));
  }

  function isVideoFile(fileObj) {
    const ext = String(fileObj.fileType || '').toLowerCase();
    const title = String(fileObj.title || '').toLowerCase();
    if (['mp4', 'mov', 'mkv', 'webm', 'flv', 'avi', 'm4v'].includes(ext)) return true;
    if (/\.(mp4|mov|mkv|webm|flv|avi)$/i.test(title)) return true;
    if (/回放|录播|课堂录像|上课录像/.test(title)) return true;
    return false;
  }

  function extractOriginFromUrl(url) {
    if (!url) return '';
    try {
      return new URL(url).origin;
    } catch (_) {
      return '';
    }
  }

  function classifyYktActivity(act, yktOrigin, classroomId, courseId) {
    const type = Number(act.type);
    const cwId = String(act.courseware_id || act.lesson_id || '');
    const actId = String(act.id || cwId || '');
    const contentObj = act.content && typeof act.content === 'object' ? act.content : null;
    const leafId = String((contentObj && contentObj.leaf_id) || '');
    const skuId = String((contentObj && contentObj.sku_id) || '');
    const leafTypeId = String((contentObj && contentObj.leaf_type_id) || cwId || '');
    const encClass = encodeURIComponent(classroomId);
    const baseLogUrl = `${yktOrigin}/v2/web/studentLog/${encClass}`;

    let category = 'courseware';
    let subLabel = '雨课堂课件';
    let url = baseLogUrl;
    let isLive = Boolean(act.isLive || act.is_live);

    if (type === 14) {
      category = 'replay';
      if (act.is_finished === false || isLive) {
        subLabel = '正在上课';
        isLive = true;
        url = act.url || (cwId ? `${yktOrigin}/lesson/fullscreen/v3/${encodeURIComponent(cwId)}` : baseLogUrl);
      } else {
        subLabel = '上课实录';
        if (cwId && actId) {
          url = `${yktOrigin}/v2/web/student-lesson-report/${encClass}/${encodeURIComponent(cwId)}/${encodeURIComponent(actId)}`;
        }
      }
    } else if (type === 3) {
      category = 'replay';
      if (act.is_finished === false || isLive) {
        subLabel = '正在上课';
        isLive = true;
        url = act.url || (cwId ? `${yktOrigin}/lesson/fullscreen/${encodeURIComponent(cwId)}` : baseLogUrl);
      } else {
        subLabel = '上课实录';
        if (cwId && actId) {
          url = `${yktOrigin}/v2/web/student/${encClass}/${encodeURIComponent(cwId)}/${encodeURIComponent(actId)}`;
        }
      }
    } else if (isLive) {
      category = 'replay';
      subLabel = '正在上课';
      isLive = true;
      url = act.url || (cwId ? `${yktOrigin}/lesson/fullscreen/v3/${encodeURIComponent(cwId)}` : baseLogUrl);
    } else if (type === 17) {
      category = 'replay';
      subLabel = '课程视频';
      const targetLeaf = leafId || cwId;
      if (targetLeaf) {
        url = `${yktOrigin}/v2/web/xcloud/video-student/${encClass}/${encodeURIComponent(targetLeaf)}`;
      }
    } else if (type === 25 || Boolean(act.has_playback || act.replay_url)) {
      category = 'replay';
      subLabel = '课堂回放';
      url = act.replay_url || baseLogUrl;
    } else if (type === 4) {
      category = 'quiz';
      subLabel = '雨课堂试卷';
      if (cwId) {
        const st = Number(act.status);
        url = (st === 2 || st === 3)
          ? `${yktOrigin}/v2/web/quizSummary/${encClass}/${encodeURIComponent(cwId)}`
          : `${yktOrigin}/v2/web/studentQuiz/${encodeURIComponent(cwId)}/1`;
      }
    } else if (type === 5) {
      category = 'quiz';
      subLabel = '雨课堂考试';
      if (cwId) {
        url = `${yktOrigin}/v2/web/exam/${encClass}/${encodeURIComponent(cwId)}`;
      }
    } else if (type === 19) {
      category = 'quiz';
      subLabel = '雨课堂作业';
      if (leafId && skuId) {
        url = `${yktOrigin}/v2/web/cloud/student/exercise/${encClass}/${encodeURIComponent(leafId)}/${encodeURIComponent(skuId)}`;
      }
    } else if (type === 20 || type === 22) {
      category = 'quiz';
      subLabel = '单元测验';
      if (leafTypeId) {
        url = `${yktOrigin}/v2/web/exam/${encClass}/${encodeURIComponent(leafTypeId)}${leafId ? `?leaf_id=${encodeURIComponent(leafId)}` : ''}`;
      }
    } else if (type === 6 || type === 9) {
      category = 'notice';
      subLabel = '雨课堂公告';
      if (cwId) {
        url = `${yktOrigin}/v2/web/noticeView/${encClass}/${encodeURIComponent(cwId)}?identity=0${type === 9 ? '&type=9' : ''}`;
      }
    } else if (type === 2) {
      category = 'courseware';
      subLabel = '雨课堂课件';
      if (cwId && actId) {
        const cidQuery = courseId ? `cid=${encodeURIComponent(courseId)}&autoOpenPPT=1` : 'autoOpenPPT=1';
        url = `${yktOrigin}/v2/web/studentCards/${encClass}/${encodeURIComponent(cwId)}/${encodeURIComponent(actId)}?${cidQuery}`;
      }
    } else if (type === 16) {
      category = 'courseware';
      subLabel = '图文讲义';
      if (leafId) {
        url = `${yktOrigin}/v2/web/lms/${encClass}/graph/${encodeURIComponent(leafId)}`;
      }
    }

    const statusNum = Number(act.status);
    const submitted = Boolean(
      act.is_submit ||
      act.submitted ||
      act.attend ||
      act.complete === 1 ||
      (type === 4 ? (statusNum === 2 || statusNum === 3) : statusNum === 1) ||
      (typeof act.user_submit_count === 'number' && act.user_submit_count > 0)
    );

    const hasRead = Boolean(
      submitted ||
      act.is_read ||
      act.read ||
      (typeof act.view_count === 'number' && act.view_count > 0)
    );

    const summaryText = typeof act.content === 'string'
      ? act.content
      : (typeof act.summary === 'string' ? act.summary : '');

    return {
      id: String(actId || cwId || `${type}_${act.create_time || Math.random()}`),
      lessonId: cwId,
      type,
      category,
      subLabel,
      isLive,
      title: decodeHtml(act.title || (isLive ? '正在直播课堂' : '课堂动态')),
      createTime: act.create_time || act.publish_time || 0,
      deadline: act.deadline || act.end_time || act.limit_time || 0,
      submitted,
      hasRead,
      score: act.score !== undefined && act.score !== null ? act.score : (act.student_score ?? ''),
      problemCount: act.prob_count || act.total_num || 0,
      slideCount: (category === 'courseware' || category === 'replay') ? (act.total_num || act.count || 0) : 0,
      summary: summaryText,
      url,
      logUrl: baseLogUrl
    };
  }

  function extractOnLessonClassrooms(payload, yktOrigin = '') {
    if (!payload || typeof payload !== 'object') return [];
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : payload;
    const rawArr = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.data)
        ? payload.data
        : (
            data.onLessonClassrooms ||
            data.on_lesson_classrooms ||
            data.onLesson ||
            data.on_lesson ||
            data.onLessonCourses ||
            data.on_lesson_courses ||
            []
          );
    if (!Array.isArray(rawArr)) return [];

    const seen = new Set();
    const out = [];

    for (const entry of rawArr) {
      if (!entry || typeof entry !== 'object') continue;
      const lessonObj = entry.lesson && typeof entry.lesson === 'object' ? entry.lesson : null;
      const classroomObj = entry.classroom && typeof entry.classroom === 'object' ? entry.classroom : null;
      const courseObj = entry.course && typeof entry.course === 'object' ? entry.course : null;

      let classroomId = String(
        entry.classroom_id ??
        entry.classroomId ??
        (classroomObj && (classroomObj.classroom_id ?? classroomObj.id)) ??
        entry.cid ??
        ''
      ).trim();

      let lessonId = String(
        entry.lesson_id ??
        entry.lessonId ??
        (lessonObj && (lessonObj.lesson_id ?? lessonObj.id)) ??
        entry.courseware_id ??
        entry.coursewareId ??
        ''
      ).trim();

      if (!classroomId && entry.id !== undefined && entry.id !== null) {
        const fallbackId = String(entry.id).trim();
        if (lessonId && fallbackId !== lessonId) {
          classroomId = fallbackId;
        } else if (!lessonId) {
          classroomId = fallbackId;
        }
      }

      if (!classroomId && !lessonId) continue;

      const dedupKey = `${classroomId}:${lessonId}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const courseId = String(
        (courseObj && courseObj.id) ??
        entry.course_id ??
        entry.courseId ??
        ''
      ).trim();

      const courseName = decodeHtml(
        (courseObj && courseObj.name) ||
        entry.course_name ||
        entry.courseName ||
        (classroomObj && (classroomObj.course_name || classroomObj.name)) ||
        entry.classroom_name ||
        entry.classroomName ||
        entry.name ||
        ''
      );

      const classroomName = decodeHtml(
        entry.classroom_name ||
        entry.classroomName ||
        (classroomObj && classroomObj.name) ||
        entry.class_name ||
        entry.className ||
        ''
      );

      const teacher = decodeHtml(
        (entry.teacher && entry.teacher.name) ||
        (Array.isArray(entry.teachers) && entry.teachers[0] && entry.teachers[0].name) ||
        entry.teacher_name ||
        entry.teacherName ||
        ''
      );

      const title = decodeHtml(
        (lessonObj && lessonObj.title) ||
        entry.lesson_title ||
        entry.lessonTitle ||
        entry.presentation_title ||
        entry.presentationTitle ||
        entry.title ||
        ''
      );

      const startTime = normalizeTimestamp(
        (lessonObj && (lessonObj.start_time ?? lessonObj.create_time)) ??
        entry.start_time ??
        entry.startTime ??
        entry.create_time ??
        entry.createTime ??
        0
      );

      const isHugeLive = Boolean(entry.is_huge_live || entry.isHugeLive || entry.huge_live);
      const rawDirectUrl = entry.live_url || entry.liveUrl || entry.url || '';
      let url = '';
      if (rawDirectUrl) {
        url = resolveRelativeUrl(rawDirectUrl, yktOrigin);
      } else if (lessonId) {
        url = `${yktOrigin}/lesson/fullscreen/v3/${encodeURIComponent(lessonId)}`;
      } else if (isHugeLive && classroomId) {
        url = `${yktOrigin}/lesson/fullscreen/huge/live/${encodeURIComponent(classroomId)}`;
      } else if (classroomId) {
        url = `${yktOrigin}/v2/web/studentLog/${encodeURIComponent(classroomId)}`;
      }

      out.push({
        classroomId,
        lessonId,
        courseId,
        courseName,
        classroomName,
        teacher,
        title,
        startTime,
        isHugeLive,
        isLive: true,
        url
      });
    }

    return out;
  }

  function applyLiveLessonsToYktCourses(yktCourses = [], liveLessons = [], yktOrigin = '', nowMs, rawCourseList = []) {
    if (!Array.isArray(liveLessons) || liveLessons.length === 0) {
      return yktCourses;
    }
    const now = nowMs || Date.now();
    const cloned = yktCourses.map(c => ({
      ...c,
      activities: Array.isArray(c.activities) ? [...c.activities] : []
    }));

    const byClassroomId = new Map();
    cloned.forEach(c => {
      if (c && c.classroomId) byClassroomId.set(String(c.classroomId), c);
    });

    const rawMetaById = new Map();
    if (Array.isArray(rawCourseList)) {
      rawCourseList.forEach(item => {
        const cid = String((item && (item.classroom_id || item.id)) || '');
        if (cid) rawMetaById.set(cid, item);
      });
    }

    for (const live of liveLessons) {
      if (!live) continue;
      let target = live.classroomId ? byClassroomId.get(String(live.classroomId)) : null;
      if (!target && live.courseName) {
        const liveNorm = normalizeCourseName(live.courseName);
        if (liveNorm) {
          target = cloned.find(c => normalizeCourseName(c.courseName || c.name) === liveNorm) || null;
        }
      }

      if (target) {
        target.isLive = true;
        const existingIdx = target.activities.findIndex(act => {
          if (live.lessonId) {
            return (
              String(act.lessonId || '') === live.lessonId ||
              String(act.id || '') === live.lessonId ||
              String(act.url || '').includes(`/${encodeURIComponent(live.lessonId)}`)
            );
          }
          return Boolean(act.isLive || act.subLabel === '正在上课');
        });

        const liveUrl = live.lessonId
          ? `${yktOrigin}/lesson/fullscreen/v3/${encodeURIComponent(live.lessonId)}`
          : (live.url || target.url);

        if (existingIdx >= 0) {
          const prev = target.activities[existingIdx];
          target.activities[existingIdx] = {
            ...prev,
            lessonId: live.lessonId || prev.lessonId || '',
            category: 'replay',
            subLabel: '正在上课',
            isLive: true,
            title: prev.title && prev.title !== '课堂动态'
              ? prev.title
              : (live.title || `${target.courseName || target.name || '课堂'}（正在直播）`),
            createTime: prev.createTime || live.startTime || now,
            url: prev.type === 3 && live.lessonId
              ? `${yktOrigin}/lesson/fullscreen/${encodeURIComponent(live.lessonId)}`
              : liveUrl
          };
        } else {
          const injected = classifyYktActivity(
            {
              id: live.lessonId ? `live_${live.lessonId}` : `live_${target.classroomId}`,
              type: 14,
              lesson_id: live.lessonId,
              courseware_id: live.lessonId,
              title: live.title || `${target.courseName || target.name || '课堂'}（正在直播）`,
              create_time: live.startTime || now,
              is_finished: false,
              isLive: true,
              url: liveUrl
            },
            yktOrigin,
            target.classroomId,
            target.courseId || live.courseId || ''
          );
          target.activities.unshift(injected);
        }
      } else {
        const cid = String(live.classroomId || `live_${live.lessonId}`);
        const rawMeta = live.classroomId ? rawMetaById.get(String(live.classroomId)) : null;
        const cTitle = live.courseName ||
          (rawMeta && decodeHtml((rawMeta.course && rawMeta.course.name) || rawMeta.course_name || rawMeta.name || '')) ||
          '正在直播课程';
        const clsTitle = live.classroomName ||
          (rawMeta && decodeHtml(rawMeta.name || rawMeta.classroom_name || '')) ||
          '';
        const tName = live.teacher ||
          (rawMeta && decodeHtml((rawMeta.teacher && rawMeta.teacher.name) || rawMeta.teacher_name || '')) ||
          '';
        const cId = live.courseId ||
          (rawMeta && String((rawMeta.course && rawMeta.course.id) || rawMeta.course_id || '')) ||
          '';
        const liveUrl = live.lessonId
          ? `${yktOrigin}/lesson/fullscreen/v3/${encodeURIComponent(live.lessonId)}`
          : (live.url || `${yktOrigin}/v2/web/studentLog/${encodeURIComponent(cid)}`);

        const injected = classifyYktActivity(
          {
            id: live.lessonId ? `live_${live.lessonId}` : `live_${cid}`,
            type: 14,
            lesson_id: live.lessonId,
            courseware_id: live.lessonId,
            title: live.title || `${cTitle}（正在直播）`,
            create_time: live.startTime || now,
            is_finished: false,
            isLive: true,
            url: liveUrl
          },
          yktOrigin,
          cid,
          cId
        );

        const synthesized = {
          classroomId: cid,
          courseId: cId,
          origin: yktOrigin,
          courseName: cTitle,
          name: cTitle,
          className: clsTitle && clsTitle !== cTitle ? clsTitle : '',
          teacher: tName,
          isLive: true,
          url: live.classroomId ? `${yktOrigin}/v2/web/studentLog/${encodeURIComponent(live.classroomId)}` : liveUrl,
          activities: [injected]
        };
        cloned.unshift(synthesized);
        byClassroomId.set(cid, synthesized);
      }
    }

    return cloned;
  }

  function buildCoursePayload(wlxt, ykt, matchType, nowMs) {
    const now = nowMs || Date.now();
    const recentWindowMs = 7 * 24 * 3600 * 1000;
    const overdueGraceMs = 7 * 24 * 3600 * 1000;

    const courseId = wlxt && ykt
      ? `merged_${wlxt.id}_${ykt.classroomId}`
      : wlxt
        ? `wlxt_${wlxt.id}`
        : `ykt_${ykt.classroomId}`;

    const courseName = (wlxt && (wlxt.chineseName || wlxt.name)) || (ykt && (ykt.courseName || ykt.name)) || '未命名课程';
    const teacherSet = [];
    if (wlxt && wlxt.teacher) teacherSet.push(wlxt.teacher);
    if (ykt && ykt.teacher && !teacherSet.some(t => t.includes(ykt.teacher))) {
      teacherSet.push(ykt.teacher);
    }
    const teacher = teacherSet.join(' / ');

    const tasks = [];
    const replays = [];
    const materials = [];
    const announcements = [];

    if (wlxt) {
      const wlxtBaseOrigin = wlxt.origin || extractOriginFromUrl(wlxt.url);

      for (const hw of wlxt.homeworks || []) {
        const deadlineMs = normalizeTimestamp(hw.deadline);
        const submitMs = normalizeTimestamp(hw.submitTime);
        const isPending = !hw.submitted;
        const isOverdue = deadlineMs > 0 && deadlineMs < now;
        tasks.push({
          id: `wlxt_hw_${hw.id}`,
          source: 'wlxt',
          sourceLabel: '学堂作业',
          courseId,
          courseName,
          title: decodeHtml(hw.title || '未命名作业'),
          deadlineMs,
          publishMs: normalizeTimestamp(hw.publishTime),
          submitMs,
          submitted: Boolean(hw.submitted),
          graded: Boolean(hw.graded),
          grade: hw.grade !== undefined && hw.grade !== null ? String(hw.grade) : '',
          gradeLevel: hw.gradeLevel || '',
          graderName: hw.graderName || '',
          gradeComment: hw.gradeComment ? htmlToPlainText(hw.gradeComment) : '',
          isPending,
          isOverdue: isPending && isOverdue,
          isActivePending: isPending && (!deadlineMs || deadlineMs >= now - overdueGraceMs),
          url: hw.submitted ? (hw.viewUrl || hw.url) : (hw.submitUrl || hw.url),
          viewUrl: hw.viewUrl || hw.url,
          submitUrl: hw.submitUrl || hw.url,
          description: hw.description ? htmlToPlainText(hw.description) : ''
        });
      }

      for (const f of wlxt.files || []) {
        const uploadMs = normalizeTimestamp(f.uploadTime);
        const isRecent = Boolean(f.isNew) || (uploadMs > 0 && now - uploadMs <= recentWindowMs);
        const itemPayload = {
          id: `wlxt_file_${f.id || f.fileId}`,
          source: 'wlxt',
          kind: isVideoFile(f) ? 'replay' : 'file',
          sourceLabel: isVideoFile(f) ? '学堂录像' : '学堂文件',
          isLive: false,
          courseId,
          courseName,
          title: decodeHtml(f.title || '未命名文件'),
          description: f.description ? decodeHtml(f.description) : '',
          sizeText: f.size || formatBytes(f.rawSize),
          fileType: (f.fileType || '').toLowerCase(),
          categoryName: f.categoryName || '',
          timeMs: uploadMs,
          isNew: isRecent,
          hasRead: !isRecent,
          important: Boolean(f.markedImportant),
          url: f.previewUrl || wlxt.url,
          downloadUrl: f.downloadUrl || ''
        };
        if (itemPayload.kind === 'replay') {
          replays.push(itemPayload);
        } else {
          materials.push(itemPayload);
        }
      }

      for (const n of wlxt.notices || []) {
        const pubMs = normalizeTimestamp(n.publishTime);
        const rawHtmlContent = n.contentHtml || '';
        announcements.push({
          id: `wlxt_notice_${n.id}`,
          rawNoticeId: String(n.id),
          wlkcid: String(wlxt.id),
          origin: wlxtBaseOrigin,
          source: 'wlxt',
          sourceLabel: '学堂公告',
          courseId,
          courseName,
          title: decodeHtml(n.title || '课程公告'),
          publisher: n.publisher || '',
          timeMs: pubMs,
          hasRead: Boolean(n.hasRead),
          important: Boolean(n.markedImportant),
          attachmentName: n.attachmentName || '',
          attachmentUrl: n.attachmentUrl || '',
          plainText: rawHtmlContent ? htmlToPlainText(rawHtmlContent) : (n.plainText || ''),
          contentHtml: sanitizeRichHtml(rawHtmlContent, wlxtBaseOrigin),
          url: n.url || wlxt.url
        });
      }
    }

    if (ykt) {
      const yktBaseOrigin = ykt.origin || extractOriginFromUrl(ykt.url);

      for (const act of ykt.activities || []) {
        const createMs = normalizeTimestamp(act.createTime);
        const deadlineMs = normalizeTimestamp(act.deadline);
        const category = act.category || 'courseware';

        if (category === 'quiz') {
          const submitted = Boolean(act.submitted);
          const isOverdue = deadlineMs > 0 && deadlineMs < now;
          tasks.push({
            id: `ykt_quiz_${ykt.classroomId}_${act.id}`,
            source: 'ykt',
            sourceLabel: '雨课堂习题',
            courseId,
            courseName,
            title: decodeHtml(act.title || '课堂测验/习题'),
            deadlineMs,
            publishMs: createMs,
            submitMs: 0,
            submitted,
            graded: act.score !== undefined && act.score !== null && act.score !== '',
            grade: act.score !== undefined && act.score !== null ? String(act.score) : '',
            gradeLevel: '',
            graderName: '',
            gradeComment: '',
            isPending: !submitted,
            isOverdue: !submitted && isOverdue,
            isActivePending: !submitted && (!deadlineMs || deadlineMs >= now - overdueGraceMs),
            url: act.url || ykt.url,
            viewUrl: act.url || ykt.url,
            submitUrl: act.url || ykt.url,
            problemCount: act.problemCount || 0
          });
        } else if (category === 'notice') {
          announcements.push({
            id: `ykt_notice_${ykt.classroomId}_${act.id}`,
            rawNoticeId: String(act.id),
            origin: yktBaseOrigin,
            source: 'ykt',
            sourceLabel: '雨课堂公告',
            courseId,
            courseName,
            title: decodeHtml(act.title || '课堂公告'),
            publisher: ykt.teacher || '',
            timeMs: createMs,
            hasRead: Boolean(act.hasRead),
            important: false,
            attachmentName: '',
            attachmentUrl: '',
            plainText: act.summary ? htmlToPlainText(act.summary) : '',
            contentHtml: act.summary ? sanitizeRichHtml(act.summary, yktBaseOrigin) : '',
            url: act.url || ykt.url
          });
        } else if (category === 'video' || category === 'replay') {
          const isLive = Boolean(act.isLive || act.is_live || act.subLabel === '正在上课');
          const isRecent = isLive ||
            (!act.hasRead && createMs > 0 && now - createMs <= recentWindowMs * 2) ||
            (createMs > 0 && now - createMs <= recentWindowMs);
          replays.push({
            id: `ykt_replay_${ykt.classroomId}_${act.id}`,
            lessonId: act.lessonId ? String(act.lessonId) : '',
            source: 'ykt',
            kind: 'replay',
            sourceLabel: act.subLabel || (isLive ? '正在上课' : '课堂回放'),
            subLabel: act.subLabel || (isLive ? '正在上课' : ''),
            isLive,
            courseId,
            courseName,
            title: decodeHtml(act.title || (isLive ? '正在直播课堂' : '课堂实录回放')),
            description: act.slideCount ? `同步课件 ${act.slideCount}P` : '',
            sizeText: act.slideCount ? `${act.slideCount}P` : '',
            fileType: 'video',
            categoryName: ykt.className || '',
            timeMs: createMs,
            isNew: isRecent,
            hasRead: isLive ? true : Boolean(act.hasRead),
            important: isLive,
            url: act.url || ykt.url,
            logUrl: act.logUrl || ykt.url,
            downloadUrl: ''
          });
        } else {
          const isRecent = (!act.hasRead && createMs > 0 && now - createMs <= recentWindowMs * 2) ||
            (createMs > 0 && now - createMs <= recentWindowMs);
          materials.push({
            id: `ykt_mat_${ykt.classroomId}_${act.id}`,
            source: 'ykt',
            kind: 'courseware',
            sourceLabel: '雨课堂课件',
            courseId,
            courseName,
            title: decodeHtml(act.title || '课堂课件'),
            description: act.slideCount ? `共 ${act.slideCount} 页课件` : '',
            sizeText: act.slideCount ? `${act.slideCount}P` : '',
            fileType: 'ppt',
            categoryName: '',
            timeMs: createMs,
            isNew: isRecent,
            important: false,
            url: act.url || ykt.url,
            downloadUrl: ''
          });
        }
      }
    }

    tasks.sort((a, b) => {
      if (a.isPending !== b.isPending) return a.isPending ? -1 : 1;
      if (a.isPending) {
        const aUpcoming = a.deadlineMs >= now;
        const bUpcoming = b.deadlineMs >= now;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        if (a.deadlineMs && b.deadlineMs) return a.deadlineMs - b.deadlineMs;
        if (a.deadlineMs !== b.deadlineMs) return a.deadlineMs ? -1 : 1;
        return (b.publishMs || 0) - (a.publishMs || 0);
      }
      return (b.deadlineMs || b.publishMs || 0) - (a.deadlineMs || a.publishMs || 0);
    });

    replays.sort((a, b) => {
      if (Boolean(a.isLive) !== Boolean(b.isLive)) return a.isLive ? -1 : 1;
      return (b.timeMs || 0) - (a.timeMs || 0);
    });
    materials.sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0));

    announcements.sort((a, b) => {
      if (a.hasRead !== b.hasRead) return a.hasRead ? 1 : -1;
      if (a.important !== b.important) return a.important ? -1 : 1;
      return (b.timeMs || 0) - (a.timeMs || 0);
    });

    const liveCount = replays.filter(r => r.isLive).length;
    const pendingDdlCount = tasks.filter(t => t.isActivePending).length;
    const unreadNoticeCount = announcements.filter(n => !n.hasRead).length;
    const recentMaterialCount = materials.filter(m => m.isNew).length;
    const recentReplayCount = replays.filter(r => r.isNew).length;

    return {
      id: courseId,
      name: courseName,
      teacher,
      courseNumber: (wlxt && wlxt.courseNumber) || '',
      className: (ykt && ykt.className) || '',
      matchType,
      isLive: liveCount > 0 || Boolean(ykt && ykt.isLive),
      platforms: {
        wlxt: Boolean(wlxt),
        ykt: Boolean(ykt)
      },
      wlxt: wlxt ? {
        id: String(wlxt.id),
        name: wlxt.chineseName || wlxt.name,
        teacher: wlxt.teacher || '',
        courseNumber: wlxt.courseNumber || '',
        url: wlxt.url || ''
      } : null,
      ykt: ykt ? {
        classroomId: String(ykt.classroomId),
        name: ykt.courseName || ykt.name,
        className: ykt.className || '',
        teacher: ykt.teacher || '',
        isLive: Boolean(ykt.isLive || liveCount > 0),
        url: ykt.url || ''
      } : null,
      counts: {
        liveCount,
        pendingDdl: pendingDdlCount,
        unreadNotice: unreadNoticeCount,
        recentMaterial: recentMaterialCount,
        recentReplay: recentReplayCount,
        totalTasks: tasks.length,
        totalReplays: replays.length,
        totalMaterials: materials.length,
        totalAnnouncements: announcements.length
      },
      tasks,
      replays,
      materials,
      announcements
    };
  }

  function mergeCourses(wlxtCourses = [], yktCourses = [], pairingConfig = {}, nowMs) {
    const manualLinks = (pairingConfig && pairingConfig.manualLinks) || {};
    const unlinkedPairs = new Set((pairingConfig && pairingConfig.unlinkedPairs) || []);

    const usedWlxt = new Set();
    const usedYkt = new Set();
    const merged = [];

    const wlxtById = new Map();
    wlxtCourses.forEach(c => wlxtById.set(String(c.id), c));
    const yktById = new Map();
    yktCourses.forEach(c => yktById.set(String(c.classroomId), c));

    for (const [wId, yId] of Object.entries(manualLinks)) {
      const w = wlxtById.get(String(wId));
      const y = yktById.get(String(yId));
      if (w && y && !usedWlxt.has(String(wId)) && !usedYkt.has(String(yId))) {
        usedWlxt.add(String(wId));
        usedYkt.add(String(yId));
        merged.push(buildCoursePayload(w, y, 'manual', nowMs));
      }
    }

    const yktCandidates = yktCourses.map(y => {
      const norm = normalizeCourseName(y.courseName || y.name);
      return {
        raw: y,
        id: String(y.classroomId),
        norm,
        stem: extractCoreCourseStem(norm)
      };
    });

    for (const w of wlxtCourses) {
      const wId = String(w.id);
      if (usedWlxt.has(wId)) continue;
      const wNorm = normalizeCourseName(w.chineseName || w.name);
      if (!wNorm) continue;

      const exactMatches = yktCandidates.filter(
        yc => !usedYkt.has(yc.id) && !unlinkedPairs.has(`${wId}:${yc.id}`) && yc.norm === wNorm
      );
      if (exactMatches.length > 0) {
        const best = exactMatches.find(yc => teachersOverlap(w.teacher, yc.raw.teacher)) || exactMatches[0];
        usedWlxt.add(wId);
        usedYkt.add(best.id);
        merged.push(buildCoursePayload(w, best.raw, 'auto', nowMs));
      }
    }

    for (const w of wlxtCourses) {
      const wId = String(w.id);
      if (usedWlxt.has(wId)) continue;
      const wNorm = normalizeCourseName(w.chineseName || w.name);
      const wStem = extractCoreCourseStem(wNorm);
      if (!wStem || wStem.length < 2) continue;

      const fuzzyMatches = yktCandidates.filter(yc => {
        if (usedYkt.has(yc.id) || unlinkedPairs.has(`${wId}:${yc.id}`)) return false;
        if (!yc.norm) return false;
        const sameTeacher = teachersOverlap(w.teacher, yc.raw.teacher);
        if (sameTeacher && (yc.stem === wStem || yc.norm.includes(wNorm) || wNorm.includes(yc.norm))) {
          return true;
        }
        if (wNorm.length >= 4 && yc.norm.length >= 4 && yc.stem === wStem && wNorm === yc.stem) {
          return true;
        }
        return false;
      });

      if (fuzzyMatches.length > 0) {
        usedWlxt.add(wId);
        usedYkt.add(fuzzyMatches[0].id);
        merged.push(buildCoursePayload(w, fuzzyMatches[0].raw, 'auto', nowMs));
      }
    }

    for (const w of wlxtCourses) {
      const wId = String(w.id);
      if (!usedWlxt.has(wId)) {
        merged.push(buildCoursePayload(w, null, 'single', nowMs));
      }
    }
    for (const y of yktCourses) {
      const yId = String(y.classroomId);
      if (!usedYkt.has(yId)) {
        merged.push(buildCoursePayload(null, y, 'single', nowMs));
      }
    }

    merged.sort((a, b) => {
      const aLive = (a.counts.liveCount || 0) > 0 ? 1 : 0;
      const bLive = (b.counts.liveCount || 0) > 0 ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      if (a.counts.pendingDdl !== b.counts.pendingDdl) {
        return b.counts.pendingDdl - a.counts.pendingDdl;
      }
      const isADual = a.platforms.wlxt && a.platforms.ykt ? 1 : 0;
      const isBDual = b.platforms.wlxt && b.platforms.ykt ? 1 : 0;
      if (isADual !== isBDual) return isBDual - isADual;
      const aAct = a.counts.unreadNotice + a.counts.recentMaterial + a.counts.recentReplay;
      const bAct = b.counts.unreadNotice + b.counts.recentMaterial + b.counts.recentReplay;
      if (aAct !== bAct) return bAct - aAct;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    return merged;
  }

  function buildGlobalRadar(mergedCourses = [], nowMs) {
    const now = nowMs || Date.now();
    const liveLessons = [];
    const urgentTasks = [];
    const completedTasks = [];
    const recentReplays = [];
    const feedItems = [];

    let mergedCount = 0;
    let wlxtCount = 0;
    let yktCount = 0;
    let unreadNoticeCount = 0;
    let recentMaterialCount = 0;
    let totalReplaysCount = 0;

    for (const course of mergedCourses) {
      if (course.platforms.wlxt && course.platforms.ykt) mergedCount++;
      if (course.platforms.wlxt) wlxtCount++;
      if (course.platforms.ykt) yktCount++;
      unreadNoticeCount += course.counts.unreadNotice;
      recentMaterialCount += course.counts.recentMaterial;
      totalReplaysCount += course.counts.totalReplays;

      for (const t of course.tasks) {
        if (t.isActivePending) {
          urgentTasks.push(t);
        } else if (t.submitted) {
          completedTasks.push(t);
        }
      }

      for (const r of course.replays) {
        recentReplays.push(r);
        if (r.isLive || r.subLabel === '正在上课') {
          liveLessons.push(r);
        }
      }

      for (const n of course.announcements) {
        feedItems.push({
          id: n.id,
          feedType: 'notice',
          source: n.source,
          sourceLabel: n.sourceLabel,
          courseId: course.id,
          courseName: course.name,
          title: n.title,
          subtitle: n.plainText ? n.plainText.slice(0, 90) : '',
          badge: !n.hasRead ? '未读' : (n.important ? '重要' : ''),
          unread: !n.hasRead,
          timeMs: n.timeMs,
          url: n.url,
          noticeRef: n
        });
      }

      for (const m of course.materials) {
        feedItems.push({
          id: m.id,
          feedType: 'material',
          source: m.source,
          sourceLabel: m.sourceLabel,
          courseId: course.id,
          courseName: course.name,
          title: m.title,
          subtitle: [m.categoryName, m.sizeText].filter(Boolean).join(' · '),
          badge: m.isNew ? '新上传' : '',
          unread: Boolean(m.isNew),
          timeMs: m.timeMs,
          url: m.url,
          downloadUrl: m.downloadUrl || ''
        });
      }
    }

    urgentTasks.sort((a, b) => {
      const aUpcoming = a.deadlineMs >= now;
      const bUpcoming = b.deadlineMs >= now;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      if (a.deadlineMs && b.deadlineMs) return a.deadlineMs - b.deadlineMs;
      if (a.deadlineMs !== b.deadlineMs) return a.deadlineMs ? -1 : 1;
      return (b.publishMs || 0) - (a.publishMs || 0);
    });

    liveLessons.sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0));
    completedTasks.sort((a, b) => (b.submitMs || b.deadlineMs || 0) - (a.submitMs || a.deadlineMs || 0));
    recentReplays.sort((a, b) => {
      const aLive = Boolean(a.isLive || a.subLabel === '正在上课');
      const bLive = Boolean(b.isLive || b.subLabel === '正在上课');
      if (aLive !== bLive) return aLive ? -1 : 1;
      return (b.timeMs || 0) - (a.timeMs || 0);
    });
    feedItems.sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0));

    const urgent48hCount = urgentTasks.filter(
      t => t.deadlineMs >= now && t.deadlineMs - now <= 48 * 3600 * 1000
    ).length;

    return {
      liveLessons,
      urgentTasks,
      completedTasks: completedTasks.slice(0, 25),
      recentReplays: recentReplays.slice(0, 60),
      feedItems: feedItems.slice(0, 80),
      stats: {
        totalCourses: mergedCourses.length,
        mergedCount,
        wlxtCount,
        yktCount,
        liveCount: liveLessons.length,
        pendingTaskCount: urgentTasks.length,
        urgent48hCount,
        unreadNoticeCount,
        recentMaterialCount,
        totalReplaysCount
      }
    };
  }

  function formatCountdown(deadlineMs, nowMs) {
    const now = nowMs || Date.now();
    if (!deadlineMs) {
      return { text: '未设截止时间', level: 'calm' };
    }
    const diff = deadlineMs - now;
    if (diff < 0) {
      const overHours = Math.floor(Math.abs(diff) / 3600000);
      if (overHours < 24) return { text: `已截止 ${Math.max(1, overHours)} 小时`, level: 'overdue' };
      return { text: `已截止 ${Math.floor(overHours / 24)} 天`, level: 'overdue' };
    }
    const totalMinutes = Math.floor(diff / 60000);
    if (totalMinutes < 60) {
      return { text: `剩 ${Math.max(1, totalMinutes)} 分钟`, level: 'critical' };
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours < 24) {
      return { text: `剩 ${hours} 小时 ${mins} 分`, level: 'critical' };
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (days < 3) {
      return { text: `剩 ${days} 天 ${remHours} 小时`, level: 'warn' };
    }
    return { text: `剩 ${days} 天`, level: 'calm' };
  }

  function formatRelativeTime(tsMs, nowMs) {
    if (!tsMs) return '';
    const now = nowMs || Date.now();
    const diff = now - tsMs;
    if (diff < 60000 && diff >= -60000) return '刚刚';
    if (diff > 0) {
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins} 分钟前`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours} 小时前`;
      const days = Math.floor(hours / 24);
      if (days <= 7) return `${days} 天前`;
    }
    const d = new Date(tsMs);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm}`;
  }

  return {
    decodeHtml,
    decodeBase64Utf8,
    unwrapEncodedHtmlIfNeeded,
    resolveRelativeUrl,
    htmlToPlainText,
    sanitizeRichHtml,
    normalizeCourseName,
    extractCoreCourseStem,
    normalizeTimestamp,
    formatBytes,
    teachersOverlap,
    classifyYktActivity,
    extractOnLessonClassrooms,
    applyLiveLessonsToYktCourses,
    mergeCourses,
    buildGlobalRadar,
    formatCountdown,
    formatRelativeTime
  };
});
