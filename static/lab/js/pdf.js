import { zipSync } from '/static/lab/vendor/pdf/fflate.esm.js';

const $ = id => document.getElementById(id);
const L = window.L || (z => z);
const fmtSize = window.LabFmt && window.LabFmt.size ? window.LabFmt.size : (b => b + ' B');

const PDFJS = window.pdfjsLib;
const PLIB = window.PDFLib;
PDFJS.GlobalWorkerOptions.workerSrc = '/static/lab/vendor/pdf/pdf.worker.min.js?v=2026111401';
PDFJS.GlobalWorkerOptions.standardFontDataUrl = '/static/lab/vendor/pdf/standard_fonts/';

const VENDOR = '/static/lab/vendor/pdf/';
const MAX_SIZE = 200 * 1024 * 1024;
const FONT_KEY = 'fonts|pdf-studio-noto-gb1';
const FONT_URL = VENDOR + 'NotoSansSC-GB1.ttf';
const HAS_IDB = typeof indexedDB !== 'undefined';

const state = {
    files: [],
    mode: 'merge',
    nextId: 1,
    org: null,
    orgHist: [],
    orgFut: [],
    orgSel: new Set(),
    orgAnchor: null,
    history: [],
    busy: false,
    results: null,
    fontCache: null
};

function saveBlob(data, name, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
}

function idbOpen() {
    return new Promise((res, rej) => {
        const rq = indexedDB.open('sts-lab-assets', 1);
        rq.onupgradeneeded = () => { rq.result.createObjectStore('files'); };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
    });
}
async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
        const t = db.transaction('files', 'readonly').objectStore('files').get(key);
        t.onsuccess = () => res(t.result || null);
        t.onerror = () => rej(t.error);
    });
}
async function idbPut(key, blob) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
        const t = db.transaction('files', 'readwrite').objectStore('files').put(blob, key);
        t.onsuccess = () => res();
        t.onerror = () => rej(t.error);
    });
}
async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
        const t = db.transaction('files', 'readwrite').objectStore('files').delete(key);
        t.onsuccess = () => res();
        t.onerror = () => rej(t.error);
    });
}

async function getEmbedFont() {
    if (state.fontCache) return state.fontCache;
    let buf = null;
    if (HAS_IDB) {
        try {
            const blob = await idbGet(FONT_KEY);
            if (blob) buf = new Uint8Array(await blob.arrayBuffer());
        } catch (e) {}
    }
    if (!buf) {
        setStatus(L('正在加载中文字库（约 1.8MB，仅首次）', 'Loading CJK font (~1.8MB, first time only)'));
        const resp = await fetch(FONT_URL);
        if (!resp.ok) throw new Error(L('中文字库加载失败', 'Failed to load CJK font'));
        buf = new Uint8Array(await resp.arrayBuffer());
        if (HAS_IDB) {
            try { await idbPut(FONT_KEY, new Blob([buf], { type: 'font/ttf' })); } catch (e) {}
            try { await idbDel('fonts|pdf-studio-noto-sc'); } catch (e) {}
        }
    }
    const doc = await PLIB.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const font = await doc.embedFont(buf);
    state.fontCache = { buf, font };
    return state.fontCache;
}

function hasCJK(str) {
    return /[^\x00-\xFF]/.test(str);
}

function setStatus(text, cls, pct) {
    const line = $('statusLine');
    line.style.display = 'block';
    line.className = 'status-line' + (cls ? ' ' + cls : '');
    $('statusText').textContent = text;
    $('statusBar').style.display = pct != null ? 'block' : 'none';
    if (pct != null) $('barFill').style.width = Math.round(pct * 100) + '%';
}
function clearStatus() {
    $('statusLine').style.display = 'none';
    $('barFill').style.width = '0';
}

const isImgFile = f => f.kind === 'img';
const pdfFiles = () => state.files.filter(f => f.kind === 'pdf');

function baseName(n) {
    return n.replace(/\.(pdf|png|jpe?g|webp|bmp|gif)$/i, '');
}

async function loadFileObjects(list) {
    if (state.busy) return;
    const added = [];
    for (const file of list) {
        if (file.size > MAX_SIZE) {
            setStatus(L('文件过大：' + file.name + '（上限 200MB）', 'Too large: ' + file.name + ' (200MB max)'), 'err');
            continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        try {
            if (isPdf) {
                await PLIB.PDFDocument.load(bytes.slice(0), { ignoreEncryption: false, updateMetadata: false });
                const jsDoc = await PDFJS.getDocument({ data: bytes.slice(0) }).promise;
                added.push({
                    id: state.nextId++, name: file.name, size: file.size,
                    kind: 'pdf', bytes, pageCount: jsDoc.numPages, jsDoc
                });
            } else if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)) {
                const blob = new Blob([bytes]);
                const bmp = await createImageBitmap(blob);
                added.push({
                    id: state.nextId++, name: file.name, size: file.size,
                    kind: 'img', bytes, w: bmp.width, h: bmp.height, bmp,
                    objUrl: URL.createObjectURL(blob)
                });
            } else {
                setStatus(L('不支持的文件类型：' + file.name, 'Unsupported type: ' + file.name), 'err');
            }
        } catch (e) {
            const msg = String(e && e.message || e);
            if (/encrypt/i.test(msg)) {
                setStatus(L('文件已加密，暂不支持：' + file.name, 'Encrypted file not supported: ' + file.name), 'err');
            } else {
                setStatus(L('文件无法读取：' + file.name, 'Cannot read file: ' + file.name), 'err');
            }
        }
    }
    if (added.length) {
        state.files = state.files.concat(added);
        setStatus(L('已载入 ' + added.length + ' 个文件', added.length + ' file(s) loaded'), 'ok');
        setTimeout(() => { if (!$('statusLine').classList.contains('err')) clearStatus(); }, 2500);
    }
    refreshUI(true);
}

function renderFiles() {
    const box = $('fileList');
    if (!state.files.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'flex';
    box.innerHTML = '';
    state.files.forEach((f, i) => {
        const chip = document.createElement('div');
        chip.className = 'file-chip';
        chip.draggable = true;
        chip.dataset.idx = i;
        chip.innerHTML =
            '<span class="drag-handle" title="' + L('拖动排序', 'Drag to reorder') + '"><svg aria-hidden="true" class="ic" style="width:13px;height:13px"><use href="#i-grid"/></svg></span>' +
            '<svg aria-hidden="true" class="ic" style="width:14px;height:14px"><use href="#' + (f.kind === 'pdf' ? 'i-file' : 'i-image') + '"/></svg>' +
            '<span class="fname">' + f.name.replace(/</g, '&lt;') + '</span>' +
            '<span class="fsize">' + (f.kind === 'pdf' ? f.pageCount + L('页', 'p') + ' - ' : '') + fmtSize(f.size) + '</span>' +
            '<button data-act="up" aria-label="' + L('上移', 'Move up') + '"><svg aria-hidden="true" class="ic" style="width:12px;height:12px"><use href="#i-up"/></svg></button>' +
            '<button data-act="down" aria-label="' + L('下移', 'Move down') + '"><svg aria-hidden="true" class="ic" style="width:12px;height:12px"><use href="#i-down"/></svg></button>' +
            '<button data-act="del" aria-label="' + L('移除', 'Remove') + '"><svg aria-hidden="true" class="ic" style="width:13px;height:13px"><use href="#i-close"/></svg></button>';
        box.appendChild(chip);
    });
}

function chipEvents() {
    const box = $('fileList');
    box.onclick = e => {
        const btn = e.target.closest('button');
        const chip = e.target.closest('.file-chip');
        if (!btn || !chip) return;
        const i = Number(chip.dataset.idx);
        const act = btn.dataset.act;
        if (act === 'del') {
            const f = state.files[i];
            if (f.jsDoc) f.jsDoc.destroy();
            if (f.objUrl) URL.revokeObjectURL(f.objUrl);
            state.files.splice(i, 1);
        } else if (act === 'up' && i > 0) {
            [state.files[i - 1], state.files[i]] = [state.files[i], state.files[i - 1]];
        } else if (act === 'down' && i < state.files.length - 1) {
            [state.files[i], state.files[i + 1]] = [state.files[i + 1], state.files[i]];
        }
        refreshUI(true);
    };
    let dragIdx = -1;
    box.addEventListener('dragstart', e => {
        const chip = e.target.closest('.file-chip');
        if (!chip) return;
        dragIdx = Number(chip.dataset.idx);
        chip.classList.add('drag-src');
        e.dataTransfer.effectAllowed = 'move';
    });
    box.addEventListener('dragover', e => {
        e.preventDefault();
        const chip = e.target.closest('.file-chip');
        box.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
        if (chip && dragIdx >= 0) chip.classList.add('drag-over');
    });
    box.addEventListener('drop', e => {
        e.preventDefault();
        const chip = e.target.closest('.file-chip');
        if (chip && dragIdx >= 0) {
            const to = Number(chip.dataset.idx);
            const [moved] = state.files.splice(dragIdx, 1);
            state.files.splice(to, 0, moved);
        }
        dragIdx = -1;
        refreshUI(true);
    });
    box.addEventListener('dragend', () => {
        dragIdx = -1;
        box.querySelectorAll('.drag-src').forEach(c => c.classList.remove('drag-src'));
        box.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
    });
}

function modeAvail() {
    const pdfs = pdfFiles();
    const imgs = state.files.filter(isImgFile);
    return {
        merge: pdfs.length >= 2,
        organize: pdfs.length === 1,
        split: pdfs.length >= 1,
        compress: pdfs.length >= 1,
        convert: (pdfs.length > 0 && imgs.length === 0) || (imgs.length > 0 && pdfs.length === 0),
        watermark: pdfs.length >= 1,
        pagenum: pdfs.length >= 1
    };
}

const MODE_LABEL = {
    merge: () => L('合并 PDF', 'Merge PDFs'),
    organize: () => L('导出整理结果', 'Export organized PDF'),
    split: () => L('开始拆分', 'Split'),
    compress: () => L('开始压缩', 'Compress'),
    convert: () => pdfFiles().length ? L('导出图片', 'Export images') : L('合成 PDF', 'Build PDF'),
    watermark: () => L('添加水印', 'Add watermark'),
    pagenum: () => L('添加页码', 'Add page numbers')
};

function refreshUI(rebuildThumbs) {
    renderFiles();
    const avail = modeAvail();
    document.querySelectorAll('#modeTabs button').forEach(b => {
        b.disabled = !avail[b.dataset.mode];
        b.classList.toggle('active', b.dataset.mode === state.mode);
    });
    if (!avail[state.mode]) {
        const first = Object.keys(avail).find(k => avail[k]);
        if (first) state.mode = first;
        else {
            document.querySelectorAll('#modeTabs button').forEach(b => b.classList.remove('active'));
        }
    }
    document.querySelectorAll('.opt-block').forEach(b => {
        b.classList.toggle('show', b.dataset.opt === state.mode && state.files.length > 0);
    });
    if (state.mode === 'convert') updateConvertUI();
    if (state.mode === 'compress') scheduleEstimate();
    updateOrgBtns();
    updateSelBar();
    $('runBtn').disabled = !avail[state.mode] || state.busy;
    $('runLabel').textContent = avail[state.mode] ? MODE_LABEL[state.mode]() : L('先载入文件', 'Load a file first');
    if (rebuildThumbs) renderThumbs();
}

function updateConvertUI() {
    const isImgs = pdfFiles().length === 0 && state.files.length > 0;
    $('convP2I').style.display = isImgs ? 'none' : 'block';
    $('convI2P').style.display = isImgs ? 'block' : 'none';
}

let thumbObserver = null;
let renderQueue = Promise.resolve();

function clearThumbs() {
    if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }
    $('thumbGrid').innerHTML = '';
}

function makeThumbShell(pageIndex, fileId, fname, isImg, objUrl) {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-wrap';
    const th = document.createElement('div');
    th.className = 'thumb';
    th.dataset.page = pageIndex;
    th.dataset.file = fileId;
    if (isImg) {
        const img = document.createElement('img');
        img.src = objUrl;
        img.alt = '';
        img.loading = 'lazy';
        th.appendChild(img);
        const fx = document.createElement('canvas');
        fx.className = 'fx';
        th.appendChild(fx);
    } else {
        const sk = document.createElement('div');
        sk.className = 'thumb-skeleton';
        th.appendChild(sk);
        const fx = document.createElement('canvas');
        fx.className = 'fx';
        th.appendChild(fx);
    }
    if (fname && state.files.length > 1) {
        const tag = document.createElement('div');
        tag.className = 'f-tag';
        tag.textContent = fname;
        tag.title = fname;
        wrap.appendChild(th);
        wrap.appendChild(tag);
        return wrap;
    }
    return th;
}

function renderThumbs() {
    clearThumbs();
    const grid = $('thumbGrid');
    const empty = $('empty');
    if (!state.files.length) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        $('outInfo').style.display = 'none';
        $('resTitle').textContent = L('页面预览', 'Page preview');
        return;
    }
    grid.style.display = 'grid';
    empty.style.display = 'none';
    const pdfs = pdfFiles();
    const imgs = state.files.filter(isImgFile);
    if (state.mode === 'organize') {
        $('resTitle').textContent = L('页面编辑', 'Organize pages');
        buildOrgThumbs();
        return;
    }
    $('resTitle').textContent = L('页面预览', 'Page preview');
    const fxMode = state.mode === 'watermark' || state.mode === 'pagenum';
    if (fxMode && pdfs.length) {
        $('resTitle').textContent = state.mode === 'watermark' ? L('水印预览 - 实时效果', 'Watermark preview - live') : L('页码预览 - 实时效果', 'Page numbers preview - live');
        const f = pdfs[0];
        const large = document.createElement('div');
        large.className = 'fx-large';
        large.innerHTML = '<div class="fx-large-stage"><div class="thumb-skeleton"></div><canvas class="fx"></canvas></div>';
        grid.appendChild(large);
        buildFxLarge(f);
    }
    thumbObserver = new IntersectionObserver(entries => {
        for (const en of entries) {
            if (!en.isIntersecting) continue;
            const th = en.target;
            thumbObserver.unobserve(th);
            queueThumbRender(th);
        }
    }, { root: grid, rootMargin: '260px' });
    let hasPreview = false;
    for (const f of pdfs) {
        hasPreview = true;
        for (let i = 0; i < f.pageCount; i++) {
            const shell = makeThumbShell(i, f.id, i === 0 ? f.name : null, false, null);
            grid.appendChild(shell);
            const th = shell.classList && shell.classList.contains('thumb') ? shell : shell.querySelector('.thumb');
            if (fxMode) th.classList.add('fx-on');
            thumbObserver.observe(th);
        }
    }
    for (const f of imgs) {
        hasPreview = true;
        const shell = makeThumbShell(0, f.id, f.name, true, f.objUrl);
        grid.appendChild(shell);
        const th = shell.classList && shell.classList.contains('thumb') ? shell : shell.querySelector('.thumb');
        if (fxMode) th.classList.add('fx-on');
        drawFx(th, f);
    }
    if (!hasPreview) {
        empty.style.display = 'block';
        grid.style.display = 'none';
    }
    if (fxMode) scheduleFx(0);
}

async function buildFxLarge(f) {
    const stage = document.querySelector('.fx-large-stage');
    if (!stage) return;
    try {
        const page = await f.jsDoc.getPage(1);
        const vp = page.getViewport({ scale: Math.min(1.4, 560 / page.getViewport({ scale: 1 }).width) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        if (!document.body.contains(stage)) return;
        const sk = stage.querySelector('.thumb-skeleton');
        if (sk) sk.remove();
        stage.insertBefore(canvas, stage.firstChild);
        drawFxOn(stage.querySelector('.fx'), 0, f.pageCount);
    } catch (e) {}
}

function queueThumbRender(th) {
    const fileId = Number(th.dataset.file);
    const pageIndex = Number(th.dataset.page);
    const rot = Number(th.dataset.rot || 0);
    renderQueue = renderQueue.then(async () => {
        if (!document.body.contains(th)) return;
        const f = state.files.find(x => x.id === fileId);
        if (!f || f.kind !== 'pdf') return;
        try {
            const page = await f.jsDoc.getPage(pageIndex + 1);
            const vp = page.getViewport({ scale: 0.35, rotation: ((page.rotate || 0) + rot) % 360 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(vp.width));
            canvas.height = Math.max(1, Math.floor(vp.height));
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            const sk = th.querySelector('.thumb-skeleton');
            if (sk) sk.remove();
            th.insertBefore(canvas, th.firstChild);
            if (th.classList.contains('fx-on')) drawFx(th, f, pageIndex);
        } catch (e) {}
    });
}

let fxTimer = null;
function scheduleFx(delay) {
    clearTimeout(fxTimer);
    fxTimer = setTimeout(renderFxAll, delay == null ? 300 : delay);
}

function fxParams() {
    if (state.mode === 'watermark') {
        return {
            kind: 'watermark',
            text: $('wmText').value.trim() || L('水印文字', 'Watermark'),
            layout: segVal('wmLayoutSeg'),
            size: Math.max(6, Number($('wmSize').value) || 42),
            color: $('wmColor').value === 'black' ? '20,20,20' : $('wmColor').value === 'white' ? '235,235,235' : '85,85,85',
            opacity: Number($('wmOpa').value) / 100,
            angle: Number($('wmAng').value)
        };
    }
    return {
        kind: 'pagenum',
        start: Math.max(0, Number($('pnStart').value) || 1),
        size: Math.max(6, Number($('pnSize').value) || 11),
        fmt: segVal('pnFmtSeg'),
        pos: Number(document.querySelector('#posGrid button.active').dataset.pos)
    };
}

let estTimer = null;
const yieldFrame = () => new Promise(r => setTimeout(r, 0));

const LS_KEY = 'pdf-studio-opts';
let lsTimer = null;
function scheduleSaveOpts() {
    clearTimeout(lsTimer);
    lsTimer = setTimeout(saveOpts, 500);
}
function saveOpts() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            wmText: $('wmText').value, wmLayout: segVal('wmLayoutSeg'), wmSize: $('wmSize').value,
            wmColor: $('wmColor').value, wmOpa: $('wmOpa').value, wmAng: $('wmAng').value,
            pnPos: document.querySelector('#posGrid button.active').dataset.pos,
            pnStart: $('pnStart').value, pnSize: $('pnSize').value, pnFmt: segVal('pnFmtSeg'),
            q: $('qSlider').value, dpi: $('dpiSel').value, fmt: segVal('convFmtSeg')
        }));
    } catch (e) {}
}
function loadOpts() {
    let o;
    try { o = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
    if (!o) return;
    const setV = (id, v) => { const el = $(id); if (el && v != null && v !== '') el.value = v; };
    setV('wmText', o.wmText); setV('wmSize', o.wmSize); setV('wmOpa', o.wmOpa); setV('wmAng', o.wmAng);
    setV('pnStart', o.pnStart); setV('pnSize', o.pnSize); setV('qSlider', o.q); setV('dpiSel', o.dpi);
    if (o.wmColor) $('wmColor').value = o.wmColor;
    const segSet = (segId, v) => {
        if (!v) return;
        const b = document.querySelector('#' + segId + ' button[data-v="' + v + '"]');
        if (b) { b.parentElement.querySelectorAll('button').forEach(x => x.classList.remove('active')); b.classList.add('active'); }
    };
    segSet('wmLayoutSeg', o.wmLayout); segSet('pnFmtSeg', o.pnFmt); segSet('convFmtSeg', o.fmt);
    if (o.pnPos != null) {
        const b = document.querySelector('#posGrid button[data-pos="' + o.pnPos + '"]');
        if (b) { document.querySelectorAll('#posGrid button').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); }); b.classList.add('active'); b.setAttribute('aria-pressed', 'true'); }
    }
    $('qVal').textContent = $('qSlider').value + '%';
    $('qVal2').textContent = $('qSlider').value + '%';
    $('wmOpaVal').textContent = $('wmOpa').value + '%';
    $('wmOpaVal2').textContent = $('wmOpa').value + '%';
    $('wmAngVal').textContent = $('wmAng').value + '°';
    $('wmAngVal2').textContent = $('wmAng').value + '°';
}

function pushHistory(label, results) {
    state.history = state.history || [];
    state.history.unshift({ t: new Date(), label, items: results.map(r => ({ name: r.name, size: r.bytes.length, bytes: r.bytes })) });
    if (state.history.length > 5) state.history.length = 5;
    let total = 0;
    for (const h of state.history) {
        for (const it of h.items) total += it.size;
        if (total > 150 * 1024 * 1024) { h.items = h.items.map(it => ({ name: it.name, size: it.size, bytes: null })); }
    }
    renderHistory();
}

function renderHistory() {
    const old = document.querySelectorAll('.hist-title, .hist-list');
    old.forEach(el => el.remove());
    if (!state.history || !state.history.length) return;
    const info = $('outInfo');
    const title = document.createElement('p');
    title.className = 'hist-title';
    title.textContent = L('本会话导出记录', 'Session exports');
    info.appendChild(title);
    const list = document.createElement('div');
    list.className = 'hist-list';
    state.history.forEach((h, i) => {
        const row = document.createElement('div');
        row.className = 'hist-row';
        const t = document.createElement('span');
        t.className = 'h-time';
        t.textContent = String(h.t.getHours()).padStart(2, '0') + ':' + String(h.t.getMinutes()).padStart(2, '0');
        const lb = document.createElement('span');
        lb.className = 'h-label';
        const total = h.items.reduce((s, it) => s + it.size, 0);
        lb.textContent = h.label + ' - ' + h.items.length + L(' 份 - ', ' file(s) - ') + fmtSize(total);
        const btn = document.createElement('button');
        const hasBytes = h.items.every(it => it.bytes);
        btn.textContent = hasBytes ? L('重下载', 'Save again') : L('已释放', 'Freed');
        btn.disabled = !hasBytes;
        btn.onclick = () => downloadItems(h.items);
        row.append(t, lb, btn);
        list.appendChild(row);
    });
    info.appendChild(list);
}

async function downloadItems(items) {
    if (items.length === 1) {
        const r = items[0];
        saveBlob(r.bytes, r.name, /\.zip$/i.test(r.name) ? 'application/zip' : /\.png$/i.test(r.name) ? 'image/png' : /\.jpe?g$/i.test(r.name) ? 'image/jpeg' : 'application/pdf');
        return;
    }
    const z = zipSync(Object.fromEntries(items.map(it => [it.name, it.bytes])), { level: 4 });
    saveBlob(z, 'pdf-studio-' + new Date().toISOString().slice(0, 10) + '.zip', 'application/zip');
}

function scheduleEstimate() {
    clearTimeout(estTimer);
    estTimer = setTimeout(runEstimate, 450);
}

async function runEstimate() {
    const line = $('estLine');
    if (state.mode !== 'compress' || !pdfFiles().length) { line.style.display = 'none'; return; }
    const f = pdfFiles()[0];
    const q = Number($('qSlider').value) / 100;
    const dpi = Number($('dpiSel').value);
    line.style.display = 'block';
    $('estText').textContent = L('估算中…', 'Estimating…');
    try {
        const page = await f.jsDoc.getPage(1);
        const vp = page.getViewport({ scale: dpi / 72 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
        const est = blob.size * f.pageCount;
        $('estText').textContent = L('按首页估算全部约 ' + fmtSize(est) + '（原 ' + fmtSize(f.size) + '）', 'Estimated ~' + fmtSize(est) + ' total, from page 1 (was ' + fmtSize(f.size) + ')');
    } catch (e) {
        line.style.display = 'none';
    }
}

function drawFxOn(cv, pageIndex, totalPages) {
    const p = fxParams();
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.scale(dpr, dpr);
    const scale = W / 595.28;
    if (p.kind === 'watermark') {
        const fs = Math.max(9, p.size * scale);
        ctx.save();
        ctx.font = '300 ' + fs + 'px Poppins, "PingFang SC", sans-serif';
        ctx.fillStyle = 'rgba(' + p.color + ',' + p.opacity + ')';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const rad = (p.angle * Math.PI) / 180;
        if (p.layout === 'center') {
            ctx.translate(W / 2, H / 2);
            ctx.rotate(rad);
            ctx.fillText(p.text, 0, 0);
        } else {
            const tw = ctx.measureText(p.text).width;
            const dx = Math.max(80, tw + 140 * scale);
            const dy = Math.max(70, fs * 1.4 + 160 * scale);
            for (let cx = -dx / 2; cx < W + dx; cx += dx) {
                for (let cy = -dy / 2; cy < H + dy; cy += dy) {
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(rad);
                    ctx.fillText(p.text, 0, 0);
                    ctx.restore();
                }
            }
        }
        ctx.restore();
    } else {
        const fs = Math.max(9, p.size * scale);
        const num = p.start + (pageIndex || 0);
        const text = p.fmt === 'plain' ? String(num)
            : p.fmt === 'pageX' ? L('第 ' + num + ' 页', 'Page ' + num)
            : L('第 ' + num + ' 页 共 ' + totalPages + ' 页', 'Page ' + num + ' of ' + totalPages);
        ctx.save();
        ctx.font = '300 ' + fs + 'px Poppins, "PingFang SC", sans-serif';
        ctx.fillStyle = 'rgba(89,89,89,0.9)';
        ctx.textBaseline = 'alphabetic';
        const margin = 20 * scale;
        const tw = ctx.measureText(text).width;
        const thh = fs;
        const pos = PN_POS[p.pos];
        let x = pos.x * W, y = pos.y * H;
        if (pos.ax === 'center') x = (W - tw) / 2;
        if (pos.ax === 'right') x = W - tw - margin;
        if (pos.ay === 'top') y = margin + thh;
        if (pos.ay === 'middle') y = (H + thh) / 2;
        if (pos.ay === 'bottom') y = H - margin;
        ctx.fillText(text, x, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x - 5, y - thh - 3, tw + 10, thh + 8);
        ctx.restore();
    }
}

function drawFx(th, file, pageIndex) {
    const fx = th.querySelector('.fx');
    if (!fx || !th.clientWidth) return;
    drawFxOn(fx, pageIndex, file && file.kind === 'pdf' ? file.pageCount : 1);
}

function renderFxAll() {
    if (state.mode !== 'watermark' && state.mode !== 'pagenum') return;
    const stage = document.querySelector('.fx-large-stage');
    if (stage && !stage.querySelector('.thumb-skeleton')) drawFxOn(stage.querySelector('.fx'), 0, pdfFiles()[0] ? pdfFiles()[0].pageCount : 1);
    document.querySelectorAll('#thumbGrid .thumb.fx-on').forEach(th => {
        const fileId = Number(th.dataset.file);
        const f = state.files.find(x => x.id === fileId);
        if (f) drawFx(th, f, Number(th.dataset.page));
    });
}

let splitTimer = null;
function scheduleSplitHighlight() {
    clearTimeout(splitTimer);
    splitTimer = setTimeout(highlightSplitPages, 220);
}

function highlightSplitPages() {
    if (state.mode !== 'split' || pdfFiles().length !== 1) return;
    const f = pdfFiles()[0];
    const seg = segVal('splitSeg');
    let pages = null;
    if (seg === 'range') {
        pages = parseRange($('splitRange').value, f.pageCount);
    } else if (seg === 'every') {
        const n = Math.max(1, Number($('splitEvery').value) || 2);
        pages = [];
        for (let i = 1; i <= Math.min(n, f.pageCount); i++) pages.push(i);
    } else {
        pages = Array.from({ length: f.pageCount }, (_, i) => i + 1);
    }
    const set = new Set(pages || []);
    document.querySelectorAll('#thumbGrid .thumb').forEach(th => {
        th.classList.toggle('in-range', set.has(Number(th.dataset.page) + 1));
    });
}

async function renderResultPreview(results) {
    const picks = results.filter(r => /\.pdf$/i.test(r.name)).slice(0, 4);
    if (!picks.length) return;
    const info = $('outInfo');
    const row = document.createElement('div');
    row.className = 'res-thumb-row';
    if (state.mode === 'compress' && pdfFiles().length) {
        try {
            const src = pdfFiles()[0];
            const page = await src.jsDoc.getPage(1);
            const vp = page.getViewport({ scale: 0.22 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(vp.width));
            canvas.height = Math.max(1, Math.floor(vp.height));
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            const cell = document.createElement('div');
            cell.className = 'res-thumb-cell';
            cell.appendChild(canvas);
            const cap = document.createElement('span');
            cap.textContent = L('压缩前 - ' + fmtSize(src.size), 'Before - ' + fmtSize(src.size));
            cell.appendChild(cap);
            row.appendChild(cell);
        } catch (e) {}
    }
    for (const pick of picks) {
        try {
            const jsDoc = await PDFJS.getDocument({ data: pick.bytes.slice(0) }).promise;
            const page = await jsDoc.getPage(1);
            const vp = page.getViewport({ scale: 0.22 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(vp.width));
            canvas.height = Math.max(1, Math.floor(vp.height));
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            jsDoc.destroy();
            const cell = document.createElement('div');
            cell.className = 'res-thumb-cell';
            cell.appendChild(canvas);
            const cap = document.createElement('span');
            cap.textContent = (state.mode === 'compress' ? L('压缩后 - ', 'After - ') : '') + pick.name + ' - ' + fmtSize(pick.bytes.length);
            cap.title = pick.name;
            cell.appendChild(cap);
            row.appendChild(cell);
        } catch (e) {}
    }
    if (row.children.length) info.insertBefore(row, info.firstChild);
}

function buildOrgThumbs() {
    state.org = state.org && state.org.fileId === pdfFiles()[0].id ? state.org : initOrg();
    const grid = $('thumbGrid');
    grid.innerHTML = '';
    const f = pdfFiles()[0];
    let seq = 0;
    state.org.pages.forEach((p, i) => {
        if (p.deleted) return;
        const shell = makeThumbShell(p.srcPage, f.id, null);
        const th = shell.classList && shell.classList.contains('thumb') ? shell : shell.querySelector('.thumb');
        th.dataset.orgIdx = i;
        th.dataset.rot = p.rot;
        if (p.rot) { th.classList.add('rot' + p.rot); th.querySelector('.t-mark') && (th.querySelector('.t-mark').textContent = p.rot + '°'); }
        const num = document.createElement('span');
        num.className = 't-num';
        num.textContent = ++seq;
        const mark = document.createElement('span');
        mark.className = 't-mark';
        if (p.rot) mark.textContent = p.rot + '°';
        const acts = document.createElement('div');
        acts.className = 't-acts';
        acts.innerHTML =
            '<button data-act="rot" title="' + L('旋转 90°', 'Rotate 90°') + '"><svg aria-hidden="true" class="ic"><use href="#i-rotate"/></svg></button>' +
            '<button data-act="del" title="' + L('删除本页', 'Remove page') + '"><svg aria-hidden="true" class="ic"><use href="#i-trash"/></svg></button>';
        th.appendChild(num);
        th.appendChild(mark);
        th.appendChild(acts);
        grid.appendChild(shell);
        queueThumbRender(th);
    });
    grid.ondragstart = e => {
        const th = e.target.closest('.thumb');
        if (!th) return;
        e.dataTransfer.effectAllowed = 'move';
        th.classList.add('drag-src');
        grid.dataset.dragIdx = th.dataset.orgIdx;
    };
    grid.ondragover = e => {
        e.preventDefault();
        const rect = grid.getBoundingClientRect();
        const edge = 48;
        if (e.clientY < rect.top + edge) grid.scrollTop -= (rect.top + edge - e.clientY) * 0.18;
        else if (e.clientY > rect.bottom - edge) grid.scrollTop += (e.clientY - (rect.bottom - edge)) * 0.18;
        const th = e.target.closest('.thumb');
        grid.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over', 'dnd-line'));
        if (th && grid.dataset.dragIdx !== th.dataset.orgIdx) th.classList.add('drag-over', 'dnd-line');
    };
    grid.ondrop = e => {
        e.preventDefault();
        const th = e.target.closest('.thumb');
        const from = grid.dataset.dragIdx;
        if (th && from !== undefined && from !== '') {
            const to = Number(th.dataset.orgIdx);
            if (Number(from) !== to) {
                orgPush();
                const moved = state.org.pages.splice(Number(from), 1)[0];
                state.org.pages.splice(to, 0, moved);
                state.orgSel.clear();
            }
            buildOrgThumbs();
        }
        delete grid.dataset.dragIdx;
    };
    grid.ondragend = () => {
        grid.querySelectorAll('.drag-src').forEach(c => c.classList.remove('drag-src'));
        grid.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over', 'dnd-line'));
        delete grid.dataset.dragIdx;
    };
    grid.onclick = e => {
        if (e.target.closest('.t-acts button')) return;
        const th = e.target.closest('.thumb');
        if (th) orgSelect(e, th);
    };
    grid.ondblclick = e => {
        const th = e.target.closest('.thumb');
        if (!th) return;
        const idx = Number(th.dataset.orgIdx);
        if (isNaN(idx) || !state.org.pages[idx]) return;
        orgPush();
        state.org.pages[idx].rot = (state.org.pages[idx].rot + 90) % 360;
        state.orgSel = new Set([idx]);
        buildOrgThumbs();
    };
    updateSelBar();
}

function initOrg() {
    const f = pdfFiles()[0];
    state.orgHist = [];
    state.orgFut = [];
    state.orgSel = new Set();
    state.orgAnchor = null;
    return { fileId: f.id, pages: Array.from({ length: f.pageCount }, (_, i) => ({ srcPage: i, rot: 0, deleted: false })) };
}

function orgPush() {
    state.orgHist.push(JSON.stringify(state.org.pages));
    if (state.orgHist.length > 60) state.orgHist.shift();
    state.orgFut.length = 0;
    updateOrgBtns();
}

function orgUndo() {
    if (state.busy || !state.orgHist.length || !state.org) return;
    state.orgFut.push(JSON.stringify(state.org.pages));
    state.org.pages = JSON.parse(state.orgHist.pop());
    state.orgSel.clear();
    buildOrgThumbs();
    updateOrgBtns();
}

function orgRedo() {
    if (state.busy || !state.orgFut.length || !state.org) return;
    state.orgHist.push(JSON.stringify(state.org.pages));
    state.org.pages = JSON.parse(state.orgFut.pop());
    state.orgSel.clear();
    buildOrgThumbs();
    updateOrgBtns();
}

function updateOrgBtns() {
    state.orgHist = state.orgHist || [];
    state.orgFut = state.orgFut || [];
    state.orgSel = state.orgSel || new Set();
    const show = state.mode === 'organize' && !!state.org;
    $('undoBtn').style.display = show ? 'flex' : 'none';
    $('redoBtn').style.display = show ? 'flex' : 'none';
    $('undoBtn').disabled = !state.orgHist.length;
    $('redoBtn').disabled = !state.orgFut.length;
}

function updateSelBar() {
    const bar = $('selBar');
    const n = state.orgSel ? state.orgSel.size : 0;
    bar.style.display = n ? 'flex' : 'none';
    $('selCount').textContent = L('已选 ' + n + ' 页', n + ' page(s) selected');
}

function orgSelect(e, th) {
    const idx = Number(th.dataset.orgIdx);
    if (e.shiftKey && state.orgAnchor != null) {
        const a = Math.min(state.orgAnchor, idx), b = Math.max(state.orgAnchor, idx);
        for (let i = a; i <= b; i++) {
            if (!state.org.pages[i].deleted) state.orgSel.add(i);
        }
    } else if (e.ctrlKey || e.metaKey) {
        if (state.orgSel.has(idx)) state.orgSel.delete(idx);
        else state.orgSel.add(idx);
        state.orgAnchor = idx;
    } else {
        state.orgSel = new Set([idx]);
        state.orgAnchor = idx;
    }
    document.querySelectorAll('#thumbGrid .thumb').forEach(t => {
        t.classList.toggle('sel', state.orgSel.has(Number(t.dataset.orgIdx)));
    });
    updateSelBar();
}

function moveSel(dir) {
    if (!state.orgSel.size || !state.org) return;
    const visIdx = state.org.pages.map((p, i) => p.deleted ? -1 : i).filter(i => i >= 0);
    const selVis = visIdx.filter(i => state.orgSel.has(i));
    if (!selVis.length) return;
    orgPush();
    if (dir === -1) {
        for (const i of selVis) {
            const pos = visIdx.indexOf(i);
            if (pos === 0) continue;
            const prev = visIdx[pos - 1];
            if (state.orgSel.has(prev)) continue;
            [state.org.pages[i], state.org.pages[prev]] = [state.org.pages[prev], state.org.pages[i]];
            if (state.orgSel.has(i)) { state.orgSel.delete(i); state.orgSel.add(prev); }
        }
    } else {
        for (const i of [...selVis].reverse()) {
            const pos = visIdx.indexOf(i);
            if (pos === visIdx.length - 1) continue;
            const next = visIdx[pos + 1];
            if (state.orgSel.has(next)) continue;
            [state.org.pages[i], state.org.pages[next]] = [state.org.pages[next], state.org.pages[i]];
            if (state.orgSel.has(i)) { state.orgSel.delete(i); state.orgSel.add(next); }
        }
    }
    buildOrgThumbs();
}

function orgEvents() {
    $('thumbGrid').addEventListener('click', e => {
        const btn = e.target.closest('.t-acts button');
        if (!btn) return;
        const th = btn.closest('.thumb');
        const idx = Number(th.dataset.orgIdx);
        const p = state.org.pages[idx];
        orgPush();
        if (btn.dataset.act === 'rot') {
            p.rot = (p.rot + 90) % 360;
            if (state.orgSel.size > 1 && state.orgSel.has(idx)) {
                state.org.pages.forEach((pp, i) => {
                    if (state.orgSel.has(i) && i !== idx) pp.rot = (pp.rot + 90) % 360;
                });
            }
        }
        if (btn.dataset.act === 'del') {
            p.deleted = true;
            if (state.orgSel.size > 1 && state.orgSel.has(idx)) {
                state.org.pages.forEach((pp, i) => {
                    if (state.orgSel.has(i)) pp.deleted = true;
                });
                state.orgSel.clear();
            }
        }
        buildOrgThumbs();
    });
    $('undoBtn').onclick = orgUndo;
    $('redoBtn').onclick = orgRedo;
    $('selRot').onclick = () => {
        if (!state.orgSel.size) return;
        orgPush();
        state.org.pages.forEach((p, i) => {
            if (state.orgSel.has(i)) p.rot = (p.rot + 90) % 360;
        });
        buildOrgThumbs();
    };
    $('selDel').onclick = () => {
        if (!state.orgSel.size) return;
        orgPush();
        state.org.pages.forEach((p, i) => {
            if (state.orgSel.has(i)) p.deleted = true;
        });
        state.orgSel.clear();
        buildOrgThumbs();
    };
    $('selClear').onclick = () => {
        state.orgSel.clear();
        buildOrgThumbs();
    };
    $('selUp').onclick = () => moveSel(-1);
    $('selDown').onclick = () => moveSel(1);
    $('wmPresets').onclick = e => {
        const b = e.target.closest('button[data-t]');
        if (!b) return;
        $('wmText').value = b.dataset.t;
        scheduleFx(0);
        scheduleSaveOpts();
    };
    $('resetBtn').onclick = () => {
        if (state.mode === 'organize') state.org = null;
        clearResults();
        renderThumbs();
    };
}

document.addEventListener('keydown', e => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (state.mode !== 'organize' || !state.org) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'z') {
        e.preventDefault();
        orgUndo();
    } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) {
        e.preventDefault();
        orgRedo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.orgSel.size) {
            e.preventDefault();
            orgPush();
            state.org.pages.forEach((p, i) => {
                if (state.orgSel.has(i)) p.deleted = true;
            });
            state.orgSel.clear();
            buildOrgThumbs();
        }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const vis = state.org.pages.map((p, i) => p.deleted ? -1 : i).filter(i => i >= 0);
        if (!vis.length) return;
        e.preventDefault();
        if (e.shiftKey && state.orgAnchor != null) {
            if (state.orgExt == null) state.orgExt = vis.indexOf(state.orgAnchor);
            state.orgExt = e.key === 'ArrowLeft' ? Math.max(0, state.orgExt - 1) : Math.min(vis.length - 1, state.orgExt + 1);
            const newIdx = vis[state.orgExt];
            const a = Math.min(state.orgAnchor, newIdx), b = Math.max(state.orgAnchor, newIdx);
            state.orgSel = new Set();
            for (let i = a; i <= b; i++) if (!state.org.pages[i].deleted) state.orgSel.add(i);
        } else {
            state.orgExt = null;
            let cur = state.orgAnchor != null && vis.includes(state.orgAnchor) ? vis.indexOf(state.orgAnchor) : (e.key === 'ArrowLeft' ? vis.length : -1);
            cur = e.key === 'ArrowLeft' ? Math.max(0, cur - 1) : Math.min(vis.length - 1, cur + 1);
            state.orgAnchor = vis[cur];
            state.orgSel = new Set([state.orgAnchor]);
        }
        document.querySelectorAll('#thumbGrid .thumb').forEach(t => {
            t.classList.toggle('sel', state.orgSel.has(Number(t.dataset.orgIdx)));
        });
        updateSelBar();
    }
});

window.addEventListener('beforeunload', e => {
    if (state.mode === 'organize' && state.org && state.orgHist.length) {
        e.preventDefault();
        e.returnValue = '';
    }
});

function parseRange(str, max) {
    const out = [];
    str = str.trim();
    if (!str) return null;
    for (const part of str.split(/[,，]/)) {
        const s = part.trim();
        if (!s) continue;
        const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
        if (m) {
            let a = Number(m[1]), b = Number(m[2]);
            if (a > b) [a, b] = [b, a];
            for (let i = a; i <= b; i++) out.push(i);
        } else if (/^\d+$/.test(s)) {
            out.push(Number(s));
        } else {
            return null;
        }
    }
    const pages = out.filter(i => i >= 1 && i <= max);
    if (!pages.length) return null;
    return pages;
}

function segVal(segId) {
    const b = document.querySelector('#' + segId + ' button.active');
    return b ? b.dataset.v : undefined;
}

async function runMerge() {
    const pdfs = pdfFiles();
    setStatus(L('正在合并…', 'Merging…'), '', 0.1);
    const out = await PLIB.PDFDocument.create();
    for (let i = 0; i < pdfs.length; i++) {
        const src = await PLIB.PDFDocument.load(pdfs[i].bytes.slice(0), { ignoreEncryption: false });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
        setStatus(L('正在合并…', 'Merging…'), '', (i + 1) / pdfs.length);
        await yieldFrame();
    }
    const bytes = await out.save();
    return [{ name: 'merged.pdf', bytes }];
}

async function runOrganize() {
    const f = pdfFiles()[0];
    setStatus(L('正在导出…', 'Exporting…'), '', 0.2);
    const src = await PLIB.PDFDocument.load(f.bytes.slice(0), { ignoreEncryption: false });
    const out = await PLIB.PDFDocument.create();
    const keep = state.org.pages.filter(p => !p.deleted);
    const copied = await out.copyPages(src, keep.map(p => p.srcPage));
    copied.forEach((p, i) => {
        const rot = keep[i].rot;
        if (rot) p.setRotation(PLIB.degrees((p.getRotation().angle + rot) % 360));
        out.addPage(p);
    });
    setStatus(L('正在保存…', 'Saving…'), '', 0.9);
    const bytes = await out.save();
    return [{ name: baseName(f.name) + '-organized.pdf', bytes }];
}

async function runSplit() {
    const f = pdfFiles()[0];
    const seg = segVal('splitSeg');
    setStatus(L('正在拆分…', 'Splitting…'), '', 0.1);
    const src = await PLIB.PDFDocument.load(f.bytes.slice(0), { ignoreEncryption: false });
    const total = src.getPageCount();
    const groups = [];
    if (seg === 'range') {
        const pages = parseRange($('splitRange').value, total);
        if (!pages) throw new Error(L('页码范围无效或为空', 'Invalid page range'));
        groups.push({ label: '', pages });
    } else if (seg === 'single') {
        for (let i = 1; i <= total; i++) groups.push({ label: 'p' + i, pages: [i] });
    } else {
        const n = Math.max(1, Number($('splitEvery').value) || 2);
        for (let i = 1; i <= total; i += n) {
            const pages = [];
            for (let k = i; k < i + n && k <= total; k++) pages.push(k);
            groups.push({ label: 'p' + i + '-' + pages[pages.length - 1], pages });
        }
    }
    const results = [];
    for (let gi = 0; gi < groups.length; gi++) {
        const out = await PLIB.PDFDocument.create();
        const copied = await out.copyPages(src, groups[gi].pages.map(p => p - 1));
        copied.forEach(p => out.addPage(p));
        const bytes = await out.save();
        results.push({ name: baseName(f.name) + (groups[gi].label ? '-' + groups[gi].label : '-extract') + '.pdf', bytes });
        setStatus(L('正在拆分…', 'Splitting…'), '', (gi + 1) / groups.length);
    }
    return results;
}

async function compressOne(f, q, dpi, onPct) {
    const out = await PLIB.PDFDocument.create();
    const n = f.pageCount;
    for (let i = 1; i <= n; i++) {
        const page = await f.jsDoc.getPage(i);
        const vp = page.getViewport({ scale: dpi / 72 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
        const jpg = new Uint8Array(await blob.arrayBuffer());
        const img = await out.embedJpg(jpg);
        const base = page.getViewport({ scale: 1 });
        const p = out.addPage([base.width, base.height]);
        p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
        onPct(i / n);
        await yieldFrame();
    }
    return out.save();
}

async function runCompress() {
    const pdfs = pdfFiles();
    const q = Number($('qSlider').value) / 100;
    const dpi = Number($('dpiSel').value);
    const results = [];
    for (let fi = 0; fi < pdfs.length; fi++) {
        const f = pdfs[fi];
        const bytes = await compressOne(f, q, dpi, p => {
            setStatus(L('正在压缩 ' + f.name + '…', 'Compressing ' + f.name + '…'), '', (fi + p) / pdfs.length);
        });
        results.push({ name: baseName(f.name) + '-compressed.pdf', bytes, orig: f.size });
    }
    return results;
}

async function runConvert() {
    const isImgs = pdfFiles().length === 0;
    if (isImgs) {
        setStatus(L('正在合成 PDF…', 'Building PDF…'), '', 0.1);
        const out = await PLIB.PDFDocument.create();
        const imgs = state.files.filter(isImgFile);
        const a4 = $('imgPageSize').value === 'a4';
        const margin = Math.max(0, Number($('imgMargin').value) || 0);
        for (let i = 0; i < imgs.length; i++) {
            const f = imgs[i];
            const bmp = f.bmp || await createImageBitmap(new Blob([f.bytes]));
            const canvas = document.createElement('canvas');
            canvas.width = bmp.width;
            canvas.height = bmp.height;
            canvas.getContext('2d').drawImage(bmp, 0, 0);
            const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
            const png = new Uint8Array(await blob.arrayBuffer());
            const emb = await out.embedPng(png);
            let pw, ph;
            if (a4) {
                pw = 595.28; ph = 841.89;
                const maxW = pw - margin * 2, maxH = ph - margin * 2;
                const scale = Math.min(maxW / emb.width, maxH / emb.height, 1e9);
                const w = emb.width * scale, h = emb.height * scale;
                const p = out.addPage([pw, ph]);
                p.drawImage(emb, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
            } else {
                const p = out.addPage([emb.width + margin * 2, emb.height + margin * 2]);
                p.drawImage(emb, { x: margin, y: margin, width: emb.width, height: emb.height });
            }
            setStatus(L('正在合成 PDF…', 'Building PDF…'), '', (i + 1) / imgs.length);
        }
        const bytes = await out.save();
        return [{ name: 'images-' + state.files.length + 'p.pdf', bytes }];
    }
    const f = pdfFiles()[0];
    const dpi = Number($('convDpi').value);
    const fmt = segVal('convFmtSeg');
    const total = f.pageCount;
    let pages;
    if ($('convRange').value.trim()) {
        pages = parseRange($('convRange').value, total);
        if (!pages) throw new Error(L('页码范围无效', 'Invalid page range'));
    } else {
        pages = Array.from({ length: total }, (_, i) => i + 1);
    }
    const items = {};
    for (let i = 0; i < pages.length; i++) {
        const page = await f.jsDoc.getPage(pages[i]);
        const vp = page.getViewport({ scale: dpi / 72 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const ctx = canvas.getContext('2d', { alpha: fmt === 'png' });
        if (fmt === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise(res => canvas.toBlob(res, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92));
        const u8 = new Uint8Array(await blob.arrayBuffer());
        const bn = baseName(f.name);
        items[bn + '-p' + pages[i] + '.' + fmt] = u8;
        setStatus(L('正在导出图片…', 'Exporting images…'), '', (i + 1) / pages.length);
    }
    if (Object.keys(items).length === 1) {
        const key = Object.keys(items)[0];
        return [{ name: key, bytes: items[key] }];
    }
    const zipped = zipSync(items, { level: 4 });
    return [{ name: baseName(f.name) + '-images.zip', bytes: zipped }];
}

async function drawWatermark(doc, opts) {
    const pages = doc.getPages();
    let font;
    if (hasCJK(opts.text)) {
        const cached = await getEmbedFont();
        doc.registerFontkit(window.fontkit);
        font = await doc.embedFont(cached.buf);
    } else {
        font = await doc.embedFont(PLIB.StandardFonts.HelveticaBold);
    }
    const [r, g, b] = opts.color;
    for (let pi = 0; pi < pages.length; pi++) {
        const page = pages[pi];
        const { width, height } = page.getSize();
        const w = font.widthOfTextAtSize(opts.text, opts.size);
        const h = font.heightAtSize(opts.size);
        const th = (opts.angle * Math.PI) / 180;
        const cos = Math.cos(th), sin = Math.sin(th);
        const drawAt = (cx, cy) => {
            const a = w / 2, b = h / 2;
            const x = cx - (a * cos - b * sin);
            const y = cy - (a * sin + b * cos);
            page.drawText(opts.text, {
                x, y, size: opts.size, font,
                color: PLIB.rgb(r / 255, g / 255, b / 255),
                opacity: opts.opacity,
                rotate: PLIB.degrees(opts.angle)
            });
        };
        if (opts.layout === 'center') {
            drawAt(width / 2, height / 2);
        } else {
            const dx = w + 140, dy = h + 160;
            for (let cx = -dx / 2; cx < width + dx; cx += dx) {
                for (let cy = -dy / 2; cy < height + dy; cy += dy) {
                    drawAt(cx, cy);
                }
            }
        }
        if (pi % 8 === 7) await yieldFrame();
    }
}

async function runWatermark() {
    const text = $('wmText').value.trim();
    if (!text) throw new Error(L('请先填写水印文字', 'Enter watermark text first'));
    const opts = {
        text,
        layout: segVal('wmLayoutSeg'),
        size: Math.max(6, Number($('wmSize').value) || 42),
        color: $('wmColor').value === 'black' ? [20, 20, 20] : $('wmColor').value === 'white' ? [235, 235, 235] : [85, 85, 85],
        opacity: Number($('wmOpa').value) / 100,
        angle: Number($('wmAng').value)
    };
    const pdfs = pdfFiles();
    const results = [];
    for (let fi = 0; fi < pdfs.length; fi++) {
        const f = pdfs[fi];
        const doc = await PLIB.PDFDocument.load(f.bytes.slice(0), { ignoreEncryption: false });
        await drawWatermark(doc, opts);
        const bytes = await doc.save();
        results.push({ name: baseName(f.name) + '-watermark.pdf', bytes });
        setStatus(L('正在加水印…', 'Adding watermark…'), '', (fi + 1) / pdfs.length);
    }
    return results;
}

const PN_POS = [
    { x: 0.03, y: 0.97, ax: 'left', ay: 'top' }, { x: 0.5, y: 0.97, ax: 'center', ay: 'top' }, { x: 0.97, y: 0.97, ax: 'right', ay: 'top' },
    { x: 0.03, y: 0.5, ax: 'left', ay: 'middle' }, { x: 0.5, y: 0.5, ax: 'center', ay: 'middle' }, { x: 0.97, y: 0.5, ax: 'right', ay: 'middle' },
    { x: 0.03, y: 0.03, ax: 'left', ay: 'bottom' }, { x: 0.5, y: 0.03, ax: 'center', ay: 'bottom' }, { x: 0.97, y: 0.03, ax: 'right', ay: 'bottom' }
];

async function runPagenum() {
    const start = Math.max(0, Number($('pnStart').value) || 1);
    const size = Math.max(6, Number($('pnSize').value) || 11);
    const fmt = segVal('pnFmtSeg');
    const posIdx = Number(document.querySelector('#posGrid button.active').dataset.pos);
    const pdfs = pdfFiles();
    const results = [];
    for (let fi = 0; fi < pdfs.length; fi++) {
        const f = pdfs[fi];
        const doc = await PLIB.PDFDocument.load(f.bytes.slice(0), { ignoreEncryption: false });
        const pages = doc.getPages();
        const sample = fmt === 'plain' ? '1' : fmt === 'pageX' ? L('第 1 页', 'Page 1') : L('第 1 页 共 ' + pages.length + ' 页', 'Page 1 of ' + pages.length);
        let font;
        if (hasCJK(sample)) {
            const cached = await getEmbedFont();
            doc.registerFontkit(window.fontkit);
            font = await doc.embedFont(cached.buf);
        } else {
            font = await doc.embedFont(PLIB.StandardFonts.Helvetica);
        }
        const margin = 20;
        for (let pi = 0; pi < pages.length; pi++) {
            const page = pages[pi];
            const num = start + pi;
            const text = fmt === 'plain' ? String(num)
                : fmt === 'pageX' ? L('第 ' + num + ' 页', 'Page ' + num)
                : L('第 ' + num + ' 页 共 ' + pages.length + ' 页', 'Page ' + num + ' of ' + pages.length);
            const { width, height } = page.getSize();
            const tw = font.widthOfTextAtSize(text, size);
            const thh = font.heightAtSize(size);
            const pos = PN_POS[posIdx];
            let x = pos.x * width, y = pos.y * height;
            if (pos.ax === 'center') x = (width - tw) / 2;
            if (pos.ax === 'right') x = width - tw - margin;
            if (pos.ay === 'top') y = height - thh - margin;
            if (pos.ay === 'middle') y = (height - thh) / 2;
            if (pos.ay === 'bottom') y = margin;
            page.drawText(text, { x, y, size, font, color: PLIB.rgb(0.35, 0.35, 0.35) });
            if (pi % 10 === 9) await yieldFrame();
        }
        const bytes = await doc.save();
        results.push({ name: baseName(f.name) + '-numbered.pdf', bytes });
        setStatus(L('正在加页码…', 'Numbering pages…'), '', (fi + 1) / pdfs.length);
    }
    return results;
}

function showResults(results) {
    state.results = results;
    const info = $('outInfo');
    info.style.display = 'flex';
    info.innerHTML = '';
    const total = results.reduce((s, r) => s + r.bytes.length, 0);
    const orig = results.reduce((s, r) => s + (r.orig || 0), 0);
    info.innerHTML =
        '<div class="out-row"><span>' + L('产物', 'Output') + '</span><strong>' + results.length + L(' 个文件 - 共 ', ' file(s) - ') + fmtSize(total) + '</strong></div>' +
        (orig ? '<div class="out-row"><span>' + (total <= orig ? L('压缩比', 'Reduction') : L('体积变化', 'Size change')) + '</span><strong class="' + (total <= orig ? 'delta-less' : 'delta-more') + '">' + Math.round(total / orig * 100) + '%（' + fmtSize(orig) + ' → ' + fmtSize(total) + '）</strong></div>' : '');
    $('dlBtn').disabled = false;
    setStatus(L('完成', 'Done'), 'ok');
    setTimeout(clearStatus, 3000);
    renderResultPreview(results);
    pushHistory(MODE_LABEL[state.mode] ? MODE_LABEL[state.mode]() : '', results);
}

async function downloadResults() {
    if (!state.results) return;
    const items = [];
    const used = new Set();
    for (const r of state.results) {
        let n = r.name;
        let k = 2;
        while (used.has(n)) n = r.name.replace(/(\.\w+)$/, '-' + k++ + '$1');
        used.add(n);
        items.push({ name: n, bytes: r.bytes });
    }
    await downloadItems(items);
}

function clearResults() {
    state.results = null;
    $('outInfo').style.display = 'none';
    $('dlBtn').disabled = true;
}

async function run() {
    if (state.busy) return;
    state.busy = true;
    $('runBtn').disabled = true;
    $('runLabel').textContent = L('处理中…', 'Working…');
    try {
        let results;
        if (state.mode === 'merge') results = await runMerge();
        else if (state.mode === 'organize') results = await runOrganize();
        else if (state.mode === 'split') results = await runSplit();
        else if (state.mode === 'compress') results = await runCompress();
        else if (state.mode === 'convert') results = await runConvert();
        else if (state.mode === 'watermark') results = await runWatermark();
        else results = await runPagenum();
        showResults(results);
    } catch (e) {
        const msg = String(e && e.message || e);
        if (/encrypt/i.test(msg)) setStatus(L('文件已加密，无法处理', 'Encrypted file cannot be processed'), 'err');
        else setStatus(msg || L('处理失败', 'Failed'), 'err');
    } finally {
        state.busy = false;
        $('runBtn').disabled = false;
        $('runLabel').textContent = MODE_LABEL[state.mode]();
    }
}

function tabEvents() {
    $('modeTabs').onclick = e => {
        const b = e.target.closest('button[data-mode]');
        if (!b || b.disabled) return;
        if (state.mode === 'organize' && b.dataset.mode !== 'organize') state.org = null;
        state.mode = b.dataset.mode;
        clearResults();
        refreshUI(true);
    };
    document.querySelectorAll('.seg').forEach(seg => {
        seg.addEventListener('click', e => {
            const b = e.target.closest('button[data-v]');
            if (!b) return;
            seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            if (seg.id === 'splitSeg') {
                $('splitRangeRow').style.display = b.dataset.v === 'range' ? 'block' : 'none';
                $('splitEveryRow').style.display = b.dataset.v === 'every' ? 'block' : 'none';
                $('splitHint').textContent = b.dataset.v === 'range' ? L('将提取指定页码生成新的 PDF；页码可混用区间与逗号。', 'Extracts the given pages into a new PDF.')
                    : b.dataset.v === 'every' ? L('每 N 页拆成一份，最后不足 N 页的也独立成一份。', 'Every N pages become one file; the remainder forms the last one.')
                    : L('每一页拆成一个独立 PDF，多份时打包为 ZIP。', 'Each page becomes its own PDF - many pages come as a ZIP.');
                scheduleSplitHighlight();
            }
            if (seg.id === 'wmLayoutSeg') scheduleFx(0);
            if (seg.id === 'pnFmtSeg') scheduleFx(0);
        });
    });
    $('splitRange').addEventListener('input', scheduleSplitHighlight);
    $('splitEvery').addEventListener('input', scheduleSplitHighlight);
    $('wmText').addEventListener('input', () => scheduleFx());
    $('wmSize').addEventListener('input', () => scheduleFx());
    $('wmColor').addEventListener('change', () => scheduleFx(0));
    $('qSlider').oninput = function () {
        $('qVal').textContent = this.value + '%';
        $('qVal2').textContent = this.value + '%';
        scheduleEstimate();
    };
    $('dpiSel').addEventListener('change', scheduleEstimate);
    $('wmOpa').oninput = function () {
        $('wmOpaVal').textContent = this.value + '%';
        $('wmOpaVal2').textContent = this.value + '%';
        scheduleFx();
    };
    $('wmAng').oninput = function () {
        $('wmAngVal').textContent = this.value + '°';
        $('wmAngVal2').textContent = this.value + '°';
        scheduleFx();
    };
    $('posGrid').onclick = e => {
        const b = e.target.closest('button[data-pos]');
        if (!b) return;
        document.querySelectorAll('#posGrid button').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('active');
        b.setAttribute('aria-pressed', 'true');
        scheduleFx(0);
        scheduleSaveOpts();
    };
    $('pnStart').addEventListener('input', () => scheduleFx());
    $('pnSize').addEventListener('input', () => scheduleFx());
    $('runBtn').onclick = run;
    $('dlBtn').onclick = downloadResults;
}

function dzEvents() {
    const dz = $('dropzone');
    const input = $('fileInput');
    const curtain = $('dropCurtain');
    dz.onclick = () => input.click();
    input.onchange = () => { loadFileObjects([...input.files]); input.value = ''; };
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => {
        const fs = e.dataTransfer && e.dataTransfer.files;
        if (fs && fs.length) loadFileObjects([...fs]);
    });
    let dragDepth = 0;
    const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    window.addEventListener('dragenter', e => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth++;
        curtain.classList.add('show');
    });
    window.addEventListener('dragleave', e => {
        if (!hasFiles(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) curtain.classList.remove('show');
    });
    window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('drop', e => {
        e.preventDefault();
        dragDepth = 0;
        curtain.classList.remove('show');
        const fs = e.dataTransfer && e.dataTransfer.files;
        if (fs && fs.length) loadFileObjects([...fs]);
    });
}

async function boot() {
    loadOpts();
    dzEvents();
    chipEvents();
    tabEvents();
    orgEvents();
    document.querySelectorAll('#posGrid button').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false'));
    document.querySelectorAll('.opt-block input, .opt-block select, #qSlider, #dpiSel').forEach(el => {
        el.addEventListener('change', scheduleSaveOpts);
        el.addEventListener('input', scheduleSaveOpts);
    });
    refreshUI(false);
    if (window.LabBoot) { window.LabBoot.drive(); window.LabBoot.hide(); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
