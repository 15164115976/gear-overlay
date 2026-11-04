const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const MARGIN = 18;          // 面板四周留给外发光的透明边
const BASE_W = 164;         // 面板基准尺寸（缩放 1.0 时）
const BASE_H = 366;
const ICON_WIN = 78;        // 收起时窗口尺寸
const ICON_C = 39;          // 图标中心在窗口内的位置
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 2.2;

// 收起按钮在面板内的中心（未缩放），用于收起/展开时对准同一个点
const FOLD_X = 21;
const FOLD_Y = 23;

const SLOT_KEYS = ['帽子', '护腕', '上衣', '下装', '腰带', '鞋子',
                   '项链', '腰坠', '戒指', '戒子', '武器', '暗器'];
const LEVELS = [740, 965, 1110, 1280];

let win = null;
let store = null;
let dragTimer = null;
let dragOffset = null;

// 便携版：exe 同目录若有 portable.marker，配置就存在 exe 旁边的 data 目录里
try {
  const exeDir = path.dirname(app.getPath('exe'));
  if (fs.existsSync(path.join(exeDir, 'portable.marker'))) {
    app.setPath('userData', path.join(exeDir, 'data'));
  }
} catch (e) { /* ignore */ }

const dataFile = () => path.join(app.getPath('userData'), 'gear-overlay.json');

function newSlot(lv) {
  return { lv: lv || 740, s: { t: '小附魔', on: false }, b: { t: '大附魔', on: false } };
}

function newPage(name) {
  const slots = {};
  for (const k of SLOT_KEYS) slots[k] = newSlot();
  return { name, slots };
}

function defaults() {
  return { zoom: 1.2, collapsed: false, pos: null, page: 0, pages: [newPage('角色 1')] };
}

function load() {
  const d = defaults();
  try {
    const s = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    const out = Object.assign(d, s);
    if (!Array.isArray(out.pages) || !out.pages.length) out.pages = d.pages;
    out.pages = out.pages.map((p) => {
      const slots = {};
      for (const k of SLOT_KEYS) {
        const old = p.slots && p.slots[k];
        if (old && typeof old === 'object') {
          slots[k] = {
            lv: old.lv || 740,
            s: old.s || { t: '小附魔', on: false },
            b: old.b || { t: '大附魔', on: false }
          };
        } else {
          slots[k] = newSlot(p.lv && p.lv[k]);   // 兼容旧版只有 lv 的数据
        }
      }
      return { name: p.name || '角色', slots };
    });
    return out;
  } catch (e) {
    return d;
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
      fs.writeFileSync(dataFile(), JSON.stringify(store, null, 2));
    } catch (e) { /* ignore */ }
  }, 150);
}

/** 保证整块窗口落在屏幕可视范围里（多屏也管用） */
function clampToScreen(x, y, w, h) {
  const d = screen.getDisplayNearestPoint({ x: Math.round(x + w / 2), y: Math.round(y + h / 2) });
  const wa = d.workArea;
  const nx = Math.max(wa.x, Math.min(Math.round(x), wa.x + wa.width - w));
  const ny = Math.max(wa.y, Math.min(Math.round(y), wa.y + wa.height - h));
  return { x: nx, y: ny };
}

function panelSize() {
  const z = store.zoom;
  return { w: Math.round(BASE_W * z), h: Math.round(BASE_H * z) };
}

function rememberPos() {
  if (!win) return;
  const b = win.getBounds();
  store.pos = { x: b.x, y: b.y };
  save();
}

/** 切到收起 / 展开，并让「图标中心」与「收起按钮中心」重合 */
function setCollapsed(v) {
  if (!win) return;
  const z = store.zoom;
  const b = win.getBounds();
  const was = store.collapsed;
  store.collapsed = !!v;

  if (!was && store.collapsed) {
    // 展开 → 收起：图标落在收起按钮的位置
    const px = b.x + MARGIN, py = b.y + MARGIN;
    const c = clampToScreen(px + FOLD_X * z - ICON_C, py + FOLD_Y * z - ICON_C, ICON_WIN, ICON_WIN);
    win.setBounds({ x: c.x, y: c.y, width: ICON_WIN, height: ICON_WIN });
  } else if (was && !store.collapsed) {
    // 收起 → 展开：让收起按钮落在刚才图标的位置
    const cx = b.x + ICON_C, cy = b.y + ICON_C;
    const { w, h } = panelSize();
    const c = clampToScreen(cx - FOLD_X * z - MARGIN, cy - FOLD_Y * z - MARGIN,
                            w + MARGIN * 2, h + MARGIN * 2);
    win.setBounds({ x: c.x, y: c.y, width: w + MARGIN * 2, height: h + MARGIN * 2 });
  }
  rememberPos();
}

function createWindow() {
  const { w, h } = store.collapsed
    ? { w: ICON_WIN, h: ICON_WIN }
    : (() => { const s = panelSize(); return { w: s.w + MARGIN * 2, h: s.h + MARGIN * 2 }; })();

  let x, y;
  if (store.pos) { x = store.pos.x; y = store.pos.y; }
  else {
    const wa = screen.getPrimaryDisplay().workArea;
    x = wa.x + Math.round(wa.width * 0.72);
    y = wa.y + Math.round((wa.height - h) / 2);
  }
  // 上次关在屏幕外 / 换过显示器的情况，开机先拉回可视范围
  const c = clampToScreen(x, y, w, h);
  x = c.x; y = c.y;

  win = new BrowserWindow({
    x, y, width: w, height: h,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    roundedCorners: false,
    thickFrame: false,
    focusable: false,        // 点击不抢焦点（打字时临时打开）
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => { win = null; });

  // 开发用：GEAR_SHOT=<png路径> 启动后截图并退出
  if (process.env.GEAR_SHOT) {
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.GEAR_SHOT, img.toPNG());
      } catch (e) {}
      app.quit();
    }, 1500);
  }
}

function registerIpc() {
  ipcMain.handle('boot', () => ({
    store, margin: MARGIN, baseW: BASE_W, baseH: BASE_H,
    iconWin: ICON_WIN, levels: LEVELS, slotKeys: SLOT_KEYS,
    minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM
  }));

  ipcMain.on('state:save', (e, s) => { Object.assign(store, s); save(); });

  ipcMain.on('win:focusable', (e, v) => {
    if (!win) return;
    win.setFocusable(!!v);
    if (v) win.focus();
  });

  ipcMain.on('win:zoom', (e, z) => {
    z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(z) || 1));
    store.zoom = z;
    const { w, h } = panelSize();
    const b = win.getBounds();
    win.setBounds({ x: b.x, y: b.y, width: w + MARGIN * 2, height: h + MARGIN * 2 });
    save();
  });

  ipcMain.on('win:collapse', (e, v) => setCollapsed(!!v));

  // 图标拖动：主进程直接轮询光标位置让窗口跟着走（不依赖 mousemove，才跟得住）
  ipcMain.on('win:dragStart', (e, d) => {
    if (!win) return;
    const b = win.getBounds();
    // 用按下那一刻的鼠标屏幕坐标当锚点，避免 IPC 延迟带来的偏移
    const gx = (d && Number(d.x)) || 0;
    const gy = (d && Number(d.y)) || 0;
    dragOffset = { x: gx - b.x, y: gy - b.y };
    if (dragTimer) clearInterval(dragTimer);
    dragTimer = setInterval(() => {
      if (!win || !dragOffset) return;
      const p = screen.getCursorScreenPoint();
      win.setPosition(Math.round(p.x - dragOffset.x), Math.round(p.y - dragOffset.y));
    }, 16);
    // 防呆：万一没收到松手，6 秒后自己停
    setTimeout(() => {
      if (dragTimer) { clearInterval(dragTimer); dragTimer = null; dragOffset = null; rememberPos(); }
    }, 6000);
  });

  ipcMain.on('win:dragEnd', () => {
    if (dragTimer) { clearInterval(dragTimer); dragTimer = null; }
    dragOffset = null;
    if (win) {
      const b = win.getBounds();
      const d = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
      const wa = d.workArea;
      // 拖完至少留 80px 在屏幕里，别彻底拖丢
      const nx = Math.max(wa.x - b.width + 80, Math.min(b.x, wa.x + wa.width - 80));
      const ny = Math.max(wa.y, Math.min(b.y, wa.y + wa.height - 60));
      if (nx !== b.x || ny !== b.y) win.setPosition(Math.round(nx), Math.round(ny));
    }
    rememberPos();
  });

  ipcMain.on('app:quit', () => {
    rememberPos();
    try { fs.writeFileSync(dataFile(), JSON.stringify(store, null, 2)); } catch (e) {}
    app.quit();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.commandLine.appendSwitch('wm-window-animations-disabled');

  app.whenReady().then(() => {
    store = load();
    registerIpc();
    createWindow();

    globalShortcut.register('Control+Alt+G', () => {
      if (!win) return;
      setCollapsed(!store.collapsed);
      win.webContents.send('ui:collapsed', store.collapsed);
    });
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
