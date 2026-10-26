let cvInst = null;
function loadOnce() {
    if (cvInst) return cvInst;
    if (window.cv && window.cv.Mat) { cvInst = window.cv; return cvInst; }
    throw new Error('opencv 尚未初始化：请先调用 prepareOcr()');
}
const proxy = new Proxy({}, {
    get(_t, prop) {
        if (prop === 'then') return undefined;
        const cv = loadOnce();
        return cv[prop];
    }
});
export async function initCV() {
    if (cvInst) return cvInst;
    if (window.cv && window.cv.Mat) { cvInst = window.cv; return cvInst; }
    await new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = 'https://registry.npmmirror.com/@techstark/opencv-js/5.0.0-release.1/files/dist/opencv.js';
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('opencv 脚本加载失败')); };
        document.head.appendChild(s);
    });
    const t0 = Date.now();
    while (!(window.cv && window.cv.Mat)) {
        if (window.cv && typeof window.cv.then === 'function') {
            const cv = await window.cv;
            if (cv && cv.Mat) { window.cv = cv; cvInst = cv; return cv; }
        }
        if (Date.now() - t0 > 25000) throw new Error('opencv 初始化超时');
        await new Promise(function (r) { setTimeout(r, 150); });
    }
    cvInst = window.cv;
    return cvInst;
}
export default proxy;
