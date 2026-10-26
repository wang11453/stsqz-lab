let lib = null;
export default function getClipper() {
    if (lib) return lib;
    if (typeof window !== 'undefined' && window.ClipperLib) { lib = window.ClipperLib; return lib; }
    throw new Error('clipper 尚未初始化：请先调用 prepareOcr()');
}
