'use strict';

/**
 * 五位女主透明立绘与漫符配置（严格第一人称视角，绝不包含任何男主第三人称立绘/头像）
 * 优先使用 Node 端 4-边 BFS 漫水填充预处理生成的 heroine_*.png（零 file:// 跨域报错），
 * 并保留前端离屏 <canvas> loadTransparentSprite(src) BFS 抠图作为回退兜底。
 */
window.PovSprites = (function () {
  const HEROINES = {
    lori: {
      id: 'lori',
      name: '洛莉',
      role: '原生渲染帧 · 核善剪刀手正宫',
      color: '#fbbf24',
      png: 'assets/heroine_lori.png',
      jpg: 'assets/heroine_lori.jpg',
    },
    alice: {
      id: 'alice',
      name: '乐姐',
      role: '1号插帧 · 姐夫严选茶艺千金',
      color: '#fb7185',
      png: 'assets/heroine_alice.png',
      jpg: 'assets/heroine_alice.jpg',
    },
    kimberly: {
      id: 'kimberly',
      name: '鲍姐',
      role: '2号插帧 · 20年贴身御医VP',
      color: '#38bdf8',
      png: 'assets/heroine_kimberly.png',
      jpg: 'assets/heroine_kimberly.jpg',
    },
    zero: {
      id: 'zero',
      name: '零号',
      role: '3号插帧 · 辞职日盲盒黑客妹',
      color: '#a855f7',
      png: 'assets/heroine_zero.png',
      jpg: 'assets/heroine_zero.jpg',
    },
    lisa: {
      id: 'lisa',
      name: '苏表姐',
      role: '乱入吃席BOSS · 超威红厂霸总',
      color: '#ef4444',
      png: 'assets/heroine_lisa.png',
      jpg: 'assets/heroine_lisa.jpg',
    },
  };

  const BACKGROUNDS = {
    bg_hq_plaza: 'assets/bg_hq_plaza.jpg',
    bg_ceo_office: 'assets/bg_ceo_office.jpg',
    bg_night_bistro: 'assets/bg_night_bistro.jpg',
    bg_vip_clinic: 'assets/bg_vip_clinic.jpg',
    bg_server_lab: 'assets/bg_server_lab.jpg',
    bg_boardroom: 'assets/bg_boardroom.jpg',
    cg_pov_cover: 'assets/cg_pov_cover.jpg',
  };

  const EMOTES = {
    '💢': { label: '青筋暴起', cls: 'emote-anger' },
    '💕': { label: '茶艺冒心', cls: 'emote-heart' },
    '❄️': { label: '黑化寒气', cls: 'emote-chill' },
    '💦': { label: '无语汗滴', cls: 'emote-sweat' },
    '✨': { label: '阴阳闪光', cls: 'emote-sparkle' },
  };

  const spriteCache = {};

  /**
   * 前端离屏 <canvas> 4-边 BFS 漫水填充白底抠图（严格禁用 multiply 混合模式）
   */
  function loadTransparentSprite(src) {
    if (spriteCache[src]) {
      return Promise.resolve(spriteCache[src]);
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve(src);
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;
          const total = w * h;
          const visited = new Uint8Array(total);
          const isBg = new Uint8Array(total);
          const queue = new Int32Array(total);
          let head = 0;
          let tail = 0;

          const isWhite = (idx) => {
            const o = idx * 4;
            const r = data[o];
            const g = data[o + 1];
            const b = data[o + 2];
            const spread = Math.max(r, g, b) - Math.min(r, g, b);
            return r >= 234 && g >= 234 && b >= 234 && spread <= 24;
          };

          const seed = (x, y) => {
            const idx = y * w + x;
            if (!visited[idx] && isWhite(idx)) {
              visited[idx] = 1;
              queue[tail++] = idx;
            }
          };

          for (let x = 0; x < w; x++) {
            seed(x, 0);
            seed(x, h - 1);
          }
          for (let y = 0; y < h; y++) {
            seed(0, y);
            seed(w - 1, y);
          }

          while (head < tail) {
            const idx = queue[head++];
            isBg[idx] = 1;
            const x = idx % w;
            const y = (idx / w) | 0;
            const nexts = [];
            if (x > 0) nexts.push(idx - 1);
            if (x + 1 < w) nexts.push(idx + 1);
            if (y > 0) nexts.push(idx - w);
            if (y + 1 < h) nexts.push(idx + w);
            for (let i = 0; i < nexts.length; i++) {
              const n = nexts[i];
              if (!visited[n]) {
                visited[n] = 1;
                if (isWhite(n)) queue[tail++] = n;
              }
            }
          }

          for (let i = 0; i < total; i++) {
            if (isBg[i]) {
              data[i * 4 + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);
          const url = canvas.toDataURL('image/png');
          spriteCache[src] = url;
          resolve(url);
        } catch (err) {
          // file:// 下读取像素受限时直接退回预生成 PNG
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  function getHeroineSrc(id) {
    const meta = HEROINES[id];
    if (!meta) return '';
    return spriteCache[meta.png] || meta.png;
  }

  function resolveSpriteWithFallback(imgEl, id) {
    const meta = HEROINES[id];
    if (!meta || !imgEl) return;
    imgEl.onerror = () => {
      if (imgEl.dataset.fallbackTried) return;
      imgEl.dataset.fallbackTried = '1';
      loadTransparentSprite(meta.jpg).then((url) => {
        imgEl.src = url;
      });
    };
    imgEl.src = getHeroineSrc(id);
  }

  return {
    HEROINES,
    BACKGROUNDS,
    EMOTES,
    loadTransparentSprite,
    getHeroineSrc,
    resolveSpriteWithFallback,
  };
})();
