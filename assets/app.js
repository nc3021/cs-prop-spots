'use strict';

/* ============================================================
   CS2 道具点位库
   数据模型：
     spot  = 地图上的一个「站位/落点」 { id, map, x, y, props[] }
     prop  = 挂在该站位下的一个道具   { id, side(T/CT), type, name, keys[], toss[], move[], note, imgs[] }
   x / y 都是地图图片的百分比（0~100），所以和分辨率无关。
   一个点位可以由 T、CT、或两者共用：道具各自带阵营，站位的阵营由其下道具推导。
   ============================================================ */

/* ---------------- 常量 ---------------- */

const API = 'http://127.0.0.1:8778';
const LS_KEY = 'cs2props.data.v1';
const MAP_ORDER_KEY = 'cs2props.mapOrder.v1';   // 左侧地图栏的手动排序（纯界面偏好，不入 data.json）

const MAPS = [
  { id: 'mirage',   cn: '荒漠迷城',     en: 'MIRAGE',   file: '荒漠迷城MIRAGE.jpg',        w: 4000, h: 4000 },
  { id: 'inferno',  cn: '炼狱小镇',     en: 'INFERNO',  file: '炼狱小镇-INFERNO.jpg',      w: 1440, h: 1440 },
  { id: 'dust2',    cn: '沙二',         en: 'DUST II',  file: '沙二DUSTⅡ.jpg',             w: 1440, h: 1440 },
  { id: 'nuke',     cn: '核子危机',     en: 'NUKE',     file: '核子危机-NUKE.jpg',         w: 1440, h: 1440 },
  { id: 'ancient',  cn: '远古遗迹',     en: 'ANCIENT',  file: '远古遗迹-ANCIENT.jpg',      w: 1440, h: 1440 },
  { id: 'anubis',   cn: '阿努比斯',     en: 'ANUBIS',   file: '阿努比斯-ANUBIS.jpg',       w: 1440, h: 1440 },
  { id: 'vertigo',  cn: '殒命大厦',     en: 'VERTIGO',  file: '殒命大厦-VERTIGO.jpg',      w: 1440, h: 1440 },
  { id: 'overpass', cn: '死亡游乐园',   en: 'OVERPASS', file: '死亡游乐园-OVERPASS.jpg',   w: 4000, h: 4000 },
  { id: 'train',    cn: '火车',         en: 'TRAIN',    file: '火车-Train.jpg',            w: 4000, h: 4000 },
  { id: 'office',   cn: '办公室',       en: 'OFFICE',   file: '办公室-Office.jpg',         w: 4000, h: 4000 },
  { id: 'cache',    cn: '死亡迷城',      en: 'CACHE',    file: '死亡迷城（叉车）-Cache.jpg', w: 4000, h: 4000 },
];

const TYPES = [
  { id: 'smoke', label: '烟' },
  { id: 'flash', label: '闪' },
  { id: 'fire',  label: '火' },
  { id: 'he',    label: '雷' },
];

/** 「使用方式」的三行单选：按键 / 投掷 / 移动 */
const ACT_ROWS = [
  { key: 'keys', label: '按键', opts: [
    { id: 'left',  label: '左键' },
    { id: 'right', label: '右键' },
    { id: 'both',  label: '双键' },
  ] },
  { key: 'toss', label: '投掷', opts: [
    { id: 'jump',   label: '跳投' },
    { id: 'nojump', label: '非跳投' },
  ] },
  { key: 'move', label: '移动', opts: [
    { id: 'fwd',   label: '前进' },
    { id: 'back',  label: '后退' },
    { id: 'left',  label: '左移' },
    { id: 'right', label: '右移' },
  ] },
];
const ACT_KEYS = ACT_ROWS.map(r => r.key);

const INSET_L = 172;   // 左侧地图栏占位
const INSET_R = 190;   // 右侧阵营栏占位
const INSET_Y = 16;
const DOCK_W = 462;    // 右侧停靠面板宽度（与 style.css 的 --dock-w 一致）

/* ---------------- 工具 ---------------- */

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mapById = id => MAPS.find(m => m.id === id) || MAPS[0];
const typeLabel = id => (TYPES.find(t => t.id === id) || TYPES[TYPES.length - 1]).label;

let uidSeq = 0;
const uid = p => p + '_' + Date.now().toString(36) + (uidSeq++).toString(36) + Math.random().toString(36).slice(2, 6);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function imgSrc(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}
function debounce(fn, ms) {
  let t = 0;
  return function () { clearTimeout(t); t = setTimeout(fn, ms); };
}
function typeBadge(id) {
  return '<span class="tp tp-' + esc(id) + '">' + esc(typeLabel(id)) + '</span>';
}
/** 阵营圆点类名：t / ct / mix */
function dotClass(side) {
  if (side === 'CT') return 'ct';
  if (side === 'both' || side === 'mix') return 'mix';
  return 't';
}
function sideColor(side) {
  if (side === 'mix' || side === 'both') return 'linear-gradient(135deg,var(--t) 50%,var(--ct) 50%)';
  return side === 'CT' ? 'var(--ct)' : 'var(--t)';
}
/** 道具是否属于某一阵营（both 两个都算） */
function isSide(p, side) { return p.side === side || p.side === 'both'; }
/** 站位的阵营由其下道具推导：全是CT→CT，全是T→T，混合→mix */
function spotSide(s) {
  const ps = (s.props || []).filter(Boolean);
  const hasT = ps.some(p => isSide(p, 'T'));
  const hasCT = ps.some(p => isSide(p, 'CT'));
  return hasT && hasCT ? 'mix' : hasCT ? 'CT' : 'T';
}
function sideLabel(s) { return s === 'mix' ? '共用' : s; }
/** 地图标记的阵营：筛选到单一阵营时随筛选走，否则看点位本身的阵营 */
function markerSide(s) { return state.side !== 'all' ? state.side : spotSide(s); }

/* ---------------- 「使用方式」三行单选 ---------------- */

/** 选中的标签，按 按键 → 投掷 → 移动 的顺序 */
function actLabels(p) {
  const out = [];
  ACT_ROWS.forEach(row => {
    const sel = (p && p[row.key]) || [];
    row.opts.forEach(o => { if (sel.indexOf(o.id) >= 0) out.push(o.label); });
  });
  return out;
}
function actText(p) { return actLabels(p).join(' · '); }

/** 只读展示。compact = 悬浮提示里用的紧凑版（不显示行名） */
function actViewHtml(p, compact) {
  const rows = [];
  ACT_ROWS.forEach(row => {
    const sel = (p && p[row.key]) || [];
    const labels = row.opts.filter(o => sel.indexOf(o.id) >= 0).map(o => o.label);
    if (!labels.length) return;
    rows.push('<span class="av-row' + (compact ? ' compact' : '') + '">'
      + (compact ? '' : '<i>' + esc(row.label) + '</i>')
      + labels.map(l => '<b>' + esc(l) + '</b>').join('') + '</span>');
  });
  return rows.length ? '<div class="act-view' + (compact ? ' compact' : '') + '">' + rows.join('') + '</div>' : '';
}

/** 统一成新结构（建议使用 normalizeSpot 包裹，确保点位内道具阵营一致） */
function normalizeProp(p) {
  const src = p || {};
  const out = {
    id: src.id || uid('p'),
    side: src.side === 'both' ? 'both' : src.side === 'CT' ? 'CT' : 'T',
    type: TYPES.some(t => t.id === src.type) ? src.type : 'smoke',
    name: src.name || '',
    imgs: Array.isArray(src.imgs) ? src.imgs.slice() : [],
  };
  // 每行只能有一个值；历史数据某行若存了多个，只保留第一个
  ACT_KEYS.forEach(k => { out[k] = Array.isArray(src[k]) ? src[k].filter(Boolean).slice(0, 1) : []; });
  out.note = typeof src.note === 'string' ? src.note : '';
  if (!out.note && typeof src.how === 'string' && src.how.trim()) out.note = src.how.trim();
  return out;
}

function normalizeData() {
  state.spots = (Array.isArray(state.spots) ? state.spots : [])
    .filter(s => s && s.map)
    .map(s => {
      return {
        id: s.id || uid('s'),
        map: s.map,
        x: Number(s.x) || 0,
        y: Number(s.y) || 0,
        props: (Array.isArray(s.props) ? s.props : []).map(normalizeProp),
      };
    });
}

/* ---------------- 状态 ---------------- */

const state = {
  spots: [],
  mapId: 'mirage',
  mapOrder: [],
  side: 'all',
  q: '',
  showNames: false,
  server: false,
  pick: null,          // { type: 'spot' }
  view: { zoom: 1, fx: 0.5, fy: 0.5 },
  baseW: 1, baseH: 1,
  box: { L: 0, T: 0, w: 1, h: 1 },
  pan: { x: 0, y: 0 },
  found: null,         // Set，搜索命中的 spot id；null = 没有搜索
  editor: null,
  viewer: null,        // { spotId, propId, idx }
  swipe: null,
  suppressSlideClick: false,
};

/* ---------------- DOM ---------------- */

let animMarkers = false;   // 换地图后第一次渲染点位时播放入场动画

const viewport = $('viewport');
const stage = $('stage');
const markerLayer = $('markerLayer');
const pickLayer = $('pickLayer');
const tooltip = $('tooltip');

const show = el => { el.hidden = false; };
const hide = el => { el.hidden = true; };

/* ============================================================
   主题配色（7 套深色主题，令牌在 assets/theme.css）
   ============================================================ */

const THEME_KEY = 'cs2props.theme.v1';
const FX_KEY = 'cs2props.fx.v1';

/* 视效档位：full = 极光/毛玻璃/脉冲环全上；lite = 一键卸掉（老机器或投屏时用）。
   下拉面板里已经不放这个开关了，setFxTier() 仍可用（读 localStorage 生效）。 */
let fxTier = 'full';

/* 配色规则：t 恒为「黄色系」（阵营辨识度优先），ct 取黄以外的色系，
   accent 是每套主题的签名色，只驱动 UI 主色，不参与阵营语义。 */
const THEMES = [
  { id: 'aurum',   name: '鎏金夜航', en: 'GILDED NIGHTFALL', t: '#f2b53c', accent: '#f2b53c', ct: '#4a9eff' },
  { id: 'neon',    name: '霓虹废墟', en: 'NEON RUINS',       t: '#f5ff3d', accent: '#ff2e88', ct: '#00e5ff' },
  { id: 'verdant', name: '密林潜行', en: 'VERDANT RECON',    t: '#d19a22', accent: '#8fbf4a', ct: '#36a88e' },
  { id: 'magma',   name: '熔岩裂谷', en: 'MAGMA RIFT',       t: '#ffc61a', accent: '#f04a24', ct: '#4f9de0' },
  { id: 'glacier', name: '极地冰川', en: 'POLAR GLACIER',    t: '#ffd98a', accent: '#a9efff', ct: '#2e3a4e' },
  { id: 'violet',  name: '紫电风暴', en: 'VIOLET STORM',     t: '#ffdd4d', accent: '#a56bff', ct: '#4d9bff' },
  { id: 'toxic',   name: '生化禁区', en: 'TOXIC ZONE',       t: '#ffe01a', accent: '#b026ff', ct: '#39ff14' },
];

let themeId = 'aurum';
let themeAnimTimer = 0;

const themeById = id => THEMES.find(x => x.id === id) || THEMES[0];

function initTheme() {
  let saved = '';
  let fx = 'full';
  try {
    saved = localStorage.getItem(THEME_KEY) || '';
    fx = localStorage.getItem(FX_KEY) || 'full';
  } catch (e) { saved = ''; fx = 'full'; }
  setFxTier(fx);
  applyTheme(themeById(saved).id, false);
  renderThemePanel();
  bindSpotlight();
}

function setFxTier(tier) {
  fxTier = tier === 'lite' ? 'lite' : 'full';
  document.documentElement.setAttribute('data-fx', fxTier);
  try { localStorage.setItem(FX_KEY, fxTier); } catch (e) { /* 忽略 */ }
}

/** animate = 换肤时给整页加一段颜色过渡 + 一次扩散闪光 */
function applyTheme(id, animate) {
  const th = themeById(id);
  themeId = th.id;
  document.documentElement.setAttribute('data-theme', th.id);
  try { localStorage.setItem(THEME_KEY, th.id); } catch (e) { /* 忽略 */ }

  const now = $('themeNow');
  if (now) now.textContent = th.name;

  markThemePanel();

  if (!animate) return;
  const root = document.documentElement;
  const flash = $('fxFlash');
  root.classList.add('theming');
  if (flash) { flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
  clearTimeout(themeAnimTimer);
  themeAnimTimer = setTimeout(() => root.classList.remove('theming'), 660);
}

function cycleTheme() {
  const i = THEMES.findIndex(t => t.id === themeId);
  applyTheme(THEMES[(i + 1) % THEMES.length].id, true);
}

/** 下拉里只有主题：一行一套，左边一小块 T→主色→CT 的色卡，当前项打勾 */
function renderThemePanel() {
  const body = $('themeBody');
  if (!body) return;
  body.innerHTML = '<div class="theme-list">'
    + THEMES.map(t =>
        '<button type="button" class="theme-item' + (t.id === themeId ? ' on' : '') + '" data-theme="' + t.id + '">'
        + '<i class="ti-chip" style="--bar: linear-gradient(120deg,' + t.t + ',' + t.accent + ',' + t.ct + ')"></i>'
        + '<span class="ti-name">' + t.name + '</span>'
        + '<i class="ti-check">✓</i>'
        + '</button>').join('')
    + '</div>';
  body.querySelectorAll('.theme-item').forEach(b => {
    b.addEventListener('click', () => applyTheme(b.dataset.theme, true));
  });
}

/** 只刷新高亮态，不重建 DOM（换肤时不闪） */
function markThemePanel() {
  const body = $('themeBody');
  if (!body) return;
  body.querySelectorAll('.theme-item').forEach(b => b.classList.toggle('on', b.dataset.theme === themeId));
}

function toggleThemePanel() {
  const p = $('themePanel');
  if (p.hidden) { renderThemePanel(); show(p); } else hide(p);
}

/** 把下拉摆到「主题」按钮正下方：左边缘对齐按钮，右边界不越界 */
function placeThemePanel() {
  const btn = $('btnTheme');
  const p = $('themePanel');
  if (!btn || !p) return;
  const r = btn.getBoundingClientRect();
  const w = p.offsetWidth || 188;
  p.style.right = 'auto';
  p.style.bottom = 'auto';
  p.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - w - 8))) + 'px';
  p.style.top = Math.round(r.bottom + 8) + 'px';
}

/** 主题面板开合：鼠标悬停即展开，离开按钮与面板 240ms 后自动收起。
    触屏 / 键盘用户仍可点击按钮或按 T 切换。 */
function bindThemeMenu() {
  const btn = $('btnTheme');
  const p = $('themePanel');
  if (!btn || !p) return;
  const canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  let timer = 0;
  const openNow = () => {
    clearTimeout(timer);
    if (p.hidden) toggleThemePanel();
    placeThemePanel();
  };
  const closeSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!p.hidden && !btn.matches(':hover') && !p.matches(':hover')) hide(p);
    }, 240);
  };
  if (canHover) {
    [btn, p].forEach(el => {
      el.addEventListener('mouseenter', openNow);
      el.addEventListener('mouseleave', closeSoon);
    });
  }
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    if (canHover) { openNow(); return; }  // 悬停模式下按钮只负责展开，不负责收起
    toggleThemePanel();
    if (!p.hidden) placeThemePanel();
  });
  // 窗口尺寸变了就重新贴回按钮下方
  window.addEventListener('resize', () => { if (!p.hidden) placeThemePanel(); });
}

/** 鼠标光斑：rAF 内只改 transform，走 GPU 合成 */
function bindSpotlight() {
  const spot = $('fxSpot');
  if (!spot) return;
  let x = 0, y = 0, queued = false;
  window.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;
    x = ev.clientX; y = ev.clientY;
    if (!spot.classList.contains('on')) spot.classList.add('on');
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      spot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    });
  }, { passive: true });
  document.addEventListener('mouseleave', () => spot.classList.remove('on'));
}

/* ============================================================
   启动
   ============================================================ */

async function boot() {
  initTheme();
  loadMapOrder();
  renderMapList();
  bindMapDrag();
  bindGlobal();

  const ok = await pingServer();
  state.server = ok;

  if (ok) {
    try {
      const r = await fetch(API + '/api/data', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        state.spots = Array.isArray(d.spots) ? d.spots : [];
        if (Array.isArray(d.mapOrder) && d.mapOrder.length) {
          state.mapOrder = d.mapOrder.filter(id => typeof id === 'string');   // 服务端的排序优先
        }
      }
    } catch (e) { /* 读不到就当空库 */ }
  } else {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        state.spots = Array.isArray(d.spots) ? d.spots : [];
      }
    } catch (e) { /* 忽略坏数据 */ }
    banner('未检测到本地服务，数据只存在这台浏览器里，图片也无法上传。'
      + '请双击 <code>用Edge-本地服务打开.bat</code>（或 <code>CS2道具点位库.lnk</code>）重新打开本页。', 'err');
  }

  normalizeData();
  renderMapList();
  const withData = MAPS.find(m => state.spots.some(s => s.map === m.id));
  setMap(withData ? withData.id : 'mirage');
}

async function pingServer() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(API + '/api/ping', { cache: 'no-store', signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return false;
    const j = await r.json();
    return !!j.ok;
  } catch (e) { return false; }
}

function banner(html, kind) {
  const el = $('serverBanner');
  el.innerHTML = html;
  el.className = 'banner' + (kind === 'info' ? ' info' : '');
  el.hidden = false;
  requestAnimationFrame(() => layout(false));
}

/* ============================================================
   持久化
   ============================================================ */

let saveTimer = 0;

function payload() {
  return JSON.stringify({
    meta: { version: 3, updated: new Date().toISOString(), app: 'cs2-props' },
    mapOrder: state.mapOrder,
    spots: state.spots,
  });
}

function save(immediate) {
  clearTimeout(saveTimer);
  const run = async () => {
    const body = payload();
    if (state.server) {
      try {
        const r = await fetch(API + '/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || '保存失败');
        flashSaved('已保存到 data.json');
      } catch (e) {
        flashSaved('保存失败', true);
        toast('保存失败：' + e.message, true);
      }
    } else {
      try {
        localStorage.setItem(LS_KEY, body);
        flashSaved('已存到浏览器');
      } catch (e) {
        flashSaved('保存失败', true);
      }
    }
  };
  if (immediate) run(); else saveTimer = setTimeout(run, 320);
}

let flashTimer = 0;
function flashSaved(text, isErr) {
  const el = $('statSaved');
  el.textContent = text;
  el.classList.toggle('err', !!isErr);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.textContent = ''; }, 2600);
}

/* ============================================================
   布局 / 视图变换
   ============================================================ */

function dockOpen() {
  return !$('editDock').hidden;
}

function layout(resetView) {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const L = INSET_L;
  const T = INSET_Y;
  const availW = Math.max(160, vw - INSET_L - INSET_R - (dockOpen() ? DOCK_W : 0));
  const availH = Math.max(160, vh - INSET_Y * 2);

  const m = mapById(state.mapId);
  const ratio = m.w / m.h;
  let w = availW, h = w / ratio;
  if (h > availH) { h = availH; w = h * ratio; }

  state.baseW = w;
  state.baseH = h;
  state.box = { L, T, w: availW, h: availH };

  stage.style.width = w + 'px';
  stage.style.height = h + 'px';

  if (resetView) {
    state.view.zoom = 1;
    state.view.fx = 0.5;
    state.view.fy = 0.5;
  }
  state.view.fx = clamp(state.view.fx, 0, 1);
  state.view.fy = clamp(state.view.fy, 0, 1);

  applyView();
  layoutNames();
  renderPin();
}

function applyView() {
  const { L, T, w, h } = state.box;
  const z = state.view.zoom;
  const cx = state.view.fx * state.baseW;
  const cy = state.view.fy * state.baseH;
  const panX = (L + w / 2) - cx * z;
  const panY = (T + h / 2) - cy * z;
  state.pan = { x: panX, y: panY };
  stage.style.transform = 'translate(' + panX.toFixed(2) + 'px,' + panY.toFixed(2) + 'px) scale(' + z + ')';
  stage.style.setProperty('--inv', (1 / z).toFixed(4));
  $('zoomRead').textContent = Math.round(z * 100) + '%';
}

function screenToPct(clientX, clientY) {
  const r = stage.getBoundingClientRect();     // 已含 transform 的盒子
  return {
    x: clamp((clientX - r.left) / r.width * 100, 0, 100),
    y: clamp((clientY - r.top) / r.height * 100, 0, 100),
  };
}

function focusSpot(id) {
  const s = state.spots.find(x => x.id === id);
  if (!s) return;
  state.view.fx = s.x / 100;
  state.view.fy = s.y / 100;
  state.view.zoom = Math.max(state.view.zoom, 2);
  applyView();
}

/* ============================================================
   数据筛选
   ============================================================ */

function spotsOnMap() {
  return state.spots.filter(s => s.map === state.mapId);
}
function passSide(s) {
  if (state.side === 'all') return true;
  return (s.props || []).some(p => isSide(p, state.side));
}
function propHit(p) {
  const q = state.q;
  if (!q) return true;
  return (p.name || '').toLowerCase().includes(q)
    || (p.note || '').toLowerCase().includes(q)
    || actText(p).toLowerCase().includes(q)
    || typeLabel(p.type).includes(q);
}
function spotHit(s) {
  if (!state.q) return true;
  return (s.props || []).some(propHit);
}
/** 当前筛选下这个站位应该展示哪些道具（阵营筛选 + 关键词筛选） */
function propsFor(s) {
  let ps = (s.props || []).filter(p => state.side === 'all' || isSide(p, state.side));
  if (state.q) {
    const hit = ps.filter(propHit);
    if (hit.length) ps = hit;
  }
  return ps;
}

/** 某地图的统计：总点位/总道具，以及 T、CT 各自涉及的点位与道具数。
    共用点位和双阵营（both）道具在两个阵营里都计一次。 */
function mapStats(mapId) {
  const st = { spots: 0, props: 0, T: { spots: 0, props: 0 }, CT: { spots: 0, props: 0 } };
  state.spots.forEach(s => {
    if (s.map !== mapId) return;
    const ps = s.props || [];
    st.spots += 1;
    st.props += ps.length;
    ['T', 'CT'].forEach(side => {
      const mine = ps.filter(p => isSide(p, side));
      if (mine.length) st[side].spots += 1;
      st[side].props += mine.length;
    });
  });
  return st;
}

/* ============================================================
   渲染：地图栏 / 标记 / 状态栏
   ============================================================ */

/* 按用户手动排序输出地图；未出现在排序里的（比如以后新加的地图）接到末尾 */
function orderedMaps() {
  const left = new Map(MAPS.map(m => [m.id, m]));
  const out = [];
  state.mapOrder.forEach(id => {
    if (left.has(id)) { out.push(left.get(id)); left.delete(id); }
  });
  left.forEach(m => out.push(m));
  return out;
}

function loadMapOrder() {
  try {
    const raw = localStorage.getItem(MAP_ORDER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    state.mapOrder = Array.isArray(arr) ? arr.filter(id => typeof id === 'string') : [];
  } catch (e) { state.mapOrder = []; }
}

function saveMapOrder() {
  try { localStorage.setItem(MAP_ORDER_KEY, JSON.stringify(state.mapOrder)); } catch (e) { /* 无痕模式等，忽略 */ }
}

let dragId = null;          // 正在被拖的地图 id

function renderMapList() {
  const box = $('mapList');
  box.innerHTML = '';
  orderedMaps().forEach(m => {
    const st = mapStats(m.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'map-btn';
    b.dataset.id = m.id;
    b.draggable = true;
    // 右上角两个数字：前一个是点位数量，后一个是道具数量
    b.innerHTML = '<span class="mb-grip" aria-hidden="true">⠿</span>'
      + '<span class="mb-cn">' + esc(m.cn) + '</span>'
      + '<span class="mb-en">' + esc(m.en) + '</span>'
      + (st.spots ? '<span class="mb-n"><b>' + st.spots + '</b><i>' + st.props + '</i></span>' : '');
    b.addEventListener('mouseenter', ev => showMapTip(m, ev));
    b.addEventListener('mousemove', ev => moveTip(ev));
    b.addEventListener('mouseleave', scheduleTipHide);
    b.addEventListener('click', () => { if (state.mapId !== m.id) setMap(m.id); });
    box.appendChild(b);
  });
}

/* 拖拽排序：dragover 时实时把被拖的按钮挪到光标位置，dragend 时落盘顺序 */
function bindMapDrag() {
  const box = $('mapList');

  box.addEventListener('dragstart', ev => {
    const b = ev.target.closest('.map-btn');
    if (!b) return;
    dragId = b.dataset.id;
    b.classList.add('dragging');
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', dragId); } catch (e) { /* 某些浏览器禁止，忽略 */ }
    }
  });

  box.addEventListener('dragover', ev => {
    if (!dragId) return;
    ev.preventDefault();                       // 不 preventDefault 就不会触发 drop
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const dragging = box.querySelector('.map-btn.dragging');
    if (!dragging) return;
    const rest = [...box.querySelectorAll('.map-btn:not(.dragging)')];
    const next = rest.find(el => {
      const r = el.getBoundingClientRect();
      return ev.clientY < r.top + r.height / 2;
    });
    if (next) box.insertBefore(dragging, next);
    else box.appendChild(dragging);
  });

  box.addEventListener('drop', ev => { if (dragId) ev.preventDefault(); });

  box.addEventListener('dragend', () => {
    const dragging = box.querySelector('.map-btn.dragging');
    if (dragging) dragging.classList.remove('dragging');
    if (!dragId) return;
    dragId = null;
    state.mapOrder = [...box.querySelectorAll('.map-btn')].map(b => b.dataset.id);
    saveMapOrder();     // 本地兜底（没有服务时也能记住）
    save();             // 写进 data.json，换浏览器/换电脑也保持
  });
}

function setMap(id) {
  const m = mapById(id);
  state.mapId = m.id;
  $('mapList').querySelectorAll('.map-btn').forEach(b => b.classList.toggle('on', b.dataset.id === m.id));
  animMarkers = true;      // 换地图时，点位圆点做一次入场动画

  const img = $('mapImg');
  const loading = $('mapLoading');
  loading.textContent = '地图加载中…';
  loading.hidden = false;
  img.onload = () => { loading.hidden = true; };
  img.onerror = () => { loading.textContent = '地图图片加载失败：' + m.file; };
  img.src = 'resource/maps/' + encodeURIComponent(m.file);

  layout(true);
  refresh();
  if (!$('listPanel').hidden) renderList();
}

function refresh() {
  renderMarkers();
  renderPin();
  updateStatus();
}

function renderMarkers() {
  const all = spotsOnMap().filter(passSide);
  state.found = state.q ? new Set(all.filter(spotHit).map(s => s.id)) : null;

  markerLayer.innerHTML = '';
  const frag = document.createDocumentFragment();

  all.forEach((s, mi) => {
    const ps = propsFor(s);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'marker side-' + dotClass(markerSide(s)) + (animMarkers ? ' mk-in' : '');
    if (state.found && !state.found.has(s.id)) b.classList.add('dimmed');
    if (state.found && state.found.has(s.id)) b.classList.add('found');
    b.style.left = s.x + '%';
    b.style.top = s.y + '%';
    b.style.setProperty('--i', mi);      // 脉冲环按序号错峰，不要整齐划一
    b.dataset.id = s.id;

    let inner = '<span class="mk-dot"></span>';
    if (ps.length > 1) inner += '<span class="mk-count">' + ps.length + '</span>';
    // 标签列出该点位每个道具名（没名字就用道具类型兜底），一个名字一行
    const src = ps.length ? ps : (s.props || []);
    if (src.length) {
      inner += '<span class="mk-name">'
        + src.map(q => '<span class="mkn-i">' + esc(q.name || typeLabel(q.type)) + '</span>').join('')
        + '</span>';
    }
    b.innerHTML = inner;

    b.addEventListener('mouseenter', ev => showTip(s, ev));
    b.addEventListener('mousemove', ev => moveTip(ev));
    b.addEventListener('mouseleave', scheduleTipHide);
    b.addEventListener('click', ev => {
      if (state.pick) return;              // 点选模式下让地图接管
      ev.stopPropagation();
      const vis = propsFor(s);
      if (!vis.length) return;
      hideTip();
      openViewer(s.id, vis[0].id);         // 多道具时默认看第一个，其余在左栏切换
    });

    frag.appendChild(b);
  });

  markerLayer.appendChild(frag);
  animMarkers = false;      // 只有换地图那一次播放入场动画，搜索/筛选不重播
  layoutNames();
  updateHint();
}

/* ---------------- 点位名标签的排布 ----------------
   标签是横向文字，该点位的每个道具名占一行、从上到下排列，整块摆在点位的
   上 / 下 / 左 / 右四个方向之一。
   方向按需求挑：先排除会压到其它点位圆点或已放标签的方向，再在这些方向里
   挑离它朝向的那条地图边最近的；一个都放不下时，退而选压得最少、越界最少的。
   全部在屏幕坐标里算，所以跟缩放级别无关。 */

const NAME_DIRS = ['r', 'l', 'b', 't'];
const NAME_DOT_R = 9;    // .mk-dot 半径
const NAME_OFF = 13;     // 标签边到圆点中心的距离（= 半径 + 4px 空隙）

/** 某个方向上标签的包围盒（屏幕坐标） */
function nameBox(cx, cy, w, h, dir) {
  if (dir === 'r') return { x1: cx + NAME_OFF, y1: cy - h / 2, x2: cx + NAME_OFF + w, y2: cy + h / 2 };
  if (dir === 'l') return { x1: cx - NAME_OFF - w, y1: cy - h / 2, x2: cx - NAME_OFF, y2: cy + h / 2 };
  if (dir === 't') return { x1: cx - w / 2, y1: cy - NAME_OFF - h, x2: cx + w / 2, y2: cy - NAME_OFF };
  return { x1: cx - w / 2, y1: cy + NAME_OFF, x2: cx + w / 2, y2: cy + NAME_OFF + h };
}
function boxOverlap(a, b) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
}
/** 越出地图边界的总长度，0 表示完整落在地图里 */
function boxOut(box, W, H) {
  return Math.max(0, -box.x1) + Math.max(0, box.x2 - W)
    + Math.max(0, -box.y1) + Math.max(0, box.y2 - H);
}
/** 标签到它朝向的那条边的距离 */
function boxEdge(box, W, H, dir) {
  if (dir === 'r') return W - box.x2;
  if (dir === 'l') return box.x1;
  if (dir === 't') return box.y1;
  return H - box.y2;
}

function layoutNames() {
  if (!state.showNames) return;
  const mr = markerLayer.getBoundingClientRect();
  if (mr.width < 8 || mr.height < 8) return;

  // 先让标签参与布局量出尺寸（只隐藏可见性，避免闪一下）
  const items = [];
  markerLayer.querySelectorAll('.marker').forEach(m => {
    const el = m.querySelector('.mk-name');
    if (!el) return;
    el.style.display = 'flex';
    el.style.visibility = 'hidden';
    el.dataset.dir = '';
    const r = el.getBoundingClientRect();
    const c = m.getBoundingClientRect();
    items.push({
      el,
      w: r.width,
      h: r.height,
      cx: c.left + c.width / 2 - mr.left,
      cy: c.top + c.height / 2 - mr.top,
    });
  });
  if (!items.length) return;

  const W = mr.width, H = mr.height;
  const dots = items.map(it => ({
    x1: it.cx - NAME_DOT_R, y1: it.cy - NAME_DOT_R,
    x2: it.cx + NAME_DOT_R, y2: it.cy + NAME_DOT_R,
  }));

  // 可选方向越少的点位越先定，免得被后定的挤掉
  const order = items.map((it, i) => ({
    i,
    inside: NAME_DIRS.filter(d => boxOut(nameBox(it.cx, it.cy, it.w, it.h, d), W, H) === 0).length,
    far: Math.hypot(it.cx - W / 2, it.cy - H / 2),
  })).sort((a, b) => a.inside - b.inside || b.far - a.far);

  const taken = [];
  const dirOf = new Array(items.length);
  const rank = c => [c.out > 0 ? 1 : 0, c.hit > 0 ? 1 : 0, c.hit, c.edge, c.out];

  order.forEach(({ i }) => {
    const it = items[i];
    let best = null;
    NAME_DIRS.forEach(dir => {
      const box = nameBox(it.cx, it.cy, it.w, it.h, dir);
      let hit = 0;
      dots.forEach((d, k) => { if (k !== i) hit += boxOverlap(box, d); });
      taken.forEach(t => { hit += boxOverlap(box, t); });
      const cand = { dir, out: boxOut(box, W, H), hit, edge: boxEdge(box, W, H, dir) };
      if (!best) { best = cand; return; }
      const ra = rank(cand), rb = rank(best);
      for (let n = 0; n < ra.length; n++) {
        if (ra[n] !== rb[n]) { if (ra[n] < rb[n]) best = cand; return; }
      }
    });
    dirOf[i] = best.dir;
    taken.push(nameBox(it.cx, it.cy, it.w, it.h, best.dir));
  });

  items.forEach((it, i) => {
    it.el.dataset.dir = dirOf[i];
    it.el.style.display = '';
    it.el.style.visibility = '';
  });
}

const relayoutNames = debounce(layoutNames, 80);

function renderPin() {
  pickLayer.innerHTML = '';
  if ($('editDock').hidden || !state.editor) return;
  const d = document.createElement('div');
  d.className = 'pick-pin';
  d.style.left = state.editor.x + '%';
  d.style.top = state.editor.y + '%';
  pickLayer.appendChild(d);
}

function updateStatus() {
  const m = mapById(state.mapId);
  const spots = spotsOnMap();
  const props = spots.reduce((n, s) => n + (s.props || []).length, 0);
  $('statMap').textContent = m.cn + ' · ' + m.en;
  $('statCount').textContent = spots.length + ' 个点位 · ' + props + ' 个道具';
}

function updateHint() {
  const el = $('viewportHint');
  if (state.pick) {
    el.innerHTML = '<span>在地图上点一下，确定道具点位</span><button type="button" data-act="cancelPick">取消 (Esc)</button>';
    el.hidden = false;
    return;
  }
  const n = spotsOnMap().length;
  if (!n) {
    el.innerHTML = '<span>这张图还没有点位，点右上角「＋ 添加道具点位」开始记录</span>';
    el.hidden = false;
    return;
  }
  el.hidden = true;
}

/* ============================================================
   悬浮提示（可点击的 hover 卡片）
   ============================================================ */

let tipTimer = 0;
function cancelTipHide() { clearTimeout(tipTimer); }
function scheduleTipHide() {
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tooltip.hidden = true; }, 200);
}
function hideTip() { cancelTipHide(); tooltip.hidden = true; }

/** 地图按钮的悬停卡片：T / CT 分别的点位数量与道具数量 */
function showMapTip(m, ev) {
  cancelTipHide();
  const st = mapStats(m.id);
  const row = (side, cls) => {
    const n = st[side];
    return '<div class="mt-row">'
      + '<span class="chip ' + cls + '">' + side + '</span>'
      + '<span class="mt-n"><b>' + n.spots + '</b>点位</span>'
      + '<span class="mt-n"><b>' + n.props + '</b>道具</span>'
      + '</div>';
  };
  tooltip.innerHTML = '<div class="tt-head">' + esc(m.cn) + ' · ' + esc(m.en) + '</div>'
    + '<div class="mt-body">' + row('T', 't') + row('CT', 'ct') + '</div>';
  tooltip.hidden = false;
  moveTip(ev);
}

function showTip(s, ev) {
  cancelTipHide();
  const ps = propsFor(s);
  const sd = spotSide(s);
  let html = '<div class="tt-head">';
  html += '<span class="chip ' + dotClass(sd) + '">' + esc(sideLabel(sd)) + '</span>';
  // 右上角：在这个点位上再加一个道具
  html += '<button type="button" class="tt-add" data-add="' + esc(s.id) + '" title="在这个点位再加一个道具">＋</button>';
  html += '</div>';
  if (!ps.length) {
    html += '<div class="tt-how">（当前筛选下没有可显示的道具）</div>';
  } else {
    ps.forEach(p => {
      html += '<div class="tt-prop clickable" data-spot="' + esc(s.id) + '" data-prop="' + esc(p.id) + '">'
        + typeBadge(p.type)
        + '<div class="tt-main">'
        + '<div class="tt-name">' + esc(p.name || '未命名') + ' <span class="tt-arrow">›</span></div>'
        + actViewHtml(p, true)
        + (p.note ? '<div class="tt-how">' + esc(p.note) + '</div>' : '')
        + '</div></div>';
    });
    html += '</div>';
  }
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  moveTip(ev);
}

function moveTip(ev) {
  const pad = 14;
  const w = tooltip.offsetWidth;
  const h = tooltip.offsetHeight;
  let x = ev.clientX + 18;
  let y = ev.clientY + 18;
  if (x + w > window.innerWidth - pad) x = ev.clientX - w - 18;
  if (y + h > window.innerHeight - pad) y = ev.clientY - h - 18;
  tooltip.style.left = Math.max(pad, x) + 'px';
  tooltip.style.top = Math.max(pad, y) + 'px';
}

tooltip.addEventListener('mouseenter', cancelTipHide);
tooltip.addEventListener('mouseleave', scheduleTipHide);
tooltip.addEventListener('click', ev => {
  const add = ev.target.closest('[data-add]');
  if (add) {
    hideTip();
    openEditorAddProp(add.dataset.add);
    return;
  }
  const row = ev.target.closest('[data-prop]');
  if (!row) return;
  const s = state.spots.find(x => x.id === row.dataset.spot);
  const p = s && (s.props || []).find(pp => pp.id === row.dataset.prop);
  if (p) { hideTip(); openViewer(s.id, p.id); }
});

/* ============================================================
   交互：缩放 / 平移 / 点选
   ============================================================ */

let drag = null;
let suppressClick = false;

viewport.addEventListener('pointerdown', ev => {
  if (ev.button !== 0) return;
  if (ev.target.closest('.marker')) return;
  drag = { x: ev.clientX, y: ev.clientY };
  suppressClick = false;
  viewport.classList.add('dragging');
  try { viewport.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
});

viewport.addEventListener('pointermove', ev => {
  if (!drag) return;
  const dx = ev.clientX - drag.x;
  const dy = ev.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) suppressClick = true;
  drag.x = ev.clientX;
  drag.y = ev.clientY;
  state.view.fx -= dx / state.view.zoom / state.baseW;
  state.view.fy -= dy / state.view.zoom / state.baseH;
  state.view.fx = clamp(state.view.fx, 0, 1);
  state.view.fy = clamp(state.view.fy, 0, 1);
  applyView();
});

function endDrag() {
  drag = null;
  viewport.classList.remove('dragging');
}
viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);

viewport.addEventListener('click', ev => {
  if (suppressClick) { suppressClick = false; return; }
  if (!state.pick) return;
  if (ev.target.closest('.viewport-hint')) return;   // 别把「取消」按钮的点击当成落点
  const p = screenToPct(ev.clientX, ev.clientY);
  applyPick(p.x, p.y);
});

viewport.addEventListener('dblclick', () => {
  state.view.zoom = 1;
  state.view.fx = 0.5;
  state.view.fy = 0.5;
  applyView();
});

viewport.addEventListener('wheel', ev => {
  ev.preventDefault();
  const r = viewport.getBoundingClientRect();
  const sx = ev.clientX - r.left;
  const sy = ev.clientY - r.top;
  const z0 = state.view.zoom;
  const z1 = clamp(z0 * Math.exp(-ev.deltaY * 0.0016), 0.35, 12);
  if (z1 === z0) return;
  const lx = (sx - state.pan.x) / z0;      // 光标下的舞台本地坐标
  const ly = (sy - state.pan.y) / z0;
  const { L, T, w, h } = state.box;
  const panX = sx - lx * z1;
  const panY = sy - ly * z1;
  state.view.zoom = z1;
  state.view.fx = clamp(((L + w / 2) - panX) / z1 / state.baseW, 0, 1);
  state.view.fy = clamp(((T + h / 2) - panY) / z1 / state.baseH, 0, 1);
  applyView();
  relayoutNames();       // 缩放后圆点间距变了，标签方向要重算
}, { passive: false });

window.addEventListener('resize', debounce(() => { layout(false); fitViewerShot(); }, 120));

/* ---------------- 点选模式 ---------------- */

function startPick() {
  state.pick = { type: 'spot' };
  viewport.classList.add('picking');
  updateHint();
  hideTip();
}

function stopPick() {
  state.pick = null;
  viewport.classList.remove('picking');
  updateHint();
}

function applyPick(x, y) {
  if (!state.editor) return;
  state.editor.x = +x.toFixed(2);
  state.editor.y = +y.toFixed(2);
  const c = $('edCoord');
  if (c) c.textContent = coordText(state.editor);
  renderPin();
  toast('位置已设为 X ' + state.editor.x + ' , Y ' + state.editor.y);
  stopPick();
}

function coordText(ed) {
  return 'X ' + (ed.x == null ? 0 : +ed.x).toFixed(2) + ' · Y ' + (ed.y == null ? 0 : +ed.y).toFixed(2);
}

/* ============================================================
   道具查看器（轮播 + 使用方式 + 感想）
   ============================================================ */

function openViewer(spotId, propId) {
  const s = state.spots.find(x => x.id === spotId);
  if (!s) return;
  state.viewer = { spotId, propId, idx: 0 };
  renderViewer();
  show($('detailModal'));
  fitViewerShot();   // 弹窗显示后才有尺寸可量
}

function renderViewer() {
  const v = state.viewer;
  if (!v) return;
  const s = state.spots.find(x => x.id === v.spotId);
  if (!s) return;
  const vi = (s.props || []).findIndex(p => p.id === v.propId);
  if (vi < 0) return;
  const p = s.props[vi];
  v.propId = p.id;
  v.idx = 0;
  state.lastTap = 0;

  // 左栏：同一点位下的每个道具各占一行，点哪行看哪个
  const list = '<div class="dt-props"><div class="dt-props-in">' + (s.props || []).map((q, k) =>
    '<button type="button" class="dt-prop' + (k === vi ? ' on' : '') + '" data-prop="' + esc(q.id) + '">'
    + typeBadge(q.type) + '<span class="nm">' + esc(q.name || '未命名') + '</span>'
    + '</button>').join('') + '</div></div>';

  // 左栏底部：使用方式压成一行
  const usage = '<div class="dt-usage">'
    + '<span class="dt-k">使用方式</span>'
    + (actViewHtml(p, true) || '<span class="dt-none">未设置</span>')
    + '</div>';

  const note = p.note
    ? '<div class="dt-note"><span class="dt-k">感想</span><p>' + esc(p.note) + '</p></div>'
    : '';

  $('detailBody').innerHTML = '<div class="dt-side">' + list + note + usage + '</div>'
    + '<div class="dt-main">' + carouselHtml(p) + '</div>';

  $('detailFoot').innerHTML = '<span class="foot-hint">' + esc(p.imgs.length + ' 张描点图' + (p.imgs.length > 1 ? ' · 拖动/圆点/箭头 切换' : '') + ' · 双击图片全屏') + '</span>'
    + '<button type="button" class="btn danger" data-act="delSpot">删除点位</button>'
    + '<button type="button" class="btn primary" data-act="editSpot">编辑</button>';

  bindShotFit();
}

function carouselHtml(p) {
  const imgs = p.imgs || [];
  if (!imgs.length) {
    return '<div class="carousel empty"><div class="empty-note">这个道具还没有描点图片</div></div>';
  }
  let html = '<div class="carousel">'
    + '<div class="car-track" id="carTrack">'
    + '<img id="carImg" class="car-img" src="' + imgSrc(imgs[0]) + '" alt="">'
    + (imgs.length > 1 ? '<span class="car-count" id="carCount">1 / ' + imgs.length + '</span>' : '')
    + '</div>';
  if (imgs.length > 1) {
    html += '<button type="button" class="car-arrow prev" id="carPrev" title="上一张" tabindex="-1">‹</button>'
      + '<button type="button" class="car-arrow next" id="carNext" title="下一张" tabindex="-1">›</button>'
      + '<div class="car-dots" id="carDots">' + imgs.map((f, k) =>
        '<button type="button" class="car-dot' + (k === 0 ? ' on' : '') + '" data-i="' + k + '" title="第 ' + (k + 1) + ' 张"></button>').join('') + '</div>';
  }
  return html + '</div>';
}

/* 把图片框的宽高算成图片的真实宽高：这样框和图片一样大，
   上下（或左右）不会留出黑边，同时图片尽量占满可用空间。 */
function fitViewerShot() {
  const body = $('detailBody');
  const car = body && body.querySelector('.dt-main .carousel');
  const track = $('carTrack');
  const img = $('carImg');
  if (!car || !track || !img) return;
  const ar = (img.naturalWidth || 16) / (img.naturalHeight || 9);
  if (!(ar > 0)) return;
  const availW = car.clientWidth;
  // 高度要扣掉圆点那一行和它与图片之间的 10px 间距
  const dots = $('carDots');
  const availH = car.clientHeight - (dots ? dots.offsetHeight + 10 : 0);
  if (availW <= 0 || availH <= 0) return;
  let w = availW, h = w / ar;
  if (h > availH) { h = availH; w = h * ar; }
  track.style.width = Math.floor(w) + 'px';
  track.style.height = Math.floor(h) + 'px';
}

/* 图片换 src 后重新量一次；已经缓存好的图 complete 为真，直接算 */
function bindShotFit() {
  const img = $('carImg');
  if (!img) return;
  img.onload = fitViewerShot;
  if (img.complete && img.naturalWidth) fitViewerShot();
}

/** 查看器当前道具的图片列表 */
function viewerImgs() {
  const v = state.viewer;
  if (!v) return [];
  const s = state.spots.find(x => x.id === v.spotId);
  const p = s && (s.props || []).find(pp => pp.id === v.propId);
  return (p && p.imgs) || [];
}

/** 当前查看器道具的图片张数 */
function carN() { return viewerImgs().length; }

/** 当前正在看的那张图 */
function currentImg() {
  const imgs = viewerImgs();
  const v = state.viewer;
  return imgs[v ? v.idx : 0];
}

/** 切换查看器里的某张图：只换 src，永远只有一个 <img>，任何渲染环境都稳妥 */
function carGo(i) {
  const v = state.viewer;
  const imgs = viewerImgs();
  const n = imgs.length;
  if (!v || n < 2) return;
  v.idx = clamp(i, 0, n - 1);
  const img = $('carImg');
  if (img && imgs[v.idx]) img.src = imgSrc(imgs[v.idx]);
  const cnt = $('carCount');
  if (cnt) cnt.textContent = (v.idx + 1) + ' / ' + n;
  const dots = $('carDots');
  if (dots) [...dots.children].forEach((d, k) => d.classList.toggle('on', k === v.idx));
  const prev = $('carPrev'), next = $('carNext');
  if (prev) prev.classList.toggle('off', v.idx === 0);
  if (next) next.classList.toggle('off', v.idx === n - 1);
  bindShotFit();   // 换图后比例可能不同，重新量一次
}

$('detailBody').addEventListener('click', ev => {
  // 查看器：上一张 / 下一张 / 圆点跳转 / 切换道具 / 双击图片全屏
  if (state.suppressSlideClick) { state.suppressSlideClick = false; return; }
  const arr = ev.target.closest('#carPrev');
  if (arr) { carGo(state.viewer.idx - 1); return; }
  const arrN = ev.target.closest('#carNext');
  if (arrN) { carGo(state.viewer.idx + 1); return; }
  const dot = ev.target.closest('.car-dot[data-i]');
  if (dot) { carGo(+dot.dataset.i); return; }
  const track = ev.target.closest('#carTrack');
  if (track) {
    // 手动识别双击：不依赖原生 dblclick，避免被指针捕获等行为吞掉
    const now = Date.now();
    if (state.lastTap && now - state.lastTap < 380) {
      state.lastTap = 0;
      const src = currentImg();
      if (src) openLightbox(src);
      return;
    }
    state.lastTap = now;
    return;
  }
  const nav = ev.target.closest('.dt-prop[data-prop]');
  if (nav) { state.viewer.propId = nav.dataset.prop; renderViewer(); return; }
});

// 轮播拖动：按住当前这张图跟随手指，松手按贝塞尔回弹；不捕获指针，避免影响点击/双击
$('detailBody').addEventListener('pointerdown', ev => {
  if (ev.button !== 0) return;
  const track = ev.target.closest('#carTrack');
  const img = track && track.querySelector('#carImg');
  if (!track || !img) return;
  state.suppressSlideClick = false;
  state.swipe = { x: ev.clientX, from: state.viewer ? state.viewer.idx : 0, el: track, active: false, pid: ev.pointerId };
  img.style.transition = 'none';
  track.classList.add('dragging');
});
window.addEventListener('pointermove', ev => {
  const sw = state.swipe;
  if (!sw || ev.pointerId !== sw.pid) return;
  const dx = ev.clientX - sw.x;
  if (!sw.active && Math.abs(dx) > 8) sw.active = true;
  if (!sw.active) return;
  state.suppressSlideClick = true;
  const img = sw.el.querySelector('#carImg');
  if (img) img.style.transform = 'translateX(' + dx + 'px)';
});
window.addEventListener('pointerup', ev => {
  const sw = state.swipe;
  if (!sw || ev.pointerId !== sw.pid) return;
  state.swipe = null;
  sw.el.classList.remove('dragging');
  const img = sw.el.querySelector('#carImg');
  const dx = ev.clientX - sw.x;
  if (img) {
    img.style.transition = 'transform .3s cubic-bezier(.22, .8, .3, 1)';
    img.style.transform = '';
  }
  if (sw.active) {
    state.suppressSlideClick = true;
    carGo(Math.abs(dx) >= 48 ? sw.from + (dx < 0 ? 1 : -1) : sw.from);
  }
});
window.addEventListener('pointercancel', ev => {
  const sw = state.swipe;
  if (!sw || ev.pointerId !== sw.pid) return;
  state.swipe = null;
  sw.el.classList.remove('dragging');
  const img = sw.el.querySelector('#carImg');
  if (img) { img.style.transition = 'none'; img.style.transform = ''; }
});

$('detailFoot').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const s = state.viewer && state.spots.find(x => x.id === state.viewer.spotId);
  if (!s) return;
  const act = btn.dataset.act;
  if (act === 'editSpot') {
    hide($('detailModal'));
    state.viewer = null;
    openEditor(s.id);
  } else if (act === 'delSpot') {
    if (!confirm('删除这个点位？它下面的 ' + (s.props || []).length + ' 个道具也会一起删掉。')) return;
    state.spots = state.spots.filter(x => x.id !== s.id);
    save(true);
    state.viewer = null;
    hide($('detailModal'));
    renderMapList(); refresh();
    if (!$('listPanel').hidden) renderList();
    toast('点位已删除');
  }
});

/* ============================================================
   添加 / 编辑点位
   ============================================================ */

function newProp() {
  return { side: 'T', type: 'smoke', name: '', note: '', imgs: [],
           keys: ['left'], toss: ['nojump'], move: [] };
}

function openEditor(spotId) {
  const s = spotId ? state.spots.find(x => x.id === spotId) : null;
  if (s) {
    state.editor = {
      id: s.id, map: s.map, x: s.x, y: s.y,
      props: (s.props || []).map(p => ({
        id: p.id, side: p.side, type: p.type, name: p.name || '',
        keys: [...(p.keys || [])], toss: [...(p.toss || [])], move: [...(p.move || [])],
        note: p.note || '', imgs: [...(p.imgs || [])],
      })),
    };
    if (!state.editor.props.length) state.editor.props = [newProp()];
  } else {
    state.editor = { id: null, map: state.mapId, x: 50, y: 50, props: [newProp()] };
  }

  $('editTitle').textContent = s ? '编辑道具点位' : '添加道具点位';

  if (state.editor.map !== state.mapId) setMap(state.editor.map);
  renderEditor();
  show($('editDock'));
  layout(false);
}

/** 打开该点位的编辑弹窗，并直接追加一个空道具（点位悬停卡片右上角的 ＋） */
function openEditorAddProp(spotId) {
  const s = state.spots.find(x => x.id === spotId);
  const had = s ? (s.props || []).length : 0;
  openEditor(spotId);
  if (!state.editor) return;
  // 该点位本来没有道具时，openEditor 已经给了一个空块，不用再加
  if (had) {
    state.editor.props.push(newProp());
    renderEditor();
  }
  const blocks = $('edProps').querySelectorAll('.prop-block');
  if (blocks.length) blocks[blocks.length - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function closeEditor() {
  hide($('editDock'));
  state.editor = null;
  stopPick();
  renderPin();
  layout(false);
}

function renderEditor() {
  const ed = state.editor;
  if (!ed) return;
  const mapOpts = MAPS.map(m =>
    '<option value="' + m.id + '"' + (m.id === ed.map ? ' selected' : '') + '>' + esc(m.cn + ' · ' + m.en) + '</option>').join('');

  const isEdit = !!ed.id;
  let html = '<div class="field"><label>地图</label><select id="edMap">' + mapOpts + '</select></div>';

  html += '<div class="field"><div class="coord-pick">'
    + '<span class="coord-read" id="edCoord">' + coordText(ed) + '</span>'
    + '<button type="button" class="btn ghost sm" data-act="pickSpot">在地图上点选</button>'
    + (isEdit ? '<button type="button" class="btn ghost sm" data-act="addProp" title="编辑时可继续加道具">＋ 再加一个道具</button>' : '')
    + '</div></div>';

  html += '<div class="section-title">道具</div><div id="edProps">';
  ed.props.forEach((p, i) => { html += propBlockHtml(p, i); });
  html += '</div>';

  $('editBody').innerHTML = html;
  renderPin();
}

function propBlockHtml(p, i) {
  const typeOpts = TYPES.map(t =>
    '<option value="' + t.id + '"' + (t.id === p.type ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('');
  const thumbs = (p.imgs || []).map((f, k) =>
    '<div class="img-cell" data-img="' + esc(f) + '" title="点击放大">'
    + '<img src="' + imgSrc(f) + '" alt="">'
    + '<button type="button" class="del" data-act="delImg" data-k="' + k + '" title="移除">×</button></div>').join('');

  return '<div class="prop-block" data-i="' + i + '">'
    + '<div class="row2">'
    + '<div class="field"><label>道具类型</label><select data-f="type">' + typeOpts + '</select></div>'
    + '<div class="field"><label>阵营</label><div class="mini-seg">'
    + '<button type="button" data-f="side" data-side="T"' + (isSide(p, 'T') ? ' class="on"' : '') + '>T</button>'
    + '<button type="button" data-f="side" data-side="CT"' + (isSide(p, 'CT') ? ' class="on"' : '') + '>CT</button>'
    + '</div></div></div>'

    + '<div class="field"><label>道具点位名称</label>'
    + '<input type="text" data-f="name" value="' + esc(p.name) + '"></div>'

    + '<div class="field"><label>使用方式</label>'
    + actRowsHtml(p)
    + '</div>'

    + '<div class="field"><label>感想</label>'
    + '<textarea data-f="note">' + esc(p.note) + '</textarea></div>'

    + '<div class="field"><label>描点图片</label><div class="img-grid">'
    + thumbs
    + '<button type="button" class="img-add" data-act="upImg"><span class="plus">＋</span>上传图片</button>'
    + '<button type="button" class="img-add" data-act="pickImg"><span class="plus">≡</span>已有图片</button>'
    + '</div></div>'

    + '<div class="prop-del"><button type="button" class="btn ghost sm" data-act="delProp">删除此道具</button></div>'
    + '</div>';
}

/** 表单里的三行单选按钮 */
function actRowsHtml(p) {
  return '<div class="act-rows">' + ACT_ROWS.map(row => {
    const sel = (p && p[row.key]) || [];
    return '<div class="act-row">'
      + '<span class="act-row-label">' + esc(row.label) + '</span>'
      + '<div class="act-chips">' + row.opts.map(o =>
          '<button type="button" class="act-chip' + (sel.indexOf(o.id) >= 0 ? ' on' : '') + '"'
          + ' data-act="act" data-row="' + row.key + '" data-opt="' + o.id + '">' + esc(o.label) + '</button>').join('')
      + '</div></div>';
  }).join('') + '</div>';
}

/** 把界面上的值收回模型 */
function syncEditor() {
  const ed = state.editor;
  if (!ed) return;
  const mapSel = $('edMap');
  if (mapSel) ed.map = mapSel.value;

  const blocks = [...$('edProps').querySelectorAll('.prop-block')];
  if (!blocks.length) return;
  ed.props = blocks.map(b => {
    const prev = ed.props[+b.dataset.i] || {};
    const sides = [...b.querySelectorAll('[data-f="side"].on')].map(el => el.dataset.side);
    const out = {
      id: prev.id,
      side: sides.includes('T') && sides.includes('CT') ? 'both'
        : sides.includes('CT') ? 'CT'
        : sides.includes('T') ? 'T'
        : (prev.side || 'T'),
      type: b.querySelector('[data-f="type"]').value,
      name: b.querySelector('[data-f="name"]').value.trim(),
      note: b.querySelector('[data-f="note"]').value,
      imgs: [...(prev.imgs || [])],
    };
    ACT_KEYS.forEach(k => {
      out[k] = [...b.querySelectorAll('[data-act="act"][data-row="' + k + '"].on')].map(el => el.dataset.opt);
    });
    return out;
  });
}

$('editBody').addEventListener('change', ev => {
  if (ev.target.id === 'edMap') {
    syncEditor();
    const next = state.editor.map;
    if (next !== state.mapId) setMap(next);
    renderEditor();
  }
});

$('editBody').addEventListener('click', ev => {
  const sideBtn = ev.target.closest('[data-f="side"]');
  if (sideBtn) {
    sideBtn.classList.toggle('on');
    return;
  }
  // 点缩略图放大（右上角的 × 除外）。这一步必须排在 data-act 判定之前：
  // 缩略图本身没有 data-act，若先判定会被 return 掉，导致永远放不大。
  const cell = ev.target.closest('.img-cell[data-img]');
  if (cell && !ev.target.closest('[data-act="delImg"]')) {
    openLightbox(cell.dataset.img);
    return;
  }

  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;

  const block = btn.closest('.prop-block');
  const idx = block ? +block.dataset.i : -1;

  if (act === 'pickSpot') {
    syncEditor();
    startPick();
    toast('现在在地图上点一下，确定点位坐标');
  } else if (act === 'act') {
    // 每行单选：点未选中的就换成它，点已选中的则取消（允许整行留空）。
    // 不重绘整块，免得输入框里的光标跑掉。
    syncEditor();
    const row = btn.dataset.row;
    const opt = btn.dataset.opt;
    const wasOn = (state.editor.props[idx][row] || []).indexOf(opt) >= 0;
    state.editor.props[idx][row] = wasOn ? [] : [opt];
    const chips = btn.closest('.act-chips');
    if (chips) {
      chips.querySelectorAll('.act-chip').forEach(el => {
        el.classList.toggle('on', !wasOn && el === btn);
      });
    }
  } else if (act === 'delProp') {
    syncEditor();
    if (state.editor.props.length <= 1) {
      state.editor.props = [newProp()];
    } else {
      state.editor.props.splice(idx, 1);
    }
    renderEditor();
  } else if (act === 'addProp') {
    syncEditor();
    const last = state.editor.props[state.editor.props.length - 1];
    state.editor.props.push(newProp());
    renderEditor();
    const blocks = $('edProps').querySelectorAll('.prop-block');
    if (blocks.length) blocks[blocks.length - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else if (act === 'delImg') {
    syncEditor();
    state.editor.props[idx].imgs.splice(+btn.dataset.k, 1);
    renderEditor();
  } else if (act === 'upImg') {
    syncEditor();
    state.imgTarget = idx;
    $('edFile').click();
  } else if (act === 'pickImg') {
    syncEditor();
    state.imgTarget = idx;
    openPicker();
  }
});

$('edFile').addEventListener('change', async ev => {
  const files = [...ev.target.files];
  ev.target.value = '';
  const idx = state.imgTarget;
  if (!files.length || idx == null || !state.editor) return;
  if (!state.server) {
    toast('需要本地服务才能把图片存到磁盘，请用「用Edge-本地服务打开.bat」打开本页', true);
    return;
  }
  toast('正在上传 ' + files.length + ' 张图片…');
  let ok = 0;
  for (const f of files) {
    try {
      const prop = state.editor.props[idx];
      const path = await uploadImage(f, imgBaseName(prop));
      prop.imgs.push(path);
      ok++;
    } catch (e) {
      toast('上传失败：' + f.name + ' —— ' + e.message, true);
    }
  }
  if (ok) toast('已上传 ' + ok + ' 张图片');
  renderEditor();
});

/** 上传图片的基名：<道具名>；服务端会自动补 -1 / -2 序号 */
function imgBaseName(prop) {
  const s = String(prop.name || '').trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 48);
  return s || (typeLabel(prop.type) + '道具');
}

async function uploadImage(file, saveAs) {
  const headers = {
    'Content-Type': file.type || 'application/octet-stream',
    'X-Filename': encodeURIComponent(file.name),
  };
  if (saveAs) headers['X-Save-As'] = encodeURIComponent(saveAs);
  const r = await fetch(API + '/api/upload', { method: 'POST', headers, body: file });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || '上传失败');
  return j.path;
}

$('btnSaveSpot').addEventListener('click', () => {
  syncEditor();
  const ed = state.editor;
  if (!ed) return;

  ed.props.forEach(p => {
    if (!p.name) p.name = typeLabel(p.type) + '道具';
  });

  const clean = ed.props.map(p => {
    const out = {
      id: p.id || uid('p'),
      side: p.side,
      type: p.type,
      name: p.name,
      note: p.note || '',
      imgs: p.imgs || [],
    };
    ACT_KEYS.forEach(k => { out[k] = [...(p[k] || [])]; });
    return out;
  });

  if (ed.id) {
    const s = state.spots.find(x => x.id === ed.id);
    if (s) {
      s.map = ed.map; s.x = ed.x; s.y = ed.y; s.props = clean;
    }
  } else {
    state.spots.push({ id: uid('s'), map: ed.map, x: ed.x, y: ed.y, props: clean });
  }

  save(true);
  renderMapList();
  refresh();
  if (!$('listPanel').hidden) renderList();
  closeEditor();
  toast(ed.id ? '点位已更新' : '点位已添加');
});

/* ============================================================
   从已有图片里挑
   ============================================================ */

let pickerSel = new Set();

async function openPicker() {
  pickerSel = new Set();
  const body = $('pickerBody');
  body.innerHTML = '<div class="empty-note">读取中…</div>';
  $('pickerHint').textContent = '';
  show($('pickerModal'));

  if (!state.server) {
    body.innerHTML = '<div class="empty-note">需要本地服务才能读取 <code>resource\\props</code>。<br>请用「用Edge-本地服务打开.bat」打开本页。</div>';
    return;
  }
  try {
    const r = await fetch(API + '/api/images', { cache: 'no-store' });
    const j = await r.json();
    const imgs = j.images || [];
    if (!imgs.length) {
      body.innerHTML = '<div class="empty-note">resource\\props 里还没有图片。<br>先用「上传图片」放几张进去吧。</div>';
      return;
    }
    body.innerHTML = '<div class="pick-grid">' + imgs.map(f =>
      '<div class="pick-cell" data-f="resource/props/' + esc(f) + '">'
      + '<img src="' + imgSrc('resource/props/' + f) + '" alt="">'
      + '<span class="nm">' + esc(f) + '</span></div>').join('') + '</div>';
  } catch (e) {
    body.innerHTML = '<div class="empty-note">读取失败：' + esc(e.message) + '</div>';
  }
}

$('pickerBody').addEventListener('click', ev => {
  const cell = ev.target.closest('.pick-cell');
  if (!cell) return;
  const f = cell.dataset.f;
  if (pickerSel.has(f)) { pickerSel.delete(f); cell.classList.remove('on'); }
  else { pickerSel.add(f); cell.classList.add('on'); }
  $('pickerHint').textContent = pickerSel.size ? '已选 ' + pickerSel.size + ' 张' : '';
});

$('btnPickerOk').addEventListener('click', () => {
  const idx = state.imgTarget;
  if (!pickerSel.size || idx == null || !state.editor) { hide($('pickerModal')); return; }
  state.editor.props[idx].imgs.push(...pickerSel);
  hide($('pickerModal'));
  renderEditor();
  toast('已加入 ' + pickerSel.size + ' 张图片');
});

/* ============================================================
   清理未被引用的图片
   ============================================================ */

let cleanNames = [];      // 待删除的文件名（纯名字，不含路径）

/** 收集一组 spots 里引用到的图片文件名 */
function referencedNames(spots) {
  const set = new Set();
  (spots || []).forEach(s => (s.props || []).forEach(p => (p.imgs || []).forEach(v => {
    if (v) set.add(String(v).split('/').pop());
  })));
  return set;
}

async function openClean() {
  cleanNames = [];
  const body = $('cleanBody');
  const hint = $('cleanHint');
  body.innerHTML = '<div class="empty-note">扫描中…</div>';
  hint.textContent = '';
  $('btnCleanOk').disabled = true;
  show($('cleanModal'));

  if (!state.server) {
    body.innerHTML = '<div class="empty-note">需要本地服务才能扫描 <code>resource\\props</code>。<br>请用「用Edge-本地服务打开.bat」打开本页。</div>';
    return;
  }

  let imgs = [];
  try {
    const r = await fetch(API + '/api/images', { cache: 'no-store' });
    const j = await r.json();
    imgs = j.images || [];
  } catch (e) {
    body.innerHTML = '<div class="empty-note">读取失败：' + esc(e.message) + '</div>';
    return;
  }
  if (!imgs.length) {
    body.innerHTML = '<div class="empty-note">resource\\props 里还没有图片。</div>';
    return;
  }

  const used = referencedNames(state.spots);

  // 上一版 data.json.bak 里还引用着的，单独标出来 —— 可能是刚删掉的点位，
  // 删图前让用户能看出「这张其实还能找回」。
  const inBak = new Set();
  try {
    const rb = await fetch(API + '/data.json.bak', { cache: 'no-store' });
    if (rb.ok) inBak = referencedNames((await rb.json()).spots);
  } catch (e) { /* 没有备份就算了 */ }

  cleanNames = imgs.filter(f => !used.has(f));
  if (!cleanNames.length) {
    body.innerHTML = '<div class="empty-note">没有未引用的图片，<code>resource\\props</code> 很干净。</div>';
    return;
  }

  const bakCount = cleanNames.filter(f => inBak.has(f)).length;
  body.innerHTML = '<p class="clean-lead">以下 <b>' + cleanNames.length + '</b> 张图片没有被任何道具引用，删除后无法撤销。'
    + '点缩略图可放大查看。'
    + (bakCount ? '<br>其中 <b>' + bakCount + '</b> 张在上一版备份（<code>data.json.bak</code>）里仍被引用，删掉就找不回了。' : '')
    + '</p>'
    + '<div class="pick-grid">' + cleanNames.map(f =>
      '<div class="pick-cell view" data-img="resource/props/' + esc(f) + '">'
      + '<img src="' + imgSrc('resource/props/' + f) + '" alt="">'
      + '<span class="nm">' + esc(f) + '</span>'
      + (inBak.has(f) ? '<span class="bak-tag" title="上一版 data.json.bak 里仍引用它">备份中</span>' : '')
      + '</div>').join('') + '</div>';
  hint.textContent = '共 ' + cleanNames.length + ' 张待删除';
  $('btnCleanOk').disabled = false;
}

$('cleanBody').addEventListener('click', ev => {
  const cell = ev.target.closest('.pick-cell[data-img]');
  if (cell) openLightbox(cell.dataset.img);
});

$('btnCleanOk').addEventListener('click', async () => {
  if (!cleanNames.length) { hide($('cleanModal')); return; }
  const btn = $('btnCleanOk');
  btn.disabled = true;
  try {
    const r = await fetch(API + '/api/images/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: cleanNames }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '删除失败');
    const n = (j.deleted || []).length;
    const bad = (j.failed || []).length;
    hide($('cleanModal'));
    toast('已删除 ' + n + ' 张未引用图片' + (bad ? '，' + bad + ' 张失败' : ''), !!bad);
  } catch (e) {
    btn.disabled = false;
    toast('删除失败：' + e.message, true);
  }
});

/* ============================================================
   点位清单（按地点分组，方便复习）
   ============================================================ */

function openList() {
  renderList();
  show($('listPanel'));
}
function closeList() { hide($('listPanel')); }

function renderList() {
  const m = mapById(state.mapId);
  $('listTitle').textContent = '点位清单 · ' + m.cn;

  const spots = spotsOnMap().filter(passSide);
  if (!spots.length) {
    $('listBody').innerHTML = '<div class="lg-empty">这张图还没有点位。</div>';
    return;
  }

  const groups = new Map();
  spots.forEach(s => {
    const key = (s.props[0] && s.props[0].name) || '（未命名）';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });

  const keys = [...groups.keys()].sort((a, b) => {
    if (a === '（未命名）') return 1;
    if (b === '（未命名）') return -1;
    return a.localeCompare(b, 'zh-Hans-CN');
  });

  let html = '';
  keys.forEach(k => {
    const arr = groups.get(k).sort((a, b) => a.y - b.y || a.x - b.x);
    html += '<div class="lg-group"><div class="lg-group-h">' + esc(k)
      + '<span class="cnt">' + arr.length + '</span></div>';
    arr.forEach(s => {
      const ps = propsFor(s);
      const types = [...new Set(ps.map(p => typeLabel(p.type)))].join(' · ');
      html += '<div class="lg-item" data-id="' + s.id + '">'
        + '<i class="li-dot" style="background:' + sideColor(markerSide(s)) + '"></i>'
        + '<div class="li-main"><div class="li-name">' + esc(ps.map(p => p.name).join(' / ') || '未命名') + '</div>'
        + '<div class="li-sub">' + esc(types) + (ps.some(p => (p.imgs || []).length) ? ' · 有图' : '') + '</div></div>'
        + '</div>';
    });
    html += '</div>';
  });
  $('listBody').innerHTML = html;
}

$('listBody').addEventListener('click', ev => {
  const item = ev.target.closest('.lg-item');
  if (!item) return;
  const s = state.spots.find(x => x.id === item.dataset.id);
  if (!s) return;
  focusSpot(item.dataset.id);
  const ps = propsFor(s);
  openViewer(s.id, (ps[0] || s.props[0] || {}).id);
});

/* ============================================================
   灯箱 / toast
   ============================================================ */

let lbOpenedAt = 0;      // 遮罩刚打开的时间，用来吃掉「双击」的第二下

function openLightbox(src) {
  $('lightboxImg').src = imgSrc(src);
  $('lightboxCap').textContent = String(src).split('/').pop();
  lbOpenedAt = Date.now();
  show($('lightbox'));
}
function closeLightbox() {
  hide($('lightbox'));
  $('lightboxImg').removeAttribute('src');
}

let toastTimer = 0;
function toast(msg, isErr) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isErr ? 5200 : 2400);
}

/* ============================================================
   全局事件绑定
   ============================================================ */

function bindGlobal() {
  // 主题配色（悬停展开）
  bindThemeMenu();
  document.addEventListener('click', ev => {
    const p = $('themePanel');
    if (!p.hidden && !ev.target.closest('#themePanel') && !ev.target.closest('#btnTheme')) hide(p);
  });

  $('btnAdd').addEventListener('click', () => openEditor(null));
  $('btnClean').addEventListener('click', () => openClean());
  $('btnList').addEventListener('click', () => {
    if ($('listPanel').hidden) openList(); else closeList();
  });
  $('btnFit').addEventListener('click', () => {
    state.view.zoom = 1;
    state.view.fx = 0.5;
    state.view.fy = 0.5;
    applyView();
  });

  // 关闭按钮
  document.addEventListener('click', ev => {
    const c = ev.target.closest('[data-close]');
    if (c) {
      const id = c.dataset.close;
      if (id === 'editDock') closeEditor();
      else if (id === 'listPanel') closeList();
      else { if (id === 'detailModal') state.viewer = null; hide($(id)); }
      return;
    }
    const cancel = ev.target.closest('[data-act="cancelPick"]');
    if (cancel) { stopPick(); return; }
  });

  // 点遮罩关弹窗
  ['detailModal', 'pickerModal', 'cleanModal'].forEach(id => {
    $(id).addEventListener('click', ev => {
      if (ev.target.id === id) { if (id === 'detailModal') state.viewer = null; hide($(id)); }
    });
  });

  // 单击缩略图就能放大；若用户习惯双击，第二下会落在刚出现的遮罩上，
  // 这里把打开后 400ms 内的遮罩点击忽略掉，免得开了又立刻被关掉。
  $('lightbox').addEventListener('click', () => {
    if (Date.now() - lbOpenedAt < 400) return;
    closeLightbox();
  });
  $('lightboxClose').addEventListener('click', closeLightbox);

  // 阵营筛选
  $('sideSeg').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-side]');
    if (!b) return;
    state.side = b.dataset.side;
    $('sideSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    refresh();
    if (!$('listPanel').hidden) renderList();
  });

  // 显示点位名
  $('tgNames').addEventListener('change', ev => {
    state.showNames = ev.target.checked;
    stage.classList.toggle('show-names', state.showNames);
    if (state.showNames) layoutNames();
  });

  // 搜索
  const si = $('searchInput');
  si.addEventListener('input', debounce(() => {
    state.q = si.value.trim().toLowerCase();
    $('searchClear').hidden = !state.q;
    refresh();
    if (!$('listPanel').hidden) renderList();
  }, 130));
  $('searchClear').addEventListener('click', () => {
    si.value = '';
    state.q = '';
    $('searchClear').hidden = true;
    refresh();
  });

  // 快捷键
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      if (!$('lightbox').hidden) { closeLightbox(); return; }
      if (!$('themePanel').hidden) { hide($('themePanel')); return; }
      if (state.pick) { stopPick(); return; }
      if (!$('pickerModal').hidden) { hide($('pickerModal')); return; }
      if (!$('cleanModal').hidden) { hide($('cleanModal')); return; }
      if (!$('detailModal').hidden) { state.viewer = null; hide($('detailModal')); return; }
      if (!$('editDock').hidden) { closeEditor(); return; }
      if (!$('listPanel').hidden) { closeList(); return; }
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((ev.target.tagName || ''));
    if (!typing && ev.key === '/') { ev.preventDefault(); si.focus(); }
    if (!typing && ev.key.toLowerCase() === 'n' && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); openEditor(null); }
    if (!typing && ev.key.toLowerCase() === 't' && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); cycleTheme(); }
  });
}

/* ---------------- 起飞 ---------------- */

boot();