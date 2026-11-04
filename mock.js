/* 浏览器里直接打开 index.html 时的演示桩（真正的悬浮窗由 main.js 提供 api） */
if (!window.api) {
  const keys = ['帽子', '护腕', '上衣', '下装', '腰带', '鞋子', '项链', '腰坠', '戒指', '戒子', '武器', '暗器'];
  const demoLv = [1110, 965, 1280, 965, 1110, 740, 1110, 965, 1280, 740, 1280, 965];
  const slots = {};
  keys.forEach((k, i) => {
    slots[k] = { lv: demoLv[i], s: { t: i % 2 ? '攻击' : '根骨', on: i % 3 === 0 }, b: { t: '大附魔', on: i === 2 } };
  });
  window.api = {
    boot: async () => ({
      store: { zoom: 1.2, collapsed: false, page: 0, pages: [{ name: '角色 1', slots: slots }] },
      margin: 18, baseW: 164, baseH: 366, iconWin: 78,
      levels: [740, 965, 1110, 1280], slotKeys: keys,
      minZoom: 0.9, maxZoom: 2.2
    }),
    save: () => {}, setFocusable: () => {}, setZoom: () => {}, collapse: () => {},
    dragStart: () => {}, dragEnd: () => {}, quit: () => {}, onCollapsed: () => {}
  };
}
