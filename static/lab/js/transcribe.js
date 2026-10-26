var LabPiko = window.LabPiko || { set: function () {} };
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var dz = $('dropzone'), fileInput = $('fileInput'), chip = $('fileChip'),
        fcName = $('fcName'), fcDur = $('fcDur'), fcX = $('fcX'), recBtn = $('recBtn'),
        langSel = $('langSel'), runBtn = $('runBtn'), modelSel = $('modelSel'), modelHint = $('modelHint'),
        statusLine = $('statusLine'), statusText = $('statusText'), bar = $('statusBar'), barFill = $('barFill'),
        segList = $('segList'), empty = $('emptyState'),
        btnCopy = $('btnCopy'), btnTxt = $('btnTxt'), btnSrt = $('btnSrt');

    var audioData = null;
    var audioDuration = 0;
    var fileName = '';
    var busy = false;
    var ready = false;
    var pendingSwitch = false;
    var lastResult = null;
    var MAX_SECONDS = 300;
    var LANGS = { auto: null, zh: 'chinese', en: 'english', ja: 'japanese', ko: 'korean', fr: 'french', de: 'german', es: 'spanish', ru: 'russian' };
    var MODEL_MAP = { tiny: 'Xenova/whisper-tiny', base: 'Xenova/whisper-base', small: 'Xenova/whisper-small' };
    var MODEL_SIZE = { tiny: '42MB', base: '78MB', small: '242MB' };
    var MODEL_NAME = { tiny: '速度优先', base: '均衡', small: '精准优先' };

    var engine = { worker: null, mainPipe: null, mainPath: false, model: null };

    function currentModelId() {
        return MODEL_MAP[modelSel.value] || MODEL_MAP.tiny;
    }

    function savedModel() {
        try {
            var v = localStorage.getItem('lab_model');
            return MODEL_MAP[v] ? v : null;
        } catch (e) { return null; }
    }

    function updateHint() {
        if (modelHint) {
            modelHint.textContent = '当前模型 ' + MODEL_NAME[modelSel.value] + '（' + MODEL_SIZE[modelSel.value] + '），第一次使用需下载，之后自动缓存。';
        }
    }

    function setStatus(cls) {
        statusLine.classList.remove('err', 'ok');
        if (cls) statusLine.classList.add(cls);
    }

    function hideBar() { bar.classList.remove('show'); }

    function engineOnMessage(m) {
        var d = m.data || m;
        if (d.type === 'phase') {
            if (d.phase === 'engine') {
                showStatus('正在加载引擎', null);
                LabBoot.phase('正在加载引擎');
            } else if (d.phase === 'download') {
                showStatus('正在下载模型，只需一次', 0.01);
                LabBoot.phase('正在下载模型');
            } else if (d.phase === 'fallback-mirror') {
                showStatus('本地资源缺失，改用镜像源', null);
                LabBoot.phase('切换镜像源');
            } else if (d.phase === 'idb') {
                showStatus('从本地缓存载入模型', null);
                LabBoot.phase('本地缓存载入');
            } else if (d.phase === 'init') {
                showStatus('正在初始化模型', null);
                LabBoot.progress(1, '准备就绪');
            }
        } else if (d.type === 'progress') {
            var pct = Math.round(d.ratio * 100);
            showStatus('正在下载模型 ' + pct + '%（' + LabFmt.size(d.loaded) + ' / ' + LabFmt.size(d.total) + '），只需一次', d.ratio);
            LabBoot.progress(d.ratio, '正在下载模型');
        } else if (d.type === 'ready') {
            var wasSwitch = pendingSwitch;
            pendingSwitch = false;
            ready = true;
            hideBar();
            showStatus('就绪，拖入音频即可开始', null);
            setStatus('ok');
            LabBoot.progress(1, '就绪');
            setTimeout(LabBoot.hide, 350);
            setRunEnabled(true);
        } else if (d.type === 'seg') {
            LabPiko.set('load');
            showStatus('正在转写 ' + d.done + ' / ' + d.total, d.total ? d.done / d.total : null);
        } else if (d.type === 'gen') {
            LabPiko.set('load');
            var ratio = (d.done + Math.min(d.toks / 240, 0.95)) / (d.total || 1);
            var pct2 = Math.min(99, Math.round(ratio * 100));
            showStatus('正在转写 ' + pct2 + '%', ratio);
        } else if (d.type === 'result') {
            busy = false;
            LabPiko.set('idle');
            hideBar();
            showStatus('转写完成，共 ' + d.chunks.length + ' 段', null);
            setStatus('ok');
            lastResult = d;
            renderResult(d);
            runBtn.innerHTML = '<svg class="ic"><use href="#i-wave"/></svg>再转一次';
            setRunEnabled(true);
        } else if (d.type === 'loaderror' || d.type === 'error') {
            if (d.type === 'loaderror' && !engine.mainPath) { fallbackToMain(); return; }
            busy = false;
            LabPiko.set('daze');
            setRunEnabled(true);
            var msg = d.message || '未知错误';
            if (msg.indexOf('was not found locally') !== -1 || msg.indexOf('404') !== -1 || msg.indexOf('Failed to fetch') !== -1) {
                showStatus('模型文件还没准备好，请几分钟后重试', null);
            } else {
                showStatus('出错了：' + msg, null);
            }
            setStatus('err');
            setTimeout(LabBoot.hide, 400);
        }
    }

    function fallbackToMain() {
        engine.mainPath = true;
        if (engine.worker) { try { engine.worker.terminate(); } catch (e) {} engine.worker = null; }
        mainThreadLoad(engine.model || currentModelId());
    }

    async function mainThreadLoad(modelId) {
        try {
            showStatus('正在加载引擎', null);
            var mod = await import('/static/lab/vendor/transformers.web.min.js');
            var forced = new URLSearchParams(location.search).get('origin');
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
            var useMirror = forced === 'mirror' || (forced !== 'self' && await probe(HF_MIRROR + modelId + '/resolve/main/config.json'));
            if (useMirror) {
                mod.env.allowLocalModels = false;
                mod.env.allowRemoteModels = true;
                mod.env.remoteHost = HF_MIRROR;
            } else {
                mod.env.allowLocalModels = true;
                mod.env.allowRemoteModels = false;
                mod.env.localModelPath = '/static/lab/models/';
            }
            var useCdn = forced === 'mirror' || (forced !== 'self' && await probe(ORT_CDN + 'ort-wasm-simd-threaded.jsep.wasm'));
            mod.env.backends.onnx.wasm.wasmPaths = useCdn ? ORT_CDN : '/lab/ort/';
            var SIZE_TABLES = {
                'Xenova/whisper-tiny': {
                    'config.json': 2248, 'generation_config.json': 3716, 'preprocessor_config.json': 339,
                    'tokenizer_config.json': 282683, 'tokenizer.json': 2480466, 'vocab.json': 1036584,
                    'merges.txt': 493869, 'normalizer.json': 52666, 'special_tokens_map.json': 2194,
                    'added_tokens.json': 2082, 'onnx/encoder_model_quantized.onnx': 10124910,
                    'onnx/decoder_model_merged_quantized.onnx': 30727765
                },
                'Xenova/whisper-base': {
                    'config.json': 2248, 'generation_config.json': 3776, 'preprocessor_config.json': 339,
                    'tokenizer_config.json': 282683, 'tokenizer.json': 2480466, 'vocab.json': 1036584,
                    'merges.txt': 493869, 'normalizer.json': 52666, 'special_tokens_map.json': 2194,
                    'added_tokens.json': 2082, 'quant_config.json': 2840, 'quantize_config.json': 2840,
                    'onnx/encoder_model_quantized.onnx': 23200850, 'onnx/decoder_model_merged_quantized.onnx': 53707539
                },
                'Xenova/whisper-small': {
                    'config.json': 2232, 'generation_config.json': 3837, 'preprocessor_config.json': 339,
                    'tokenizer_config.json': 282683, 'tokenizer.json': 2480466, 'vocab.json': 1036584,
                    'merges.txt': 493869, 'normalizer.json': 52666, 'special_tokens_map.json': 2194,
                    'added_tokens.json': 2082, 'quant_config.json': 2840, 'quantize_config.json': 2840,
                    'onnx/encoder_model_quantized.onnx': 92324809, 'onnx/decoder_model_merged_quantized.onnx': 156780950
                }
            };
            var FILE_SIZES = SIZE_TABLES[modelId] || SIZE_TABLES['Xenova/whisper-tiny'];
            var TOTAL_BYTES = Object.values(FILE_SIZES).reduce(function (a, b) { return a + b; }, 0);
            function mkey(f) {
                var keys = Object.keys(FILE_SIZES);
                for (var i = 0; i < keys.length; i++) {
                    if (f === keys[i] || f.endsWith('/' + keys[i])) return keys[i];
                }
                return null;
            }
            var loadedMap = new Map();
            engine.mainPipe = await mod.pipeline('automatic-speech-recognition', modelId, {
                dtype: 'q8',
                progress_callback: function (data) {
                    if (!data || !data.file) return;
                    var k = mkey(data.file);
                    if (!k) return;
                    if (data.status === 'initiate') {
                        if (!loadedMap.has(k)) loadedMap.set(k, 0);
                        engineOnMessage({ data: { type: 'phase', phase: 'download' } });
                    } else if (data.status === 'progress') {
                        loadedMap.set(k, Math.min(data.loaded || 0, FILE_SIZES[k]));
                    } else if (data.status === 'done') {
                        loadedMap.set(k, FILE_SIZES[k]);
                    } else {
                        return;
                    }
                    var loaded = 0;
                    loadedMap.forEach(function (v) { loaded += v; });
                    engineOnMessage({ data: { type: 'progress', loaded: loaded, total: TOTAL_BYTES, ratio: Math.min(loaded / TOTAL_BYTES, 0.99) } });
                }
            });
            engineOnMessage({ data: { type: 'phase', phase: 'init' } });
            engineOnMessage({ data: { type: 'ready' } });
        } catch (err) {
            engineOnMessage({ data: { type: 'error', message: String(err && err.message || err) } });
        }
    }

    function startEngine(modelId) {
        engine.model = modelId;
        LabBoot.drive();
        var origin = new URLSearchParams(location.search).get('origin') || 'auto';
        try {
            var w = new Worker('/static/lab/js/transcribe.worker.js?v=' + (window.LAB_V || Date.now()), { type: 'module' });
            var failed = false;
            w.onerror = function () {
                if (!failed) { failed = true; if (!engine.mainPath) fallbackToMain(); }
            };
            w.onmessage = function (m) {
                if (m.data && m.data.type === 'loaderror') failed = true;
                engineOnMessage(m);
            };
            w.postMessage({ type: 'load', origin: origin, model: modelId });
            engine.worker = w;
        } catch (e) {
            fallbackToMain();
        }
    }

    function switchModel(modelId) {
        if (busy) return false;
        pendingSwitch = true;
        ready = false;
        setRunEnabled(true);
        showStatus('正在切换模型', null);
        setStatus(null);
        if (engine.mainPath) {
            location.reload();
            return true;
        }
        try { engine.worker.terminate(); } catch (e) {}
        engine.worker = null;
        engine.mainPipe = null;
        startEngine(modelId);
        return true;
    }

    async function engineRun(audio, langCode, modelId) {
        if (engine.worker) {
            var send = audio.slice(0);
            engine.worker.postMessage({ type: 'run', audio: send, language: langCode, task: 'transcribe', duration: audioDuration, model: modelId }, [send.buffer]);
        } else {
            var opts = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: 'transcribe' };
            if (langCode) opts.language = langCode;
            var total = Math.max(1, Math.ceil(audioDuration / 30)), n = 0;
            opts.chunk_callback = function () { n++; engineOnMessage({ data: { type: 'seg', done: n, total: total } }); };
            var out = await engine.mainPipe(audio, opts);
            var chunks = (out.chunks || []).map(function (c) {
                return { start: (c.timestamp && c.timestamp[0]) || 0, end: (c.timestamp && c.timestamp[1]) || 0, text: (c.text || '').trim() };
            });
            engineOnMessage({ data: { type: 'result', text: (out.text || '').trim(), chunks: chunks } });
        }
    }

    async function prepareFile(file) {
        if (busy) return;
        try {
            showStatus('正在读取音频', null);
            var buf = await file.arrayBuffer();
            var AC = window.AudioContext || window.webkitAudioContext;
            var ac = new AC();
            var decoded = await ac.decodeAudioData(buf);
            ac.close();
            var duration = decoded.duration;
            var trimmed = false;
            if (duration > MAX_SECONDS) { duration = MAX_SECONDS; trimmed = true; }
            var offline = new OfflineAudioContext(1, Math.ceil(duration * 16000), 16000);
            var src = offline.createBufferSource();
            src.buffer = decoded;
            src.connect(offline.destination);
            src.start(0, 0, duration);
            var rendered = await offline.startRendering();
            audioData = rendered.getChannelData(0).slice(0);
            audioDuration = duration;
            fileName = file.name || 'recording';
            fcName.textContent = fileName;
            fcDur.textContent = LabFmt.time(duration);
            chip.classList.add('show');
            runBtn.innerHTML = '<svg class="ic"><use href="#i-wave"/></svg>开始转写';
            if (trimmed) {
                showStatus('音频超过五分钟，只取前五分钟', null);
            } else {
                showStatus('读取完成，点开始转写', null);
            }
            setRunEnabled(true);
        } catch (err) {
            showStatus('打不开这个音频文件', null);
            setStatus('err');
        }
    }

    function renderResult(d) {
        empty.style.display = 'none';
        segList.innerHTML = '';
        var frag = document.createDocumentFragment();
        d.chunks.forEach(function (c) {
            if (!c.text) return;
            var seg = document.createElement('div');
            seg.className = 'seg';
            var ts = document.createElement('span');
            ts.className = 'ts';
            ts.textContent = LabFmt.smart(c.start) + ' - ' + LabFmt.smart(c.end == null ? c.start : c.end);
            var tx = document.createElement('span');
            tx.className = 'tx';
            tx.textContent = c.text;
            seg.appendChild(ts); seg.appendChild(tx);
            frag.appendChild(seg);
        });
        segList.appendChild(frag);
        btnCopy.disabled = btnTxt.disabled = btnSrt.disabled = false;
    }

    function buildTxt() {
        if (!lastResult) return '';
        var lines = lastResult.chunks.filter(function (c) { return c.text; }).map(function (c) {
            return '[' + LabFmt.smart(c.start) + '] ' + c.text;
        });
        return lines.length ? lines.join('\n') : (lastResult.text || '');
    }

    function buildSrt() {
        if (!lastResult) return '';
        var out = [], i = 0;
        lastResult.chunks.forEach(function (c) {
            if (!c.text) return;
            i++;
            var end = (c.end == null || c.end <= c.start) ? c.start + 2 : c.end;
            out.push(i + '\n' + LabFmt.srt(c.start) + ' --> ' + LabFmt.srt(end) + '\n' + c.text + '\n');
        });
        return out.join('\n');
    }

    function showStatus(text, ratio) {
        statusText.textContent = text;
        if (ratio == null) { bar.classList.remove('show'); return; }
        bar.classList.add('show');
        barFill.style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%';
    }

    function setRunEnabled(on) {
        runBtn.disabled = !(on && audioData && !busy && ready);
    }

    dz.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) prepareFile(fileInput.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) prepareFile(f);
    });
    fcX.addEventListener('click', function () {
        audioData = null; audioDuration = 0; fileName = '';
        chip.classList.remove('show');
        fileInput.value = '';
        setRunEnabled(true);
    });

    modelSel.addEventListener('change', function () {
        var prev = engine.model ? Object.keys(MODEL_MAP).find(function (k) { return MODEL_MAP[k] === engine.model; }) : null;
        try { localStorage.setItem('lab_model', modelSel.value); } catch (e) {}
        updateHint();
        if (!switchModel(currentModelId())) {
            if (prev) modelSel.value = prev;
        }
    });

    runBtn.addEventListener('click', async function () {
        if (busy || !audioData) return;
        busy = true;
        runBtn.disabled = true;
        empty.style.display = 'none';
        segList.innerHTML = '';
        setStatus(null);
        showStatus('正在转写', 0);
        var langCode = LANGS[langSel.value] || null;
        try {
            await engineRun(audioData, langCode, currentModelId());
        } catch (err) {
            busy = false;
            setRunEnabled(true);
            showStatus('转写失败：' + String(err && err.message || err), null);
            setStatus('err');
        }
    });

    btnCopy.addEventListener('click', function () {
        var t = lastResult ? (lastResult.text || buildTxt()) : '';
        if (!t) return;
        navigator.clipboard.writeText(t).then(function () {
            btnCopy.textContent = '已复制';
            setTimeout(function () { btnCopy.textContent = '复制'; }, 1500);
        });
    });
    btnTxt.addEventListener('click', function () {
        if (lastResult) LabSave((fileName || 'transcript').replace(/\.[^.]+$/, '') + '.txt', buildTxt());
    });
    btnSrt.addEventListener('click', function () {
        if (lastResult) LabSave((fileName || 'transcript').replace(/\.[^.]+$/, '') + '.srt', buildSrt());
    });

    var mediaRec = null, recChunks = [];
    recBtn.addEventListener('click', function () {
        if (mediaRec && mediaRec.state === 'recording') { mediaRec.stop(); return; }
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            recBtn.disabled = true;
            showStatus('这个浏览器不支持录音', null);
            return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            recChunks = [];
            mediaRec = new MediaRecorder(stream);
            mediaRec.ondataavailable = function (e) { if (e.data.size) recChunks.push(e.data); };
            mediaRec.onstop = function () {
                stream.getTracks().forEach(function (t) { t.stop(); });
                recBtn.classList.remove('rec');
                recBtn.innerHTML = '<span class="rec-dot"></span>录音';
                if (!recChunks.length) return;
                var blob = new Blob(recChunks, { type: recChunks[0].type || 'audio/webm' });
                prepareFile(new File([blob], '录音-' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '.webm', { type: blob.type }));
            };
            mediaRec.start();
            recBtn.classList.add('rec');
            recBtn.textContent = '停止录音';
            showStatus('录音中', null);
        }).catch(function (err) {
            showStatus('拿不到麦克风权限', null);
        });
    });

    if (LabEnv.isMobile) {
        var mh = document.getElementById('mobileHint');
        if (mh) mh.style.display = 'block';
    }
    var saved = savedModel();
    if (saved) modelSel.value = saved;
    updateHint();
    startEngine(currentModelId());
})();
