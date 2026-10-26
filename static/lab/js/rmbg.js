var LabPiko = window.LabPiko || { set: function () {} };
(function () {
    'use strict';

    var dropzone = document.getElementById('dropzone');
    var fileInput = document.getElementById('fileInput');
    var fileChip = document.getElementById('fileChip');
    var fileChipName = document.getElementById('fileChipName');
    var runBtn = document.getElementById('runBtn');
    var statusLine = document.getElementById('statusLine');
    var statusText = document.getElementById('statusText');
    var statusBar = document.getElementById('statusBar');
    var barFill = document.getElementById('barFill');
    var cmpRow = document.getElementById('cmpRow');
    var empty = document.getElementById('empty');
    var beforeWrap = document.getElementById('beforeWrap');
    var afterWrap = document.getElementById('afterWrap');
    var compareChk = document.getElementById('compareChk');
    var dlBtn = document.getElementById('dlBtn');

    var currentFile = null;
    var currentSource = null;
    var currentBlob = null;
    var resultPngBlob = null;
    var busy = false;
    var ready = false;

    var engine = { worker: null, mainPath: false, model: 'Xenova/modnet' };

    function showStatus(text, pct) {
        statusLine.style.display = 'block';
        statusText.textContent = text;
        if (pct == null) { statusBar.style.display = 'none'; }
        else { statusBar.style.display = 'block'; barFill.style.width = Math.max(3, Math.min(100, Math.round(pct))) + '%'; }
    }

    function hideStatus() { statusLine.style.display = 'none'; }

    function setRunEnabled(on) {
        runBtn.disabled = !on;
        runBtn.classList.toggle('ui-spin', !on && busy);
    }

    function bootPhase(p, detail) { try { LabBoot.phase(p, detail); } catch (e) {} }
    function bootPush(v) { try { LabBoot.progress(v); } catch (e) {} }

    function engineOnMessage(m) {
        var d = m.data || {};
        if (d.type === 'phase') {
            if (d.phase === 'download') { ready = false; bootPhase('download'); showStatus('正在下载模型', 0); }
            else if (d.phase === 'idb') { bootPhase('download'); showStatus('命中本地缓存', 100); }
            else if (d.phase === 'fallback-mirror') { bootPhase('init'); showStatus('主源不可用，切换镜像', null); }
            else if (d.phase === 'run') { showStatus('正在抠图', null); }
        } else if (d.type === 'progress') {
            var pct = d.ratio != null ? d.ratio * 100 : (d.total ? (d.loaded || 0) / d.total * 100 : 0);
            bootPush(pct);
            showStatus('正在下载模型', pct);
        } else if (d.type === 'origin') {
            var src = d.model === 'npm' ? 'npmmirror' : (d.model === 'mirror' ? 'hf-mirror' : '本站');
            showStatus('模型源 ' + src + ' / 运行时 ' + (d.wasm === 'cdn' ? 'CDN' : '本站'), null);
        } else if (d.type === 'ready') {
            ready = true;
            hideStatus();
            setTimeout(LabBoot.hide, 300);
            if (currentSource) setRunEnabled(true);
        } else if (d.type === 'result') {
            handleResult(d);
        } else if (d.type === 'error') {
            fail(d.message);
        }
    }

    function fail(msg) {
        busy = false;
        LabPiko.set('daze');
        setRunEnabled(false);
        var text = '出错了：' + msg;
        if (String(msg).indexOf('404') !== -1 || String(msg).indexOf('Failed to fetch') !== -1) {
            text = '模型文件还没准备好，请几分钟后重试';
        }
        showStatus(text, null);
        setTimeout(LabBoot.hide, 400);
    }

    function startEngine() {
        LabBoot.drive();
        var origin = new URLSearchParams(location.search).get('origin') || 'auto';
        try {
            var w = new Worker('/static/lab/js/rmbg.worker.js?v=' + (window.LAB_V || Date.now()), { type: 'module' });
            var failed = false;
            w.onerror = function () {
                if (!failed) { failed = true; if (!engine.mainPath) fallbackToMain(); }
            };
            w.onmessage = function (m) {
                if (m.data && m.data.type === 'loaderror') failed = true;
                engineOnMessage(m);
            };
            w.postMessage({ type: 'load', origin: origin, model: engine.model });
            engine.worker = w;
        } catch (e) {
            fallbackToMain();
        }
    }

    function fallbackToMain() {
        engine.mainPath = true;
        if (engine.worker) { try { engine.worker.terminate(); } catch (e) {} engine.worker = null; }
        mainThreadInit();
    }

    async function mainThreadInit() {
        try {
            showStatus('正在加载引擎', null);
            var mod = await import('/static/lab/vendor/transformers.web.min.js');
            var origin = new URLSearchParams(location.search).get('origin') || 'auto';
            var HF_MIRROR = 'https://hf-mirror.com/';
            var ORT_CDN = 'https://registry.npmmirror.com/onnxruntime-web/1.22.0-dev.20250409-89f8206ba4/files/dist/';
            async function probe(url) {
                try {
                    var ctrl = new AbortController();
                    var timer = setTimeout(function () { ctrl.abort(); }, 3000);
                    var r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, cache: 'no-store' });
                    clearTimeout(timer);
                    return r.ok;
                } catch (e) { return false; }
            }
            var useCdn = await probe(ORT_CDN + 'ort-wasm-simd-threaded.jsep.mjs');
            mod.env.backends.onnx.wasm.wasmPaths = useCdn ? ORT_CDN : '/lab/ort/';
            mod.env.allowLocalModels = true;
            mod.env.useBrowserCache = false;
            var useMirror = origin === 'mirror' || (origin !== 'self' && await probe(HF_MIRROR + engine.model + '/resolve/main/config.json'));
            if (useMirror) { mod.env.remoteHost = HF_MIRROR; mod.env.remotePathTemplate = '{model}/resolve/{revision}/'; }
            mod.env.localModelPath = '/static/lab/models/';
            showStatus('正在初始化模型', null);
            removerMain = await mod.pipeline('background-removal', engine.model, { dtype: 'q8' });
            ready = true;
            hideStatus();
            setTimeout(LabBoot.hide, 300);
            if (currentSource) setRunEnabled(true);
        } catch (err) {
            fail(String(err && err.message || err));
        }
    }

    var removerMain = null;

    function checker(el) {
        el.style.backgroundImage = 'linear-gradient(45deg,#20242c 25%,transparent 25%),linear-gradient(-45deg,#20242c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#20242c 75%),linear-gradient(-45deg,transparent 75%,#20242c 75%)';
        el.style.backgroundSize = '18px 18px';
        el.style.backgroundPosition = '0 0,0 9px,9px -9px,-9px 0';
        el.style.backgroundColor = '#181b22';
    }

    var lastBeforeNode = null;

    function showPreview(beforeNode, afterNode) {
        empty.style.display = 'none';
        cmpRow.style.display = 'grid';
        if (beforeNode) {
            lastBeforeNode = beforeNode;
            beforeNode.style.maxWidth = '100%';
            beforeNode.style.maxHeight = '100%';
            beforeNode.style.objectFit = 'contain';
            beforeWrap.innerHTML = '';
            beforeWrap.appendChild(beforeNode);
        }
        if (afterNode) {
            afterNode.style.maxWidth = '100%';
            afterNode.style.maxHeight = '100%';
            afterNode.style.objectFit = 'contain';
            afterWrap.innerHTML = '';
            afterWrap.appendChild(afterNode);
        }
        applyCompare();
    }

    function applyCompare() {
        if (!compareChk) return;
        beforeWrap.style.display = compareChk.checked ? 'block' : 'none';
        afterWrap.style.display = compareChk.checked ? 'none' : 'block';
    }

    function decodeToSource(src, onOk, onFail) {
        var img = new Image();
        img.onload = function () {
            var w = img.naturalWidth || 1;
            var h = img.naturalHeight || 1;
            if (window.createImageBitmap) {
                createImageBitmap(img).then(function (bmp) {
                    onOk(bmp, bmp.width, bmp.height);
                }, function () {
                    onOk(img, w, h);
                });
            } else {
                onOk(img, w, h);
            }
        };
        img.onerror = onFail;
        img.src = src;
    }

    function setFile(f) {
        if (!f) return;
        var looksImage = /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name) || !f.type;
        if (!looksImage) { showStatus('请选择图片文件', null); return; }
        currentFile = f;
        currentBlob = null;
        resultPngBlob = null;
        dlBtn.disabled = true;
        if (fileChip) {
            fileChip.style.display = 'flex';
            if (fileChipName) fileChipName.textContent = f.name + '（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
        }

        var url = URL.createObjectURL(f);
        decodeToSource(url, function (source, w, h) {
            currentSource = source;
            var cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(source, 0, 0, w, h);
            showPreview(cv, null);
            setRunEnabled(ready);
        }, function () {
            var fr = new FileReader();
            fr.onload = function () {
                decodeToSource(fr.result, function (source, w, h) {
                    currentSource = source;
                    var cv = document.createElement('canvas');
                    cv.width = w; cv.height = h;
                    cv.getContext('2d').drawImage(source, 0, 0, w, h);
                    showPreview(cv, null);
                    setRunEnabled(ready);
                }, function () {
                    showStatus('图片读取失败，请换一张 PNG 或 JPG 试试', null);
                });
            };
            fr.onerror = function () { showStatus('图片读取失败，请换一张 PNG 或 JPG 试试', null); };
            fr.readAsDataURL(f);
        });
    }

    function sourceToBlob(cb) {
        if (currentBlob) { cb(currentBlob); return; }
        var cv = document.createElement('canvas');
        var w = currentSource.naturalWidth || currentSource.width;
        var h = currentSource.naturalHeight || currentSource.height;
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(currentSource, 0, 0, w, h);
        cv.toBlob(function (b) { currentBlob = b; cb(b); }, 'image/png');
    }

    async function run() {
        if (busy || !currentSource) return;
        if (!ready) { showStatus('模型还没就绪，稍等一下', null); return; }
        busy = true;
        LabPiko.set('load');
        setRunEnabled(false);
        showStatus('正在抠图', null);
        try {
            sourceToBlob(function (blob) {
                if (engine.mainPath) {
                    runMain(blob).then(function (img) {
                        handleResult({ width: img.width, height: img.height, channels: img.channels, dataURL: null, data: img.data });
                    }, function (e) { fail(String(e && e.message || e)); });
                } else {
                    engine.worker.postMessage({ type: 'run', model: engine.model, image: blob });
                }
            });
        } catch (e) {
            fail(String(e && e.message || e));
        }
    }

    async function runMain(blob) {
        var mod = await import('/static/lab/vendor/transformers.web.min.js');
        var out = await removerMain(blob);
        var res = Array.isArray(out) ? out[0] : out;
        return res.mask || res.image || res;
    }

    function handleResult(d) {
        busy = false;
        LabPiko.set('idle');
        var after = document.createElement('img');
        after.onload = function () {
            showStatus('完成，可下载 PNG', null);
            setTimeout(hideStatus, 1200);
            dlBtn.disabled = false;
        };
        after.onerror = function () {
            showStatus('结果解码失败', null);
            dlBtn.disabled = false;
        };
        if (d.dataURL) {
            after.src = d.dataURL;
            showPreview(null, after);
            fetch(d.dataURL).then(function (r) { return r.blob(); }).then(function (b) { resultPngBlob = b; }).catch(function () {});
        } else if (window.ImageData && d.data) {
            var arr = new Uint8ClampedArray(d.data);
            var need = d.width * d.height * 4;
            if (arr.length !== need) {
                var fixed = new Uint8ClampedArray(need);
                fixed.set(arr.subarray(0, Math.min(arr.length, need)));
                arr = fixed;
            }
            var cv = document.createElement('canvas');
            cv.width = d.width; cv.height = d.height;
            cv.getContext('2d').putImageData(new ImageData(arr, d.width, d.height), 0, 0);
            after.src = cv.toDataURL('image/png');
            showPreview(null, after);
            cv.toBlob(function (b) { if (b) resultPngBlob = b; }, 'image/png');
        } else {
            fail('结果为空');
        }
    }

    function download() {
        if (!resultPngBlob) return;
        var a = document.createElement('a');
        a.href = URL.createObjectURL(resultPngBlob);
        var base = (currentFile && currentFile.name || 'image').replace(/\.[^.]+$/, '');
        a.download = base + '_rmbg.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('drag'); });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag'); });
    dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('drag');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
    });
    if (compareChk) compareChk.addEventListener('change', applyCompare);
    runBtn.addEventListener('click', run);
    dlBtn.addEventListener('click', download);

    setRunEnabled(false);
    startEngine();
})();
