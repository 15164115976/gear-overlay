'use strict';

let S = null;      // 状态
let boot = null;   // 启动参数
let zoomDrag = null;

const $ = (id) => document.getElementById(id);
const elPanel = $('panel');
const elIcon = $('icon');
const elFold = $('fold');
const elTabs = $('tabs');
const elGrid = $('grid');
const elPop = $('lvlpop');
const elMenu = $('menu');
const elGrip = $('grip');
const elModal = $('modal');
const elCode = $('codeArea');
const elMsg = $('mmsg');
const elMTitle = $('mtitle');

// 只有这几件有大附魔
const BIG_SLOTS = ['帽子', '上衣', '腰带', '护腕', '鞋子', '武器'];

const page = () => S.pages[S.page] || S.pages[0];
const saveState = () => api.save({ pages: S.pages, page: S.page });

/* ---------------- 渲染 ---------------- */
function renderAll() {
  elPanel.style.zoom = S.zoom;
  elIcon.style.display = S.collapsed ? 'block' : 'none';
  elPanel.style.display = S.collapsed ? 'none' : 'flex';
  hidePop();
  renderTabs();
  renderGrid();
}

function renderTabs() {
  elTabs.innerHTML = '';
  S.pages.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'tab' + (i === S.page ? ' on' : '');
    d.textContent = p.name;
    d.title = '单击切换 · 双击改名 · 右键更多';
    d.onclick = () => { S.page = i; saveState(); renderAll(); };
    d.ondblclick = (e) => {
      e.stopPropagation();
      editText(d, p.name, (v) => { p.name = v; saveState(); renderAll(); });
    };
    d.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      S.page = i; renderAll();
      showMenu(e.clientX, e.clientY, [
        { t: '重命名角色', f: () => editText(elTabs.children[i], page().name, (v) => { page().name = v; saveState(); renderAll(); }) },
        { t: '删除此角色', f: () => { if (S.pages.length < 2) return; S.pages.splice(i, 1); S.page = Math.max(0, S.page - 1); saveState(); renderAll(); } },
        { sep: 1 },
        { t: '添加角色', f: addPage }
      ]);
    };
    elTabs.appendChild(d);
  });
  const add = document.createElement('div');
  add.className = 'tab add';
  add.textContent = '＋';
  add.title = '添加角色页';
  add.onclick = addPage;
  elTabs.appendChild(add);
}

function addPage() {
  S.pages.push(makePage('角色 ' + (S.pages.length + 1)));
  S.page = S.pages.length - 1;
  saveState(); renderAll();
}

function makePage(name) {
  const slots = {};
  boot.slotKeys.forEach((k) => {
    slots[k] = { lv: 740, s: { t: '小附魔', on: false }, b: { t: '大附魔', on: false } };
  });
  return { name, slots };
}

function newSlot() {
  return { lv: 740, s: { t: '小附魔', on: false }, b: { t: '大附魔', on: false } };
}

function renderGrid() {
  const p = page();
  elGrid.innerHTML = '';
  boot.slotKeys.forEach((k) => {
    const st = p.slots[k] || (p.slots[k] = newSlot());

    const d = document.createElement('div');
    d.className = 'slot';
    d.dataset.k = k;

    const r1 = document.createElement('div');
    r1.className = 'r1';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = k;
    const lv = document.createElement('span');
    lv.className = 'lv l' + st.lv;
    lv.textContent = st.lv;
    r1.append(nm, lv);

    const r2 = document.createElement('div');
    r2.className = 'r2';
    const es = document.createElement('span');
    es.className = 'en en-s' + (st.s.on ? ' on' : '');
    es.textContent = st.s.t || '小附魔';
    if (BIG_SLOTS.indexOf(k) >= 0) {
      const eb = document.createElement('span');
      eb.className = 'en en-b' + (st.b.on ? ' on' : '');
      eb.textContent = st.b.t || '大附魔';
      r2.append(es, eb);
      eb.onclick = (e) => { e.stopPropagation(); st.b.on = !st.b.on; saveState(); eb.classList.toggle('on', st.b.on); };
      eb.ondblclick = (e) => { e.stopPropagation(); editText(eb, st.b.t, (v) => { st.b.t = v; saveState(); renderGrid(); }); };
    } else {
      r2.append(es);
    }

    d.append(r1, r2);

    d.onclick = (e) => {
      if (e.target.closest('.en')) return;
      openPop(d, k);
    };

    es.onclick = (e) => { e.stopPropagation(); st.s.on = !st.s.on; saveState(); es.classList.toggle('on', st.s.on); };
    es.ondblclick = (e) => { e.stopPropagation(); editText(es, st.s.t, (v) => { st.s.t = v; saveState(); renderGrid(); }); };

    elGrid.appendChild(d);
  });
}

/* ---------------- 装等小浮层 ---------------- */
function openPop(slotEl, key) {
  if (elPop.style.display === 'grid' && elPop.dataset.k === key) { hidePop(); return; }
  const p = page();
  const cur = p.slots[key].lv;
  elPop.dataset.k = key;
  elPop.innerHTML = '';
  boot.levels.forEach((v) => {
    const d = document.createElement('div');
    d.className = 'pi' + (v === cur ? ' on' : '');
    d.textContent = v;
    d.onclick = (e) => {
      e.stopPropagation();
      p.slots[key].lv = v;
      saveState();
      hidePop();
      renderGrid();
    };
    elPop.appendChild(d);
  });
  elPop.style.display = 'grid';

  // 直接盖住被点的格子（坐标除以 zoom 换算成面板内部坐标）
  const z = S.zoom;
  const pr = elPanel.getBoundingClientRect();
  const sr = slotEl.getBoundingClientRect();
  elPop.style.left = ((sr.left - pr.left) / z) + 'px';
  elPop.style.top = ((sr.top - pr.top) / z) + 'px';
  elPop.style.width = (sr.width / z) + 'px';
  elPop.style.height = (sr.height / z) + 'px';
}

function hidePop() {
  elPop.style.display = 'none';
  elPop.dataset.k = '';
}

/* ---------------- 行内编辑 ---------------- */
function editText(host, value, done) {
  const inp = document.createElement('input');
  inp.value = value;
  host.textContent = '';
  host.appendChild(inp);
  api.setFocusable(true);
  setTimeout(() => { inp.focus(); inp.select(); }, 70);
  let finished = false;
  const commit = (ok) => {
    if (finished) return;
    finished = true;
    api.setFocusable(false);
    const v = inp.value.trim();
    if (ok && v) done(v); else renderAll();
  };
  inp.onblur = () => commit(true);
  inp.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    if (e.key === 'Escape') commit(false);
  };
}

/* ---------------- 右键菜单 ---------------- */
function showMenu(x, y, items) {
  elMenu.innerHTML = '';
  items.forEach((it) => {
    const d = document.createElement('div');
    if (it.sep) { d.className = 'sep'; elMenu.appendChild(d); return; }
    d.textContent = it.t;
    d.onclick = (e) => { e.stopPropagation(); hideMenu(); it.f(); };
    elMenu.appendChild(d);
  });
  elMenu.style.display = 'block';
  elMenu.style.left = x + 'px';
  elMenu.style.top = y + 'px';
  // 别被窗口边界裁掉（窗口就这么大）
  const r = elMenu.getBoundingClientRect();
  const maxX = window.innerWidth - r.width - 2;
  const maxY = window.innerHeight - r.height - 2;
  if (x > maxX) elMenu.style.left = Math.max(2, maxX) + 'px';
  if (y > maxY) elMenu.style.top = Math.max(2, maxY) + 'px';
}
function hideMenu() { elMenu.style.display = 'none'; }

/* ---------------- 功能码：导出 / 导入 ---------------- */
function b64e(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64d(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function exportCode() {
  const data = {
    v: 1,
    p: S.pages.map((p) => ({
      n: p.name,
      l: boot.slotKeys.map((k) => Math.max(0, boot.levels.indexOf(p.slots[k] ? p.slots[k].lv : 740))),
      s: boot.slotKeys.map((k) => [p.slots[k] ? p.slots[k].s.t : '', p.slots[k] && p.slots[k].s.on ? 1 : 0]),
      b: boot.slotKeys.map((k) => [p.slots[k] ? p.slots[k].b.t : '', p.slots[k] && p.slots[k].b.on ? 1 : 0])
    }))
  };
  return 'GX1' + b64e(JSON.stringify(data));
}

function importCode(raw) {
  const str = (raw || '').replace(/\s+/g, '');
  if (!str) throw new Error('功能码是空的');
  if (!/^GX1/.test(str)) throw new Error('不是本工具的功能码（应以 GX1 开头）');
  let data;
  try { data = JSON.parse(b64d(str.slice(3))); } catch (e) { throw new Error('功能码内容损坏，粘贴不完整？'); }
  if (!data || !Array.isArray(data.p) || !data.p.length) throw new Error('功能码里没有角色数据');

  S.pages = data.p.map((pg, i) => {
    const slots = {};
    boot.slotKeys.forEach((k, idx) => {
      const li = pg.l && Number(pg.l[idx]);
      const sm = (pg.s && pg.s[idx]) || [];
      const bg = (pg.b && pg.b[idx]) || [];
      slots[k] = {
        lv: boot.levels[li] || 740,
        s: { t: sm[0] || '小附魔', on: !!Number(sm[1]) },
        b: { t: bg[0] || '大附魔', on: !!Number(bg[1]) }
      };
    });
    return { name: pg.n || ('角色 ' + (i + 1)), slots };
  });
  S.page = 0;
  saveState();
  renderAll();
  return S.pages.length;
}

function openModal(mode) {
  api.setFocusable(true);
  elModal.classList.add('open');
  elMsg.className = 'mmsg';
  if (mode === 'export') {
    elMTitle.textContent = '功能码（发给别人 / 存起来）';
    elCode.value = exportCode();
    elMsg.textContent = '已全选，Ctrl+C 复制';
    setTimeout(() => { elCode.focus(); elCode.select(); }, 60);
  } else {
    elMTitle.textContent = '导入功能码';
    elCode.value = '';
    elMsg.textContent = '把功能码粘贴进来，再点「导入」';
    setTimeout(() => elCode.focus(), 60);
  }
}
function closeModal() {
  elModal.classList.remove('open');
  api.setFocusable(false);
}

$('mGen').onclick = () => {
  elCode.value = exportCode();
  elCode.focus(); elCode.select();
  try {
    navigator.clipboard.writeText(elCode.value).then(() => {
      elMsg.className = 'mmsg ok'; elMsg.textContent = '已生成并复制，粘到别处保存即可';
    }).catch(() => {
      elMsg.className = 'mmsg'; elMsg.textContent = '已生成，Ctrl+C 复制';
    });
  } catch (e) {
    elMsg.className = 'mmsg'; elMsg.textContent = '已生成，Ctrl+C 复制';
  }
};

$('mImport').onclick = () => {
  try {
    const n = importCode(elCode.value);
    elMsg.className = 'mmsg ok';
    elMsg.textContent = '导入成功：' + n + ' 个角色';
    setTimeout(closeModal, 700);
  } catch (e) {
    elMsg.className = 'mmsg err';
    elMsg.textContent = e.message || '导入失败';
  }
};

$('mClose').onclick = closeModal;

/* ---------------- 交互 ---------------- */
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.lvlpop')) hidePop();
  if (!e.target.closest('.menu')) hideMenu();
}, true);

// 任何元素都不许被浏览器拖出副本
document.addEventListener('dragstart', (e) => { e.preventDefault(); }, true);

/* 拖动窗口：面板/图标上任意位置按住都能拖，超过 3px 才算拖（不影响点击） */
let pdrag = null;
let suppressClick = false;

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('input, textarea, .modal, .grip')) return;
  const onIcon = !!e.target.closest('#icon');
  const onPanel = !!e.target.closest('#panel');
  if (!onIcon && !onPanel) return;
  pdrag = { sx: e.screenX, sy: e.screenY, active: false, icon: onIcon };
}, true);

window.addEventListener('mousemove', (e) => {
  if (pdrag && !pdrag.active) {
    if (Math.abs(e.screenX - pdrag.sx) + Math.abs(e.screenY - pdrag.sy) > 3) {
      pdrag.active = true;
      api.dragStart(pdrag.sx, pdrag.sy);
      if (pdrag.icon) elIcon.classList.add('moving');
      document.body.classList.add('dragging');
    }
  }
  if (zoomDrag) {
    const z = zoomDrag.z0 + (e.screenX - zoomDrag.sx) / boot.baseW;
    if (Date.now() - zoomDrag.last > 16) {
      zoomDrag.last = Date.now();
      applyZoom(z);
    }
  }
});

function endDrag() {
  if (pdrag) {
    if (pdrag.active) {
      api.dragEnd();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 180);
    } else if (pdrag.icon) {
      expand();
    }
  }
  elIcon.classList.remove('moving');
  document.body.classList.remove('dragging');
  pdrag = null;
  zoomDrag = null;
}

// 捕获阶段兜底：鼠标松开 / 失焦 / 指针取消 / 右键，都要结束拖动
window.addEventListener('mouseup', endDrag, true);
window.addEventListener('blur', endDrag);
document.addEventListener('pointercancel', endDrag, true);
document.addEventListener('contextmenu', endDrag, true);

// 拖完那一下不要把 click 也触发掉
document.addEventListener('click', (e) => {
  if (suppressClick) {
    e.stopPropagation();
    e.preventDefault();
    suppressClick = false;
  }
}, true);

/* 缩放手柄 */
if (elGrip) {
  elGrip.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    zoomDrag = { sx: e.screenX, z0: S.zoom, last: 0 };
  });
}

function applyZoom(z) {
  z = Math.max(boot.minZoom, Math.min(boot.maxZoom, z));
  S.zoom = Math.round(z * 100) / 100;
  elPanel.style.zoom = S.zoom;
  api.setZoom(S.zoom);
}

/* 滚轮缩放：鼠标停在面板上滚轮即可调大小 */
let wheelLast = 0;
elPanel.addEventListener('wheel', (e) => {
  if (e.target.closest('.modal')) return;      // 功能码框里滚轮是滚动文本
  e.preventDefault();
  const now = Date.now();
  if (now - wheelLast < 16) return;
  wheelLast = now;
  applyZoom(S.zoom - e.deltaY * 0.0012);
}, { passive: false });

/* ---------------- 收起 / 展开 ---------------- */
function collapse() {
  S.collapsed = true;
  saveState();
  api.collapse(true);
  renderAll();
}
function expand() {
  S.collapsed = false;
  saveState();
  api.collapse(false);
  renderAll();
}

elFold.addEventListener('click', (e) => { e.stopPropagation(); collapse(); });

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.tab, .menu, .lvlpop, .modal, input, textarea')) return;
  e.preventDefault();
  showMenu(e.clientX, e.clientY, [
    { t: '功能码…', f: () => openModal('export') },
    { sep: 1 },
    { t: '添加角色页', f: addPage },
    { t: '收起成小图标', f: collapse },
    { sep: 1 },
    { t: '退出', f: () => api.quit() }
  ]);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (elModal.classList.contains('open')) { closeModal(); return; }
    if (!e.target.closest('input, textarea')) collapse();
  }
});

/* ---------------- 启动 ---------------- */
api.boot().then((b) => {
  boot = b;
  S = b.store;
  renderAll();
  if (!S.collapsed) api.setZoom(S.zoom);
});

api.onCollapsed((v) => {
  S.collapsed = v;
  renderAll();
});
