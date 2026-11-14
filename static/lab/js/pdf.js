import { zipSync } from '/static/lab/vendor/pdf/fflate.esm.js';

const $ = id => document.getElementById(id);
const L = window.L || (z => z);
const fmtSize = window.LabFmt && window.LabFmt.size ? window.LabFmt.size : (b => b + ' B');

const PDFJS = window.pdfjsLib;
const PLIB = window.PDFLib;
PDFJS.GlobalWorkerOptions.workerSrc = '/static/lab/vendor/pdf/pdf.worker.min.js?v=2026111401';

const VENDOR = '/static/lab/vendor/pdf/';
const MAX_SIZE = 200 * 1024 * 1024;
const FONT_KEY = 'fonts|pdf-studio-noto-sc';
const FONT_URL = VENDOR + 'NotoSansSC-Regular.ttf';
const HAS_IDB = typeof indexedDB !== 'undefined';

const state = {
    files: [],
    mode: 'merge',
    nextId: 1,
    org: null,
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
        setStatus(L('正在加载中文字体（约 13MB，仅首次）', 'Loading CJK font (~13MB, first time only)'));
        const resp = await fetch(FONT_URL);
        if (!resp.ok) throw new Error(L('中文字体加载失败', 'Failed to load CJK font'));
        buf = new Uint8Array(await resp.arrayBuffer());
        if (HAS_IDB) {
            try { await idbPut(FONT_KEY, new Blob([buf], { type: 'font/ttf' })); } catch (e) {}
        }
    }
    const doc = await PLIB.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const font = await doc.embedFont(buf, { subset: true });
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
                    kind: 'img', bytes, w: bmp.width, h: bmp.height, bmp
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

function makeThumbShell(pageIndex, fileId, fname) {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-wrap';
    const th = document.createElement('div');
    th.className = 'thumb';
    th.dataset.page = pageIndex;
    th.dataset.file = fileId;
    const ph = document.createElement('div');
    ph.className = 'thumb-loading';
    ph.textContent = L('加载中', '…');
    th.appendChild(ph);
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
    if (state.mode === 'organize') {
        $('resTitle').textContent = L('页面编辑', 'Organize pages');
        buildOrgThumbs();
        return;
    }
    $('resTitle').textContent = L('页面预览', 'Page preview');
    thumbObserver = new IntersectionObserver(entries => {
        for (const en of entries) {
            if (!en.isIntersecting) continue;
            const th = en.target;
            thumbObserver.unobserve(th);
            queueThumbRender(th);
        }
    }, { root: grid, rootMargin: '200px' });
    for (const f of pdfs) {
        for (let i = 0; i < f.pageCount; i++) {
            const shell = makeThumbShell(i, f.id, f.name);
            grid.appendChild(shell);
            const th = shell.classList && shell.classList.contains('thumb') ? shell : shell.firstChild;
            thumbObserver.observe(th);
        }
    }
    if (!pdfs.length) {
        empty.style.display = 'block';
        $('emptyText').textContent = L('当前为图片文件，执行合成后生成 PDF', 'Images loaded - run Convert to build the PDF');
        grid.style.display = 'none';
    }
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
            const ph = th.querySelector('.thumb-loading');
            if (ph) ph.remove();
            th.insertBefore(canvas, th.firstChild);
        } catch (e) {}
    });
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
        const th = e.target.closest('.thumb');
        grid.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
        if (th) th.classList.add('drag-over');
    };
    grid.ondrop = e => {
        e.preventDefault();
        const th = e.target.closest('.thumb');
        const from = grid.dataset.dragIdx;
        if (th && from !== undefined && from !== '') {
            const to = Number(th.dataset.orgIdx);
            const moved = state.org.pages.splice(Number(from), 1)[0];
            state.org.pages.splice(to, 0, moved);
            buildOrgThumbs();
        }
        delete grid.dataset.dragIdx;
    };
    grid.ondragend = () => {
        grid.querySelectorAll('.drag-src').forEach(c => c.classList.remove('drag-src'));
        grid.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
        delete grid.dataset.dragIdx;
    };
}

function initOrg() {
    const f = pdfFiles()[0];
    return { fileId: f.id, pages: Array.from({ length: f.pageCount }, (_, i) => ({ srcPage: i, rot: 0, deleted: false })) };
}

function orgEvents() {
    $('thumbGrid').addEventListener('click', e => {
        const btn = e.target.closest('.t-acts button');
        if (!btn) return;
        const th = btn.closest('.thumb');
        const idx = Number(th.dataset.orgIdx);
        const p = state.org.pages[idx];
        if (btn.dataset.act === 'rot') p.rot = (p.rot + 90) % 360;
        if (btn.dataset.act === 'del') p.deleted = true;
        buildOrgThumbs();
    });
    $('resetBtn').onclick = () => {
        if (state.mode === 'organize') state.org = null;
        clearResults();
        renderThumbs();
    };
}

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
        font = await doc.embedFont(cached.buf, { subset: true });
    } else {
        font = await doc.embedFont(PLIB.StandardFonts.HelveticaBold);
    }
    const [r, g, b] = opts.color;
    pages.forEach(page => {
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
    });
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
            font = await doc.embedFont(cached.buf, { subset: true });
        } else {
            font = await doc.embedFont(PLIB.StandardFonts.Helvetica);
        }
        const margin = 20;
        pages.forEach((page, pi) => {
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
        });
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
        (orig ? '<div class="out-row"><span>' + L('压缩比', 'Reduction') + '</span><strong class="' + (total <= orig ? 'delta-less' : 'delta-more') + '">' + Math.round(total / orig * 100) + '%（' + fmtSize(orig) + ' → ' + fmtSize(total) + '）</strong></div>' : '');
    $('dlBtn').disabled = false;
    setStatus(L('完成', 'Done'), 'ok');
    setTimeout(clearStatus, 3000);
}

async function downloadResults() {
    if (!state.results) return;
    if (state.results.length === 1) {
        const r = state.results[0];
        const isZip = /\.zip$/i.test(r.name);
        saveBlob(r.bytes, r.name, isZip ? 'application/zip' : /\.png$/i.test(r.name) ? 'image/png' : /\.jpe?g$/i.test(r.name) ? 'image/jpeg' : 'application/pdf');
        return;
    }
    const items = {};
    const used = new Set();
    for (const r of state.results) {
        let n = r.name;
        let k = 2;
        while (used.has(n)) n = r.name.replace(/(\.\w+)$/, '-' + k++ + '$1');
        used.add(n);
        items[n] = r.bytes;
    }
    saveBlob(zipSync(items, { level: 4 }), 'pdf-studio-' + new Date().toISOString().slice(0, 10) + '.zip', 'application/zip');
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
            }
        });
    });
    $('qSlider').oninput = function () {
        $('qVal').textContent = this.value + '%';
        $('qVal2').textContent = this.value + '%';
    };
    $('wmOpa').oninput = function () {
        $('wmOpaVal').textContent = this.value + '%';
        $('wmOpaVal2').textContent = this.value + '%';
    };
    $('wmAng').oninput = function () {
        $('wmAngVal').textContent = this.value + '°';
        $('wmAngVal2').textContent = this.value + '°';
    };
    $('posGrid').onclick = e => {
        const b = e.target.closest('button[data-pos]');
        if (!b) return;
        document.querySelectorAll('#posGrid button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
    };
    $('runBtn').onclick = run;
    $('dlBtn').onclick = downloadResults;
}

function dzEvents() {
    const dz = $('dropzone');
    const input = $('fileInput');
    dz.onclick = () => input.click();
    input.onchange = () => { loadFileObjects([...input.files]); input.value = ''; };
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => {
        const fs = e.dataTransfer && e.dataTransfer.files;
        if (fs && fs.length) loadFileObjects([...fs]);
    });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => e.preventDefault());
}

async function boot() {
    dzEvents();
    chipEvents();
    tabEvents();
    orgEvents();
    refreshUI(false);
    if (window.LabBoot) { window.LabBoot.drive(); window.LabBoot.hide(); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
