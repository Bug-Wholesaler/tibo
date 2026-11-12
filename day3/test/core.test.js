const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

test('decodeHtml decodes single and double encoded entities cleanly', () => {
  assert.equal(Core.decodeHtml('微积分A&amp;#40;1&amp;#41; &amp;ldquo;进阶&amp;rdquo;'), '微积分A(1) “进阶”');
  assert.equal(Core.decodeHtml('Data &amp; Structures &ndash; Lab 3'), 'Data & Structures – Lab 3');
});

test('decodeBase64Utf8 decodes UTF-8 HTML and htmlToPlainText strips script tags', () => {
  const rawHtml = '<p>本周五晚 <strong>23:59</strong> 提交第三次实验报告</p><script>alert(1)</script>';
  const b64 = Buffer.from(rawHtml, 'utf8').toString('base64');
  const decoded = Core.decodeBase64Utf8(b64);
  assert.ok(decoded.includes('第三次实验报告'));
  const plain = Core.htmlToPlainText(decoded);
  assert.equal(plain, '本周五晚 23:59 提交第三次实验报告');
});

test('sanitizeRichHtml unwraps entity-escaped Base64 notice HTML, resolves relative image URLs and strips rigid dimensions', () => {
  const entityEscapedHtml =
    '&lt;p&gt;考场座位图如下：&lt;/p&gt;&lt;p&gt;&lt;img src=&quot;/upload_files/seat_map.png?room=301&amp;amp;v=2&quot; width=&quot;1600&quot; height=&quot;1200&quot; style=&quot;width: 1600px; height: 1200px; border: 1px solid #ccc;&quot; /&gt;&lt;/p&gt;';
  const b64 = Buffer.from(entityEscapedHtml, 'utf8').toString('base64');
  const decoded = Core.decodeBase64Utf8(b64);
  const sanitized = Core.sanitizeRichHtml(decoded, 'https://example.org');

  assert.ok(sanitized.includes('<img src="https://example.org/upload_files/seat_map.png?room=301&v=2"'));
  assert.ok(!sanitized.includes('width="1600"'));
  assert.ok(!sanitized.includes('width: 1600px'));
  assert.ok(sanitized.includes('border: 1px solid #ccc;'));
  assert.ok(sanitized.includes('loading="lazy">'));

  const plain = Core.htmlToPlainText(decoded);
  assert.ok(plain.includes('考场座位图如下：'));
  assert.ok(plain.includes('[图片]'));
});

test('normalizeCourseName unifies full-width parens, semester prefixes and class suffixes', () => {
  assert.equal(
    Core.normalizeCourseName('大学物理B（2）'),
    Core.normalizeCourseName('2026秋-大学物理B(2)(第1课堂)')
  );
  assert.equal(
    Core.normalizeCourseName('（2026-2027-1）数据结构(1班)'),
    '数据结构'
  );
});

test('mergeCourses auto-merges matching courses and respects manual bind/unlink overrides', () => {
  const now = 1794369600000;
  const wlxtCourses = [
    {
      id: 'w1',
      chineseName: '大学物理B(2)',
      teacher: '张老师',
      courseNumber: '10430024',
      url: 'https://example.org/f/wlxt/index/course/student/course?wlkcid=w1',
      homeworks: [
        {
          id: 'hw1',
          title: '第6章电磁感应作业',
          deadline: now + 18 * 3600 * 1000,
          submitted: false,
          graded: false,
          submitUrl: 'https://example.org/submit/hw1'
        }
      ],
      notices: [
        {
          id: 'n1',
          title: '期中答疑安排',
          hasRead: false,
          markedImportant: true,
          publishTime: now - 3600 * 1000,
          contentHtml: '<p>周四下午答疑</p>'
        }
      ],
      files: [
        {
          id: 'f1',
          fileId: 'wf1',
          title: 'Ch06_讲义.pdf',
          rawSize: 2097152,
          uploadTime: now - 7200 * 1000,
          isNew: true,
          previewUrl: 'https://example.org/preview/wf1',
          downloadUrl: 'https://example.org/dl/wf1'
        },
        {
          id: 'f2',
          fileId: 'wf2',
          title: '第6章习题课录播回放.mp4',
          fileType: 'mp4',
          rawSize: 104857600,
          uploadTime: now - 5400 * 1000,
          isNew: true,
          previewUrl: 'https://example.org/preview/wf2',
          downloadUrl: 'https://example.org/dl/wf2'
        }
      ]
    },
    {
      id: 'w2',
      chineseName: '工程热力学基础',
      teacher: '李老师',
      courseNumber: '20110033',
      url: 'https://example.org/w2',
      homeworks: [],
      notices: [],
      files: []
    }
  ];

  const yktCourses = [
    {
      classroomId: '9001',
      courseName: '2026秋-大学物理B（2）（1班）',
      className: '1班',
      teacher: '张老师',
      url: 'https://pro.yuketang.cn/v2/web/studentLog/9001',
      activities: [
        {
          id: 'cw1',
          category: 'courseware',
          title: '第11讲 麦克斯韦方程组',
          createTime: Math.floor((now - 1800 * 1000) / 1000),
          hasRead: false,
          slideCount: 42,
          url: 'https://pro.yuketang.cn/v2/web/studentCards/9001/cw1'
        },
        {
          id: 'rp1',
          category: 'replay',
          subLabel: '上课实录',
          title: '第11讲 麦克斯韦方程组（智慧教室实录）',
          createTime: Math.floor((now - 1200 * 1000) / 1000),
          hasRead: false,
          slideCount: 42,
          url: 'https://pro.yuketang.cn/v2/web/student-lesson-report/9001/1319866990000000001/8080001'
        },
        {
          id: 'qz1',
          category: 'quiz',
          title: '第11讲随堂小测',
          createTime: Math.floor((now - 1500 * 1000) / 1000),
          deadline: Math.floor((now + 5 * 3600 * 1000) / 1000),
          submitted: false,
          url: 'https://pro.yuketang.cn/v2/web/studentQuiz/qz1/1'
        }
      ]
    },
    {
      classroomId: '9002',
      courseName: '工热26秋周三课堂',
      className: '周三班',
      teacher: '助教团队',
      url: 'https://pro.yuketang.cn/v2/web/studentLog/9002',
      activities: []
    }
  ];

  // Auto-merge check
  const autoMerged = Core.mergeCourses(wlxtCourses, yktCourses, {}, now);
  assert.equal(autoMerged.length, 3);
  const phys = autoMerged.find(c => c.name === '大学物理B(2)');
  assert.ok(phys);
  assert.equal(phys.platforms.wlxt, true);
  assert.equal(phys.platforms.ykt, true);
  assert.equal(phys.counts.pendingDdl, 2);
  assert.equal(phys.counts.unreadNotice, 1);
  assert.equal(phys.counts.recentMaterial, 2);
  assert.equal(phys.counts.totalReplays, 2);
  assert.equal(phys.replays[0].title, '第11讲 麦克斯韦方程组（智慧教室实录）');
  assert.equal(phys.replays[1].title, '第6章习题课录播回放.mp4');

  // Manual bind check for differently named courses
  const manualMerged = Core.mergeCourses(
    wlxtCourses,
    yktCourses,
    { manualLinks: { w2: '9002' }, unlinkedPairs: [] },
    now
  );
  assert.equal(manualMerged.length, 2);
  assert.ok(manualMerged.every(c => c.platforms.wlxt && c.platforms.ykt));

  // Radar sorting check: nearest deadline (5h quiz) comes before 18h homework
  const radar = Core.buildGlobalRadar(manualMerged, now);
  assert.equal(radar.stats.mergedCount, 2);
  assert.equal(radar.stats.pendingTaskCount, 2);
  assert.equal(radar.stats.urgent48hCount, 2);
  assert.equal(radar.stats.totalReplaysCount, 2);
  assert.equal(radar.recentReplays.length, 2);
  assert.equal(radar.urgentTasks[0].title, '第11讲随堂小测');
  assert.equal(radar.urgentTasks[1].title, '第6章电磁感应作业');

  // Manual unlink check
  const splitMerged = Core.mergeCourses(
    wlxtCourses,
    yktCourses,
    { manualLinks: {}, unlinkedPairs: ['w1:9001'] },
    now
  );
  assert.equal(splitMerged.length, 4);
});

test('formatCountdown classifies critical, warning, calm and overdue levels accurately', () => {
  const now = 1794369600000;
  assert.equal(Core.formatCountdown(now + 3 * 3600 * 1000, now).level, 'critical');
  assert.equal(Core.formatCountdown(now + 36 * 3600 * 1000, now).level, 'warn');
  assert.equal(Core.formatCountdown(now + 6 * 24 * 3600 * 1000, now).level, 'calm');
  assert.equal(Core.formatCountdown(now - 4 * 3600 * 1000, now).level, 'overdue');
});

test('classifyYktActivity builds exact official router URLs for lesson replays, videos, cards, quizzes and notices', () => {
  const origin = 'https://pro.yuketang.cn';
  const classroomId = '3130001';
  const courseId = '190055';

  // Type 14: Smart classroom lesson replay -> /:classroomid/:lessonid/:activityid
  const lessonReplay = Core.classifyYktActivity(
    {
      id: 8081234,
      type: 14,
      courseware_id: '1319866990000123456',
      title: '第12讲 电磁波谱',
      is_finished: true,
      total_num: 36
    },
    origin,
    classroomId,
    courseId
  );
  assert.equal(lessonReplay.category, 'replay');
  assert.equal(
    lessonReplay.url,
    'https://pro.yuketang.cn/v2/web/student-lesson-report/3130001/1319866990000123456/8081234'
  );

  // Type 17: Cloud video -> /xcloud/video-student/:classroom_id/:leaf_id
  const cloudVid = Core.classifyYktActivity(
    {
      id: 90012,
      type: 17,
      courseware_id: '7701',
      content: { leaf_id: 556677 },
      title: '补充录播：张量初步'
    },
    origin,
    classroomId,
    courseId
  );
  assert.equal(cloudVid.category, 'replay');
  assert.equal(cloudVid.url, 'https://pro.yuketang.cn/v2/web/xcloud/video-student/3130001/556677');
  assert.equal(cloudVid.summary, '');

  // Type 2: Pushed PPT cards -> /studentCards/:classroomid/:cardsid/:activityid?cid=...&autoOpenPPT=1
  const pptCards = Core.classifyYktActivity(
    {
      id: 8089999,
      type: 2,
      courseware_id: '445566',
      title: '第12讲预习课件'
    },
    origin,
    classroomId,
    courseId
  );
  assert.equal(pptCards.category, 'courseware');
  assert.equal(
    pptCards.url,
    'https://pro.yuketang.cn/v2/web/studentCards/3130001/445566/8089999?cid=190055&autoOpenPPT=1'
  );

  // Type 4: Quiz pending vs finished summary
  const activeQuiz = Core.classifyYktActivity(
    { id: 701, type: 4, courseware_id: '998877', status: 1, title: '随堂小测' },
    origin,
    classroomId,
    courseId
  );
  assert.equal(activeQuiz.category, 'quiz');
  assert.equal(activeQuiz.submitted, false);
  assert.equal(activeQuiz.url, 'https://pro.yuketang.cn/v2/web/studentQuiz/998877/1');

  const doneQuiz = Core.classifyYktActivity(
    { id: 702, type: 4, courseware_id: '998878', status: 3, title: '已结束小测' },
    origin,
    classroomId,
    courseId
  );
  assert.equal(doneQuiz.submitted, true);
  assert.equal(doneQuiz.url, 'https://pro.yuketang.cn/v2/web/quizSummary/3130001/998878');

  // Type 13: Discussion must NOT be misclassified as replay
  const disc = Core.classifyYktActivity(
    { id: 601, type: 13, courseware_id: '112233', title: '课堂视频讨论帖' },
    origin,
    classroomId,
    courseId
  );
  assert.notEqual(disc.category, 'replay');
  assert.equal(disc.isLive, false);
});

test('classifyYktActivity identifies ongoing live lessons (isLive) and points to /lesson/fullscreen/v3/:lessonId', () => {
  const origin = 'https://pro.yuketang.cn';
  const classroomId = '3130001';
  const courseId = '190055';

  // Ongoing type 14 lesson (is_finished: false)
  const liveType14 = Core.classifyYktActivity(
    {
      id: 8085555,
      type: 14,
      lesson_id: '9900112233',
      title: '第13讲 光的干涉与衍射',
      is_finished: false
    },
    origin,
    classroomId,
    courseId
  );
  assert.equal(liveType14.category, 'replay');
  assert.equal(liveType14.subLabel, '正在上课');
  assert.equal(liveType14.isLive, true);
  assert.equal(liveType14.url, 'https://pro.yuketang.cn/lesson/fullscreen/v3/9900112233');

  // Explicit real-time live item passed without type 14
  const explicitLive = Core.classifyYktActivity(
    {
      id: 'live_778899',
      lesson_id: '7788990011',
      title: '实时直播课堂',
      isLive: true
    },
    origin,
    classroomId,
    courseId
  );
  assert.equal(explicitLive.category, 'replay');
  assert.equal(explicitLive.subLabel, '正在上课');
  assert.equal(explicitLive.isLive, true);
  assert.equal(explicitLive.url, 'https://pro.yuketang.cn/lesson/fullscreen/v3/7788990011');
});

test('on-lesson live discovery injects missing live lessons, preserves isLive and pins live items to top of replays and radar', () => {
  const now = 1794369600000;
  const origin = 'https://pro.yuketang.cn';

  // Graceful fallback on empty / malformed payloads
  assert.deepEqual(Core.extractOnLessonClassrooms(null, origin), []);
  assert.deepEqual(Core.extractOnLessonClassrooms({ code: 0, data: {} }, origin), []);

  // Supports both snake_case and camelCase fields from /api/v3/classroom/on-lesson-upcoming-exam
  const livePayload = {
    code: 0,
    data: {
      on_lesson_classrooms: [
        {
          classroom_id: '9002',
          lesson_id: '5566778899',
          course_name: '工程热力学基础',
          classroom_name: '周三班',
          title: '第9讲 热力学第二定律'
        }
      ]
    }
  };
  const extracted = Core.extractOnLessonClassrooms(livePayload, origin);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].classroomId, '9002');
  assert.equal(extracted[0].lessonId, '5566778899');
  assert.equal(extracted[0].isLive, true);
  assert.equal(extracted[0].url, 'https://pro.yuketang.cn/lesson/fullscreen/v3/5566778899');

  // Classroom 9002 has an older replay with a newer timestamp edge case, and logs/learn has NOT surfaced 5566778899 yet
  const baseYktCourses = [
    {
      classroomId: '9001',
      courseName: '线性代数(1)',
      teacher: '王老师',
      url: `${origin}/v2/web/studentLog/9001`,
      activities: [
        Core.classifyYktActivity(
          {
            id: 'rp_old_1',
            type: 14,
            courseware_id: '111111',
            title: '第8讲 特征值与特征向量',
            create_time: now - 600 * 1000,
            is_finished: true
          },
          origin,
          '9001',
          '101'
        )
      ]
    },
    {
      classroomId: '9002',
      courseName: '工程热力学基础',
      className: '周三班',
      teacher: '李老师',
      url: `${origin}/v2/web/studentLog/9002`,
      activities: [
        Core.classifyYktActivity(
          {
            id: 'rp_prev_9002',
            type: 14,
            courseware_id: '222222',
            title: '第8讲 卡诺循环回放',
            // Intentionally give finished replay a larger timestamp than the live start time to verify strict pin-to-top
            create_time: now + 60 * 1000,
            is_finished: true
          },
          origin,
          '9002',
          '102'
        )
      ]
    }
  ];

  const liveAdjusted = Core.applyLiveLessonsToYktCourses(
    baseYktCourses,
    [
      {
        ...extracted[0],
        startTime: now - 1800 * 1000
      }
    ],
    origin,
    now
  );

  // Applying again with the same lessonId must deduplicate rather than duplicate
  const deduped = Core.applyLiveLessonsToYktCourses(liveAdjusted, extracted, origin, now);
  const c9002 = deduped.find(c => c.classroomId === '9002');
  assert.equal(c9002.activities.length, 2);

  const merged = Core.mergeCourses([], deduped, {}, now);
  // Course with active live class floats to the top
  assert.equal(merged[0].name, '工程热力学基础');
  assert.equal(merged[0].isLive, true);
  assert.equal(merged[0].counts.liveCount, 1);

  // Live lesson is pinned at index 0 of course.replays despite older startTime
  assert.equal(merged[0].replays.length, 2);
  assert.equal(merged[0].replays[0].isLive, true);
  assert.equal(merged[0].replays[0].url, 'https://pro.yuketang.cn/lesson/fullscreen/v3/5566778899');
  assert.equal(merged[0].replays[1].isLive, false);

  // Global radar preserves isLive, exposes liveLessons, and pins live item to top of recentReplays
  const radar = Core.buildGlobalRadar(merged, now);
  assert.equal(radar.stats.liveCount, 1);
  assert.equal(radar.liveLessons.length, 1);
  assert.equal(radar.liveLessons[0].url, 'https://pro.yuketang.cn/lesson/fullscreen/v3/5566778899');
  assert.equal(radar.recentReplays[0].isLive, true);
  assert.equal(radar.recentReplays[0].title, '第9讲 热力学第二定律');
});
