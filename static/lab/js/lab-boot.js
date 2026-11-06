(function () {
    var el = document.getElementById('labBoot');
    if (!el) return;
    var bar = el.querySelector('.boot-bar');
    var barFill = bar ? bar.querySelector('i') : null;
    var sub = el.querySelector('.boot-sub');
    var pct = el.querySelector('.boot-pct');
    var driven = false;
    var hidden = false;

    var dots = el.querySelector('.boot-dots');
    if (dots && !dots.children.length) {
        for (var i = 0; i < 16; i++) {
            var d = document.createElement('i');
            d.style.setProperty('--i', i);
            dots.appendChild(d);
        }
    }

    function hide() {
        if (hidden) return;
        hidden = true;
        el.classList.add('hide');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 600);
    }

    window.LabBoot = {
        drive: function () {
            driven = true;
            if (bar) bar.classList.add('idle');
        },
        progress: function (ratio, label) {
            driven = true;
            if (bar) bar.classList.remove('idle');
            var p = Math.max(0, Math.min(100, Math.round(ratio * 100)));
            if (barFill) barFill.style.width = p + '%';
            if (pct) pct.textContent = p > 0 && p < 100 ? p + '%' : '';
            if (label && sub) sub.textContent = label;
        },
        phase: function (text) {
            driven = true;
            if (sub) sub.textContent = text;
        },
        hide: hide
    };

    if (!document.documentElement.dataset.labTool) {
        setTimeout(function () { if (!driven) hide(); }, 3200);
    } else {
        setTimeout(function () {
            if (driven) return;
            var t = document.getElementById('term');
            if (t) {
                var d = document.createElement('div');
                d.className = 'l-err';
                d.textContent = window.__stsEN ? '[ERR] Page scripts did not start (the browser likely cached an old version) - press Ctrl+Shift+R to hard-refresh.' : '[ERR] 页面脚本没有启动（多半是浏览器缓存了旧版本），请按 Ctrl+Shift+R 强制刷新。';
                t.appendChild(d);
            }
            hide();
        }, 8000);
    }
})();
