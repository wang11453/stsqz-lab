import { pipeline, env, TextStreamer } from '/static/lab/vendor/transformers.web.min.js';

const HF_MIRROR = 'https://hf-mirror.com/';
const ORT_CDN = 'https://registry.npmmirror.com/onnxruntime-web/1.22.0-dev.20250409-89f8206ba4/files/dist/';
const NPM_SHORT = {
    'Xenova/whisper-tiny': 'https://cdn.npmmirror.com/packages/sts-whisper-tiny/1.0.0/sts-whisper-tiny-1.0.0.tgz',
    'Xenova/whisper-base': 'https://cdn.npmmirror.com/packages/sts-whisper-base/1.0.0/sts-whisper-base-1.0.0.tgz',
    'Xenova/whisper-small': 'https://cdn.npmmirror.com/packages/sts-whisper-small/1.0.0/sts-whisper-small-1.0.0.tgz'
};

const COMMON_JSON = {
    'preprocessor_config.json': 339,
    'tokenizer_config.json': 282683,
    'tokenizer.json': 2480466,
    'vocab.json': 1036584,
    'merges.txt': 493869,
    'normalizer.json': 52666,
    'special_tokens_map.json': 2194,
    'added_tokens.json': 2082
};

const MODELS = {
    'Xenova/whisper-tiny': Object.assign({}, COMMON_JSON, {
        'config.json': 2248,
        'generation_config.json': 3716,
        'onnx/encoder_model_quantized.onnx': 10124910,
        'onnx/decoder_model_merged_quantized.onnx': 30727765
    }),
    'Xenova/whisper-base': Object.assign({}, COMMON_JSON, {
        'config.json': 2248,
        'generation_config.json': 3776,
        'quant_config.json': 2840,
        'quantize_config.json': 2840,
        'onnx/encoder_model_quantized.onnx': 23200850,
        'onnx/decoder_model_merged_quantized.onnx': 53707539
    }),
    'Xenova/whisper-small': Object.assign({}, COMMON_JSON, {
        'config.json': 2232,
        'generation_config.json': 3837,
        'quant_config.json': 2840,
        'quantize_config.json': 2840,
        'onnx/encoder_model_quantized.onnx': 92324809,
        'onnx/decoder_model_merged_quantized.onnx': 156780950
    })
};

const MODEL_SHORT = { 'Xenova/whisper-tiny': 'tiny', 'Xenova/whisper-base': 'base', 'Xenova/whisper-small': 'small' };

let transcriber = null;
let currentModel = null;
let currentRunId = 0;
let loadedMap = new Map();
let currentTotal = 1;
let originMode = 'auto';
let usedMirror = false;

function matchKey(file) {
    const keys = Object.keys(MODELS[currentModel] || {});
    for (const k of keys) {
        if (file === k || file.endsWith('/' + k)) return k;
    }
    return null;
}

function pushProgress() {
    let loaded = 0;
    loadedMap.forEach((v) => { loaded += v; });
    const ratio = Math.min(loaded / currentTotal, 0.99);
    self.postMessage({ type: 'progress', loaded: loaded, total: currentTotal, ratio: ratio });
}

function reportProgress(data) {
    if (!data || !data.file) return;
    const key = matchKey(data.file);
    if (!key) return;
    const size = MODELS[currentModel][key];
    if (data.status === 'initiate') {
        if (!loadedMap.has(key)) loadedMap.set(key, 0);
        self.postMessage({ type: 'phase', phase: 'download', model: MODEL_SHORT[currentModel] });
        pushProgress();
    } else if (data.status === 'progress') {
        loadedMap.set(key, Math.min(data.loaded || 0, size));
        pushProgress();
    } else if (data.status === 'done') {
        loadedMap.set(key, size);
        pushProgress();
    }
}

async function probe(url, timeoutMs) {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(timer);
        return r.ok;
    } catch (e) {
        return false;
    }
}

function parseTar(buf) {
    const files = new Map();
    const enc = new TextDecoder();
    let off = 0;
    while (off + 512 <= buf.length) {
        const hdr = buf.subarray(off, off + 512);
        if (hdr.every((b) => b === 0)) break;
        const nameLen = hdr.subarray(0, 100);
        let name = '';
        for (let i = 0; i < 100 && nameLen[i] !== 0; i++) name += String.fromCharCode(nameLen[i]);
        let sizeStr = '';
        for (let i = 124; i < 136 && hdr[i] !== 0; i++) if (hdr[i] !== 32) sizeStr += String.fromCharCode(hdr[i]);
        const size = parseInt(sizeStr || '0', 8);
        const type = String.fromCharCode(hdr[156]);
        off += 512;
        if (type === 'x' || type === 'g' || type === 'L') {
            off += Math.ceil(size / 512) * 512;
            continue;
        }
        if (type === '0' || type === '\0' || type === '') {
            files.set(name, buf.subarray(off, off + size));
        }
        off += Math.ceil(size / 512) * 512;
    }
    void enc;
    return files;
}

let npmCache = null;

function idbOpen() {
    return new Promise((res, rej) => {
        const rq = indexedDB.open('sts-lab-models', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('tgz');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
    });
}

async function idbGet(modelId) {
    try {
        const db = await idbOpen();
        return await new Promise((res, rej) => {
            const rq = db.transaction('tgz').objectStore('tgz').get(modelId);
            rq.onsuccess = () => res(rq.result || null);
            rq.onerror = () => rej(rq.error);
        });
    } catch (e) {
        return null;
    }
}

async function idbPut(modelId, files) {
    try {
        const db = await idbOpen();
        await new Promise((res, rej) => {
            const tx = db.transaction('tgz', 'readwrite');
            tx.objectStore('tgz').put({ files: files }, modelId);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    } catch (e) {}
}

async function loadNpmTarball(tgzUrl, modelId) {
    const cached = await idbGet(modelId);
    if (cached && Array.isArray(cached.files) && cached.files.length) {
        npmCache = new Map(cached.files);
        self.postMessage({ type: 'phase', phase: 'idb' });
        return;
    }
    const resp = await fetch(tgzUrl, { cache: 'force-cache' });
    if (!resp.ok) throw new Error('tgz ' + resp.status);
    const total = Number(resp.headers.get('Content-Length') || 0);
    let bytes;
    if (resp.body && total) {
        const reader = resp.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            self.postMessage({
                type: 'progress',
                loaded: loaded,
                total: total,
                ratio: Math.min(loaded / total, 0.99)
            });
        }
        const all = new Uint8Array(loaded);
        let pos = 0;
        for (const c of chunks) { all.set(c, pos); pos += c.length; }
        bytes = all;
    } else {
        bytes = new Uint8Array(await resp.arrayBuffer());
    }
    const gunzip = new Uint8Array(await new Response(new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const tarFiles = parseTar(gunzip);
    const map = new Map();
    const marker = 'package/models/';
    for (const [p, content] of tarFiles) {
        const i = p.indexOf(marker);
        if (i !== -1) map.set(p.slice(i + marker.length), content);
    }
    npmCache = map;
    await idbPut(modelId, [...map]);
    self.postMessage({ type: 'origin', npmFiles: map.size });
}

const npmCustomCache = {
    match: async function (key) {
        if (!npmCache) return undefined;
        const k = typeof key === 'string' ? key : (key && key.url) || '';
        const i = k.indexOf('/Xenova/');
        if (i === -1) return undefined;
        const rel = k.slice(i + 1);
        const bytes = npmCache.get(rel);
        if (!bytes) return undefined;
        const ct = rel.endsWith('.json') || rel.endsWith('.txt') ? 'application/json' : 'application/octet-stream';
        return new Response(bytes.slice(0), { headers: { 'Content-Type': ct } });
    },
    put: async function () {}
};

async function setupEnv(forced, modelId) {
    originMode = forced || 'auto';
    let npmOk = false;
    let idbHit = false;
    if (originMode !== 'self' && originMode !== 'mirror') {
        const cached = await idbGet(modelId);
        if (cached && Array.isArray(cached.files) && cached.files.length) {
            idbHit = true;
            npmOk = true;
        } else {
            npmOk = await probe(NPM_SHORT[modelId], 2500);
        }
    }
    if (npmOk) {
        await loadNpmTarball(NPM_SHORT[modelId], modelId);
        env.useBrowserCache = false;
        env.useCustomCache = true;
        env.customCache = npmCustomCache;
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        env.localModelPath = 'https://registry.npmmirror.com/sts-whisper-' + MODEL_SHORT[modelId] + '/1.0.0/files/models/';
        usedMirror = false;
        if (idbHit) self.postMessage({ type: 'phase', phase: 'idb' });
    } else {
        let useMirror = originMode === 'mirror';
        if (originMode === 'auto') {
            useMirror = await probe(HF_MIRROR + modelId + '/resolve/main/config.json', 3000);
        }
        usedMirror = useMirror;
        if (useMirror) {
            env.allowLocalModels = false;
            env.allowRemoteModels = true;
            env.remoteHost = HF_MIRROR;
        } else {
            env.allowLocalModels = true;
            env.allowRemoteModels = false;
            env.localModelPath = '/static/lab/models/';
        }
    }
    let useCdn = originMode === 'mirror';
    if (originMode === 'auto' || originMode === 'self') {
        useCdn = await probe(ORT_CDN + 'ort-wasm-simd-threaded.jsep.wasm', 3000);
    }
    env.backends.onnx.wasm.wasmPaths = useCdn ? ORT_CDN : '/lab/ort/';
    self.postMessage({ type: 'origin', model: npmOk ? 'npm' : (usedMirror ? 'mirror' : 'self'), wasm: useCdn ? 'cdn' : 'self' });
}

async function loadPipe(modelId) {
    if (transcriber && currentModel === modelId) return;
    if (transcriber && transcriber.dispose) {
        try { transcriber.dispose(); } catch (e) {}
    }
    transcriber = null;
    currentModel = modelId;
    loadedMap = new Map();
    currentTotal = Object.values(MODELS[modelId]).reduce((a, b) => a + b, 0);
    transcriber = await pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8',
        progress_callback: reportProgress
    });
}

async function ensureModel(modelId) {
    try {
        await loadPipe(modelId);
    } catch (e) {
        if (!usedMirror) {
            usedMirror = true;
            env.useCustomCache = false;
            env.allowLocalModels = false;
            env.allowRemoteModels = true;
            env.remoteHost = HF_MIRROR;
            transcriber = null;
            currentModel = null;
            self.postMessage({ type: 'phase', phase: 'fallback-mirror' });
            await loadPipe(modelId);
        } else {
            throw e;
        }
    }
}

self.onmessage = async function (e) {
    const msg = e.data;
    try {
        if (msg.type === 'load') {
            self.postMessage({ type: 'phase', phase: 'engine' });
            if (msg.npmOverride) Object.assign(NPM_SHORT, msg.npmOverride);
            await setupEnv(msg.origin || 'auto', msg.model || 'Xenova/whisper-tiny');
            await ensureModel(msg.model || 'Xenova/whisper-tiny');
            self.postMessage({ type: 'phase', phase: 'init' });
            self.postMessage({ type: 'ready' });
            return;
        }
        if (msg.type === 'run') {
            await ensureModel(msg.model || currentModel || 'Xenova/whisper-tiny');
            const runId = ++currentRunId;
            const totalChunks = Math.max(1, Math.ceil(msg.duration / 30));
            const opts = {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: true,
                task: msg.task || 'transcribe'
            };
            if (msg.language && msg.language !== 'auto') opts.language = msg.language;
            let done = 0, toks = 0, lastTok = 0;
            opts.chunk_callback = function () {
                done++;
                toks = 0;
                lastTok = 0;
                self.postMessage({ type: 'seg', run: runId, done: done, total: totalChunks });
            };
            try {
                opts.streamer = new TextStreamer(transcriber.tokenizer, {
                    skip_prompt: true,
                    callback_function: function () {
                        toks++;
                        if (toks === 1 || toks - lastTok >= 6) {
                            lastTok = toks;
                            self.postMessage({ type: 'gen', run: runId, done: done, toks: toks, total: totalChunks });
                        }
                    }
                });
            } catch (e) {}
            const out = await transcriber(msg.audio, opts);
            if (runId !== currentRunId) return;
            const chunks = (out.chunks || []).map(function (c) {
                return { start: (c.timestamp && c.timestamp[0]) || 0, end: (c.timestamp && c.timestamp[1]) || 0, text: (c.text || '').trim() };
            });
            self.postMessage({ type: 'result', run: runId, text: (out.text || '').trim(), chunks: chunks });
            return;
        }
    } catch (err) {
        self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
};
