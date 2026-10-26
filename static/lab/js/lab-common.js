(function () {
    var LabEnv = window.LabEnv = {};
    LabEnv.hasWebGPU = (typeof navigator !== 'undefined' && !!navigator.gpu);
    LabEnv.isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent) || window.innerWidth < 768;
    LabEnv.cores = navigator.hardwareConcurrency || 4;

    var LabFmt = window.LabFmt = {};
    LabFmt.time = function (sec) {
        if (sec == null || !isFinite(sec) || sec < 0) sec = 0;
        var m = Math.floor(sec / 60);
        var s = sec - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
    };
    LabFmt.srt = function (sec) {
        if (sec == null || !isFinite(sec) || sec < 0) sec = 0;
        var ms = Math.round(sec * 1000);
        var h = Math.floor(ms / 3600000); ms -= h * 3600000;
        var m = Math.floor(ms / 60000); ms -= m * 60000;
        var s = Math.floor(ms / 1000); ms -= s * 1000;
        function p(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
        return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + ',' + p(ms, 3);
    };
    LabFmt.smart = function (sec) {
        if (sec == null || !isFinite(sec) || sec < 0) sec = 0;
        var m = Math.floor(sec / 60), s = Math.round(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    };
    LabFmt.size = function (bytes) {
        if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
        if (bytes > 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return bytes + ' B';
    };

    window.LabSave = function (name, text, mime) {
        var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    };

    window.LabIcon = function (id, cls) {
        return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + id + '"></use></svg>';
    };
})();
