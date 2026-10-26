var LabPiko = window.LabPiko || { set: function () {} };
(function () {
    const $ = (id) => document.getElementById(id);
    const dz = $('dropzone'), fileInput = $('fileInput'), chip = $('fileChip'),
        fcName = $('fcName'), fcX = $('fcX'),
        runBtn = $('runBtn'), statusText = $('statusText'), barFill = $('barFill'),
        empty = $('emptyState'), textBox = $('textBox'), imgPrev = $('imgPrev'), canvas = $('boxesCanvas'),
        btnCopy = $('btnCopy'), btnTxt = $('btnTxt'), modelHint = $('modelHint');

    const IDB_NAME = 'sts-lab-models';
    const IDB_STORE = 'tgz';
    const CACHE_KEYS = {
        det: 'ocr|ppocrv4|det',
        rec: 'ocr|ppocrv4|rec',
        dict: 'ocr|ppocrv4|dict'
    };
    const FILES = {
        det: 'https://modelscope.cn/models/deadash/paddleocr/resolve/master/ch_PP-OCRv4_det_infer.onnx',
        rec: 'https://modelscope.cn/models/deadash/paddleocr/resolve/master/ch_PP-OCRv4_rec_infer.onnx',
        dict: 'https://modelscope.cn/models/deadash/paddleocr/resolve/master/ppocr_keys_v1.txt'
    };
    const TOTAL_BYTES = 4745517 + 10822323 + 26249;

    let picked = null;
    let enginePromise = null;
    let ocrInstance = null;
    let lastText = '';

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

    function showStatus(text, ratio) {
        statusText.textContent = text;
        if (ratio == null) {
            barFill.style.width = '36%';
            barFill.parentElement.classList.add('indeterminate');
        } else {
            barFill.parentElement.classList.remove('indeterminate');
            barFill.style.width = Math.min(100, ratio * 100).toFixed(1) + '%';
        }
    }

    function fmtSize(b) {
        if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
        if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
        return b + ' B';
    }

    async function fetchWithCache(url, key, onProgress, base, total) {
        const hit = await idbGet(key);
        if (hit) return hit;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(url.split('/').pop() + ' ' + resp.status);
        const reader = resp.body.getReader();
        const chunks = [];
        let got = 0;
        for (;;) {
            const r = await reader.read();
            if (r.done) break;
            chunks.push(r.value);
            got += r.value.length;
            if (onProgress) onProgress(base + got, total);
        }
        const blob = new Blob(chunks);
        const buf = await blob.arrayBuffer();
        idbPut(key, buf);
        return buf;
    }

    async function prepareEngine() {
        if (ocrInstance) return ocrInstance;
        if (enginePromise) return enginePromise;
        enginePromise = (async () => {
            LabBoot.phase('正在加载引擎');
            LabBoot.drive();
            showStatus('正在加载运算库…', null);
            const mod = await import('/static/lab/vendor/ocr/ort.mjs');
            showStatus('正在加载图像库…', null);
            const cvmod = await import('/static/lab/vendor/ocr/opencv.mjs');
            await cvmod.initCV();
            const clipMod = await import('/static/lab/vendor/ocr/clipper.mjs');
            window.ClipperLib = window.ClipperLib || null;
            const clipScript = document.createElement('script');
            clipScript.src = '/static/lab/vendor/ocr/_clipper_cjs.js';
            await new Promise(function (res, rej) {
                clipScript.onload = res;
                clipScript.onerror = function () { rej(new Error('clipper 加载失败')); };
                document.head.appendChild(clipScript);
            });
            let cached = 0;
            for (const k of Object.keys(CACHE_KEYS)) {
                if (await idbGet(CACHE_KEYS[k])) cached++;
            }
            if (cached === 3) {
                showStatus('命中本机缓存', 1);
                term('模型来自本机缓存，无需下载');
            } else {
                term('首次使用下载约 15MB 模型（之后走本机缓存）');
            }
            let done = 0;
            const onProg = function (got, total) {
                showStatus('正在下载模型 ' + fmtSize(got) + ' / ' + fmtSize(total), got / total);
                LabBoot.progress(got / total, '正在下载模型 ' + fmtSize(got) + ' / ' + fmtSize(total));
            };
            const [detBuf, recBuf, dictText] = await Promise.all([
                fetchWithCache(FILES.det, CACHE_KEYS.det, onProg, 0, TOTAL_BYTES),
                fetchWithCache(FILES.rec, CACHE_KEYS.rec, onProg, 0, TOTAL_BYTES),
                fetchWithCache(FILES.dict, CACHE_KEYS.dict, onProg, 0, TOTAL_BYTES).then(function (b) { return new TextDecoder().decode(b); })
            ]);
            showStatus('正在初始化模型…', null);
            LabBoot.progress(1, '正在初始化');
            const ort = window.ort;
            const detSession = await ort.InferenceSession.create(detBuf, { executionProviders: ['wasm'] });
            const recSession = await ort.InferenceSession.create(recBuf, { executionProviders: ['wasm'] });
            const dictLines = dictText.split('\n');

            const instance = {
                ort: ort,
                detSession: detSession,
                recSession: recSession,
                dict: dictLines
            };
            ocrInstance = instance;
            showStatus('就绪', 1);
            LabBoot.hide();
            return instance;
        })().catch(function (err) {
            enginePromise = null;
            showStatus('引擎加载失败', 0);
            LabBoot.hide();
            throw err;
        });
        return enginePromise;
    }

    function term(text) {
        const el = document.getElementById('ocrLog');
        if (el) {
            const d = document.createElement('div');
            d.textContent = text;
            el.appendChild(d);
        }
    }

    function preprocess(canvas) {
        const ctx = canvas.getContext('2d');
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return img;
    }

    async function runDet(instance, imageData) {
        const { ort } = instance;
        let w = imageData.width, h = imageData.height;
        const maxSide = 960;
        let scale = 1;
        if (Math.max(w, h) > maxSide) scale = maxSide / Math.max(w, h);
        const tw = Math.max(32, Math.round(w * scale / 32) * 32);
        const th = Math.max(32, Math.round(h * scale / 32) * 32);
        const c2 = document.createElement('canvas');
        c2.width = tw; c2.height = th;
        const c2ctx = c2.getContext('2d');
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        tmp.getContext('2d').putImageData(imageData, 0, 0);
        c2ctx.drawImage(tmp, 0, 0, tw, th);
        const resized = c2ctx.getImageData(0, 0, tw, th);
        const px = tw * th;
        const chB = new Float32Array(px), chG = new Float32Array(px), chR = new Float32Array(px);
        for (let i = 0, j = 0; i < resized.data.length; i += 4, j++) {
            chR[j] = resized.data[i] / 255;
            chG[j] = resized.data[i + 1] / 255;
            chB[j] = resized.data[i + 2] / 255;
        }
        const floatData = new Float32Array(px * 3);
        floatData.set(chB, 0); floatData.set(chG, px); floatData.set(chR, px * 2);
        const tensor = new ort.Tensor('float32', floatData, [1, 3, th, tw]);
        const output = await instance.detSession.run({ [instance.detSession.inputNames[0]]: tensor });
        const out = output[instance.detSession.outputNames[0]];
        return { data: out.data, dims: out.dims, tw: tw, th: th, scale: scale, origW: w, origH: h };
    }

    function detPostprocess(det) {
        const oh = det.dims[2], ow = det.dims[3];
        const prob = det.data;
        const sx = det.tw / ow, sy = det.th / oh;
        const visited = new Uint8Array(ow * oh);
        const boxes = [];
        const TH = 0.3;
        const stack = [];
        for (let seed = 0; seed < ow * oh; seed++) {
            if (visited[seed] || prob[seed] <= TH) continue;
            stack.length = 0;
            stack.push(seed);
            visited[seed] = 1;
            let minX = ow, minY = oh, maxX = 0, maxY = 0, cnt = 0;
            while (stack.length) {
                const p = stack.pop();
                const px = p % ow, py = (p - px) / ow;
                cnt++;
                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
                if (py < minY) minY = py;
                if (py > maxY) maxY = py;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = px + dx, ny = py + dy;
                        if (nx < 0 || ny < 0 || nx >= ow || ny >= oh) continue;
                        const np = ny * ow + nx;
                        if (visited[np] || prob[np] <= TH) continue;
                        visited[np] = 1;
                        stack.push(np);
                    }
                }
            }
            const bx = minX * sx, by = minY * sy;
            const bw = (maxX - minX) * sx, bh = (maxY - minY) * sy;
            if (cnt >= 20 && bw > 12 && bh > 8 && bw / bh < 30) {
                boxes.push({ x: bx, y: by, w: bw, h: bh });
            }
        }
        return boxes;
    }

    async function runRec(instance, srcCanvas, box) {
        const { ort } = instance;
        const pad = Math.max(4, box.h * 0.15);
        const sx = Math.max(0, box.x - pad), sy = Math.max(0, box.y - pad);
        const sw = Math.min(srcCanvas.width - sx, box.w + pad * 2), sh = Math.min(srcCanvas.height - sy, box.h + pad * 2);
        if (sw < 4 || sh < 4) return { text: '', mean: 0 };
        const rh = 48;
        let rw = Math.max(16, Math.round(sw * rh / sh));
        const RW_MAX = 640;
        rw = Math.min(rw, RW_MAX);
        const c = document.createElement('canvas');
        c.width = rw; c.height = rh;
        const cctx = c.getContext('2d');
        cctx.imageSmoothingEnabled = true;
        cctx.imageSmoothingQuality = 'high';
        cctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, rw, rh);
        const img = cctx.getImageData(0, 0, c.width, rh);
        const n = rh * c.width;
        const chB2 = new Float32Array(n), chG2 = new Float32Array(n), chR2 = new Float32Array(n);
        for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
            chR2[j] = img.data[i] / 255;
            chG2[j] = img.data[i + 1] / 255;
            chB2[j] = img.data[i + 2] / 255;
        }
        const floatData = new Float32Array(n * 3);
        floatData.set(chB2, 0); floatData.set(chG2, n); floatData.set(chR2, n * 2);
        const tensor = new ort.Tensor('float32', floatData, [1, 3, rh, c.width]);
        const output = await instance.recSession.run({ [instance.recSession.inputNames[0]]: tensor });
        const out = output[instance.recSession.outputNames[0]];
        const predLen = out.dims[2];
        const dict = instance.dict;
        const ignored = [0];
        const chars = [];
        const confs = [];
        for (let i = 0; i < out.dims[1]; i++) {
            const base = i * predLen;
            let maxV = -Infinity, maxI = 0;
            for (let k = 0; k < predLen; k++) {
                const v = out.data[base + k];
                if (v > maxV) { maxV = v; maxI = k; }
            }
            if (ignored.indexOf(maxI) >= 0) continue;
            if (i > 0 && chars._lastIdx === maxI) continue;
            chars._lastIdx = maxI;
            const ch = dict[maxI - 1];
            if (ch) { chars.push(ch); confs.push(maxV); }
        }
        const mean = confs.length ? confs.reduce(function (a, b) { return a + b; }, 0) / confs.length : 0;
        return { text: chars.join(''), mean: mean };
    }

    function drawBoxes(boxes, scaleInfo) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = imgPrev.naturalWidth;
        canvas.height = imgPrev.naturalHeight;
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.9)';
        ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.font = Math.max(12, canvas.width / 40) + 'px monospace';
        boxes.forEach(function (b, i) {
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            ctx.fillStyle = 'rgba(52, 211, 153, 0.85)';
            ctx.fillText(String(i + 1), b.x + 2, Math.max(14, b.y - 4));
        });
    }

    async function run() {
        if (!picked || runBtn.disabled) return;
        runBtn.disabled = true;
        runBtn.classList.add('ui-spin');
        LabPiko.set('load');
        showStatus('正在识别…', null);
        empty.style.display = 'none';
        textBox.textContent = '';
        lastText = '';
        const t0 = Date.now();
        try {
            const inst = await prepareEngine();
            const bitmap = await createImageBitmap(picked);
            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = bitmap.width;
            srcCanvas.height = bitmap.height;
            srcCanvas.getContext('2d').drawImage(bitmap, 0, 0);
            const imageData = srcCanvas.getContext('2d').getImageData(0, 0, srcCanvas.width, srcCanvas.height);
            showStatus('正在检测文字区域…', 0.2);
            await new Promise(function (r) { setTimeout(r, 30); });
            const det = await runDet(inst, imageData);
            showStatus('检测完成，解析区域…', 0.35);
            await new Promise(function (r) { setTimeout(r, 30); });
            const boxes = detPostprocess(det);
            boxes.sort(function (a, b) { return (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x; });
            showStatus('检测到 ' + boxes.length + ' 块区域，正在识别文字…', 0.5);
            await new Promise(function (r) { setTimeout(r, 30); });
            const results = [];
            for (let i = 0; i < boxes.length; i++) {
                const r = await runRec(inst, srcCanvas, boxes[i]);
                if (r.text && r.mean > 0.3) results.push(r);
                showStatus('识别中 ' + (i + 1) + ' / ' + boxes.length, 0.5 + 0.5 * (i + 1) / boxes.length);
            }
            lastText = results.map(function (r) { return r.text; }).join('\n');
            textBox.textContent = lastText || '（没有识别到文字，试试更清晰的图）';
            drawBoxes(boxes, det);
            btnCopy.disabled = !lastText;
            btnTxt.disabled = !lastText;
            showStatus('完成 - ' + results.length + ' 段，耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's', 1);
            LabPiko.set('idle');
        } catch (err) {
            LabPiko.set('daze');
            showStatus('识别失败：' + (err && err.message ? err.message : err), 0);
            console.error(err);
        } finally {
            runBtn.disabled = false;
            runBtn.classList.remove('ui-spin');
        }
    }

    function pick(file) {
        if (!file) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].indexOf(ext) < 0) {
            showStatus('不支持的格式 .' + ext, 0);
            return;
        }
        picked = file;
        fcName.textContent = file.name;
        chip.classList.add('show');
        imgPrev.src = URL.createObjectURL(file);
        imgPrev.onload = function () {
            canvas.width = imgPrev.naturalWidth;
            canvas.height = imgPrev.naturalHeight;
        };
        runBtn.disabled = false;
        empty.style.display = 'none';
        var rb = document.getElementById('resultBody');
        if (rb) rb.style.display = '';
        showStatus('待命', null);
    }

    function reset() {
        picked = null;
        chip.classList.remove('show');
        runBtn.disabled = true;
        imgPrev.src = '';
        canvas.width = 0; canvas.height = 0;
        textBox.textContent = '';
        lastText = '';
        btnCopy.disabled = true;
        btnTxt.disabled = true;
        empty.style.display = '';
        var rb2 = document.getElementById('resultBody');
        if (rb2) rb2.style.display = 'none';
        showStatus('选文件后开始', null);
    }

    dz.addEventListener('click', function () { fileInput.click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('drag'); });
    dz.addEventListener('drop', function (e) {
        e.preventDefault();
        dz.classList.remove('drag');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) pick(f);
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) pick(fileInput.files[0]);
        fileInput.value = '';
    });
    fcX.addEventListener('click', reset);
    runBtn.addEventListener('click', run);
    btnCopy.addEventListener('click', function () {
        navigator.clipboard.writeText(lastText).then(function () {
            btnCopy.textContent = '已复制';
            setTimeout(function () { btnCopy.textContent = '复制'; }, 1500);
        });
    });
    btnTxt.addEventListener('click', function () {
        const name = (picked ? picked.name.replace(/\.[^.]+$/, '') : 'ocr') + '.txt';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([lastText], { type: 'text/plain' }));
        a.download = name;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });

    showStatus('待命 - 选图片后开始', null);
    prepareEngine().catch(function (e) {
        term('引擎加载失败：' + (e && e.message ? e.message : e));
    });
})();
