const dotW = document.getElementById('dot-w');
const txtW = document.getElementById('txt-w');
const dotY = document.getElementById('dot-y');
const txtY = document.getElementById('txt-y');
const mDdl = document.getElementById('m-ddl');
const mNotice = document.getElementById('m-notice');
const mMerged = document.getElementById('m-merged');
const btnLaunch = document.getElementById('btn-launch');
const hintText = document.getElementById('hint-text');

let latestSnap = null;

function isSupportedPage(url = '') {
  return /\/f\/wlxt\//i.test(url) || /^https?:\/\/[^/]*\.yuketang\.cn\//i.test(url);
}

chrome.runtime.sendMessage({ type: 'GET_SNAPSHOT' }, res => {
  if (!res || !res.ok || !res.data) return;
  const snap = res.data;
  latestSnap = snap;

  const wOk = snap.wlxtStatus && snap.wlxtStatus.connected;
  dotW.className = 'dot ' + (wOk ? 'ok' : 'warn');
  txtW.textContent = wOk ? `📘 学堂 (${snap.radar.stats.wlxtCount})` : '📘 学堂待同步';

  const yOk = snap.yktStatus && snap.yktStatus.connected;
  dotY.className = 'dot ' + (yOk ? 'ok' : 'warn');
  txtY.textContent = yOk ? `🌧️ 雨课堂 (${snap.radar.stats.yktCount})` : '🌧️ 雨课堂待同步';

  const st = snap.radar.stats;
  mDdl.textContent = String(st.pendingTaskCount);
  mDdl.classList.toggle('danger', st.pendingTaskCount > 0);
  mNotice.textContent = String(st.unreadNoticeCount);
  mMerged.textContent = `${st.mergedCount}/${st.totalCourses}`;
});

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const activeTab = tabs && tabs[0];
  if (activeTab && isSupportedPage(activeTab.url)) {
    btnLaunch.textContent = '🚀 在当前页展开工作台';
  } else {
    btnLaunch.textContent = '🚀 前往并打开工作台';
  }
});

btnLaunch.onclick = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const activeTab = tabs && tabs[0];
    if (activeTab && isSupportedPage(activeTab.url)) {
      chrome.tabs.sendMessage(activeTab.id, { type: 'CHUB_TOGGLE', forceOpen: true }, () => {
        if (chrome.runtime.lastError) {
          hintText.textContent = '请先刷新一次当前页面后再点击展开';
        } else {
          window.close();
        }
      });
      return;
    }

    // Otherwise jump to an open supported tab or open portal homepage
    chrome.tabs.query({}, allTabs => {
      const existing = allTabs.find(t => isSupportedPage(t.url));
      if (existing) {
        chrome.tabs.update(existing.id, { active: true }, () => {
          chrome.tabs.sendMessage(existing.id, { type: 'CHUB_TOGGLE', forceOpen: true }, () => {
            window.close();
          });
        });
      } else {
        const targetUrl =
          (latestSnap && latestSnap.wlxtStatus && latestSnap.wlxtStatus.loginUrl) ||
          'https://pro.yuketang.cn/v2/web/index';
        chrome.tabs.create({ url: targetUrl });
        window.close();
      }
    });
  });
};
