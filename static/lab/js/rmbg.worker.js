import { pipeline, env } from '/static/lab/vendor/transformers.web.min.js';

const HF_MIRROR = 'https://hf-mirror.com/';
const ORT_CDN = 'https://registry.npmmirror.com/onnxruntime-web/1.22.0-dev.20250409-89f8206ba4/files/dist/';
const NPM_SHORT = {
    'Xenova/modnet': 'https://cdn.npmmirror.com/packages/sts-rmbg-modnet/1.0.0/sts-rmbg-modnet-1.0.0.tgz'
};

const MODELS = {
    'Xenova/modnet': {
        'config.json': 83,
        'preprocessor_config.json': 365,
        'onnx/model_quantized.onnx': 6632188
    }
};

const MODEL_SHORT = { 'Xenova/modnet': 'modnet' };

let remover = null;
let currentModel = null;
let loadedMap = new Map();
let currentTotal = 0;
let usedMirror = false;
let originMode = 'auto';

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
        if (type === 'x' || type === 'g' || type === 'L') {
            off += Math.ceil(size / 512) * 512;
            continue;
        }
        if (type === '0' || type === '\0' || type === '') {
            files.set(name, buf.subarray(off, off + size));
        }
        off += Math.ceil(size / 512) * 512;
    }
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
        return;
    }
    const resp = await fetch(tgzUrl, { cache: 'force-cache' });
    if (!resp.ok) throw new Error('tgz ' + resp.status);
    const total = Number(resp.headers.get('content-length') || 0);
    let received = 0;
    const chunks = [];
    const reader = resp.body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) self.postMessage({ type: 'progress', ratio: Math.min(received / total, 0.99) });
    }
    let buf = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([buf]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    const all = parseTar(new Uint8Array(ab));
    const prefix = 'package/models/';
    const files = [];
    for (const [name, bytes] of all) {
        const at = name.indexOf(prefix);
        if (at === -1) continue;
        const rel = name.slice(at + prefix.length);
        if (!rel || name.endsWith('/')) continue;
        files.push([rel, bytes]);
    }
    if (!files.length) throw new Error('tgz 无模型文件');
    await idbPut(modelId, files);
    npmCache = new Map(files);
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
        env.localModelPath = 'https://registry.npmmirror.com/sts-rmbg-modnet/1.0.0/files/models/';
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

function matchKey(file) {
    for (const k of Object.keys(MODELS[currentModel])) {
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
        self.postMessage({ type: 'phase', phase: 'download' });
        pushProgress();
    } else if (data.status === 'progress') {
        loadedMap.set(key, Math.min(data.loaded || 0, size));
        pushProgress();
    } else if (data.status === 'done') {
        loadedMap.set(key, size);
        pushProgress();
    }
}

async function loadPipe(modelId) {
    if (remover && currentModel === modelId) return;
    if (remover && remover.dispose) {
        try { remover.dispose(); } catch (e) {}
    }
    remover = null;
    currentModel = modelId;
    loadedMap = new Map();
    currentTotal = Object.values(MODELS[modelId]).reduce((a, b) => a + b, 0);
    remover = await pipeline('background-removal', modelId, {
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
            remover = null;
            currentModel = null;
            self.postMessage({ type: 'phase', phase: 'fallback-mirror' });
            await loadPipe(modelId);
        } else {
            throw e;
        }
    }
}

async function toBitmap(src) {
    if (src instanceof ImageBitmap) return src;
    return await createImageBitmap(src);
}

self.onmessage = async function (e) {
    const msg = e.data;
    try {
        if (msg.type === 'load') {
            self.postMessage({ type: 'phase', phase: 'engine' });
            await setupEnv(msg.origin || 'auto', msg.model || 'Xenova/modnet');
            await ensureModel(msg.model || 'Xenova/modnet');
            self.postMessage({ type: 'ready' });
            return;
        }
        if (msg.type === 'run') {
            const modelId = msg.model || 'Xenova/modnet';
            await ensureModel(modelId);
            self.postMessage({ type: 'phase', phase: 'run' });
            const bmp = await toBitmap(msg.image);
            const cv = new OffscreenCanvas(bmp.width, bmp.height);
            const ctx2d = cv.getContext('2d');
            ctx2d.drawImage(bmp, 0, 0);
            const blob = await cv.convertToBlob({ type: 'image/png' });
            const out = await remover(blob);
            const res = Array.isArray(out) ? out[0] : out;
            const img = res.mask || res.image || res;
            let dataURL = null;
            try { dataURL = img.toURL('image/png'); } catch (e) {}
            self.postMessage({
                type: 'result',
                width: img.width,
                height: img.height,
                channels: img.channels,
                dataURL: dataURL,
                data: new Uint8ClampedArray(img.data)
            });
            return;
        }
    } catch (e) {
        self.postMessage({ type: 'error', message: String(e && e.message || e) });
    }
};
