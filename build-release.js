/**
 * 打一个免安装（绿色）包：
 *   node build-release.js
 * 产物：
 *   dist-portable/装备速查/            可直接运行的目录
 *   release/装备速查-v<版本>-win64.zip  发给别人解压即用
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT = path.join(ROOT, 'dist-portable');
const APP = path.join(OUT, '装备速查');
const VER = require('./package.json').version;
const ZIP_DIR = path.join(ROOT, 'release');
const ZIP = path.join(ZIP_DIR, `装备速查-v${VER}-win64.zip`);

/* ---------- 1. 极简 asar 打包（零依赖，只打白名单里的文件） ---------- */
const APP_FILES = ['index.html', 'style.css', 'renderer.js', 'main.js', 'preload.js', 'mock.js', 'package.json', 'assets'];

function packAsar(srcDir, outFile) {
  const files = [];
  (function walk(dir, base) {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, base);
      else files.push({ rel: path.relative(base, full).split(path.sep).join('/'), full, size: st.size });
    }
  })(srcDir, srcDir);
  // 只保留白名单
  const allowed = (rel) => APP_FILES.some((f) => rel === f || rel.startsWith(f + '/'));
  for (let i = files.length - 1; i >= 0; i--) if (!allowed(files[i].rel)) files.splice(i, 1);
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  let offset = 0;
  const flat = {};
  for (const f of files) {
    flat[f.rel] = { offset: String(offset), size: f.size };
    offset += f.size;
  }
  const root = { files: {} };
  for (const rel of Object.keys(flat).sort()) {
    const parts = rel.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node.files[parts[i]] = node.files[parts[i]] || { files: {} };
      node = node.files[parts[i]];
    }
    node.files[parts[parts.length - 1]] = flat[rel];
  }
  // 头格式（对齐官方 asar）：
  //   [4][headerSize = 8 + paddedLen][payloadSize = 4 + paddedLen][原始JSON长度][JSON][0 填充]
  const json = Buffer.from(JSON.stringify(root), 'utf8');
  const raw = json.length;
  const padded = Math.ceil(raw / 4) * 4;
  const head = Buffer.alloc(16);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(8 + padded, 4);
  head.writeUInt32LE(4 + padded, 8);
  head.writeUInt32LE(raw, 12);
  const chunks = [head, json, Buffer.alloc(padded - raw)];
  for (const f of files) chunks.push(fs.readFileSync(f.full));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat(chunks));
  return files.length;
}

/* ---------- 2. 拷贝运行时 ---------- */
function copyRuntime() {
  // 不删旧目录：fs 的删除被安全钩子拦，直接覆盖写即可
  fs.mkdirSync(path.join(APP, 'resources', 'locales'), { recursive: true });

  const KEEP_LOCALES = new Set(['zh-CN.pak', 'en-US.pak']);

  for (const name of fs.readdirSync(DIST)) {
    const from = path.join(DIST, name);
    const st = fs.statSync(from);

    if (name === 'locales') {
      for (const loc of fs.readdirSync(from)) {
        if (KEEP_LOCALES.has(loc)) fs.copyFileSync(path.join(from, loc), path.join(APP, 'resources', 'locales', loc));
      }
      continue;
    }
    if (name === 'resources') {
      // 只保留 default_app.asar（app.asar 稍后写入）
      for (const r of fs.readdirSync(from)) {
        if (r === 'default_app.asar') fs.copyFileSync(path.join(from, r), path.join(APP, 'resources', r));
      }
      continue;
    }
    if (name === 'electron.exe') {
      fs.copyFileSync(from, path.join(APP, '装备速查.exe'));
      continue;
    }
    if (st.isDirectory()) continue;   // 其它目录不收
    fs.copyFileSync(from, path.join(APP, name));
  }

  // 便携标记：配置写在 exe 旁边的 data 目录
  fs.writeFileSync(path.join(APP, 'portable.marker'), '');
  fs.mkdirSync(path.join(APP, 'data'), { recursive: true });
}

/* ---------- 3. 说明文件 ---------- */
function writeReadme() {
  const txt = [
    '装备速查 v' + VER,
    '',
    '【用法】',
    '双击 装备速查.exe 就能用，不用安装。',
    '',
    '- 按住小图标拖动放位置，单击小图标展开',
    '- 面板上任意位置按住都能拖动整块',
    '- 鼠标停在面板上滚滚轮 = 缩放',
    '- 点方块选装等 740/965/1110/1280',
    '- 点小附魔/大附魔文字：灰=没买，绿=买了；双击可以改字',
    '- 面板空白处右键：功能码（导出/导入配置）、加角色、收起、退出',
    '- Ctrl+Alt+G 收起/展开，Esc 收起',
    '',
    '【配置存哪】',
    '就在本文件夹的 data 目录里，整个文件夹拷走配置也跟着走。',
    '',
    '【注意】',
    '游戏如果是独占全屏，任何窗口都盖不上去，请改成“窗口化全屏/无边框”。',
    ''
  ].join('\r\n');
  fs.writeFileSync(path.join(APP, '使用说明.txt'), txt);
}

/* ---------- 4. 压缩 ---------- */
function zipIt() {
  fs.mkdirSync(ZIP_DIR, { recursive: true });
  // 用 Windows 自带的 bsdtar（Git Bash 里的 GNU tar 不认 -a）
  const sysTar = path.join(process.env.SystemRoot || 'C:////Windows', 'System32', 'tar.exe');
  const tarBin = fs.existsSync(sysTar) ? sysTar : 'tar';
  execFileSync(tarBin, ['-a', '-c', '-f', ZIP, '-C', OUT, '装备速查'], { stdio: 'inherit' });
}

/* ---------- run ---------- */
copyRuntime();
const n = packAsar(ROOT, path.join(APP, 'resources', 'app.asar'));
writeReadme();
zipIt();

const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1) + ' MB';
console.log('app.asar 打包文件数:', n);
console.log('目录:', APP);
console.log('压缩包:', ZIP, mb(ZIP));
