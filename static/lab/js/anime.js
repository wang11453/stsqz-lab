var LabPiko = window.LabPiko || { set: function () {} };
(function () {
    const $ = (id) => document.getElementById(id);
    const dz = $('dropzone'), fileInput = $('fileInput'), chip = $('fileChip'), chipName = $('fileChipName');
    const runBtn = $('runBtn'), dlBtn = $('dlBtn');
    const statusLine = $('statusLine'), statusText = $('statusText'), barFill = $('barFill');
    const srcBox = $('srcBox'), outBox = $('outBox');
    const styleStrip = $('styleStrip'), qaRow = $('qaRow');

    const TGZ_URL = 'https://cdn.npmmirror.com/packages/sts-animegan/1.0.0/sts-animegan-1.0.0.tgz';
    const TGZ_KEY = 'anime|sts-animegan|1.0.0';
    const TGZ_SIZE = 23855500;
    const STYLE_FILES = { shinkai: 'AnimeGANv2_Shinkai.onnx', hayao: 'AnimeGANv2_Hayao.onnx', face: 'face_paint_512_v2_0.onnx' };
    const STYLE_NHWC = { shinkai: true, hayao: true, face: false };
    const STYLE_SQUARE = { face: 512 };

    const IDB_NAME = 'sts-lab-models';
    const IDB_STORE = 'tgz';

    let picked = null;
    let curStyle = 'shinkai';
    let curQ = 256;
    let busy = false;
    const sessions = {};

    function idbOpen() {
        return new Promise(function (res, rej) {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = function () {
                if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
            };
            req.onsuccess = function () { res(req.result); };
            req.onerror = function () { rej(req.error); };
        });
    }
    function idbGet(key) {
        return idbOpen().then(function (db) {
            return new Promise(function (res, rej) {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const rq = tx.objectStore(IDB_STORE).get(key);
                rq.onsuccess = function () { res(rq.result || null); };
                rq.onerror = function () { rej(rq.error); };
            });
        }).catch(function () { return null; });
    }
    function idbPut(key, val) {
        return idbOpen().then(function (db) {
            return new Promise(function (res, rej) {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(val, key);
                tx.oncomplete = function () { res(true); };
                tx.onerror = function () { rej(tx.error); };
            });
        }).catch(function () { return false; });
    }

    function fmtSize(n) {
        if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
        return Math.round(n / 1024) + ' KB';
    }
    function showStatus(text, ratio) {
        statusLine.style.display = 'flex';
        statusText.textContent = text;
        if (ratio == null) {
            barFill.parentElement.style.display = 'none';
        } else {
            barFill.parentElement.style.display = 'inline-flex';
            barFill.style.width = Math.min(100, ratio * 100).toFixed(1) + '%';
        }
        statusLine.classList.remove('ok', 'err');
    }
    function setRunEnabled(on) {
        runBtn.disabled = !on;
        runBtn.classList.toggle('ui-spin', !on && busy);
    }

    dz.addEventListener('click', () => fileInput.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('drag');
        pick(e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => pick(fileInput.files && fileInput.files[0]));

    function pick(file) {
        if (!file) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (['png', 'jpg', 'jpeg', 'webp'].indexOf(ext) < 0) {
            showStatus('不支持的格式 .' + ext, null);
            statusLine.classList.add('err');
            return;
        }
        picked = file;
        chipName.textContent = file.name + ' - ' + fmtSize(file.size);
        chip.style.display = 'flex';
        const url = URL.createObjectURL(file);
        srcBox.innerHTML = '';
        const img = document.createElement('img');
        img.src = url;
        srcBox.appendChild(img);
        outBox.innerHTML = '<div class="empty"><svg class="ic"><use href="#i-wand"/></svg>转换后显示在这里</div>';
        dlBtn.disabled = true;
        setRunEnabled(true);
        try { LabBoot.hide(); } catch (e) {}
    }

    styleStrip.addEventListener('click', (e) => {
        const item = e.target.closest('.style-item');
        if (!item) return;
        styleStrip.querySelectorAll('.style-item').forEach((x) => x.classList.remove('on'));
        item.classList.add('on');
        curStyle = item.getAttribute('data-style');
    });
    qaRow.addEventListener('click', (e) => {
        const btn = e.target.closest('.qa-btn');
        if (!btn) return;
        qaRow.querySelectorAll('.qa-btn').forEach((x) => x.classList.remove('on'));
        btn.classList.add('on');
        curQ = parseInt(btn.getAttribute('data-q'), 10) || 256;
    });

    function parseTar(buf) {
        const files = new Map();
        let off = 0;
        while (off + 512 <= buf.length) {
            const hdr = buf.subarray(off, off + 512);
            if (hdr.every((b) => b === 0)) break;
            let name = '';
            for (let i = 0; i < 100 && hdr[i] !== 0; i++) name += String.fromCharCode(hdr[i]);
            let sizeStr = '';
            for (let i = 124; i < 136 && hdr[i] !== 0; i++) if (hdr[i] !== 32) sizeStr += String.fromCharCode(hdr[i]);
            const size = parseInt(sizeStr || '0', 8);
            const type = String.fromCharCode(hdr[156]);
            off += 512;
            if (type === 'x' || type === 'g' || type === 'L') { off += Math.ceil(size / 512) * 512; continue; }
            if (type === '0' || type === '\0' || type === '') files.set(name, buf.subarray(off, off + size));
            off += Math.ceil(size / 512) * 512;
        }
        return files;
    }

    let tgzFiles = null;

    async function ensureTgz(onProgress) {
        if (tgzFiles) return tgzFiles;
        const cached = await idbGet(TGZ_KEY);
        if (cached && cached.files && cached.files.length) {
            tgzFiles = new Map(cached.files.map(([n, b]) => [n, b]));
            return tgzFiles;
        }
        const resp = await fetch(TGZ_URL, { cache: 'force-cache' });
        if (!resp.ok) throw new Error('模型包下载失败 ' + resp.status);
        const total = TGZ_SIZE;
        const reader = resp.body.getReader();
        const chunks = [];
        let got = 0;
        for (;;) {
            const r = await reader.read();
            if (r.done) break;
            chunks.push(r.value);
            got += r.value.length;
            if (onProgress) onProgress(got / total, got, total);
        }
        const raw = new Uint8Array(got);
        let off = 0;
        for (const c of chunks) { raw.set(c, off); off += c.length; }
        const ds = new DecompressionStream('gzip');
        const stream = new Blob([raw]).stream().pipeThrough(ds);
        const ab = await new Response(stream).arrayBuffer();
        const all = parseTar(new Uint8Array(ab));
        const prefix = 'package/models/';
        const files = [];
        for (const [name, bytes] of all) {
            const at = name.indexOf(prefix);
            if (at === -1 || name.endsWith('/')) continue;
            files.push([name.slice(at + prefix.length), bytes]);
        }
        if (!files.length) throw new Error('模型包为空');
        idbPut(TGZ_KEY, { files: files });
        tgzFiles = new Map(files);
        return tgzFiles;
    }

    async function loadModel(style, onProgress) {
        if (sessions[style]) return sessions[style];
        const files = await ensureTgz(onProgress);
        const entry = files.get(STYLE_FILES[style]);
        if (!entry) throw new Error('模型缺失 ' + STYLE_FILES[style]);
        const buf = entry.buffer.slice(entry.byteOffset, entry.byteOffset + entry.byteLength);
        const mod = await import('/static/lab/vendor/ocr/ort.mjs');
        const sess = await mod.ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
        sessions[style] = sess;
        return sess;
    }

    async function toTensor(img, q, nhwc, square) {
        let w, h, dx = 0, dy = 0, dw, dh;
        if (square) {
            w = h = square;
            const s = square / Math.max(img.naturalWidth, img.naturalHeight);
            dw = Math.max(8, Math.round(img.naturalWidth * s));
            dh = Math.max(8, Math.round(img.naturalHeight * s));
            dx = Math.floor((w - dw) / 2);
            dy = Math.floor((h - dh) / 2);
        } else {
            const long = Math.max(img.naturalWidth, img.naturalHeight);
            const scale = q / long;
            w = Math.round(img.naturalWidth * scale);
            h = Math.round(img.naturalHeight * scale);
            w = Math.max(8, Math.round(w / 8) * 8);
            h = Math.max(8, Math.round(h / 8) * 8);
            dw = w; dh = h;
        }
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingQuality = 'high';
        if (square) { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, dx, dy, dw, dh);
        const data = ctx.getImageData(0, 0, w, h).data;
        const px = w * h;
        const f32 = new Float32Array(3 * px);
        if (nhwc) {
            for (let i = 0; i < px; i++) {
                f32[i * 3] = data[i * 4] / 127.5 - 1;
                f32[i * 3 + 1] = data[i * 4 + 1] / 127.5 - 1;
                f32[i * 3 + 2] = data[i * 4 + 2] / 127.5 - 1;
            }
        } else {
            for (let i = 0; i < px; i++) {
                f32[i] = data[i * 4] / 127.5 - 1;
                f32[px + i] = data[i * 4 + 1] / 127.5 - 1;
                f32[px * 2 + i] = data[i * 4 + 2] / 127.5 - 1;
            }
        }
        return { tensor: f32, w, h, dx, dy, dw, dh };
    }

    async function run() {
        if (!picked || busy) return;
        busy = true;
        setRunEnabled(false);
        dlBtn.disabled = true;
        try {
            LabPiko.set('load');
            showStatus('准备模型…', null);
            const sess = await loadModel(curStyle, (ratio, got, total) => {
                showStatus('下载模型 ' + fmtSize(got) + ' / ' + fmtSize(total), ratio);
            });
            showStatus('正在转换…', null);
            await new Promise((r) => setTimeout(r, 30));
            const img = new Image();
            img.src = URL.createObjectURL(picked);
            await img.decode();
            const nhwc = STYLE_NHWC[curStyle];
            const square = STYLE_SQUARE[curStyle] || 0;
            const { tensor, w, h, dx, dy, dw, dh } = await toTensor(img, curQ, nhwc, square);
            const mod = await import('/static/lab/vendor/ocr/ort.mjs');
            const feeds = {};
            const dims = nhwc ? [1, h, w, 3] : [1, 3, h, w];
            feeds[sess.inputNames[0]] = new mod.ort.Tensor('float32', tensor, dims);
            const out = await sess.run(feeds);
            const outTensor = out[sess.outputNames[0]];
            const data = outTensor.data;
            const px = w * h;
            const cv = document.createElement('canvas');
            cv.width = w;
            cv.height = h;
            const ctx = cv.getContext('2d');
            const imgData = ctx.createImageData(w, h);
            if (nhwc) {
                for (let i = 0; i < px; i++) {
                    imgData.data[i * 4] = Math.max(0, Math.min(255, Math.round((data[i * 3] + 1) * 127.5)));
                    imgData.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round((data[i * 3 + 1] + 1) * 127.5)));
                    imgData.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((data[i * 3 + 2] + 1) * 127.5)));
                    imgData.data[i * 4 + 3] = 255;
                }
            } else {
                for (let i = 0; i < px; i++) {
                    imgData.data[i * 4] = Math.max(0, Math.min(255, Math.round((data[i] + 1) * 127.5)));
                    imgData.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round((data[px + i] + 1) * 127.5)));
                    imgData.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((data[px * 2 + i] + 1) * 127.5)));
                    imgData.data[i * 4 + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            let srcCv = cv;
            if (square) {
                const crop = document.createElement('canvas');
                crop.width = dw;
                crop.height = dh;
                const cctx = crop.getContext('2d');
                cctx.imageSmoothingQuality = 'high';
                cctx.drawImage(cv, dx, dy, dw, dh, 0, 0, dw, dh);
                srcCv = crop;
            }
            const outCv = document.createElement('canvas');
            outCv.width = img.naturalWidth;
            outCv.height = img.naturalHeight;
            const octx = outCv.getContext('2d');
            octx.imageSmoothingQuality = 'high';
            octx.drawImage(srcCv, 0, 0, outCv.width, outCv.height);
            outBox.innerHTML = '';
            const resImg = document.createElement('img');
            resImg.src = outCv.toDataURL('image/png');
            outBox.appendChild(resImg);
            dlBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = resImg.src;
                a.download = (picked.name.replace(/\.[^.]+$/, '') || 'anime') + '-' + curStyle + '.png';
                a.click();
            };
            dlBtn.disabled = false;
            showStatus('完成，可下载 PNG', 1);
            statusLine.classList.add('ok');
            LabPiko.set('idle');
        } catch (err) {
            showStatus('出错了：' + (err && err.message ? err.message : err), null);
            statusLine.classList.add('err');
            LabPiko.set('daze');
        } finally {
            busy = false;
            setRunEnabled(!!picked);
        }
    }
    runBtn.addEventListener('click', run);

    try { LabBoot.progress(1, '就绪'); setTimeout(LabBoot.hide, 300); } catch (e) {}
})();

/* i18n: EN sweep for dynamically rendered strings (sts i18n campaign) */
(function () {
    if (!window.__stsEN) return;
    var EN = {
        '不支持的格式 .': 'Unsupported format .',
        '转换后显示在这里': 'Result shows up here',
        '模型包下载失败 ': 'Model pack download failed ', '模型包为空': 'Model pack is empty',
        '模型缺失 ': 'Model missing ', '准备模型…': 'Preparing model…',
        '下载模型 ': 'Downloading model ', '正在转换…': 'Converting…',
        '完成，可下载 PNG': 'Done - PNG ready to download',
        '出错了：': 'Something went wrong: ', '就绪': 'Ready'
    };
    var busy = false;
    function sweep() {
        var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var n;
        while ((n = w.nextNode())) {
            var k = n.nodeValue.trim();
            if (k && EN[k] !== undefined) n.nodeValue = n.nodeValue.replace(k, EN[k]);
        }
    }
    try { sweep(); } catch (e) {}
    window.addEventListener('load', function () {
        try { sweep(); } catch (e) {}
        setTimeout(function () { try { sweep(); } catch (e) {} }, 900);
    });
    try {
        new MutationObserver(function () {
            if (busy) return;
            busy = true;
            try { sweep(); } catch (e) {} finally { busy = false; }
        }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
})();
