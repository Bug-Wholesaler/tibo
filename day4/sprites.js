/**
 * 《恋与皮衣：今夜无人加仓》- 二次元赛博精细立绘与通讯头像系统
 * 支持 Canvas BFS 边缘漫水填充抠图引擎、预处理透明 PNG 极速加载与原生矢量 SVG 兜底
 */

// 真实美术素材映射表
const SPRITE_MAP = {
  // 角色立绘：优先加载经四边 BFS 精确羽化抠图的透明 PNG
  "huang_broken": "assets/jensen_broken.png",
  "huang_normal": "assets/jensen_normal.png",
  "huang_blush": "assets/jensen_blush.png",
  "huang_shock": "assets/jensen_shock.png",
  "huang_sad": "assets/jensen_sad.png",
  "huang_cool": "assets/jensen_cool.png",

  // 手机通讯修罗场与客串头像
  "joy": "assets/avatar_joy.jpg",
  "wife": "assets/avatar_wife.jpg",
  "musk": "assets/avatar_musk.jpg",
  "su": "assets/avatar_su.jpg",
  "shark": "",     // 华尔街空头大鳄使用内置矢量西装大白鲨头像
  "grandma": "",   // 夜市芭乐阿嬷使用内置矢量芭乐水果刀心碎头像
  "kimberly": "",  // 贴身医保·鲍姐（潜伏近20年医疗保健女VP）
  "cook": "",      // 果味接班人·库克（8G黄金显存环保大师）
  "mystery3": "",  // 第3名神秘女员工盲盒（DLSS #3 插帧）
  "buffett": ""    // 躺赢重返富豪榜第七的巴菲特老爷子
};

// 内存 DataURL 缓存
const SPRITE_CACHE = new Map();

/**
 * 核心抠图工具函数：Canvas BFS 边缘漫水填充 (Flood Fill)
 * 仅从画布四条边界的近白像素向内浸润，将连通背景色设为透明并对边界做 1~2px 柔和羽化；
 * 完美保护人物内部的银白卷发、白色镜片反光、道歉信纸张与晶圆高光！
 */
function loadTransparentSprite(src, whiteThresh = 238, featherThresh = 215) {
  return new Promise((resolve) => {
    if (SPRITE_CACHE.has(src)) {
      resolve(SPRITE_CACHE.get(src));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        canvas.width = w;
        canvas.height = h;

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const visited = new Uint8Array(w * h);
        const isBg = new Uint8Array(w * h);
        const queue = [];

        const isNearWhite = (idx) => {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          return r >= whiteThresh && g >= whiteThresh && b >= whiteThresh;
        };

        // 收集四边边缘种子
        for (let x = 0; x < w; x++) {
          const topIdx = x;
          const botIdx = (h - 1) * w + x;
          if (isNearWhite(topIdx * 4)) {
            queue.push(topIdx);
            visited[topIdx] = 1;
          }
          if (isNearWhite(botIdx * 4)) {
            queue.push(botIdx);
            visited[botIdx] = 1;
          }
        }
        for (let y = 0; y < h; y++) {
          const leftIdx = y * w;
          const rightIdx = y * w + (w - 1);
          if (!visited[leftIdx] && isNearWhite(leftIdx * 4)) {
            queue.push(leftIdx);
            visited[leftIdx] = 1;
          }
          if (!visited[rightIdx] && isNearWhite(rightIdx * 4)) {
            queue.push(rightIdx);
            visited[rightIdx] = 1;
          }
        }

        // BFS 队列漫水填充
        let head = 0;
        while (head < queue.length) {
          const curr = queue[head++];
          isBg[curr] = 1;
          const cx = curr % w;
          const cy = Math.floor(curr / w);

          const neighbors = [
            cx > 0 ? curr - 1 : -1,
            cx < w - 1 ? curr + 1 : -1,
            cy > 0 ? curr - w : -1,
            cy < h - 1 ? curr + w : -1
          ];

          for (let i = 0; i < 4; i++) {
            const n = neighbors[i];
            if (n !== -1 && !visited[n]) {
              visited[n] = 1;
              if (isNearWhite(n * 4)) {
                queue.push(n);
              }
            }
          }
        }

        // 应用透明与边缘羽化平滑抗锯齿
        for (let idx = 0; idx < w * h; idx++) {
          const p = idx * 4;
          if (isBg[idx]) {
            data[p + 3] = 0;
          } else {
            const cx = idx % w;
            const cy = Math.floor(idx / w);
            const isBorder = (
              (cx > 0 && isBg[idx - 1]) ||
              (cx < w - 1 && isBg[idx + 1]) ||
              (cy > 0 && isBg[idx - w]) ||
              (cy < h - 1 && isBg[idx + w])
            );

            if (isBorder) {
              const r = data[p];
              const g = data[p + 1];
              const b = data[p + 2];
              const brightness = (r + g + b) / 3;
              if (brightness >= featherThresh) {
                const ratio = (brightness - featherThresh) / (255 - featherThresh);
                data[p + 3] = Math.round((1 - ratio) * 255);
              }
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const transparentDataUrl = canvas.toDataURL("image/png");
        SPRITE_CACHE.set(src, transparentDataUrl);
        resolve(transparentDataUrl);
      } catch (err) {
        // file:// 协议本地打开触发跨域限制时平滑回退使用原路径
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

// 原生矢量 SVG 立绘兜底库 (老黄 6 种表情差分：含战损塌房 broken)
const SVG_SPRITES = {
  broken: `
    <svg viewBox="0 0 400 650" class="sprite-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="brkLeather" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#262930"/><stop offset="100%" stop-color="#090a0d"/></linearGradient>
        <linearGradient id="brkHair" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f1f5f9"/><stop offset="100%" stop-color="#64748b"/></linearGradient>
        <linearGradient id="brkSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#fdba74"/></linearGradient>
        <linearGradient id="gloomGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e1b4b" stop-opacity="0.85"/><stop offset="100%" stop-color="#312e81" stop-opacity="0"/></linearGradient>
      </defs>
      <!-- 头顶社死黑线与乌云阴影 -->
      <rect x="110" y="75" width="180" height="115" rx="20" fill="url(#gloomGrad)"/>
      <g stroke="#312e81" stroke-width="3" stroke-linecap="round" opacity="0.8">
        <line x1="130" y1="82" x2="130" y2="155"/><line x1="146" y1="74" x2="146" y2="148"/>
        <line x1="252" y1="76" x2="252" y2="152"/><line x1="268" y1="84" x2="268" y2="160"/>
        <line x1="282" y1="95" x2="282" y2="155"/>
      </g>
      <!-- 战损皮衣躯干 -->
      <g id="brkBody">
        <path d="M122 325 L62 435 L38 650 L362 650 L335 430 L278 325 Z" fill="url(#brkLeather)" stroke="#0f172a" stroke-width="3"/>
        <path d="M138 295 L112 374 L158 388 L182 342 Z" fill="#1e232a" stroke="#475569" stroke-width="2"/>
        <path d="M262 295 L288 374 L242 388 L218 342 Z" fill="#1e232a" stroke="#475569" stroke-width="2"/>
        <line x1="200" y1="345" x2="200" y2="650" stroke="#94a3b8" stroke-width="4" stroke-dasharray="7,4"/>
        <!-- 左袖剪刀裂口 + 粉红创可贴 -->
        <polyline points="68,455 88,468 74,480 98,492 80,505" fill="none" stroke="#dc2626" stroke-width="3"/>
        <g transform="rotate(-24 84 480)">
          <rect x="58" y="468" width="54" height="22" rx="9" fill="#f472b6" stroke="#be185d" stroke-width="2"/>
          <rect x="75" y="470" width="20" height="18" rx="3" fill="#fbcfe8"/>
          <circle cx="81" cy="476" r="1.5" fill="#be185d"/><circle cx="89" cy="476" r="1.5" fill="#be185d"/>
          <circle cx="81" cy="483" r="1.5" fill="#be185d"/><circle cx="89" cy="483" r="1.5" fill="#be185d"/>
        </g>
      </g>
      <!-- 脖颈与落汤鸡脸庞 -->
      <path d="M172 262 L172 318 Q200 328 228 318 L228 262 Z" fill="url(#brkSkin)"/>
      <path d="M145 182 Q140 268 190 288 Q200 291 210 288 Q260 268 255 182 Z" fill="url(#brkSkin)"/>
      <!-- 瀑布宽面条眼泪 -->
      <path d="M162 204 Q154 248 158 286 L178 286 Q176 248 182 204 Z" fill="#38bdf8" opacity="0.82"/>
      <path d="M218 208 Q224 250 222 286 L242 286 Q246 250 238 208 Z" fill="#38bdf8" opacity="0.82"/>
      <!-- 歪斜黑框眼镜 -->
      <g transform="rotate(9 200 196)">
        <rect x="150" y="180" width="40" height="26" rx="5" fill="#e0f2fe" fill-opacity="0.55" stroke="#090a0f" stroke-width="4.5"/>
        <rect x="208" y="180" width="40" height="26" rx="5" fill="#e0f2fe" fill-opacity="0.55" stroke="#090a0f" stroke-width="4.5"/>
        <line x1="190" y1="192" x2="208" y2="192" stroke="#090a0f" stroke-width="4.5"/>
      </g>
      <!-- 委屈波浪哭嘴 -->
      <path d="M180 256 Q190 246 200 256 Q210 264 220 254" stroke="#7f1d1d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <!-- 湿透耷拉银白乱发与水珠 -->
      <path d="M132 186 Q142 108 200 108 Q258 108 268 186 Q252 152 232 192 Q212 146 196 196 Q176 148 158 190 Z" fill="url(#brkHair)" stroke="#334155" stroke-width="2"/>
      <circle cx="142" cy="215" r="3.5" fill="#7dd3fc"/><circle cx="258" cy="222" r="4" fill="#7dd3fc"/>
      <!-- 手里死死攥着的皱巴巴群发检讨信 ALL-STAFF OOPS -->
      <g transform="rotate(-8 242 505)">
        <polygon points="185,455 298,448 308,552 192,562 178,505" fill="#f8fafc" stroke="#475569" stroke-width="2.5"/>
        <polyline points="195,478 232,486 278,472" fill="none" stroke="#cbd5e1" stroke-width="2"/>
        <text x="242" y="502" font-size="13" font-weight="900" text-anchor="middle" fill="#dc2626" font-family="monospace">ALL-STAFF</text>
        <text x="242" y="522" font-size="15" font-weight="900" text-anchor="middle" fill="#0f172a" font-family="monospace">OOPS!!</text>
      </g>
    </svg>
  `,
  normal: `
    <svg viewBox="0 0 400 650" class="sprite-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="leatherGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2a2d34"/><stop offset="100%" stop-color="#0a0b0d"/></linearGradient>
        <linearGradient id="hairGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#94a3b8"/></linearGradient>
        <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fed7aa"/><stop offset="100%" stop-color="#fdba74"/></linearGradient>
      </defs>
      <g id="body">
        <path d="M120 320 L70 420 L40 650 L360 650 L330 420 L280 320 Z" fill="url(#leatherGrad)"/>
        <path d="M135 290 L110 370 L155 385 L180 340 Z" fill="#1e232a" stroke="#475569" stroke-width="2"/>
        <path d="M265 290 L290 370 L245 385 L220 340 Z" fill="#1e232a" stroke="#475569" stroke-width="2"/>
        <line x1="200" y1="340" x2="200" y2="650" stroke="#94a3b8" stroke-width="5" stroke-dasharray="8,3"/>
      </g>
      <path d="M172 260 L172 315 Q200 325 228 315 L228 260 Z" fill="url(#skinGrad)"/>
      <g id="head">
        <path d="M145 180 Q140 265 190 285 Q200 288 210 285 Q260 265 255 180 Z" fill="url(#skinGrad)"/>
        <path d="M130 180 Q115 230 145 255 Q135 210 148 185 Z" fill="url(#hairGrad)"/>
        <path d="M270 180 Q285 230 255 255 Q265 210 252 185 Z" fill="url(#hairGrad)"/>
        <ellipse cx="174" cy="190" rx="9" ry="6" fill="#1e293b"/>
        <circle cx="176" cy="188" r="2.5" fill="#ffffff"/>
        <ellipse cx="226" cy="190" rx="9" ry="6" fill="#1e293b"/>
        <circle cx="228" cy="188" r="2.5" fill="#ffffff"/>
        <rect x="153" y="177" width="38" height="25" rx="5" fill="none" stroke="#090a0f" stroke-width="4"/>
        <rect x="209" y="177" width="38" height="25" rx="5" fill="none" stroke="#090a0f" stroke-width="4"/>
        <line x1="191" y1="187" x2="209" y2="187" stroke="#090a0f" stroke-width="4"/>
        <path d="M185 245 Q200 256 215 245" stroke="#991b1b" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M135 175 Q150 110 200 110 Q250 110 265 175 Q250 140 220 155 Q190 135 170 158 Q150 145 135 175 Z" fill="url(#hairGrad)"/>
      </g>
    </svg>
  `,
  blush: `
    <svg viewBox="0 0 400 650" class="sprite-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bLeatherGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2a2d34"/><stop offset="100%" stop-color="#0a0b0d"/></linearGradient>
        <linearGradient id="bSkinGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffe4e6"/><stop offset="100%" stop-color="#fecdd3"/></linearGradient>
      </defs>
      <path d="M120 320 L70 420 L40 650 L360 650 L330 420 L280 320 Z" fill="url(#bLeatherGrad)"/>
      <path d="M172 260 L172 315 Q200 325 228 315 L228 260 Z" fill="url(#bSkinGrad)"/>
      <path d="M145 180 Q140 265 190 285 Q200 288 210 285 Q260 265 255 180 Z" fill="url(#bSkinGrad)"/>
      <ellipse cx="165" cy="225" rx="18" ry="9" fill="#f43f5e" opacity="0.6"/>
      <ellipse cx="235" cy="225" rx="18" ry="9" fill="#f43f5e" opacity="0.6"/>
      <rect x="153" y="177" width="38" height="25" rx="5" fill="none" stroke="#090a0f" stroke-width="4"/>
      <rect x="209" y="177" width="38" height="25" rx="5" fill="none" stroke="#090a0f" stroke-width="4"/>
      <line x1="191" y1="187" x2="209" y2="187" stroke="#090a0f" stroke-width="4"/>
      <path d="M188 248 Q200 254 212 248" stroke="#991b1b" stroke-width="3" fill="none"/>
      <path d="M135 175 Q150 110 200 110 Q250 110 265 175 Q250 140 220 155 Q190 135 170 158 Q150 145 135 175 Z" fill="#cbd5e1"/>
    </svg>
  `,
  shock: `
    <svg viewBox="0 0 400 650" class="sprite-svg" xmlns="http://www.w3.org/2000/svg">
      <path d="M120 320 L70 420 L40 650 L360 650 L330 420 L280 320 Z" fill="#181a20"/>
      <rect x="153" y="177" width="38" height="25" rx="5" fill="#ffffff" stroke="#090a0f" stroke-width="4"/>
      <rect x="209" y="177" width="38" height="25" rx="5" fill="#ffffff" stroke="#090a0f" stroke-width="4"/>
      <line x1="191" y1="187" x2="209" y2="187" stroke="#090a0f" stroke-width="4"/>
      <ellipse cx="200" cy="250" rx="14" ry="18" fill="#0f172a"/>
      <path d="M135 175 Q150 100 200 100 Q250 100 265 175 Z" fill="#94a3b8"/>
    </svg>
  `,
  sad: `
    <svg viewBox="0 0 400 650" class="sprite-svg" xmlns="http://www.w3.org/2000/svg">
      <path d="M125 330 L75 430 L45 650 L355 650 L325 430 L275 330 Z" fill="#1f2937"/>
      <path d="M145 190 Q140 275 190 295 Q200 298 210 295 Q260 275 255 190 Z" fill="#fdba74"/>
      <rect x="153" y="190" width="38" height="25" rx="5" fill="none" stroke="#090a0f" stroke-width="4"/>
      <rect x="209" y="190" width="38" height="25" rx="5" fill="none" stroke="#090a0f" stroke-width="4"/>
      <line x1="191" y1="200" x2="209" y2="200" stroke="#090a0f" stroke-width="4"/>
      <path d="M188 260 Q200 250 212 260" stroke="#7f1d1d" stroke-width="3" fill="none"/>
    </svg>
  `,
  cool: `
    <svg viewBox="0 0 400 650" class="sprite-svg" xmlns="http://www.w3.org/2000/svg">
      <circle cx="200" cy="200" r="145" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="10,5"/>
      <path d="M120 320 L70 420 L40 650 L360 650 L330 420 L280 320 Z" fill="#0f172a" stroke="#10b981" stroke-width="1.5"/>
      <line x1="200" y1="340" x2="200" y2="650" stroke="#10b981" stroke-width="6"/>
      <rect x="153" y="175" width="38" height="25" rx="5" fill="none" stroke="#000000" stroke-width="4.5"/>
      <rect x="209" y="175" width="38" height="25" rx="5" fill="none" stroke="#000000" stroke-width="4.5"/>
      <line x1="191" y1="185" x2="209" y2="185" stroke="#000000" stroke-width="4.5"/>
      <circle cx="174" cy="188" r="4" fill="#34d399"/>
      <circle cx="226" cy="188" r="4" fill="#34d399"/>
    </svg>
  `
};

// 通讯弹窗头像 SVG 库（含内置常驻头像与图片加载异常兜底）
const SVG_AVATARS = {
  shark: `
    <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sharkGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#020617"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#sharkGrad)"/>
      <line x1="20" y1="25" x2="20" y2="50" stroke="#ef4444" stroke-width="2"/>
      <path d="M22 110 L45 85 L75 85 L98 110 Z" fill="#0f172a" stroke="#cbd5e1" stroke-width="1.5"/>
      <polygon points="56,88 64,88 62,110 58,110" fill="#dc2626"/>
      <path d="M40 45 Q35 15 60 12 Q85 15 80 45 Q88 75 60 84 Q32 75 40 45 Z" fill="#64748b"/>
      <path d="M48 55 Q60 84 72 55 Z" fill="#f8fafc"/>
      <circle cx="48" cy="40" r="4" fill="#facc15"/><circle cx="48" cy="40" r="2" fill="#000000"/>
      <circle cx="72" cy="40" r="4" fill="#facc15"/><circle cx="72" cy="40" r="2" fill="#000000"/>
      <path d="M45 64 Q60 76 75 64 Z" fill="#090a0f"/>
      <polygon points="48,64 51,69 54,64" fill="#ffffff"/>
      <polygon points="54,64 57,69 60,64" fill="#ffffff"/>
      <polygon points="60,64 63,69 66,64" fill="#ffffff"/>
      <polygon points="66,64 69,69 72,64" fill="#ffffff"/>
      <rect x="68" y="60" width="22" height="7" rx="1.5" fill="#dc2626"/>
    </svg>
  `,
  grandma: `
    <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="amaBg" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stop-color="#7c2d12"/><stop offset="100%" stop-color="#1c1917"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#amaBg)" stroke="#fb923c" stroke-width="2"/>
      <!-- 夜市灯牌暖光点缀 -->
      <circle cx="22" cy="28" r="6" fill="#fef08a" opacity="0.45"/>
      <!-- 阿嬷花围裙与衣领 -->
      <path d="M24 112 Q36 82 60 82 Q84 82 96 112 Z" fill="#be123c" stroke="#fda4af" stroke-width="1.5"/>
      <circle cx="48" cy="96" r="3" fill="#fef08a"/><circle cx="72" cy="98" r="3" fill="#fef08a"/>
      <!-- 烫卷银灰包租婆发型 -->
      <circle cx="38" cy="40" r="13" fill="#6b7280"/><circle cx="52" cy="30" r="14" fill="#9ca3af"/>
      <circle cx="68" cy="30" r="14" fill="#6b7280"/><circle cx="82" cy="40" r="13" fill="#9ca3af"/>
      <circle cx="34" cy="54" r="11" fill="#6b7280"/><circle cx="86" cy="54" r="11" fill="#6b7280"/>
      <!-- 阿嬷脸庞与痛心疾首表情 -->
      <path d="M40 44 Q38 78 60 82 Q82 78 80 44 Z" fill="#fed7aa" stroke="#7c2d12" stroke-width="1.5"/>
      <!-- 老花镜与怒目 -->
      <line x1="43" y1="50" x2="55" y2="54" stroke="#451a03" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="77" y1="50" x2="65" y2="54" stroke="#451a03" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="49" cy="57" r="6" fill="#ffffff" stroke="#78350f" stroke-width="2"/>
      <circle cx="71" cy="57" r="6" fill="#ffffff" stroke="#78350f" stroke-width="2"/>
      <circle cx="49" cy="57" r="2.5" fill="#1c1917"/><circle cx="71" cy="57" r="2.5" fill="#1c1917"/>
      <line x1="55" y1="57" x2="65" y2="57" stroke="#78350f" stroke-width="2"/>
      <path d="M51 71 Q60 65 69 71" stroke="#991b1b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 左手翠绿大芭乐 (番石榴) -->
      <g transform="translate(8, 66)">
        <ellipse cx="20" cy="24" rx="14" ry="16" fill="#4ade80" stroke="#15803d" stroke-width="2"/>
        <ellipse cx="16" cy="19" rx="4" ry="6" fill="#bbf7d0" opacity="0.6"/>
        <path d="M20 8 Q28 2 31 9 Q25 12 20 8 Z" fill="#16a34a"/>
      </g>
      <!-- 右手寒光闪闪切芭乐水果刀 -->
      <g transform="rotate(-25 94 74)">
        <polygon points="88,40 97,46 95,82 88,82" fill="#e2e8f0" stroke="#475569" stroke-width="1.5"/>
        <rect x="87" y="82" width="9" height="16" rx="2.5" fill="#78350f"/>
      </g>
      <!-- 右上角心碎图标 -->
      <path d="M92 18 C88 12, 80 15, 84 23 L92 32 L100 23 C104 15, 96 12, 92 18 Z" fill="#f43f5e"/>
      <polyline points="92,17 89,23 94,26 91,32" fill="none" stroke="#1c1917" stroke-width="2"/>
    </svg>
  `,
  joy: `
    <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="joyBg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#701a75"/><stop offset="100%" stop-color="#090d16"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#joyBg)" stroke="#e879f9" stroke-width="2"/>
      <path d="M28 45 Q30 16 60 18 Q90 16 92 45 Q96 86 82 106 L38 106 Q24 86 28 45 Z" fill="#1e1b4b"/>
      <path d="M40 42 Q40 76 60 82 Q80 76 80 42 Z" fill="#ffe4e6"/>
      <!-- 荧光绿晶圆耳环 -->
      <rect x="33" y="64" width="7" height="7" transform="rotate(45 36.5 67.5)" fill="#22c55e" stroke="#bbf7d0" stroke-width="1"/>
      <rect x="80" y="64" width="7" height="7" transform="rotate(45 83.5 67.5)" fill="#22c55e" stroke="#bbf7d0" stroke-width="1"/>
      <!-- 狡黠Wink与红唇 -->
      <path d="M46 53 Q51 49 56 53" stroke="#1e1b4b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <ellipse cx="70" cy="53" rx="5" ry="3.5" fill="#10b981"/>
      <path d="M54 68 Q62 73 68 67" stroke="#e11d48" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 香槟杯 -->
      <polygon points="84,78 98,78 92,92" fill="#fde047" opacity="0.85" stroke="#fef9c3" stroke-width="1.2"/>
      <line x1="91" y1="92" x2="91" y2="106" stroke="#fef9c3" stroke-width="1.5"/>
    </svg>
  `,
  wife: `
    <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="wifeBg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#991b1b"/><stop offset="100%" stop-color="#0f0505"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#wifeBg)" stroke="#f59e0b" stroke-width="2"/>
      <circle cx="60" cy="24" r="14" fill="#1f2937"/>
      <path d="M36 44 Q38 18 60 20 Q82 18 84 44 Z" fill="#111827"/>
      <path d="M40 44 Q40 76 60 82 Q80 76 80 44 Z" fill="#fed7aa"/>
      <!-- 暴怒女王发光眼 -->
      <polygon points="44,50 56,54 46,56" fill="#fef08a"/>
      <polygon points="76,50 64,54 74,56" fill="#fef08a"/>
      <path d="M52 69 Q60 65 68 69" stroke="#991b1b" stroke-width="2.5" fill="none"/>
      <!-- 黄金大裁缝剪刀咔嚓剪皮衣 -->
      <g stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round">
        <line x1="26" y1="98" x2="88" y2="74"/>
        <line x1="28" y1="74" x2="88" y2="98"/>
      </g>
      <circle cx="25" cy="73" r="6" fill="none" stroke="#f59e0b" stroke-width="3"/>
      <circle cx="25" cy="99" r="6" fill="none" stroke="#f59e0b" stroke-width="3"/>
    </svg>
  `,
  kimberly: `
    <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="kimbBg" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stop-color="#065f46"/><stop offset="100%" stop-color="#042f2e"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#kimbBg)" stroke="#34d399" stroke-width="2"/>
      <!-- 荧光绿心电图脉冲底纹 -->
      <polyline points="8,76 26,76 34,58 42,92 50,48 58,82 66,76 112,76" fill="none" stroke="#10b981" stroke-width="2" opacity="0.55"/>
      <!-- 干练金棕波浪卷发与白大褂 -->
      <path d="M28 46 Q30 16 60 18 Q90 16 92 46 Q94 80 82 96 L38 96 Q26 80 28 46 Z" fill="#78350f"/>
      <path d="M22 112 L42 82 L60 94 L78 82 L98 112 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
      <!-- 听诊器 -->
      <path d="M40 82 Q40 104 60 106 Q80 104 80 82" fill="none" stroke="#38bdf8" stroke-width="3"/>
      <circle cx="60" cy="107" r="5" fill="#0284c7" stroke="#bae6fd" stroke-width="1.5"/>
      <!-- 脸庞与医疗护目镜 -->
      <path d="M40 42 Q40 76 60 80 Q80 76 80 42 Z" fill="#fde68a"/>
      <rect x="44" y="48" width="14" height="9" rx="3" fill="#ecfdf5" stroke="#059669" stroke-width="1.8"/>
      <rect x="62" y="48" width="14" height="9" rx="3" fill="#ecfdf5" stroke="#059669" stroke-width="1.8"/>
      <line x1="58" y1="52" x2="62" y2="52" stroke="#059669" stroke-width="1.8"/>
      <path d="M52 67 Q60 72 68 67" stroke="#be123c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <!-- 右上角医疗红十字+爱心 -->
      <circle cx="94" cy="26" r="11" fill="#f43f5e" stroke="#fecdd3" stroke-width="1.5"/>
      <line x1="94" y1="20" x2="94" y2="32" stroke="#ffffff" stroke-width="3"/>
      <line x1="88" y1="26" x2="100" y2="26" stroke="#ffffff" stroke-width="3"/>
    </svg>
  `,
  cook: `
    <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cookBg" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stop-color="#334155"/><stop offset="100%" stop-color="#090d16"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#cookBg)" stroke="#94a3b8" stroke-width="2"/>
      <!-- 标志性黑色高领毛衣 -->
      <path d="M22 114 Q30 82 60 82 Q90 82 98 114 Z" fill="#090a0f" stroke="#475569" stroke-width="1.2"/>
      <rect x="44" y="74" width="32" height="14" rx="4" fill="#111827"/>
      <!-- 银发与儒雅脸型 -->
      <path d="M38 42 Q40 20 60 20 Q80 20 82 42 Z" fill="#e2e8f0"/>
      <path d="M40 40 Q40 74 60 79 Q80 74 80 40 Z" fill="#fed7aa"/>
      <!-- 银色无框眼镜 -->
      <rect x="43" y="48" width="14" height="9" rx="2" fill="rgba(255,255,255,0.18)" stroke="#cbd5e1" stroke-width="1.6"/>
      <rect x="63" y="48" width="14" height="9" rx="2" fill="rgba(255,255,255,0.18)" stroke="#cbd5e1" stroke-width="1.6"/>
      <line x1="57" y1="52" x2="63" y2="52" stroke="#cbd5e1" stroke-width="1.5"/>
      <path d="M51 66 Q60 72 69 66" stroke="#7c2d12" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- 金色 8GB 黄金显存环保价签 -->
      <rect x="72" y="84" width="38" height="20" rx="5" fill="#fbbf24" stroke="#fef08a" stroke-width="1.5"/>
      <text x="91" y="98" text-anchor="middle" font-size="11" font-weight="900" fill="#1e293b">8GB</text>
    </svg>
  `,
  mystery3: `
    <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mysBg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#4c1d95"/><stop offset="100%" stop-color="#090514"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#mysBg)" stroke="#c084fc" stroke-width="2"/>
      <!-- 神秘高马尾剪影 -->
      <path d="M28 112 Q36 80 60 80 Q84 80 92 112 Z" fill="#1e1b4b" stroke="#a855f7" stroke-width="1.5"/>
      <circle cx="60" cy="52" r="22" fill="#0f0720" stroke="#c084fc" stroke-width="2"/>
      <text x="60" y="62" text-anchor="middle" font-size="30" font-weight="900" fill="#f0abfc">?</text>
      <!-- DLSS #3 插帧角标 -->
      <rect x="64" y="14" width="44" height="17" rx="6" fill="#ec4899" stroke="#fbcfe8" stroke-width="1.2"/>
      <text x="86" y="26" text-anchor="middle" font-size="9.5" font-weight="800" fill="#ffffff">Frame#3</text>
    </svg>
  `,
  buffett: `
    <svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bufBg" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stop-color="#92400e"/><stop offset="100%" stop-color="#1c1917"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#bufBg)" stroke="#fbbf24" stroke-width="2.5"/>
      <path d="M22 112 Q34 82 60 82 Q86 82 98 112 Z" fill="#334155" stroke="#cbd5e1" stroke-width="1.2"/>
      <polygon points="56,84 64,84 62,108 58,108" fill="#dc2626"/>
      <path d="M38 44 Q40 20 60 20 Q80 20 82 44 Z" fill="#f1f5f9"/>
      <path d="M40 42 Q40 76 60 80 Q80 76 80 42 Z" fill="#fed7aa"/>
      <circle cx="49" cy="52" r="7" fill="none" stroke="#1e293b" stroke-width="2"/>
      <circle cx="71" cy="52" r="7" fill="none" stroke="#1e293b" stroke-width="2"/>
      <line x1="56" y1="52" x2="64" y2="52" stroke="#1e293b" stroke-width="2"/>
      <path d="M49 66 Q60 74 71 66" stroke="#991b1b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <!-- 富豪榜 #7 勋章 -->
      <circle cx="93" cy="27" r="14" fill="#f59e0b" stroke="#fef08a" stroke-width="2"/>
      <text x="93" y="32" text-anchor="middle" font-size="13" font-weight="900" fill="#1c1917">#7</text>
    </svg>
  `
};

/**
 * 渲染角色立绘 (优先使用真实美术素材，带平滑加载与 SVG 兜底)
 */
function renderCharacterSprite(spriteName) {
  if (!spriteName) return "";
  const key = `huang_${spriteName}`;
  const assetPath = SPRITE_MAP[key];

  if (assetPath) {
    return `
      <img 
        src="${assetPath}" 
        alt="立绘-${spriteName}" 
        class="sprite-img sprite-anim-${spriteName}" 
        onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
      />
      <div class="sprite-fallback-svg" style="display:none; width:100%; height:100%;">
        ${SVG_SPRITES[spriteName] || SVG_SPRITES.normal}
      </div>
    `;
  }
  return SVG_SPRITES[spriteName] || SVG_SPRITES.normal;
}

/**
 * 渲染通讯头像 (优先使用真实头像素材，加载异常或空路径时自动启用内置 SVG 兜底)
 */
function renderAvatar(avatarKey) {
  if (!avatarKey) return "";
  const assetPath = SPRITE_MAP[avatarKey];
  if (assetPath) {
    return `
      <img 
        src="${assetPath}" 
        alt="头像-${avatarKey}" 
        class="avatar-img" 
        onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
      />
      <div class="avatar-fallback-svg" style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">
        ${SVG_AVATARS[avatarKey] || ""}
      </div>
    `;
  }
  return SVG_AVATARS[avatarKey] || "";
}

window.SPRITE_MAP = SPRITE_MAP;
window.SPRITE_CACHE = SPRITE_CACHE;
window.loadTransparentSprite = loadTransparentSprite;
window.renderCharacterSprite = renderCharacterSprite;
window.renderAvatar = renderAvatar;
