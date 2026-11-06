/* sts lab i18n sweep (EN mode only) — catches JS-rendered + late-rendered lab copy.
   Idempotent exact-match sweep + MutationObserver with busy guard. */
(function () {
    "use strict";
    if (!window.__stsEN) return;
    var EN = {
        '正在启动': 'Starting up', '主站': 'Main site', '工具箱': 'Toolbox', '返回工具箱': 'Back to the toolbox',
        '&lt; 返回工具箱': '&lt; Back to the toolbox', '< 返回工具箱': '< Back to the toolbox',
        '隐私政策': 'Privacy Policy', '开源鸣谢': 'Open-source credits', 'sts团队': 'sts team',
        'AI 工具，全部跑在': 'AI tools, all running in', '你的浏览器': 'your browser', '里': '',
        '模型下载到本地后离线运行，你的文件不会经过任何服务器。': 'Models download locally and run offline - your files never touch any server.',
        '模型下载到本地后离线运行，你的文件不会经过任何服务器。不注册，不限次数。': 'Models download locally and run offline - your files never touch any server. No sign-up, no limits.',
        '这是怎么做到的': 'How is this done', '6 个工具，全部本地运行': 'Six tools, all running locally',
        '把音频转成带时间戳的文字，可导出 SRT 字幕。': 'Audio to timestamped text, with SRT subtitle export.',
        '三档可选 - 用到才下载': 'Three tiers - downloaded only when used',
        '保留主体，背景变透明，输出 PNG。': 'Keeps the subject, clears the background, outputs PNG.',
        '模型约 7MB，首次用需下载': 'About 7MB of model, downloaded on first use',
        '从图片里提取可复制的文字。': 'Pull copyable text out of images.',
        '本地 OCR - 无需上传': 'Local OCR - nothing uploaded',
        '格式转换、裁剪、压缩，支持 mp4 等常见格式。': 'Convert, trim, compress - mp4 and other common formats.',
        '本地 ffmpeg - 无需上传': 'Local ffmpeg - nothing uploaded',
        '新海诚、宫崎骏、人像动漫三种风格一键转换。': 'Shinkai, Miyazaki and portrait anime - one tap each.',
        '本地 AnimeGAN - 无需上传': 'Local AnimeGAN - nothing uploaded',
        '团队吉祥物，去它的页面和它聊天。': 'The team mascot - go chat on its page.',
        '官方吉祥物': 'Official mascot', '为什么这么做': 'Why we do it this way', '数据不出设备': 'Data never leaves the device',
        '所有处理都发生在浏览器里，服务器只存放模型文件本身。没有上传，也就没有泄露。': 'Everything happens in your browser; the server only hosts the model files themselves. Nothing uploaded, nothing to leak.',
        '能一直免费': 'Free for good', '计算用的是你自己电脑的算力，我们没有推理成本，所以不需要收费，也不需要限量。': 'The computing is your own machine - we carry no inference costs, so there is no fee and no cap.',
        '断网也能用': 'Works offline', '每个工具的模型只下载一次，之后浏览器会记住它，没有网络照样可以打开使用。': 'Each tool downloads its model once; the browser remembers it and everything opens without a network.',
        '照片动漫化': 'Anime Photo', '把照片变成动漫场景，三种风格，全程在本地完成。': 'Photos to anime scenes, three styles, fully local.',
        '拖入照片，或点击选择': 'Drop a photo, or click to pick', '支持 png jpg webp，建议边长不超过 2048': 'png jpg webp supported - keep edges under 2048',
        '风格': 'Style', '新海诚': 'Makoto Shinkai', '天空与光线': 'Skies and light', '宫崎骏': 'Hayao Miyazaki', '温暖手绘': 'Warm hand-drawn',
        '人像动漫': 'Portrait Anime', '人脸特化': 'Face-specialized', '质量档': 'Quality tier', '快速 256': 'Fast 256',
        '约 2-4 秒一张': 'about 2-4s per photo', '质量 512': 'Quality 512', '约 5-15 秒一张': 'about 5-15s per photo',
        '开始转换': 'Start converting', '每种风格首次使用下载约 8MB 模型，之后自动缓存。转换在你的浏览器本地完成，照片不会上传。新海诚与宫崎骏权重来自 AnimeGAN 项目（TachibanaYoshino），仅限学术与个人使用；人像动漫风格为 MIT 许可。': 'Each style downloads about 8MB of model on first use, cached afterwards. Conversion happens in your browser - photos are never uploaded. The Shinkai and Miyazaki weights come from the AnimeGAN project (TachibanaYoshino), for academic and personal use; Portrait Anime is MIT licensed.',
        '结果': 'Result', '下载 PNG': 'Download PNG', '原图': 'Original', '还没有图片': 'No image yet', '动漫化': 'Animate',
        '转换后显示在这里': 'Result shows up here',
        'Input / 输入': 'Input', '本机处理，不上传': 'Processed locally, never uploaded', '拖入文件，可一次多个、可继续添加': 'Drop files - many at once, keep adding',
        '视频 mp4 mov mkv webm avi - 音频 mp3 wav m4a aac flac ogg opus - 图片 gif png jpg webp': 'video mp4 mov mkv webm avi - audio mp3 wav m4a aac flac ogg opus - image gif png jpg webp',
        '读取中…': 'Reading…', 'Command / 指令': 'Command', '回车执行': 'Enter to run', '输入参数即可，': 'Type parameters; ',
        '-i 输入文件': '-i input-file', '会自动补在前面；输出文件名写在最后。上/下方向键翻历史。': 'is prepended automatically; the output filename goes last. Up/Down arrows page through history.',
        '分析响度': 'Analyze loudness', '参数面板': 'Parameters', '选文件后可用': 'Available after picking a file',
        '快捷模板 - 选文件后点一下填入': 'Quick templates - pick a file, tap to fill', '晚清全损压缩 - 选导出格式': 'Late-Qing ultra-lossy - pick an export format',
        'Manual / 手册': 'Manual', '怎么用': 'How to use', '不知道写什么参数？手册把一条指令拆开讲：输入自动补什么、参数怎么选、报错怎么查、参数速查表。': 'Not sure what to type? The manual takes one command apart: what gets auto-prepended, how to pick parameters, where to check errors, plus the parameter tables.',
        '&gt; 打开使用手册 /manual': '&gt; Open the manual /manual', '> 打开使用手册 /manual': '> Open the manual /manual',
        'Status / 状态': 'Status', '[ -- ] 引擎未加载': '[ -- ] Engine not loaded', '[--] 待命': '[--] Standby',
        '输出文件会在这里预览与下载': 'Outputs preview and download here',
        '把图片里的文字变成可复制的文本，全程在本地完成。': 'Image text to copyable text, fully local.',
        '拖入图片，或点击选择': 'Drop an image, or click to pick', '支持 png jpg webp bmp，清晰印刷体效果最佳': 'png jpg webp bmp supported - clean print works best',
        '开始识别': 'Start recognizing', '第一次使用会下载约 15MB 模型，之后自动缓存，无需重复下载。': 'First use downloads ~15MB of models, cached afterwards - no repeat downloads.',
        '支持中英文混排；手写字和严重倾斜的照片效果会打折。': 'Mixed Chinese and English supported; handwriting and heavily tilted photos work less well.',
        '识别结果': 'Recognition result', '复制': 'Copy', '识别结果会显示在这里': 'Recognized text shows up here',
        '保留主体，背景变透明，输出 PNG，全程在本地完成。': 'Keeps the subject, clears the background, outputs PNG - fully local.',
        '拖入图片，或点击选择 ': 'Drop an image, or click to pick',
        '开始抠图': 'Start cutting out', '第一次使用会下载约 7MB 模型，之后自动缓存，无需重复下载。抠图在你的浏览器本地完成，图片不会上传。': 'First use downloads a ~7MB model, cached afterwards - no repeat downloads. The cutout runs in your browser; the image is never uploaded.',
        '抠图结果': 'Cutout result', '显示原图': 'Show original', '选一张图片，结果会显示在这里': 'Pick an image and the result shows up here',
        '抠图后（棋盘格为透明区域）': 'Cutout (checkerboard = transparent)',
        '把音频转成带时间戳的文字，全程在本地完成。': 'Audio to timestamped text, fully local.',
        '拖入音频，或点击选择': 'Drop an audio file, or click to pick', '支持 mp3 wav m4a webm，最长五分钟': 'mp3 wav m4a webm supported, five minutes max',
        '模型 - 越大越准，也越慢': 'Model - bigger is more accurate but slower', '速度优先 - 42MB': 'Speed first - 42MB', '均衡 - 78MB': 'Balanced - 78MB', '精准优先 - 242MB': 'Accuracy first - 242MB',
        '音频语言': 'Audio language', '自动识别': 'Auto detect', '开始转写': 'Start transcription', '录音': 'Record',
        '正在加载引擎': 'Loading engine', '手机的算力有限，转写会比较慢，建议用电脑。': 'Phones have limited compute - transcription runs slow; a computer is recommended.',
        '第一次使用会下载 42MB 模型，之后自动缓存，无需重复下载。': 'First use downloads the 42MB model, cached afterwards - no repeat downloads.',
        '转写结果': 'Transcription result', 'SRT 字幕': 'SRT subtitles', '转写结果会显示在这里': 'Transcript shows up here'
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
    try {
        var AT = { '移除': 'Remove' };
        document.querySelectorAll('[title],[aria-label]').forEach(function (e) {
            ['title', 'aria-label'].forEach(function (a) {
                var v = e.getAttribute(a);
                if (v && AT[v] !== undefined) e.setAttribute(a, AT[v]);
            });
        });
    } catch (e) {}
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
