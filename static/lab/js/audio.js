var LabPiko = window.LabPiko || { set: function () {} };
import { FFmpeg } from '/static/lab/vendor/ffmpeg/index.js';

const $ = (id) => document.getElementById(id);
const dz = $('dropzone'), fileInput = $('fileInput'), chip = $('fileChip'),
    fcName = $('fcName'), fcDur = $('fcDur'), fcX = $('fcX'),
    fileKv = $('fileKv'), kvSize = $('kvSize'), kvType = $('kvType'), kvLen = $('kvLen'),
    cmdInput = $('cmdInput'), runBtn = $('runBtn'), clearBtn = $('clearBtn'),
    engineNote = $('engineNote'), tplGrid = $('tplGrid'), tplHd = $('tplHd'),
    qingList = $('qingList'), qingGrid = $('qingGrid'), qsHd = $('qsHd'),
    pBox = $('pBox'), pBtn = $('pBtn'), pBody = $('pBody'), pCaret = $('pCaret'), pSub = $('pSub'),
    loudBtn = $('loudBtn'),
    queueBox = $('queueBox'), queueList = $('queueList'), fileListEl = $('fileList'),
    inPrev = $('inPrev'),
    dz2 = $('dropzone2'), fileInput2 = $('fileInput2'), chip2 = $('fileChip2'),
    fcName2 = $('fcName2'), fcX2 = $('fcX2'),
    hStatus = $('hStatus'), hElapsed = $('hElapsed'), hProgress = $('hProgress'),
    hSpeed = $('hSpeed'), hOut = $('hOut'), hPos = $('hPos'),
    barFill = $('barFill'), term = $('term'), res = $('res');

const CORE_URL = '/static/lab/vendor/ffmpeg/ffmpeg-core.js?v=esm-0.12.10-p1';
const WASM_URL = 'https://registry.npmmirror.com/@ffmpeg/core/0.12.10/files/dist/esm/ffmpeg-core.wasm';
const WORKER_URL = '/static/lab/vendor/ffmpeg/worker.js';

const VIDEO_EXT = ['mp4', 'm4v', 'webm', 'mov', 'mkv', 'avi', 'ogv'];
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'weba'];
const IMAGE_EXT = ['gif', 'png', 'jpg', 'jpeg', 'webp', 'bmp'];
const SUPPORTED_EXT = VIDEO_EXT.concat(AUDIO_EXT, IMAGE_EXT);

function extOf(name) {
    return (String(name).split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const TPL_VIDEO = [
    ['压缩 720p（看片够用）', '-i {IN} -vf scale=-2:720 -c:v libx264 -preset veryfast -crf 26 -c:a aac -b:a 96k -movflags +faststart out_720p.mp4'],
    ['压缩 480p（发群省流量）', '-i {IN} -vf scale=-2:480 -c:v libx264 -preset veryfast -crf 28 -c:a aac -b:a 64k -movflags +faststart out_480p.mp4'],
    ['换封装为 MP4（秒完成）', '-i {IN} -c copy -movflags +faststart out_remux.mp4'],
    ['裁一段 10s-30s', '-i {IN} -ss 00:00:10 -to 00:00:30 -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k out_clip.mp4'],
    ['提音频存 MP3', '-i {IN} -vn -c:a libmp3lame -b:a 192k out.mp3'],
    ['截封面图（第 3 秒）', '-i {IN} -ss 3 -frames:v 1 -q:v 2 cover.jpg'],
    ['转 GIF（5 秒 12fps）', '-i {IN} -t 5 -vf "fps=12,scale=480:-2,split[a][b];[a]palettegen[p];[b][p]paletteuse" -an out.gif'],
    ['竖屏 9:16 短视频', '-i {IN} -vf crop=in_h*9/16:in_h,scale=720:-2 -c:v libx264 -preset veryfast -crf 24 -c:a aac -b:a 128k out_vertical.mp4'],
    ['两倍速（音画同步）', '-i {IN} -vf setpts=0.5*PTS -af atempo=2.0 -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k out_2x.mp4'],
    ['音量 x 倍（滑条）', '-i {IN} -c:v copy -c:a aac -b:a 128k out_volume.mp4', ['vol']],
    ['帧率（滑条）', '-i {IN} -c:v libx264 -preset veryfast -crf 23 -c:a copy out_fps.mp4', ['fps']],
    ['亮度对比度（滑条）', '-i {IN} -c:v libx264 -preset veryfast -crf 23 -c:a copy out_color.mp4', ['bright', 'contrast', 'sat']],
    ['晚清全损压缩', '-i {IN} -c:v libx264 -r 4 -g 120 -crf 51 -preset veryslow -vf "scale=160:90,hue=s=0" -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -c:a aac -b:a 8k 1_qing_vol40db_hard.mp4'],
    ['来回循环 GIF（正放+倒放）', '-t 5 -i {IN} -filter_complex "[0:v]scale=320:-2,setsar=1,fps=10,split[a][b];[b]reverse[br];[a][br]concat=n=2[v];[v]split[x][y];[x]palettegen[p];[y][p]paletteuse" -an boom.gif'],
    ['智能封面（自动选代表帧）', '-i {IN} -vf "thumbnail=30,scale=1280:-2" -frames:v 1 -q:v 3 cover.jpg'],
    ['九宫格拼图（3x3）', '-i {IN} -vf "fps=2,scale=480:-2,tpad=stop_mode=clone:stop=16,tile=3x3" -frames:v 1 grid9.png']
];

const TPL_AUDIO = [
    ['转 MP3 192k（通用）', '-i {IN} -vn -c:a libmp3lame -b:a 192k out.mp3'],
    ['压缩到 128k（省体积）', '-i {IN} -vn -c:a libmp3lame -b:a 128k out_128k.mp3'],
    ['转 WAV 无损', '-i {IN} -vn -c:a pcm_s16le out.wav'],
    ['裁一段 10s-30s', '-i {IN} -ss 00:00:10 -to 00:00:30 -c:a libmp3lame -b:a 192k out_clip.mp3'],
    ['音量拉齐（响度 -16）', '-i {IN} -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a libmp3lame -b:a 192k out_loud.mp3'],
    ['人声清楚（三件套）', '-i {IN} -af highpass=f=90,acompressor=threshold=0.06:ratio=4:makeup=2,loudnorm=I=-16:TP=-1.5 -c:a libmp3lame -b:a 128k out_voice.mp3'],
    ['单声道 16k（语音最小）', '-i {IN} -ac 1 -ar 16000 -c:a libmp3lame -b:a 48k out_mono.mp3'],
    ['两倍速（不变调）', '-i {IN} -af atempo=2.0 -c:a libmp3lame -b:a 192k out_2x.mp3'],
    ['淡入淡出 2 秒', '-i {IN} -af "afade=t=in:st=0:d=2,areverse,afade=t=in:st=0:d=2,areverse" -c:a libmp3lame -b:a 192k out_fade.mp3'],
    ['音量 x 倍（滑条）', '-i {IN} -c:a libmp3lame -b:a 192k out_volume.mp3', ['vol']],
    ['采样率声道（滑条）', '-i {IN} -c:a libmp3lame -b:a 192k out_rate.mp3', ['rate', 'ch', 'bitrate']],
    ['削波全损（滑条）', '-i {IN} -c:a libmp3lame -b:a 192k out_crush.mp3', ['crushbits', 'crushatoms']],
    ['晚清全损压缩', '-i {IN} -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -c:a libvorbis -b:a 8k out_qing.ogg'],
    ['波形图（整段画成一张图）', '-i {IN} -filter_complex "aformat=channel_layouts=mono,showwavespic=s=1000x280:colors=#FFB000" wave.png'],
    ['频谱图（频率-时间）', '-i {IN} -lavfi "showspectrumpic=s=1000x480:legend=1" spectrum.png']
];

const TPL_IMAGE = [
    ['转 JPG（照片通用）', '-i {IN} -frames:v 1 -q:v 3 out.jpg'],
    ['转 WebP（体积最小）', '-i {IN} -frames:v 1 -c:v libwebp -quality 82 out.webp'],
    ['转 PNG 无损（截图/透明）', '-i {IN} -frames:v 1 out.png'],
    ['压到宽 1600（发原图）', '-i {IN} -frames:v 1 -vf scale=min(1600\\,iw):-2 -q:v 4 out_1600.jpg'],
    ['缩略图 400px', '-i {IN} -frames:v 1 -vf scale=400:-2 -q:v 5 out_thumb.jpg'],
    ['方图 1:1（头像）', '-i {IN} -frames:v 1 -vf crop=min(iw\\,ih):min(iw\\,ih) -q:v 3 out_square.jpg'],
    ['竖版 9:16 封面', '-i {IN} -frames:v 1 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" -q:v 3 out_cover.jpg'],
    ['灰度黑白', '-i {IN} -frames:v 1 -vf hue=s=0 -q:v 3 out_gray.jpg'],
    ['旋转 90°（竖拍摆正）', '-i {IN} -frames:v 1 -vf transpose=1 -q:v 3 out_rot.jpg'],
    ['宽度质量（滑条）', '-i {IN} -frames:v 1 out_panel.jpg', ['width', 'q']],
    ['裁剪旋转（滑条）', '-i {IN} -frames:v 1 out_panel.jpg', ['crop', 'rot']],
    ['晚清全损压缩', '-i {IN} -frames:v 1 -vf "scale=200:-2:flags=neighbor,hue=s=0" -q:v 31 out_qing.jpg']
];

const TPL_OVR = {
    mp4: {
        '换封装为 MP4（秒完成）': ['抽出纯视频（删音轨，秒完成）', '-i {IN} -an -c:v copy out_nosound.mp4']
    },
    m4v: {
        '换封装为 MP4（秒完成）': ['抽出纯视频（删音轨，秒完成）', '-i {IN} -an -c:v copy out_nosound.mp4']
    },
    webm: {
        '换封装为 MP4（秒完成）': ['转成 MP4（重编码）', '-i {IN} -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart out_remux.mp4']
    },
    ogv: {
        '换封装为 MP4（秒完成）': ['转成 MP4（重编码）', '-i {IN} -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart out_remux.mp4']
    },
    mp3: {
        '转 MP3 192k（通用）': ['重压一遍（体积更小）', '-i {IN} -c:a libmp3lame -b:a 128k out_repack.mp3'],
        '压缩到 128k（省体积）': ['转 MP3 320k（高码率）', '-i {IN} -c:a libmp3lame -b:a 320k out_320k.mp3'],
        '转 WAV 无损': ['转 WAV 无损（给剪辑用）', '-i {IN} -c:a pcm_s16le out.wav']
    },
    wav: {
        '转 WAV 无损': ['转 FLAC（无损但更小）', '-i {IN} -c:a flac out.flac']
    },
    jpg: {
        '转 JPG（照片通用）': ['重压一遍（体积更小）', '-i {IN} -frames:v 1 -q:v 7 out_repack.jpg']
    },
    jpeg: {
        '转 JPG（照片通用）': ['重压一遍（体积更小）', '-i {IN} -frames:v 1 -q:v 7 out_repack.jpg']
    },
    png: {
        '转 PNG 无损（截图/透明）': ['转 WebP 无损（更小）', '-i {IN} -frames:v 1 -c:v libwebp -lossless 1 out_lossless.webp']
    },
    webp: {
        '转 WebP（体积最小）': ['转 PNG 无损（保留透明）', '-i {IN} -frames:v 1 out.png']
    },
    gif: {
        '转 JPG（照片通用）': ['导出首帧 JPG（当封面）', '-i {IN} -frames:v 1 -q:v 3 out_first.jpg'],
        '转 WebP（体积最小）': ['转成动图 WebP（更小）', '-i {IN} -c:v libwebp -loop 0 -quality 75 out_anim.webp']
    }
};

const FAM_NAME = { video: '视频', audio: '音频', image: '图片' };

const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
const RATES = ['原样', '8000', '11025', '16000', '22050', '32000', '44100', '48000'];

const PFMT = {
    video: [
        { id: 'mp4', label: 'MP4', hint: '最通用，手机电脑都能放', vc: 'libx264', ac: 'aac', encs: ['libx264', 'libx265', 'mpeg4'], tail: ['-movflags', '+faststart'] },
        { id: 'mkv', label: 'MKV', hint: '能装几乎所有编码', vc: 'libx264', ac: 'aac', encs: ['libx264', 'libx265', 'mpeg4'], tail: [] },
        { id: 'gif', label: 'GIF', hint: '无声动图，只适合超短片段', vc: 'gif', ac: '', encs: [], tail: [] },
        { id: 'mp3', label: 'MP3（只要声音）', hint: '丢掉画面，只存音轨', vc: '', ac: 'libmp3lame', encs: [], tail: [], av: 'audio' },
        { id: 'ogg', label: 'OGG（只要声音）', hint: '开源格式，体积更小', vc: '', ac: 'libvorbis', encs: [], tail: [], av: 'audio' }
    ],
    audio: [
        { id: 'mp3', label: 'MP3', hint: '哪儿都能放', ac: 'libmp3lame', q: true },
        { id: 'm4a', label: 'M4A', hint: '同体积音质更好', ac: 'aac' },
        { id: 'ogg', label: 'OGG', hint: '开源格式，体积最小', ac: 'libvorbis', tail: ['-q:a', '5'] },
        { id: 'wav', label: 'WAV', hint: '不压缩，给剪辑软件用', ac: 'pcm_s16le', bd: true },
        { id: 'flac', label: 'FLAC', hint: '无损，但比 WAV 小一半', ac: 'flac', level: true }
    ],
    image: [
        { id: 'jpg', label: 'JPG', hint: '照片通用', q: true },
        { id: 'png', label: 'PNG', hint: '截图、要透明就用它', level: true },
        { id: 'webp', label: 'WebP', hint: '网页用，体积最小', q: true, wl: true },
        { id: 'gif', label: 'GIF', hint: '最多 256 色' },
        { id: 'bmp', label: 'BMP', hint: '老式无压缩位图' }
    ]
};

const ENC_LABEL = { libx264: 'H.264（兼容最好）', libx265: 'H.265（更小，但很慢）', 'libvpx-vp9': 'VP9（WebM 用）', libvpx: 'VP8（老 WebM）', mpeg4: 'MPEG-4（老设备）', gif: 'GIF' };
const TUNES = ['不调', 'film', 'animation', 'grain', 'fastdecode', 'zerolatency'];
const NOISE = [['关', 0], ['轻', 1], ['中', 2], ['强', 3]];
const RATIOS = [['原样', 0], ['方图 1:1', 1], ['竖版 9:16', 2], ['横版 16:9', 3], ['老电视 4:3', 4]];
const SCALE_FLAGS = [['默认', 0], ['lanczos（更锐）', 1], ['neighbor（像素风）', 2], ['spline（平滑）', 3]];
const ROTS = [['原样', 0], ['90°', 1], ['180°', 2], ['270°', 3]];
const FLIPS = [['不翻', 0], ['水平镜像', 1], ['垂直镜像', 2]];
const GRAYS = [['原色', 0], ['灰度', 1]];

function ratioVF(v, pad) {
    const c = {
        1: pad ? ['scale=1080:1080:force_original_aspect_ratio=decrease', 'pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black'] : ['crop=min(iw\\,ih):min(iw\\,ih)'],
        2: pad ? ['scale=1080:1920:force_original_aspect_ratio=decrease', 'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black'] : ['crop=in_h*9/16:in_h'],
        3: pad ? ['scale=1920:1080:force_original_aspect_ratio=decrease', 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black'] : ['crop=in_h*16/9:in_h'],
        4: pad ? ['scale=1440:1080:force_original_aspect_ratio=decrease', 'pad=1440:1080:(ow-iw)/2:(oh-ih)/2:black'] : ['crop=in_h*4/3:in_h']
    }[v] || [];
    return c;
}

const isVid = (c) => c.fam === 'video' && !c.fmt.av;
const isX26X = (c) => c.enc === 'libx264' || c.enc === 'libx265';
const hasQ = (c) => c.enc === 'libx264' || c.enc === 'libx265' || c.enc === 'libvpx-vp9' || c.enc === 'libvpx';

const AUDIO_CORE = [
        { id: 'vol', sec: '声音', label: '音量倍数', help: '1 倍是原样，小了听不见、大了会破音', ends: ['静音', '4 倍'], min: 0, max: 4, step: 0.1, def: 1.5, fmt: (v) => v.toFixed(1) + 'x', on: true, build: (v) => ({ af: ['volume=' + v.toFixed(2)] }) },
        { id: 'rate', sec: '声音', label: '采样率', kind: 'seg', opts: () => [['原样', 0, '不改'], ['8k', 1, '电话音'], ['11k', 2, '很省'], ['16k', 3, '人声够用'], ['22k', 4, '较好'], ['32k', 5, '接近标准'], ['44.1k', 6, '音乐标准'], ['48k', 7, '视频标准']], build: (v) => (v ? { x: ['-ar', RATES[v]] } : {}) },
        { id: 'ch', sec: '声音', label: '声道', kind: 'seg', opts: () => [['原样', 0, '不改'], ['单声道', 1, '省一半体积'], ['双声道', 2, '左右分开']], build: (v) => (v ? { x: ['-ac', String(v)] } : {}) },
        { id: 'bass', sec: '声音', adv: true, label: '低音', help: '闷/轰头就往下调，缺厚度往上调', ends: ['-20dB', '+20dB'], min: -20, max: 20, step: 1, def: 6, fmt: (v) => (v > 0 ? '+' : '') + v + 'dB', build: (v) => ({ af: ['bass=g=' + v] }) },
        { id: 'treble', sec: '声音', adv: true, label: '高音', help: '发闷往上调，齿音刺耳往下调', ends: ['-20dB', '+20dB'], min: -20, max: 20, step: 1, def: 6, fmt: (v) => (v > 0 ? '+' : '') + v + 'dB', build: (v) => ({ af: ['treble=g=' + v] }) },
        { id: 'comp', sec: '声音', adv: true, label: '动态压缩', kind: 'seg', help: '把忽大忽小的音量压平，人声更稳', opts: () => NOISE, build: (v) => ({ af: v === 1 ? ['acompressor=threshold=0.125:ratio=2:attack=20:release=250'] : v === 2 ? ['acompressor=threshold=0.089:ratio=4:attack=10:release=200:makeup=2'] : v === 3 ? ['acompressor=threshold=0.063:ratio=8:attack=5:release=150:makeup=4'] : [] }) },
        { id: 'adenoise', sec: '声音', adv: true, label: '降噪', kind: 'seg', help: '麦克风底噪、空调嗡嗡声', opts: () => NOISE, build: (v) => (v ? { af: ['afftdn=nr=' + [0, 6, 12, 24][v]] } : {}) },
        { id: 'declick', sec: '声音', adv: true, label: '去咔哒声', kind: 'seg', help: '录音里的爆音、黑胶噼啪声', opts: () => [['关', 0], ['开', 1]], build: (v) => (v ? { af: ['adeclick'] } : {}) },
        { id: 'limit', sec: '声音', adv: true, label: '防破音', kind: 'seg', help: '拉过音量后限制峰值，避免削顶', opts: () => [['关', 0], ['开', 1]], build: (v) => (v ? { af: ['alimiter=limit=0.95'] } : {}) },
        { id: 'loud', sec: '声音', adv: true, label: '音量统一', help: '整段拉到同一个响度，不再忽大忽小', ends: ['-30 很小', '-6 很大'], min: -30, max: -6, step: 0.5, def: -16, fmt: (v) => v.toFixed(1) + ' LUFS', build: (v) => ({ af: ['loudnorm=I=' + v + ':TP=-1.5'] }) },
        { id: 'dyn', sec: '声音', adv: true, label: '自动增益', kind: 'seg', help: '忽大忽小的录音；和"音量统一"二选一', opts: () => [['关', 0], ['开', 1]], build: (v) => (v ? { af: ['dynaudnorm=f=150:g=15'] } : {}) },
        { id: 'fade', sec: '声音', adv: true, label: '淡入淡出', help: '开头渐渐出现、结尾渐渐消失', ends: ['0.5 秒', '10 秒'], min: 0.5, max: 10, step: 0.5, def: 2, fmt: (v) => v.toFixed(1) + 's', build: (v) => ({ af: ['afade=t=in:st=0:d=' + v, 'areverse', 'afade=t=in:st=0:d=' + v, 'areverse'] }) },
        { id: 'widen', sec: '声音', adv: true, label: '立体声宽度', kind: 'seg', opts: () => [['原样', 0], ['收窄', 1], ['加宽', 2]], build: (v) => (v ? { af: ['extrastereo=m=' + (v === 1 ? 1.5 : 3)] } : {}) },
        { id: 'pitch', sec: '声音', adv: true, label: '变调', help: '只改音高不改速度，1 就是原样', ends: ['更低', '更高'], min: 0.5, max: 2, step: 0.05, def: 1.25, fmt: (v) => v.toFixed(2) + 'x', build: (v) => ({ af: ['aresample=48000', 'asetrate=' + Math.round(48000 * v), 'aresample=48000', 'atempo=' + (1 / v).toFixed(3)] }) },
        { id: 'speed', sec: '声音', adv: true, label: '播放速度', help: '0.5 倍慢放，2 倍加速，音调不变', ends: ['慢放', '加速'], min: 0.25, max: 4, step: 0.05, def: 2, fmt: (v) => v.toFixed(2) + 'x', build: (v) => ({ af: ['atempo=' + v.toFixed(2)] }) },
        { id: 'sil', sec: '声音', adv: true, label: '去掉静音', kind: 'seg', help: '开头/结尾的空白段直接切掉', opts: () => [['关', 0], ['去掉开头', 1], ['去掉首尾', 2]], build: (v) => (v ? { af: [v === 1 ? 'silenceremove=start_periods=1:start_threshold=-45dB' : 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_threshold=-45dB'] } : {}) },
        { id: 'highpass', sec: '声音', adv: true, label: '去掉低频噪声', help: '切掉嗡嗡声、空调声和电流底噪', ends: ['不切', '400Hz'], min: 0, max: 400, step: 10, def: 90, fmt: (v) => v + 'Hz', build: (v) => ({ af: ['highpass=f=' + v] }) },
        { id: 'lowpass', sec: '声音', adv: true, label: '切掉高频', help: '去齿音、嘶声和刺耳的高频，人声反而更柔', ends: ['不切', '20kHz'], min: 1000, max: 20000, step: 500, def: 12000, fmt: (v) => (v >= 1000 ? (v / 1000) + 'kHz' : v + 'Hz'), build: (v) => ({ af: ['lowpass=f=' + v] }) },
        { id: 'crushbits', sec: '声音', adv: true, label: '老式失真：位深', help: '越小越像老电话、老游戏机', ends: ['2 位 最糊', '16 位 清晰'], min: 2, max: 16, step: 1, def: 4, fmt: (v) => v + 'bit', build: (v) => ({ crush: { bits: v } }) },
        { id: 'crushatoms', sec: '声音', adv: true, label: '老式失真：采样保持', help: '越大越像卡带跳帧的机械声', ends: ['2 倍', '64 倍'], min: 2, max: 64, step: 2, def: 8, fmt: (v) => v + 'x', build: (v) => ({ crush: { samples: v } }) },
        { id: 'mid', sec: '声音', adv: true, label: '中频（人声）', help: '鼻音重往下调，人声发闷往上调', ends: ['-20dB', '+20dB'], min: -20, max: 20, step: 1, def: 5, fmt: (v) => (v > 0 ? '+' : '') + v + 'dB', build: (v) => ({ af: ['equalizer=f=1000:t=q:w=1:g=' + v] }) },
        { id: 'echo', sec: '声音', adv: true, label: '回声', kind: 'seg', help: '空旷感、舞台感；开会录音别开', opts: () => [['关', 0], ['轻', 1], ['明显', 2]], build: (v) => (v ? { af: ['aecho=0.8:0.9:' + (v === 1 ? 400 : 900) + ':0.3'] } : {}) },
        { id: 'pan', sec: '声音', adv: true, label: '声道处理', kind: 'seg', help: '只留一边、左右互换，或混成单声道', opts: () => [['原样', 0], ['左右互换', 1], ['只留左', 2], ['只留右', 3], ['混成单声道', 4]], build: (v) => ({ af: v === 1 ? ['pan=stereo|c0=c1|c1=c0'] : v === 2 ? ['pan=stereo|c0=c0|c1=c0'] : v === 3 ? ['pan=stereo|c0=c1|c1=c1'] : v === 4 ? ['pan=mono|c0=0.5*c0+0.5*c1'] : [] }) },
];

function audioForVideo() {
    return AUDIO_CORE.map(function (c) {
        const base = c.when;
        const copy = Object.assign({}, c, { when: function (ctx) { return !!ctx.fmt.ac && (!base || base(ctx)); } });
        if (c.id === 'speed') {
            copy.build = function (v) { return { vf: ['setpts=PTS/' + v.toFixed(2)], af: ['atempo=' + v.toFixed(2)] }; };
        }
        return copy;
    });
}
const PANEL = {
    video: [
        { id: 'enc', sec: '输出质量', label: '视频编码器', kind: 'seg', when: (c) => c.fmt.encs && c.fmt.encs.length, opts: (c) => [['自动（推荐）', '']].concat(c.fmt.encs.map((e) => [ENC_LABEL[e] || e, e])), build: (v, c) => (v && v !== c.fmt.vc ? { vcodec: v } : {}) },
        { id: 'qmode', sec: '输出质量', label: '质量模式', kind: 'seg', when: isVid, opts: () => [['恒定质量（推荐）', 'crf'], ['目标码率', 'br']], build: () => ({}) },
        { id: 'crf', sec: '输出质量', label: '画质 CRF', help: '数字越小越清晰、文件越大', ends: ['14 最清晰', '51 最省体积'], when: (c) => isVid(c) && c.qmode === 'crf' && hasQ(c), min: 14, max: 51, step: 1, def: 28, fmt: (v) => 'CRF ' + v, build: (v) => ({ x: ['-crf', String(v)] }) },
        { id: 'qscale', sec: '输出质量', label: '画质（qscale）', help: 'MPEG-4 用这个：越小越清晰', ends: ['2 最好', '31 最省'], when: (c) => isVid(c) && c.qmode === 'crf' && c.enc === 'mpeg4', min: 2, max: 31, step: 1, def: 10, fmt: (v) => 'q ' + v, build: (v) => ({ x: ['-q:v', String(v)] }) },
        { id: 'vbitrate', sec: '输出质量', label: '目标码率', help: '按体积倒推码率，适合要控制大小的场合', ends: ['200k 更省', '12M 更清晰'], when: (c) => isVid(c) && c.qmode === 'br', min: 200, max: 12000, step: 100, def: 2500, fmt: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'M' : v + 'k'), build: (v) => ({ x: ['-b:v', v + 'k', '-maxrate', Math.round(v * 1.5) + 'k', '-bufsize', v * 2 + 'k'] }) },
        { id: 'tsize', sec: '输出质量', label: '目标体积', help: '按时长自动算码率，压到指定大小附近；与"目标码率"二选一；浏览器读不到时长会自动用引擎探测', ends: ['5MB', '500MB'], when: (c) => isVid(c) && c.qmode === 'br', min: 5, max: 500, step: 5, def: 20, fmt: (v) => v + 'MB', build: (v, c) => { const ps = c.st || {}; if (pickedDur <= 0) return {}; const start = (ps.ss && ps.ss.on) ? ps.ss.v : 0; let end = Math.min(pickedDur, start + ((ps.dur && ps.dur.on) ? ps.dur.v : 1e9), (ps.to && ps.to.on) ? ps.to.v : 1e9); const eff = Math.max(1, end - start); const ab = (ps.abr && ps.abr.on) ? ps.abr.v : 128; const vb = Math.max(8, Math.round(v * 8192 * 0.85 / eff) - ab); return { x: ['-b:v', vb + 'k', '-maxrate', vb + 'k', '-bufsize', Math.round(vb * 1.5) + 'k'] }; } },
        { id: 'preset', sec: '输出质量', label: '编码速度', help: '越慢同画质体积越小，但等得久', ends: ['最快', '最慢最小'], when: isX26X, min: 0, max: 8, step: 1, def: 2, fmt: (v) => PRESETS[v], build: (v) => ({ x: ['-preset', PRESETS[v]] }) },
        { id: 'tune', sec: '输出质量', adv: true, label: '画面类型', kind: 'seg', help: '动画片选 animation，胶片颗粒选 grain', when: isX26X, opts: () => TUNES.map((t, i) => [t, i]), build: (v) => (v ? { x: ['-tune', TUNES[v]] } : {}) },
        { id: 'profile', sec: '输出质量', adv: true, label: '兼容档位', kind: 'seg', help: '老设备放不了就降到 baseline', when: (c) => c.enc === 'libx264', opts: () => [['自动', 0], ['baseline（最老设备）', 1], ['main', 2], ['high', 3]], build: (v) => ({ x: v === 1 ? ['-profile:v', 'baseline', '-level', '3.0'] : v === 2 ? ['-profile:v', 'main'] : v === 3 ? ['-profile:v', 'high'] : [] }) },
        { id: 'pixfmt', sec: '输出质量', adv: true, label: '像素格式', kind: 'seg', help: 'yuv420p 兼容性最好；444 保留更多色彩', when: isVid, opts: () => [['自动', 0], ['yuv420p（最兼容）', 1], ['yuv422p', 2], ['yuv444p（色彩最全）', 3]], build: (v) => ({ x: v ? ['-pix_fmt', ['', 'yuv420p', 'yuv422p', 'yuv444p'][v]] : [] }) },
        { id: 'gop', sec: '输出质量', adv: true, label: '关键帧间隔', help: '越小越容易拖进度条，体积略大', ends: ['更密', '更稀'], when: isVid, min: 1, max: 300, step: 1, def: 60, fmt: (v) => v + ' 帧', build: (v) => ({ x: ['-g', String(v)] }) },
        { id: 'meta', sec: '输出质量', label: '拍摄信息', kind: 'seg', help: '抹掉可以去掉拍摄设备、GPS 等元数据', opts: () => [['保留', 0], ['抹掉元数据', 1]], build: (v) => (v ? { x: ['-map_metadata', '-1'] } : {}) },
        { id: 'atrack', sec: '输出质量', adv: true, label: '音轨', kind: 'seg', when: isVid, opts: () => [['保留', 0], ['只留第一条', 1], ['去掉声音', 2]], help: '多音轨视频可以只留第一条', build: (v) => (v === 1 ? { x: ['-map', '0:v:0?', '-map', '0:a:0?'] } : v === 2 ? { x: ['-an'] } : {}) },
        { id: 'scale', sec: '画面', label: '分辨率', help: '480p 手机看够用，1080p 适合存档', ends: ['360p 更省', '1080p 更清晰'], when: isVid, min: 120, max: 2160, step: 2, def: 480, fmt: (v) => v + 'p', on: true, build: (v, c) => ({ vf: ['scale=-2:' + v + (c.flags ? ':flags=' + c.flags : '')] }) },
        { id: 'flags', sec: '画面', adv: true, label: '缩放算法', kind: 'seg', help: 'lanczos 最锐，neighbor 适合像素风素材', when: isVid, opts: () => SCALE_FLAGS, build: () => ({}) },
        { id: 'fps', sec: '画面', label: '帧率', help: '每秒多少张画面，越低越省体积', ends: ['省流量', '更流畅'], when: isVid, min: 2, max: 60, step: 1, def: 24, fmt: (v) => v + 'fps', build: (v) => ({ vf: ['fps=' + v] }) },
        { id: 'colors', sec: '画面', label: '颜色数', help: '只对 GIF 生效，越少越省', ends: ['2 色', '64 色'], when: (c) => c.fmt.id === 'gif', min: 2, max: 64, step: 2, def: 16, fmt: (v) => v + ' 色', build: (v, c) => (c.fmt.id === 'gif' ? { gifColors: v } : {}) },
        { id: 'crop', sec: '画面', label: '画面裁切', kind: 'seg', help: '竖版给短视频，方图给头像', when: isVid, opts: () => RATIOS, build: (v) => ({ vf: ratioVF(v, false) }) },
        { id: 'pad', sec: '画面', adv: true, label: '补黑边', kind: 'seg', help: '不裁切，按比例补黑边', when: isVid, opts: () => RATIOS, build: (v) => ({ vf: ratioVF(v, true) }) },
        { id: 'rot', sec: '画面', label: '旋转', kind: 'seg', when: isVid, opts: () => ROTS, build: (v) => ({ vf: v === 1 ? ['transpose=1'] : v === 2 ? ['transpose=1', 'transpose=1'] : v === 3 ? ['transpose=2'] : [] }) },
        { id: 'flip', sec: '画面', adv: true, label: '翻转', kind: 'seg', when: isVid, opts: () => FLIPS, build: (v) => ({ vf: v === 1 ? ['hflip'] : v === 2 ? ['vflip'] : [] }) },
        { id: 'gray', sec: '画面', label: '颜色', kind: 'seg', when: isVid, opts: () => GRAYS, build: (v) => (v ? { vf: ['hue=s=0'] } : {}) },
        { id: 'bright', sec: '画面', adv: true, label: '亮度', help: '想让画面亮一点就往右拖', ends: ['更暗', '更亮'], when: isVid, min: -0.4, max: 0.4, step: 0.02, def: 0.08, fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2), build: (v) => ({ eq: { b: v } }) },
        { id: 'contrast', sec: '画面', adv: true, label: '对比度', help: '越大画面越硬，越小越灰', ends: ['更平', '更硬'], when: isVid, min: 0.4, max: 2.2, step: 0.05, def: 1.3, fmt: (v) => v.toFixed(2) + 'x', build: (v) => ({ eq: { c: v } }) },
        { id: 'sat', sec: '画面', adv: true, label: '饱和度', help: '颜色浓淡，0 就是黑白', ends: ['黑白', '更艳'], when: isVid, min: 0, max: 3, step: 0.05, def: 1.4, fmt: (v) => v.toFixed(2) + 'x', build: (v) => ({ eq: { s: v } }) },
        { id: 'gamma', sec: '画面', adv: true, label: '伽马', help: '调中间调的明暗，暗部发闷可以调', ends: ['更暗', '更亮'], when: isVid, min: 0.6, max: 2, step: 0.05, def: 1.2, fmt: (v) => v.toFixed(2), build: (v) => ({ eq: { g: v } }) },
        { id: 'hue', sec: '画面', adv: true, label: '色相', help: '整体偏色，用来纠正偏绿偏红', ends: ['-180°', '+180°'], when: isVid, min: -180, max: 180, step: 2, def: 20, fmt: (v) => v + '°', build: (v) => ({ vf: ['hue=h=' + v] }) },
        { id: 'sharpen', sec: '画面', adv: true, label: '锐化', help: '压过之后画质发肉可以补一点', ends: ['不锐', '很锐'], when: isVid, min: 0.2, max: 2, step: 0.1, def: 0.8, fmt: (v) => v.toFixed(1), build: (v) => ({ vf: ['unsharp=5:5:' + v.toFixed(1)] }) },
        { id: 'vfade', sec: '画面', adv: true, label: '画面淡入淡出', help: '开头渐渐出现、结尾渐渐消失（结尾位置按素材时长自动算）', ends: ['0.5 秒', '5 秒'], when: isVid, min: 0.5, max: 5, step: 0.5, def: 2, fmt: (v) => v.toFixed(1) + 's', build: (v) => (pickedDur > v * 2 ? { vf: ['fade=t=in:st=0:d=' + v, 'fade=t=out:st=' + (pickedDur - v).toFixed(2) + ':d=' + v] } : { vf: ['fade=t=in:st=0:d=' + v] }) },
        { id: 'vdenoise', sec: '画面', adv: true, label: '降噪', kind: 'seg', help: '暗光噪点、手机夜拍都能压一点', when: isVid, opts: () => NOISE, build: (v) => ({ vf: v === 1 ? ['hqdn3d=2:1:2:3'] : v === 2 ? ['hqdn3d=4:3:6:4.5'] : v === 3 ? ['hqdn3d=7:5:8:6'] : [] }) },
        { id: 'deint', sec: '画面', adv: true, label: '去隔行', kind: 'seg', help: '电视录制、老 DV 素材有横条纹时用', when: isVid, opts: () => [['关', 0], ['yadif（快）', 1], ['bwdif（更好）', 2]], build: (v) => ({ vf: v === 1 ? ['yadif'] : v === 2 ? ['bwdif'] : [] }) },
        { id: 'deband', sec: '画面', adv: true, label: '去色带', kind: 'seg', help: '天空、渐变处一圈圈的色带', when: isVid, opts: () => [['关', 0], ['轻', 1], ['强', 2]], build: (v) => ({ vf: v === 1 ? ['deband=1thr=0.015:2thr=0.015:3thr=0.015'] : v === 2 ? ['deband=1thr=0.04:2thr=0.04:3thr=0.04'] : [] }) },
        { id: 'shake', sec: '画面', adv: true, label: '防抖', kind: 'seg', help: '手持拍摄的轻微抖动；抖太狠救不回来', when: isVid, opts: () => [['关', 0], ['开', 1]], build: (v) => (v ? { vf: ['deshake'] } : {}) },
        ...audioForVideo(),
        { id: 'abr', sec: '声音', adv: true, label: '音轨码率', help: '画面之外的声音体积', ends: ['32k 省', '320k 好'], when: (c) => !!c.fmt.ac, min: 32, max: 320, step: 8, def: 128, fmt: (v) => v + 'k', build: (v) => ({ abitrate: v + 'k' }) },
        { id: 'ss', sec: '时间', label: '从第几秒开始', help: '裁掉开头的一部分', ends: ['开头', '越往后'], min: 0, max: 3600, step: 1, def: 10, fmt: (v) => hms(v), build: (v) => ({ x: ['-ss', String(v)] }) },
        { id: 'dur', sec: '时间', label: '取多长', help: '只保留这段时间，多余部分丢掉', ends: ['1 秒', '更长'], min: 1, max: 600, step: 1, def: 20, fmt: (v) => hms(v), build: (v) => ({ x: ['-t', String(v)] }) },
        { id: 'to', sec: '时间', label: '到第几秒结束', help: '按结束时间点裁剪；与"取多长"二选一，启用一个会自动关另一个', ends: ['开头', '越往后'], min: 1, max: 3600, step: 1, def: 30, fmt: (v) => hms(v), build: (v) => ({ x: ['-to', String(v)] }) },
        { id: 'rev', sec: '时间', adv: true, label: '倒放', kind: 'seg', help: '整套倒着放；长视频吃内存，建议先裁短', when: isVid, opts: () => [['正序', 0], ['倒放', 1]], build: (v) => (v ? { vf: ['reverse'], af: ['areverse'] } : {}) }
    ],
    audio: [
        { id: 'amode', sec: '输出质量', label: '质量模式', kind: 'seg', help: 'VBR 通常同体积更好听', when: (c) => c.fmt.q || c.fmt.id === 'ogg', opts: (c) => (c.fmt.q ? [['固定码率', 'br'], ['恒定质量 VBR', 'vbr']] : [['恒定质量 VBR（推荐）', 'vbr'], ['固定码率', 'br']]), build: () => ({}) },
        { id: 'bitrate', sec: '输出质量', label: '码率', help: '越高越好听、文件越大', ends: ['8k 最小', '320k 最好'], when: (c) => c.amode !== 'vbr' && c.fmt.id !== 'ogg', min: 8, max: 320, step: 8, def: 128, fmt: (v) => v + 'k', build: (v) => ({ abitrate: v + 'k' }) },
        { id: 'vbrq', sec: '输出质量', label: '质量等级', help: '数字越小音质越好、文件越大', ends: ['0 最好', '9 最省'], when: (c) => (c.fmt.id === 'mp3' || c.fmt.id === 'ogg') && c.amode === 'vbr', min: 0, max: 9, step: 1, def: 3, fmt: (v) => 'q' + v, build: (v) => ({ x: ['-q:a', String(v)] }) },
        { id: 'vbrflag', sec: '输出质量', label: 'VBR 开关', kind: 'seg', when: (c) => c.fmt.id === 'ogg' && c.amode === 'vbr', opts: () => [['开启（更好）', 1]], build: () => ({ x: ['-vbr', 'on'] }) },
        { id: 'bdepth', sec: '输出质量', adv: true, label: '位深', kind: 'seg', help: '位数越高越无损、体积越大', when: (c) => !!c.fmt.bd, opts: () => [['16 位（通用）', 0], ['24 位（更好）', 1], ['8 位（最省）', 2]], build: (v) => (v ? { acodec: ['pcm_s16le', 'pcm_s24le', 'pcm_u8'][v] } : {}) },
        { id: 'flevel', sec: '输出质量', adv: true, label: '压缩级别', help: '越高越小、越慢，音质不变', ends: ['快', '最小'], when: (c) => !!c.fmt.level, min: 0, max: 12, step: 1, def: 5, fmt: (v) => 'L' + v, build: (v) => ({ x: ['-compression_level', String(v)] }) },
        ...AUDIO_CORE,
        { id: 'ss', sec: '时间', label: '从第几秒开始', help: '裁掉开头的一部分', ends: ['开头', '越往后'], min: 0, max: 3600, step: 1, def: 10, fmt: (v) => hms(v), build: (v) => ({ x: ['-ss', String(v)] }) },
        { id: 'dur', sec: '时间', label: '取多长', help: '只保留这段时间，多余部分丢掉', ends: ['1 秒', '更长'], min: 1, max: 600, step: 1, def: 20, fmt: (v) => hms(v), build: (v) => ({ x: ['-t', String(v)] }) },
        { id: 'to', sec: '时间', label: '到第几秒结束', help: '按结束时间点裁剪；与"取多长"二选一，启用一个会自动关另一个', ends: ['开头', '越往后'], min: 1, max: 3600, step: 1, def: 30, fmt: (v) => hms(v), build: (v) => ({ x: ['-to', String(v)] }) },
        { id: 'rev', sec: '时间', adv: true, label: '倒放', kind: 'seg', help: '长音频吃内存，建议先裁短', opts: () => [['正序', 0], ['倒放', 1]], build: (v) => (v ? { af: ['areverse'] } : {}) }
    ],
    image: [
        { id: 'wmode', sec: '图片', adv: true, label: '尺寸模式', kind: 'seg', help: '长边不超过是照片最常见的压法', opts: () => [['指定宽度', 0], ['长边不超过', 1], ['保持原尺寸', 2]], build: () => ({}) },
        { id: 'width', sec: '图片', label: '宽度', help: '越小越省流量，1600 够发原图', ends: ['40px', '2000px'], min: 40, max: 4000, step: 10, def: 800, fmt: (v) => v + 'px', on: true, build: (v, c) => ({ vf: c.wmode === 1 ? ['scale=min(' + v + '\\,iw):-2' + (c.flags ? ':flags=' + c.flags : '')] : c.wmode === 2 ? [] : ['scale=' + v + ':-2' + (c.flags ? ':flags=' + c.flags : '')] }) },
        { id: 'flags', sec: '图片', adv: true, label: '缩放算法', kind: 'seg', opts: () => SCALE_FLAGS, build: () => ({}) },
        { id: 'q', sec: '图片', label: '质量', help: '越高越清晰、文件越大', ends: ['最低', '最高'], when: (c) => !!c.fmt.q, min: 1, max: 100, step: 1, def: 70, fmt: (v) => v + ' 分', build: (v, c) => (c.fmt.id === 'webp' ? { x: ['-quality', String(v)] } : { x: ['-q:v', String(31 - Math.round(v * 29 / 100))] }) },
        { id: 'wloss', sec: '图片', adv: true, label: '无损', kind: 'seg', help: '无损 WebP 比 PNG 小三四成', when: (c) => !!c.fmt.wl, opts: () => [['关（有损）', 0], ['开（无损）', 1]], build: (v) => (v ? { x: ['-lossless', '1'] } : {}) },
        { id: 'plevel', sec: '图片', adv: true, label: '压缩级别', help: '只影响体积和耗时，不掉画质', ends: ['快', '最小'], when: (c) => !!c.fmt.level, min: 0, max: 9, step: 1, def: 6, fmt: (v) => 'L' + v, build: (v) => ({ x: ['-compression_level', String(v)] }) },
        { id: 'pixf', sec: '图片', adv: true, label: '像素格式', kind: 'seg', help: '截图要透明选 RGBA，要小选灰度', opts: () => [['自动', 0], ['8 位灰度', 1], ['24 位色', 2], ['带透明 RGBA', 3]], build: (v) => (v ? { x: ['-pix_fmt', ['', 'gray', 'rgb24', 'rgba'][v]] } : {}) },
        { id: 'sharpen', sec: '图片', adv: true, label: '锐化', help: '缩过之后补一点细节', ends: ['不锐', '很锐'], min: 0.2, max: 2, step: 0.1, def: 0.8, fmt: (v) => v.toFixed(1), build: (v) => ({ vf: ['unsharp=5:5:' + v.toFixed(1)] }) },
        { id: 'colors', sec: '图片', label: '颜色数', help: '只对 GIF 生效，越少越省', ends: ['2 色', '64 色'], when: (c) => c.fmt.id === 'gif', min: 2, max: 64, step: 2, def: 16, fmt: (v) => v + ' 色', build: (v, c) => (c.fmt.id === 'gif' ? { gifColors: v } : {}) },
        { id: 'gray', sec: '图片', label: '颜色', kind: 'seg', opts: () => GRAYS, build: (v) => (v ? { vf: ['hue=s=0'] } : {}) },
        { id: 'rot', sec: '图片', label: '旋转', kind: 'seg', opts: () => ROTS, build: (v) => ({ vf: v === 1 ? ['transpose=1'] : v === 2 ? ['transpose=1', 'transpose=1'] : v === 3 ? ['transpose=2'] : [] }) },
        { id: 'flip', sec: '图片', adv: true, label: '翻转', kind: 'seg', opts: () => FLIPS, build: (v) => ({ vf: v === 1 ? ['hflip'] : v === 2 ? ['vflip'] : [] }) },
        { id: 'crop', sec: '图片', label: '画面裁切', kind: 'seg', help: '方图适合头像、竖版适合短视频封面', opts: () => RATIOS, build: (v) => ({ vf: ratioVF(v, false) }) },
        { id: 'bright', sec: '图片', adv: true, label: '亮度', ends: ['更暗', '更亮'], min: -0.4, max: 0.4, step: 0.02, def: 0.08, fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2), build: (v) => ({ eq: { b: v } }) },
        { id: 'contrast', sec: '图片', adv: true, label: '对比度', ends: ['更平', '更硬'], min: 0.4, max: 2.2, step: 0.05, def: 1.3, fmt: (v) => v.toFixed(2) + 'x', build: (v) => ({ eq: { c: v } }) },
        { id: 'sat', sec: '图片', adv: true, label: '饱和度', ends: ['黑白', '更艳'], min: 0, max: 3, step: 0.05, def: 1.4, fmt: (v) => v.toFixed(2) + 'x', build: (v) => ({ eq: { s: v } }) },
        { id: 'hue', sec: '图片', adv: true, label: '色相', ends: ['-180°', '+180°'], min: -180, max: 180, step: 2, def: 20, fmt: (v) => v + '°', build: (v) => ({ vf: ['hue=h=' + v] }) },
        { id: 'afps', sec: '时间', adv: true, label: '动图帧率', help: '只对 GIF/WebP 动图有效', ends: ['更省', '更流畅'], when: (c) => c.fmt.id === 'gif' || c.fmt.id === 'webp', min: 2, max: 30, step: 1, def: 12, fmt: (v) => v + 'fps', build: (v) => ({ x: ['-r', String(v)] }) },
        { id: 'adur', sec: '时间', adv: true, label: '动图时长', help: '只对 GIF/WebP 动图有效，切掉多余部分', ends: ['1 秒', '更长'], when: (c) => c.fmt.id === 'gif' || c.fmt.id === 'webp', min: 1, max: 60, step: 1, def: 6, fmt: (v) => v + 's', build: (v) => ({ x: ['-t', String(v)] }) },
        { id: 'meta', sec: '图片', adv: true, label: '拍摄信息', kind: 'seg', help: '抹掉 EXIF（拍摄设备、GPS）', opts: () => [['保留', 0], ['抹掉元数据', 1]], build: (v) => (v ? { x: ['-map_metadata', '-1'] } : {}) }
    ]
};

const SEC_ORDER = { video: ['输出质量', '画面', '声音', '时间'], audio: ['输出质量', '声音', '时间'], image: ['图片', '时间'] };

let panelOpen = false;
let moreOpen = {};
let panelBase = null;
let panelOut = 'out_panel';
let panelVals = {};
let pickedDur = 0;

const FONT_URL = '/static/lab/vendor/ffmpeg/fonts/NotoSansCJK-Regular.ttc';
const FONT_KEY = 'fonts|noto-cjk-regular';

async function ensureFont(inst) {
    try {
        const dirs = await inst.listDir('/');
        if (dirs.some(function (e) { return e.name === 'fonts'; })) return true;
    } catch (e) {}
    let blob = null;
    try { blob = await idbGet(FONT_KEY); } catch (e) {}
    if (!blob) {
        const resp = await fetch(FONT_URL);
        if (!resp.ok) return false;
        blob = new Blob([await resp.arrayBuffer()], { type: 'font/collection' });
        idbPut(FONT_KEY, blob);
        termWrite('[ OK ] 中文字体已下载并存入本机缓存（下次直接用）', 'l-sys');
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    try { await inst.createDir('/fonts'); } catch (e) {}
    await inst.writeFile('/fonts/NotoSansCJK-Regular.ttc', buf);
    return true;
}

const TPL_COMBO = [
    ['拼接成一条（首尾相接）', '-i {IN} -i {IN2} -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[a]" -map "[a]" -c:a libmp3lame out_combo.mp3'],
    ['转场拼接（交叉渐变 1 秒）', '-i {IN} -i {IN2} -filter_complex "[0:a]aresample=44100,asetpts=PTS-STARTPTS[a0];[1:a]aresample=44100,asetpts=PTS-STARTPTS[a1];[a0][a1]acrossfade=d=1:c1=tri:c2=tri[out]" -map "[out]" -c:a libmp3lame out_xfade.mp3'],
    ['混成一条音轨（叠在一起）', '-i {IN} -i {IN2} -filter_complex "amix=inputs=2:duration=shortest:normalize=0[a]" -map "[a]" -c:a libmp3lame out_mix.mp3']
];

const TPL_COMBO_VIDEO = [
    ['拼接成一条（首尾相接）', '-i {IN} -i {IN2} -filter_complex "[0:v]scale=320:240,setsar=1,fps=25[v0];[0:a]aresample=44100[a0];[1:v]scale=320:240,setsar=1,fps=25[v1];[1:a]aresample=44100[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 26 -c:a aac -movflags +faststart out_combo.mp4'],
    ['转场拼接（1 秒交叉溶解）', '-i {IN} -i {IN2} -filter_complex "[0:v]scale=320:240,setsar=1,setpts=PTS-STARTPTS,settb=AVTB,fps=25[v0];[0:a]aresample=44100,asetpts=PTS-STARTPTS[a0];[1:v]scale=320:240,setsar=1,setpts=PTS-STARTPTS,settb=AVTB,fps=25[v1];[1:a]aresample=44100,asetpts=PTS-STARTPTS[a1];[v0][v1]xfade=transition=fade:duration=1:offset=2[v];[a0][a1]acrossfade=d=1[a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 26 -c:a aac -movflags +faststart out_xfade.mp4'],
    ['画面并排（左右分屏，声音叠加）', '-i {IN} -i {IN2} -filter_complex "[0:v]scale=-2:240,setsar=1,fps=25[v0];[1:v]scale=-2:240,setsar=1,fps=25[v1];[0:a]aresample=44100[a0];[1:a]aresample=44100[a1];[v0][v1]hstack=inputs=2[v];[a0][a1]amix=inputs=2:duration=longest:normalize=0[a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 26 -c:a aac -movflags +faststart out_side.mp4']
];

const QING = {
    video: [
        ['MP4（H.264 + AAC 8k）', '原配方，最通用', '-i {IN} -c:v libx264 -r 4 -g 120 -crf 51 -preset veryslow -vf "scale=160:90,hue=s=0" -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -c:a aac -b:a 8k 1_qing_vol40db_hard.mp4'],
        ['MP4 极限版（80x45, 2fps）', '比原配方再砍一半，块状最大', '-i {IN} -c:v libx264 -r 2 -g 120 -crf 51 -preset veryslow -vf "scale=80:46,hue=s=0" -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -c:a aac -b:a 8k 1_qing_extreme.mp4'],
        ['MKV（原配方换壳）', '同 MP4 参数，MKV 容器', '-i {IN} -c:v libx264 -r 4 -g 120 -crf 51 -preset veryslow -vf "scale=160:90,hue=s=0" -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -c:a aac 1_qing_vol40db_hard.mkv'],
        ['GIF（4fps 8 色，10 秒）', '没有声音，色块感最强', '-i {IN} -t 10 -r 4 -vf "scale=160:-2:flags=neighbor,hue=s=0,split[a][b];[a]palettegen=max_colors=8[p];[b][p]paletteuse" -an 1_qing_4fps_8color.gif'],
        ['MP4 纯视频（删音轨）', '只留 4fps 画面', '-i {IN} -an -c:v libx264 -r 4 -g 120 -crf 51 -preset veryslow -vf "scale=160:90,hue=s=0" 1_qing_nosound.mp4'],
        ['MP3（只留 8k 声音）', '画面丢掉，留废音质', '-i {IN} -vn -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -ac 1 -c:a libmp3lame -b:a 8k 1_qing_vol40db_hard.mp3'],
        ['JPG 封面（第 1 帧）', '单帧 200px 灰度', '-i {IN} -frames:v 1 -vf "scale=200:-2:flags=neighbor,hue=s=0" -q:v 31 1_qing_cover.jpg']
    ],
    audio: [
        ['OGG（Vorbis 8k）', '原配方，体积最小', '-i {IN} -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -ac 1 -c:a libvorbis -b:a 8k 1_qing_vol40db_hard.ogg'],
        ['MP3（8k 单声道）', '哪儿都能放', '-i {IN} -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -ac 1 -c:a libmp3lame -b:a 8k 1_qing_vol40db_hard.mp3'],
        ['M4A（AAC 8k）', '苹果设备友好', '-i {IN} -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -ac 1 -c:a aac -b:a 8k 1_qing_vol40db_hard.m4a'],
        ['WAV（8-bit 电话音）', '无压缩外壳装 8kHz', '-i {IN} -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000,highpass=f=300,lowpass=f=3400" -ac 1 -c:a pcm_u8 1_qing_8bit_phone.wav'],
        ['FLAC（无损装废音质）', '无损容器存最差的音', '-i {IN} -af "volume=40dB,acrusher=bits=4:samples=8,aresample=8000" -ac 1 -c:a flac 1_qing_vol40db_hard.flac'],
        ['OGG 16k（轻损一档）', '没那么烂，能听清话', '-i {IN} -af "volume=20dB,acrusher=bits=6:samples=12,aresample=16000" -c:a libvorbis -b:a 24k 1_qing_soft.ogg']
    ],
    image: [
        ['JPG（200px q31）', '原配方，块状灰阶', '-i {IN} -frames:v 1 -vf "scale=200:-2:flags=neighbor,hue=s=0" -q:v 31 1_qing_vol40db_hard.jpg'],
        ['PNG（8-bit 灰度）', '无损容器存 200px 灰图', '-i {IN} -frames:v 1 -vf "scale=200:-2:flags=neighbor,hue=s=0,format=gray" 1_qing_vol40db_hard.png'],
        ['WebP（q5 灰度）', '体积最小', '-i {IN} -frames:v 1 -vf "scale=200:-2:flags=neighbor,hue=s=0" -c:v libwebp -quality 5 1_qing_vol40db_hard.webp'],
        ['GIF（8 色灰度）', '色带最明显', '-i {IN} -frames:v 1 -vf "scale=200:-2:flags=neighbor,hue=s=0,split[a][b];[a]palettegen=max_colors=8[p];[b][p]paletteuse" 1_qing_8color.gif'],
        ['BMP（8 位灰度）', '1995 年的画质', '-i {IN} -frames:v 1 -vf "scale=200:-2:flags=neighbor,hue=s=0" -pix_fmt gray 1_qing_vol40db_hard.bmp'],
        ['JPG 更狠（80px）', '看不见，但存在', '-i {IN} -frames:v 1 -vf "scale=80:-2:flags=neighbor,hue=s=0" -q:v 31 1_qing_tiny.jpg']
    ]
};

function qingFor(ext) {
    return QING[tplFamily(ext)] || QING.video;
}

function tplFamily(ext) {
    if (AUDIO_EXT.indexOf(ext) >= 0) return 'audio';
    if (IMAGE_EXT.indexOf(ext) >= 0) return 'image';
    return 'video';
}

function templatesFor(ext) {
    const fam = tplFamily(ext);
    const base = fam === 'audio' ? TPL_AUDIO : (fam === 'image' ? TPL_IMAGE : TPL_VIDEO);
    const ovr = TPL_OVR[ext] || {};
    return base.map(function (it) {
        const o = ovr[it[0]];
        return o ? [o[0], o[1]] : it;
    });
}

const MIME = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm',
    gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp'
};

function mimeOf(name) {
    return MIME[extOf(name)] || 'application/octet-stream';
}

function mediaEl(url, name) {
    const ext = extOf(name);
    let el;
    if (VIDEO_EXT.indexOf(ext) >= 0) {
        el = document.createElement('video');
        el.controls = true;
        el.playsInline = true;
        el.preload = 'metadata';
        el.setAttribute('controlslist', 'nodownload');
        el.src = url;
    } else if (IMAGE_EXT.indexOf(ext) >= 0) {
        el = document.createElement('img');
        el.src = url;
        el.alt = name;
    } else {
        el = document.createElement('audio');
        el.controls = true;
        el.preload = 'metadata';
        el.setAttribute('controlslist', 'nodownload');
        el.src = url;
    }
    el.addEventListener('error', function () {
        if (el.tagName !== 'IMG' && el.error && el.error.code !== 3 && el.error.code !== 4) return;
        const box = el.parentNode;
        if (!box) return;
        const note = document.createElement('div');
        note.className = 'prev-fail';
        note.textContent = '这种格式浏览器放不了预览（' + (ext || '未知') + '），文件本身没问题，下载后用本地播放器打开就行';
        box.replaceChild(note, el);
    }, { once: true });
    return el;
}

function quoteName(name) {
    return /\s/.test(name) ? '"' + name.replace(/"/g, '') + '"' : name;
}

function tplFill(cmd) {
    if (!picked) return cmd.replace(/\{IN\}/g, '文件名').replace(/\{IN2\}/g, '第二个文件');
    let out = cmd.replace(/\{IN\}/g, quoteName(picked.name));
    out = out.replace(/\{IN2\}/g, picked2 ? quoteName(picked2.name) : '第二个文件');
    return out;
}

function tplBase(cmd) {
    const toks = tokenize(tplFill(cmd));
    const args = [];
    let outBase = '';
    for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (t === '-i') { i += 1; continue; }
        if (i === toks.length - 1 && /\.[a-z0-9]{2,4}$/i.test(t)) { outBase = t.replace(/\.[a-z0-9]{2,4}$/i, ''); continue; }
        args.push(t);
    }
    return { args: args, outBase: outBase };
}

function renderQing() {
    qingGrid.textContent = '';
    qingList.hidden = true;
    if (!picked) return;
    const list = qingFor(picked.ext);
    qsHd.textContent = '晚清全损压缩 - 选导出格式（' + list.length + ' 种）';
    list.forEach(function (v) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'qs';
        b.title = v[2];
        const t = document.createElement('b');
        t.textContent = v[0];
        const d = document.createElement('span');
        d.textContent = v[1];
        b.appendChild(t);
        b.appendChild(d);
        b.addEventListener('click', function () {
            cmdInput.value = tplFill(v[2]);
            cmdInput.focus({ preventScroll: true });
            termWrite('[ .. ] 晚清全损压缩 - ' + v[0], 'l-sys');
        });
        qingGrid.appendChild(b);
    });
}


function panelState(fam) {
    if (!panelVals[fam]) {
        const same = picked && PFMT[fam].some(function (f) { return f.id === picked.ext; });
        panelVals[fam] = { __fmt: same ? picked.ext : PFMT[fam][0].id };
    }
    return panelVals[fam];
}


function panelInit(st, defs, ctx) {
    defs.forEach(function (c) {
        if (st[c.id]) return;
        if (c.kind === 'seg') {
            const opts = typeof c.opts === 'function' ? c.opts(ctx || { fmt: { id: '' }, enc: '', qmode: 'crf', amode: 'br' }) : c.opts;
            st[c.id] = { on: false, v: (opts && opts.length ? opts[0][1] : 0) };
        } else {
            st[c.id] = { on: false, v: c.def };
        }
    });
}

function fmtDef(fam, id) {
    const list = PFMT[fam];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
}

function ctxOf(fam, st, fmtId) {
    const fmt = fmtDef(fam, fmtId);
    const enc = (st.enc && st.enc.on && st.enc.v) ? st.enc.v : (fmt.vc || '');
    const qmode = (st.qmode && st.qmode.on && st.qmode.v) ? st.qmode.v : 'crf';
    const amode = (st.amode && st.amode.on && st.amode.v) ? st.amode.v : 'br';
    const flags = (st.flags && st.flags.on && st.flags.v) ? ['bicubic', 'lanczos', 'neighbor', 'spline'][st.flags.v] : '';
    const wmode = (st.wmode && st.wmode.on) ? st.wmode.v : 0;
    return { fam: fam, fmt: fmt, enc: enc, qmode: qmode, amode: amode, flags: flags, wmode: wmode, st: st };
}

function controlList(fam, ctx) {
    return PANEL[fam].filter(function (c) { return !c.when || c.when(ctx); });
}

function defOf(fam, id) {
    const list = PANEL[fam];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
}

function sliderFill(el) {
    const min = parseFloat(el.min), max = parseFloat(el.max), v = parseFloat(el.value);
    el.style.setProperty('--fill', ((v - min) / (max - min) * 100).toFixed(1) + '%');
}

function fmtRow(st, fam) {
    const row = document.createElement('div');
    row.className = 'p-row p-seg';
    row.dataset.id = '__fmt';
    const lab = document.createElement('span');
    lab.className = 'p-lab';
    lab.textContent = '输出格式';
    row.appendChild(lab);
    const hint = document.createElement('div');
    hint.className = 'p-fmt-hint';
    hint.textContent = fmtDef(fam, st.__fmt).label + ' - ' + fmtDef(fam, st.__fmt).hint;
    row.appendChild(hint);
    const box = document.createElement('div');
    box.className = 'p-segs';
    PFMT[fam].forEach(function (f) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'p-segbtn' + (st.__fmt === f.id ? ' on' : '');
        b.textContent = f.label;
        b.addEventListener('click', function () {
            st.__fmt = f.id;
            renderPanel();
            applyPanel();
        });
        box.appendChild(b);
    });
    row.appendChild(box);
    return row;
}

function segRow(st, fam, c, ctx) {
    const cur = st[c.id];
    const opts = typeof c.opts === 'function' ? c.opts(ctx) : c.opts;
    const row = document.createElement('div');
    row.className = 'p-row p-seg';
    row.dataset.id = c.id;
    if (cur.on) row.classList.add('on');
    const lab = document.createElement('button');
    lab.type = 'button';
    lab.className = 'p-lab';
    lab.textContent = c.label;
    lab.title = c.help || '点一下切换这一项';
    row.appendChild(lab);
    const box = document.createElement('div');
    box.className = 'p-segs';
    opts.forEach(function (o) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'p-segbtn' + (cur.on && cur.v === o[1] ? ' on' : '');
        b.textContent = o[0];
        b.title = o[2] || '';
        b.addEventListener('click', function () {
            st[c.id] = { on: o[1] !== opts[0][1], v: o[1] };
            renderPanel();
            applyPanel();
        });
        box.appendChild(b);
    });
    row.appendChild(box);
    return row;
}

function rangeRow(st, fam, c, ctx) {
    const cur = st[c.id];
    const row = document.createElement('div');
    row.className = 'p-row';
    row.dataset.id = c.id;
    if (cur.on) row.classList.add('on');
    const lab = document.createElement('button');
    lab.type = 'button';
    lab.className = 'p-lab';
    lab.textContent = c.label;
    lab.title = (c.help ? c.help + '（' : '') + (c.ends ? c.ends[0] + ' ~ ' + c.ends[1] : '') + (c.help ? '）' : '') + '；点一下启用或关闭这一项';
    lab.addEventListener('click', function () {
        cur.on = !cur.on;
        renderPanel();
        applyPanel();
    });
    const el = document.createElement('input');
    el.type = 'range';
    el.min = String(c.min);
    el.max = String(c.max);
    el.step = String(c.step);
    if ((c.id === 'ss' || c.id === 'dur') && pickedDur > 0) {
        const cap = c.id === 'ss' ? Math.floor(pickedDur) : Math.ceil(pickedDur);
        el.max = String(Math.max(c.min, cap));
        if (cur.v > parseFloat(el.max)) { cur.v = parseFloat(el.max); st[c.id] = cur; }
    }
    el.value = String(cur.v);
    el.setAttribute('aria-label', c.label);
    el.setAttribute('aria-valuetext', c.fmt(cur.v));
    sliderFill(el);
    const val = document.createElement('span');
    val.className = 'p-val';
    val.textContent = cur.on ? c.fmt(cur.v) : '关';
    el.addEventListener('input', function () {
        cur.v = parseFloat(el.value);
        st[c.id] = cur;
        if (!cur.on) {
            cur.on = true;
            row.classList.add('on');
        }
        if (c.id === 'tsize' && cur.on && pickedDur <= 0 && !probingDur) {
            ensureDuration().then(function (d) {
                if (d > 0) { renderPanel(); applyPanel(); markRows(['tsize']); }
            });
        }
        const MUTEX = { to: 'dur', dur: 'to', tsize: 'vbitrate', vbitrate: 'tsize' };
        const other = MUTEX[c.id];
        if (other && st[other] && st[other].on) {
            st[other].on = false;
            const otherRow = pBody.querySelector('.p-row[data-id="' + other + '"]');
            if (otherRow) { otherRow.classList.remove('on'); const ov = otherRow.querySelector('.p-val'); if (ov) ov.textContent = '关'; }
        }
        val.textContent = c.fmt(cur.v);
        el.setAttribute('aria-valuetext', c.fmt(cur.v));
        sliderFill(el);
        applyPanel();
    });
    row.appendChild(lab);
    row.appendChild(el);
    row.appendChild(val);
    return row;
}

function renderPanel() {
    if (!pBox || !pBody || !pCaret || !pSub) return;
    pBody.textContent = '';
    if (!picked) {
        pBox.classList.add('off');
        pSub.textContent = '选文件后可用';
        pCaret.textContent = '[ + ]';
        pBody.hidden = true;
        return;
    }
    const fam = tplFamily(picked.ext);
    const st = panelState(fam);
    if (st.__fmt && !PFMT[fam].some(function (f) { return f.id === st.__fmt; })) st.__fmt = PFMT[fam][0].id;
    const ctx = ctxOf(fam, st, st.__fmt || PFMT[fam][0].id);
    panelInit(st, PANEL[fam], ctx);
    pBox.classList.remove('off');
    pCaret.textContent = panelOpen ? '[ - ]' : '[ + ]';
    pSub.textContent = panelOpen ? '改动即时写进指令' : '点标题展开 - 滑动条调参，实时写进指令';
    pBody.hidden = !panelOpen;
    if (!panelOpen) return;
    const grid = document.createElement('div');
    grid.className = 'p-grid';
    const secs = ['输出格式'].concat(SEC_ORDER[fam] || []);
    secs.forEach(function (secName) {
        const rows = secName === '输出格式'
            ? null
            : PANEL[fam].filter(function (c) { return c.sec === secName && (!c.when || c.when(ctx)); });
        if (rows && !rows.length) return;
        const box = document.createElement('div');
        box.className = 'p-sec';
        const hd = document.createElement('div');
        hd.className = 'p-sec-hd';
        hd.textContent = secName;
        box.appendChild(hd);
        if (!rows) {
            box.appendChild(fmtRow(st, fam));
            grid.appendChild(box);
            return;
        }
        rows.filter(function (c) { return !c.adv; }).forEach(function (c) {
            box.appendChild(c.kind === 'seg' ? segRow(st, fam, c, ctx) : rangeRow(st, fam, c, ctx));
        });
        const advs = rows.filter(function (c) { return c.adv; });
        if (advs.length) {
            const key = fam + '|' + secName;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'p-more';
            btn.textContent = moreOpen[key] ? '收起高级项' : '更多 ' + advs.length + ' 项（编解码、滤镜、兼容性）';
            btn.addEventListener('click', function () {
                moreOpen[key] = !moreOpen[key];
                renderPanel();
            });
            box.appendChild(btn);
            if (moreOpen[key]) {
                advs.forEach(function (c) {
                    box.appendChild(c.kind === 'seg' ? segRow(st, fam, c, ctx) : rangeRow(st, fam, c, ctx));
                });
            }
        }
        grid.appendChild(box);
    });
    pBody.appendChild(grid);
    const foot = document.createElement('div');
    foot.className = 'p-foot';
    foot.textContent = '标着"关"的项不写进指令，拖一下滑条或用标签点亮即生效；参数追加在指令末尾，同名参数以后者为准。不熟的项目先别动，用上面的快捷模板和预设即可。';
    pBody.appendChild(foot);
}

function markRows(ids) {
    ids.forEach(function (id) {
        const row = pBody.querySelector('.p-row[data-id="' + id + '"]');
        if (!row) return;
        row.classList.add('hot');
        setTimeout(function () { row.classList.remove('hot'); }, 1800);
    });
}

function panelArgs(fam, st, fmtId) {
    const ctx = ctxOf(fam, st, fmtId);
    const vf = [], af = [], x = [], tail = (ctx.fmt.tail || []).slice();
    if (ctx.fmt.av === 'audio') x.push('-vn');
    if (ctx.fmt.id === 'gif' && fam === 'video') x.push('-an');
    if (ctx.fmt.vc && !ctx.fmt.av) x.push('-c:v', ctx.fmt.vc);
    if (ctx.fmt.ac) x.push('-c:a', ctx.fmt.ac);
    const eq = {};
    let crush = null, gifColors = 0, voverride = '', aoverride = '', boverride = '';
    PANEL[fam].forEach(function (c) {
        const s = st[c.id];
        if (!s || !s.on) return;
        if (c.when && !c.when(ctx)) return;
        const o = c.build(s.v, ctx) || {};
        if (o.vf) o.vf.forEach(function (f) { vf.push(f); });
        if (o.af) o.af.forEach(function (f) { af.push(f); });
        if (o.x) o.x.forEach(function (a) { x.push(a); });
        if (o.eq) for (const k in o.eq) eq[k] = o.eq[k];
        if (o.crush) crush = Object.assign(crush || {}, o.crush);
        if (o.gifColors) gifColors = o.gifColors;
        if (o.vcodec) voverride = o.vcodec;
        if (o.acodec) aoverride = o.acodec;
        if (o.abitrate) boverride = o.abitrate;
    });
    const swapCodec = function (flag, codec) {
        if (!codec) return;
        const i = x.indexOf(flag);
        if (i >= 0) { x.splice(i, 2); }
        x.push(flag, codec);
    };
    swapCodec('-c:v', voverride);
    swapCodec('-c:a', aoverride);
    swapCodec('-b:a', boverride);
    if (crush) af.push('acrusher=bits=' + (crush.bits || 16) + ':samples=' + (crush.samples || 1));
    if (Object.keys(eq).length) {
        const eqp = [];
        if (eq.b !== undefined) eqp.push('brightness=' + eq.b);
        if (eq.c !== undefined) eqp.push('contrast=' + eq.c);
        if (eq.s !== undefined) eqp.push('saturation=' + eq.s);
        if (eq.g !== undefined) eqp.push('gamma=' + eq.g);
        if (eqp.length) vf.push('eq=' + eqp.join(':'));
    }
    if (ctx.fmt.id === 'gif' && fam !== 'audio') {
        if (gifColors) vf.push('split[a][b];[a]palettegen=max_colors=' + gifColors + '[p];[b][p]paletteuse');
        else vf.push('split[a][b];[a]palettegen[p];[b][p]paletteuse');
    }
    const animMode = !!(st.afps && st.afps.on) || !!(st.adur && st.adur.on);
    if (fam === 'image' && ctx.fmt.id === 'webp' && animMode) x.push('-loop', '0');
    if (fam === 'image' && ctx.fmt.id !== 'gif' && !animMode) x.push('-frames:v', '1');
    const hasA = fam !== 'image' && (ctx.fmt.ac || ctx.fmt.av !== 'audio');
    if (!hasA) { for (let i = af.length - 1; i >= 0; i--) af.splice(i, 1); }
    return { fmt: ctx.fmt, ctx: ctx, vf: vf, af: af, x: x, tail: tail };
}

function outNameFor(fmtId) {
    const toks = tokenize(cmdInput.value);
    const last = toks.length ? toks[toks.length - 1] : '';
    let base = panelOut;
    if (last && last.charAt(0) !== '-' && /\.[a-z0-9]{2,4}$/i.test(last)) base = last.replace(/\.[a-z0-9]{2,4}$/i, '');
    return quoteName(base + '.' + fmtId);
}

function applyPanel() {
    if (!picked) return;
    const fam = tplFamily(picked.ext);
    const st = panelState(fam);
    const fmtId = st.__fmt || PFMT[fam][0].id;
    const a = panelArgs(fam, st, fmtId);
    const parts = ['-i', quoteName(picked.name)];
    if (panelBase && panelBase.length) {
        const owned = {};
        a.x.forEach(function (t, i) { if (i % 2 === 0 && typeof t === 'string' && t.charAt(0) === '-') owned[t] = true; });
        if (a.vf.length) owned['-vf'] = true;
        if (a.af.length) owned['-af'] = true;
        const base = [];
        for (let i = 0; i < panelBase.length; i++) {
            const t = panelBase[i];
            if (owned[t]) { i++; continue; }
            base.push(t);
        }
        parts.push.apply(parts, base);
    }
    if (a.vf.length) parts.push('-vf', '"' + a.vf.join(',') + '"');
    if (a.af.length) parts.push('-af', '"' + a.af.join(',') + '"');
    parts.push.apply(parts, a.x);
    parts.push.apply(parts, a.fmt.x);
    parts.push.apply(parts, a.tail);
    parts.push(outNameFor(fmtId));
    cmdInput.value = parts.join(' ');
    cmdInput.focus({ preventScroll: true });
}

function togglePanel() {
    panelOpen = !panelOpen;
    renderPanel();
}

if (pBtn) pBtn.addEventListener('click', togglePanel);

function renderTemplates() {
    tplGrid.textContent = '';
    renderQing();
    const list = picked ? templatesFor(picked.ext) : TPL_VIDEO;
    if (picked) {
        const fam = tplFamily(picked.ext);
        tplHd.textContent = '快捷模板 - ' + FAM_NAME[fam] + ' ' + picked.ext.toUpperCase() + '，点一下填入指令';
    } else {
        tplHd.textContent = '快捷模板 - 选文件后可用';
    }
    list.forEach(function (it) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tpl';
        b.textContent = it[0];
        b.title = it[1];
        b.disabled = !picked;
        b.addEventListener('click', function () {
            if (!picked) return;
            if (it[2] && it[2].length) {
                const base = tplBase(it[1]);
                panelBase = base.args;
                if (base.outBase) panelOut = base.outBase;
                const fam = tplFamily(picked.ext);
                const st = panelState(fam);
                it[2].forEach(function (id) { if (st[id]) st[id].on = true; });
                panelOpen = true;
                renderPanel();
                applyPanel();
                markRows(it[2]);
                termWrite('[ .. ] 已展开参数面板：' + it[0] + '（拖动滑条调整）', 'l-sys');
                return;
            }
            cmdInput.value = tplFill(it[1]);
            cmdInput.focus({ preventScroll: true });
            termWrite('[ .. ] 已填入模板：' + it[0], 'l-sys');
            if (it[0] === '晚清全损压缩') qingList.hidden = !qingList.hidden;
        });
        tplGrid.appendChild(b);
    });
    if (picked2 && picked2.sub) {
        const hd = document.createElement('div');
        hd.className = 'tpl-hd';
        hd.textContent = '字幕 - 用「' + picked2.name + '」';
        tplGrid.appendChild(hd);
        const subTpl = tplFamily(picked.ext) === 'video'
            ? ['烧录字幕（中文可渲染，字体自动下载）', '-i {IN} -vf "subtitles={IN2}:fontsdir=/fonts" -c:v libx264 -preset veryfast -crf 24 -c:a copy sub_out.mp4']
            : null;
        if (subTpl) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tpl';
            b.textContent = subTpl[0];
            b.title = subTpl[1];
            b.addEventListener('click', function () {
                const name = picked2.name.replace(/"/g, '');
                cmdInput.value = '-i ' + quoteName(picked.name) + ' -vf "subtitles=/' + name + ':fontsdir=/fonts:force_style=FontName=Noto Sans CJK SC" -c:v libx264 -preset veryfast -crf 24 -c:a copy sub_out.mp4';
                cmdInput.focus({ preventScroll: true });
                termWrite('[ .. ] 烧字幕：首次会下载约 11MB 中文字体（之后走本机缓存）', 'l-sys');
            });
            tplGrid.appendChild(b);
        }
    }
    if (picked2 && tplFamily(picked2.ext) === tplFamily(picked.ext)) {
        const hd = document.createElement('div');
        hd.className = 'tpl-hd';
        hd.textContent = '组合 - 与「' + picked2.name + '」一起处理';
        tplGrid.appendChild(hd);
        const combos = tplFamily(picked.ext) === 'video' ? TPL_COMBO_VIDEO : TPL_COMBO;
        combos.forEach(function (it) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tpl';
            b.textContent = it[0];
            b.title = it[1];
            b.addEventListener('click', function () {
                cmdInput.value = tplFill(it[1]);
                cmdInput.focus({ preventScroll: true });
                termWrite('[ .. ] 已填入组合模板：' + it[0] + '（输出名可自行修改）', 'l-sys');
            });
            tplGrid.appendChild(b);
        });
        const group = mediaFiles.filter(function (m) { return tplFamily(m.ext) === tplFamily(picked.ext); });
        const n = group.length;
        if (n >= 3) {
            const hd2 = document.createElement('div');
            hd2.className = 'tpl-hd';
            hd2.textContent = '全部 ' + n + ' 个一起';
            tplGrid.appendChild(hd2);
            const isVid = tplFamily(picked.ext) === 'video';
            const inputs = group.map(function (m) { return '-i ' + quoteName(m.name); }).join(' ');
            let vfc = '';
            let afc = '';
            group.forEach(function (m, k) {
                if (isVid) vfc += '[' + k + ':v]scale=320:240,setsar=1,fps=25[v' + k + '];';
                afc += '[' + k + ':a]aresample=44100[a' + k + '];';
            });
            const alabels = group.map(function (m, k) { return '[a' + k + ']'; }).join('');
            const interleave = '';
            const seglabels = group.map(function (m, k) { return '[v' + k + '][a' + k + ']'; }).join('');
            const mkBtn = function (label, cmd) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'tpl';
                b.textContent = label;
                b.title = cmd;
                b.addEventListener('click', function () {
                    cmdInput.value = cmd;
                    cmdInput.focus({ preventScroll: true });
                    termWrite('[ .. ] 已填入组合模板：' + label + '（' + n + ' 个文件，输出名可自行修改）', 'l-sys');
                });
                tplGrid.appendChild(b);
            };
            if (isVid) {
                mkBtn('拼接全部 ' + n + ' 个（首尾相接）',
                    inputs + ' -filter_complex "' + vfc + afc + seglabels + 'concat=n=' + n + ':v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 26 -c:a aac -movflags +faststart out_all.mp4');
                const rows = Math.ceil(n / 2);
                let grid = '';
                for (let r = 0; r < rows; r++) {
                    const left = group[r * 2];
                    const right = group[r * 2 + 1];
                    const li = r * 2, ri = r * 2 + 1;
                    if (right) grid += '[v' + li + '][v' + ri + ']hstack=inputs=2[row' + r + '];';
                    else grid += '[v' + li + '][blank]hstack=inputs=2:shortest=1[row' + r + '];';
                }
                const rowlabels = '';
                let rowjoin = '';
                for (let r = 0; r < rows; r++) rowjoin += '[row' + r + ']';
                grid += rowjoin + 'vstack=inputs=' + rows + '[v]';
                mkBtn('网格并排 ' + n + ' 个（2 列，声音叠加）',
                    inputs + ' -filter_complex "' + vfc + afc + 'color=c=black:s=320x240:r=25:d=3600[blank];' + grid + ';' + alabels + 'amix=inputs=' + n + ':duration=longest:normalize=0[a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 26 -c:a aac -movflags +faststart out_grid.mp4');
            } else {
                mkBtn('拼接全部 ' + n + ' 个（首尾相接）',
                    inputs + ' -filter_complex "' + afc + alabels + 'concat=n=' + n + ':v=0:a=1[a]" -map "[a]" -c:a libmp3lame out_all.mp3');
            }
            mkBtn('全部混成一条音轨（声音叠加）',
                inputs + ' -filter_complex "' + afc + alabels + 'amix=inputs=' + n + ':duration=shortest:normalize=0[a]" -map "[a]" -c:a libmp3lame out_mix_all.mp3');
        }
    }
    try {
        renderPanel();
    } catch (e) {
        termWrite('[WARN] 参数面板渲染失败：' + (e && e.message ? e.message : e), 'l-err');
    }
}

let ffmpeg = null, enginePromise = null, engineRuns = 0, lastOutExt = '', requeue = false, inUrl = '';
let picked2 = null;
let queue = [];
let batchMode = false;
let mediaFiles = [];
let mainIdx = 0;
let subEntry = null;
let picked = null, busy = false, outUrl = null, hist = [], hIdx = -1;
let total = 0, pos = 0, t0 = 0, timer = null, lineCount = 0;

function pad(n) { return (n < 10 ? '0' : '') + n; }
function hms(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
}
function fmtSize(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
}
function setStatus(text, tone) {
    hStatus.textContent = text;
    hStatus.className = tone || '';
}

function termWrite(text, cls) {
    const atBottom = term.scrollTop + term.clientHeight >= term.scrollHeight - 24;
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    term.appendChild(d);
    lineCount++;
    while (lineCount > 500) { term.removeChild(term.firstChild); lineCount--; }
    if (atBottom) term.scrollTop = term.scrollHeight;
}

let errBuf = [];
let lastLogAt = 0;
let loudRows = [];
let analyzing = false;

function onLog(msg, type) {
    lastLogAt = Date.now();
    if (analyzing && /mean_volume|max_volume/.test(msg)) loudRows.push(msg);
    termWrite(msg, /error|invalid|no such|failed|denied/i.test(msg) ? 'l-err' : 'l-out');
    if (type === 'stderr' && !/^(frame=|size=|\s*$)/.test(msg)) {
        errBuf.push(msg);
        if (errBuf.length > 20) errBuf.shift();
    }
    let m = /Duration:\s*(\d+):(\d\d):([\d.]+)/.exec(msg);
    if (m) total = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
    m = /time=(\d+):(\d\d):([\d.]+)/.exec(msg);
    if (m) {
        pos = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
        hPos.textContent = hms(pos);
        if (total > 0) {
            const r = Math.min(1, pos / total);
            hProgress.textContent = (r * 100).toFixed(1) + '%';
            barFill.style.width = (r * 100).toFixed(1) + '%';
        }
    }
    m = /speed=\s*([\d.]+)x/.exec(msg);
    if (m) hSpeed.textContent = m[1] + 'x';
    m = /Lsize=\s*([\d.]+)\s*([kKmMgG])?i?B/.exec(msg);
    if (m) {
        const u = { k: 1024, m: 1048576, g: 1073741824 }[(m[2] || 'k').toLowerCase()] || 1024;
        hOut.textContent = fmtSize(parseFloat(m[1]) * u);
    }
}

function diagBlock(cmd, cls, msg) {
    LabPiko.set('daze');
    const tail = errBuf.slice(-4).join(' | ');
    termWrite('[diag] 命令: ' + cmd, 'l-err');
    termWrite('[diag] 类别: ' + cls.id + ' / ' + cls.msg, 'l-err');
    if (tail) termWrite('[diag] ffmpeg 末尾: ' + tail.slice(0, 260), 'l-err');
    const text = ['sts-lab 诊断', '命令: ' + cmd, '类别: ' + cls.id + ' ' + cls.msg,
                  '原始错误: ' + msg, 'ffmpeg末尾: ' + tail, '引擎: esm-0.12.10-p1 / 单线程注入'].join('\n');
    const b = document.createElement('button');
    b.className = 'btn-alt';
    b.textContent = '复制诊断';
    b.style.marginTop = '8px';
    b.addEventListener('click', function () {
        navigator.clipboard.writeText(text).then(function () {
            b.textContent = '已复制';
            setTimeout(function () { b.textContent = '复制诊断'; }, 1500);
        }).catch(function () { b.textContent = '复制失败，请手动选中'; });
    });
    term.appendChild(b);
    lineCount++;
}

let probingDur = false;

async function ensureDuration() {
    if (!picked || probingDur) return pickedDur;
    probingDur = true;
    busy = true;
    try {
        termWrite('[ .. ] 浏览器读不到时长，用引擎快速探测…', 'l-sys');
        const inst = await loadEngine();
        await inst.writeFile(picked.name, new Uint8Array(await picked.file.arrayBuffer()));
        total = 0;
        await inst.exec(['-i', picked.name, '-t', '0.1', '-f', 'null', '-']);
        await new Promise(function (r) { setTimeout(r, 150); });
        try { await inst.deleteFile(picked.name); } catch (e) {}
        if (total > 0) {
            pickedDur = total;
            termWrite('[ OK ] 时长 ' + hms(pickedDur) + '（探测所得）', 'l-sys');
        } else {
            termWrite('[WARN] 探测不到时长，"目标体积"用不了，请改用"目标码率"', 'l-err');
        }
    } catch (e) {}
    finally {
        probingDur = false;
        busy = false;
    }
    return pickedDur;
}

async function analyzeLoudness() {
    if (busy || !picked) return;
    const fam = tplFamily(picked.ext);
    if (fam === 'image') { termWrite('[WARN] 图片没有响度，不用分析', 'l-err'); return; }
    busy = true;
    loudBtn.disabled = true;
    runBtn.disabled = true;
    clearBtn.disabled = true;
    setStatus('[ .. ] 分析中');
    termWrite('[ .. ] 正在分析响度（volumedetect，几秒钟）', 'l-sys');
    loudRows = [];
    analyzing = true;
    try {
        const inst = await loadEngine();
        await inst.writeFile(picked.name, new Uint8Array(await picked.file.arrayBuffer()));
        await inst.exec(['-i', picked.name, '-t', '0.1', '-map', '0:a:0?', '-af', 'volumedetect', '-f', 'null', '-']);
        await new Promise(function (r) { setTimeout(r, 200); });
        const joined = loudRows.join('\n');
        const mm = /mean_volume:\s*(-?[\d.]+) dB/.exec(joined);
        const mx = /max_volume:\s*(-?[\d.]+) dB/.exec(joined);
        if (!mm) {
            termWrite('[WARN] 没有读到音频响度（这段素材可能没有音轨）', 'l-err');
            setStatus('[--] 待命');
            return;
        }
        const mean = parseFloat(mm[1]);
        const peak = mx ? parseFloat(mx[1]) : null;
        termWrite('[ OK ] 响度分析：均值 ' + mean.toFixed(1) + ' dB' + (mx ? ' / 峰值 ' + peak.toFixed(1) + ' dB' : ''), 'l-sys');
        if (peak !== null && peak > -0.5) termWrite('[WARN] 峰值已接近满格，再调大音量会破音', 'l-err');
        const st2 = panelState(fam);
        panelInit(st2, PANEL[fam], ctxOf(fam, st2, st2.__fmt || PFMT[fam][0].id));
        if (fam !== 'audio' && !(st2.abr && st2.abr.on)) {
            termWrite('[ .. ] 提示：想整体拉响，拖"音量倍数"到 ' + Math.min(4, Math.pow(10, (-16 - mean) / 20)).toFixed(1) + 'x 左右；忽大忽小就开"音量统一"', 'l-sys');
        } else {
            st2.loud = { on: true, v: Math.max(-30, Math.min(-6, Math.round(mean * 2) / 2)) };
            panelOpen = true;
            renderPanel();
            applyPanel();
            markRows(['loud']);
            termWrite('[ .. ] 已把"音量统一"目标设为 ' + st2.loud.v + ' LUFS（按实测均值），可在面板里微调', 'l-sys');
        }
        setStatus('[--] 待命');
    } catch (err) {
        termWrite('[ERR] 响度分析失败：' + (err && err.message ? err.message : err), 'l-err');
        setStatus('[ERR] 失败', 'err');
    } finally {
        analyzing = false;
        busy = false;
        loudBtn.disabled = !picked;
        runBtn.disabled = !picked;
        clearBtn.disabled = !picked;
    }
}

function loadEngine() {
    if (ffmpeg) return Promise.resolve(ffmpeg);
    if (enginePromise) return enginePromise;
    const first = engineRuns === 0;
    engineNote.textContent = '[ .. ] 引擎加载中';
    setStatus('[ .. ] 加载引擎');
    enginePromise = (async () => {
        const inst = new FFmpeg();
        inst.on('log', (e) => { if (e && e.message) onLog(e.message, e.type); });
        let objUrl = '';
        if (engineBlob) {
            objUrl = URL.createObjectURL(engineBlob);
        }
        try {
            await inst.load({ coreURL: CORE_URL, wasmURL: objUrl || WASM_URL, classWorkerURL: WORKER_URL });
        } catch (err) {
            if (!objUrl) throw err;
            URL.revokeObjectURL(objUrl);
            objUrl = '';
            await inst.load({ coreURL: CORE_URL, wasmURL: WASM_URL, classWorkerURL: WORKER_URL });
        }
        if (objUrl) URL.revokeObjectURL(objUrl);
        ffmpeg = inst;
        engineRuns += 1;
        engineNote.textContent = '[OK] 引擎就绪';
        if (first) termWrite('[OK] 引擎就绪，可以开始处理', 'l-sys');
        return inst;
    })().catch((err) => {
        enginePromise = null;
        engineNote.textContent = '[ERR] 引擎加载失败';
        throw err;
    });
    return enginePromise;
}

function dropEngine() {
    const p = enginePromise;
    ffmpeg = null;
    enginePromise = null;
    engineRuns = 0;
    if (p) p.then((inst) => { try { inst.terminate(); } catch (e) {} }).catch(() => {});
}

const FILTER_NAMES = ('abench abitscope abuffer abuffersink acompressor acontrast acopy acrossfade acrossover acrusher acue addroi adeclick adeclip adecorrelate adelay adenorm aderivative adrawgraph adynamicequalizer adynamicsmooth aecho aemphasis aeval aevalsrc aexciter afade afftdn afftfilt afifo afir afirsrc aformat afreqshift afwtdn agate agraphmonitor ahistogram aiir aintegral ainterleave alatency alimiter allpass allrgb allyuv aloop alphaextract alphamerge amerge ametadata amix amovie amplify amultiply anequalizer anlmdn anlmf anlms anoisesrc anull anullsink anullsrc apad aperms aphasemeter aphaser aphaseshift apsyclip apulsator arealtime aresample areverse arnndn asdr asegment aselect asendcmd asetnsamples asetpts asetrate asettb ashowinfo asidedata asoftclip aspectralstats asplit ass astats astreamselect asubboost asubcut asupercut asuperpass asuperstop atadenoise atempo atilt atrim avectorscope avgblur avsynctest axcorrelate bandpass bandreject bass bbox bench bilateral biquad bitplanenoise blackdetect blackframe blend blockdetect blurdetect bm3d boxblur buffer buffersink bwdif cas cellauto channelmap channelsplit chorus chromahold chromakey chromanr chromashift ciescope codecview color colorbalance colorchannelmixer colorchart colorcontrast colorcorrect colorhold colorize colorkey colorlevels colormap colormatrix colorspace colorspectrum colortemperature compand compensationdelay concat convolution convolve copy cover_rect crop cropdetect crossfeed crystalizer cue curves datascope dblur dcshift dctdnoiz deband deblock decimate deconvolve dedot deesser deflate deflicker dejudder delogo derain deshake despill detelecine dialoguenhance dilation displace dnn_classify dnn_detect dnn_processing doubleweave drawbox drawgraph drawgrid drawtext drmeter dynaudnorm earwax ebur128 edgedetect elbg entropy epx eq equalizer erosion estdif exposure extractplanes extrastereo fade feedback fftdnoiz fftfilt field fieldhint fieldmatch fieldorder fifo fillborders find_rect firequalizer flanger floodfill format fps framepack framerate framestep freezedetect freezeframes fspp gblur geq gradfun gradients graphmonitor grayworld greyedge guided haas haldclut haldclutsrc hdcd headphone hflip highpass highshelf hilbert histeq histogram hqdn3d hqx hstack hsvhold hsvkey hue huesaturation hwdownload hwmap hwupload hysteresis identity idet il inflate interlace interleave join kerndeint kirsch lagfun latency lenscorrection life limitdiff limiter loop loudnorm lowpass lowshelf lumakey lut lut1d lut2 lut3d lutrgb lutyuv mandelbrot maskedclamp maskedmax maskedmerge maskedmin maskedthreshold maskfun mcompand median mergeplanes mestimate metadata midequalizer minterpolate mix monochrome morpho movie mpdecimate mptestsrc msad multiply negate nlmeans nnedi noformat noise normalize null nullsink nullsrc oscilloscope overlay owdenoise pad pal100bars pal75bars palettegen paletteuse pan perms perspective phase photosensitivity pixdesctest pixelize pixscope pp pp7 premultiply prewitt pseudocolor psnr pullup qp random readeia608 readvitc realtime remap removegrain removelogo repeatfields replaygain reverse rgbashift rgbtestsrc roberts rotate sab scale scale2ref scdet scharr scroll segment select selectivecolor sendcmd separatefields setdar setfield setparams setpts setrange setsar settb shear showcqt showfreqs showinfo showpalette showspatial showspectrum showspectrumpic showvolume showwaves showwavespic shuffleframes shufflepixels shuffleplanes sidechaincompress sidechaingate sidedata sierpinski signalstats signature silencedetect silenceremove sinc sine siti smartblur smptebars smptehdbars sobel spectrumsynth speechnorm split spp sr ssim stereo3d stereotools stereowiden streamselect subtitles super2xsai superequalizer surround swaprect swapuv tblend telecine testsrc testsrc2 thistogram threshold thumbnail tile tiltshelf tinterlace tlut2 tmedian tmidequalizer tmix tonemap tpad transpose treble tremolo trim unpremultiply unsharp untile v360 vaguedenoiser varblur vectorscope vflip vfrdet vibrance vibrato vif vignette virtualbass vmafmotion volume volumedetect vstack w3fdif waveform weave xbr xcorrelate xfade xmedian xstack yadif yaepblur yuvtestsrc zoompan zscale').split(' ');
const ENCODER_NAMES = ('a64multi a64multi5 aac ac3 ac3_fixed adpcm_adx adpcm_argo adpcm_ima_alp adpcm_ima_amv adpcm_ima_apm adpcm_ima_qt adpcm_ima_ssi adpcm_ima_wav adpcm_ima_ws adpcm_ms adpcm_swf adpcm_yamaha alac alias_pix amv apng aptx aptx_hd asv1 asv2 avrp avui ayuv bitpacked bmp cfhd cinepak cljr comfortnoise dca dfpwm dnxhd dpx dvvideo eac3 exr ffv1 ffvhuff fits flac flashsv flashsv2 flv g722 g723_1 g726 g726le gif h261 h263 h263p huffyuv jpeg2000 jpegls libmp3lame libopus libtheora libvorbis libvpx libvpx-vp9 libwebp libwebp_anim libx264 libx264rgb libx265 ljpeg magicyuv mjpeg mlp mp2 mp2fixed mpeg1video mpeg2video mpeg4 msmpeg4 msmpeg4v2 msvideo1 nellymoser opus pam pbm pcm_alaw pcm_bluray pcm_dvd pcm_f32be pcm_f32le pcm_f64be pcm_f64le pcm_mulaw pcm_s16be pcm_s16be_planar pcm_s16le pcm_s16le_planar pcm_s24be pcm_s24daud pcm_s24le pcm_s24le_planar pcm_s32be pcm_s32le pcm_s32le_planar pcm_s64be pcm_s64le pcm_s8 pcm_s8_planar pcm_u16be pcm_u16le pcm_u24be pcm_u24le pcm_u32be pcm_u32le pcm_u8 pcm_vidc pcx pfm pgm pgmyuv phm png ppm prores prores_aw prores_ks qoi qtrle r10k r210 rawvideo real_144 roq_dpcm roqvideo rpza rv10 rv20 s302m sbc sgi smc snow sonic sonicls speedhq sunrast svq1 targa tiff truehd tta utvideo v210 v308 v408 v410 vbn vc2 vorbis wavpack wmav1 wmav2 wmv1 wmv2 wrapped_avframe xbm xface xwd y41p yuv4 zlib zmbv').split(' ');
let filterSet = null, encoderSet = null;

function haveFilter(n) {
    if (!filterSet) filterSet = new Set(FILTER_NAMES);
    return filterSet.has(n);
}

function haveEncoder(n) {
    if (!encoderSet) encoderSet = new Set(ENCODER_NAMES);
    return encoderSet.has(n);
}

function nearest(name, kind) {
    const list = kind === 'e' ? ENCODER_NAMES : FILTER_NAMES;
    const n = String(name).toLowerCase();
    let best = '', score = 1e9;
    for (const cand of list) {
        if (Math.abs(cand.length - n.length) > 4) continue;
        let d = 0;
        const len = Math.max(cand.length, n.length);
        for (let i = 0; i < len; i++) if (cand.charAt(i) !== n.charAt(i)) d++;
        if (d < score) { score = d; best = cand; }
    }
    return score <= Math.max(2, Math.floor(n.length / 2)) ? best : '';
}

function filterExprNames(expr) {
    const out = [];
    String(expr).split(/[,]+/).forEach(function (part) {
        let t = part.trim();
        if (!t) return;
        const eq = t.indexOf('=');
        if (eq >= 0) t = t.slice(0, eq);
        if (t.length < 2) return;
        out.push(t);
    });
    return out;
}

function filterComplexNames(expr) {
    const out = [];
    String(expr).split(';').forEach(function (stmt) {
        const bare = stmt.replace(/\[[^\]]*\]/g, ',');
        filterExprNames(bare).forEach(function (n) { out.push(n); });
    });
    return out;
}

function preflight(args) {
    const bad = [];
    const last = args.length ? String(args[args.length - 1]) : '';
    let copies = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-c' || args[i] === '-c:v' || args[i] === '-vcodec') { if (args[i + 1] === 'copy') copies = true; }
    }
    if (/\.webm$/i.test(last) && !copies) {
        bad.push({ kind: '输出格式', name: 'WebM', near: '', why: 'WebM 需要 VP8/VP9，而这两个编码器在本引擎会崩（已实测）。改用 MKV 可以装同样的编码组合' });
    }
    for (let i = 0; i < args.length; i++) {
        const a = args[i] || '';
        if (a === '-c' || a === '-codec' || /^-c(:[a-z0-9]+)?$/.test(a)) {
            const v = args[i + 1];
            if (v && v !== 'copy') {
                if (BROKEN[v]) bad.push({ kind: '编码器', name: v, near: '', why: BROKEN[v] });
                else if (!haveEncoder(v)) bad.push({ kind: '编码器', name: v, near: nearest(v, 'e') });
            }
            i++;
            continue;
        }
        if (a === '-vf' || a === '-af' || a === '-filter' || a === '-filter:v' || a === '-filter:a' || a === '-filter_complex') {
            const v = args[i + 1];
            if (v) {
                const names = a === '-filter_complex' ? filterComplexNames(v) : filterExprNames(v);
                names.forEach(function (n) { if (!haveFilter(n)) bad.push({ kind: '滤镜', name: n, near: nearest(n, 'f') }); });
            }
            i++;
            continue;
        }
    }
    return bad;
}

function withThreads(args) {
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-threads' || args[i] === '-filter_threads' || args[i] === '-filter_complex_threads') return args.slice();
    }
    const out = args.slice();
    const last = out.pop();
    out.push('-threads', '1');
    out.push(last);
    out.unshift('-filter_threads', '1');
    return out;
}

const HEAVY_RE = /\b(hqdn3d|deshake|deband|nlmeans|minterpolate|yadif|bwdif|reverse)\b/;
let guardApplied = false;

function withGuard(args) {
    guardApplied = false;
    const flat = args.join(' ');
    if (!HEAVY_RE.test(flat)) return args.slice();
    if (/scale=|crop=|pad=/.test(flat)) return args.slice();
    const vi = args.indexOf('-vf');
    if (vi < 0) return args.slice();
    const out = args.slice();
    out[vi + 1] = 'scale=-2:720,' + out[vi + 1];
    guardApplied = true;
    return out;
}

const BROKEN = {
    libvpx: 'libvpx(VP8) 在本引擎必崩（已实测），改用 H.264 即可',
    'libvpx-vp9': 'libvpx-vp9 在本引擎必崩（已实测），改用 H.264 即可',
    libopus: 'libopus 在立体声/48k 输入下会崩，改用 libvorbis 或 aac'
};

const ERR_KINDS = [
    { id: 'mem', retry: true, re: /memory access out of bounds|Cannot enlarge memory|out of memory|ArrayBuffer is detached/i,
      msg: '引擎内存不足', tip: '先降分辨率或裁短再试；已自动重建引擎重试一次' },
    { id: 'engine', retry: false, re: /function signature mismatch|null function|Invalid function pointer|unreachable|RuntimeError/i,
      msg: '引擎自身缺陷（wasm 内部调用签名不匹配）', tip: '与你的文件无关：把重滤镜或编码器换一种，或改用模板里的等价写法' },
    { id: 'unsupported', retry: false, re: /Unknown (encoder|decoder|filter|option)|No such filter|Unrecognized option|not found|Undefined constant|Option .* not found|Invalid option/i,
      msg: '命令里有引擎不认的名字', tip: '对照微调面板或 /manual 参数表；手写注意拼写' },
    { id: 'badarg', retry: false, re: /Invalid argument|Invalid data found|Error splitting|not divisible|does not contain any stream|Conversion failed/i,
      msg: '参数或输入被 ffmpeg 拒绝', tip: '看上面 ffmpeg 自己报的最后几行' },
    { id: 'net', retry: false, re: /Failed to fetch|NetworkError|worker|CSP|load failed/i,
      msg: '引擎或资源加载失败', tip: '刷新重试；持续失败检查网络' },
    { id: 'ours', retry: false, re: /ffmpeg 退出码|没有生成输出文件|输出文件是空的/,
      msg: '转换没有产出结果', tip: '检查输出文件名与参数是否完整' }
];

function classifyErr(msg, tail) {
    const t = String(msg);
    const exitOnly = /^ffmpeg 退出码/.test(t);
    for (const k of ERR_KINDS) {
        if (k.id === 'ours' && exitOnly) continue;
        if (k.re.test(t)) return k;
    }
    if (exitOnly) {
        const seen = String(tail || '');
        const order = ['unsupported', 'badarg', 'net', 'mem', 'engine'];
        for (const id of order) {
            const k = ERR_KINDS.filter(function (x) { return x.id === id; })[0];
            if (k && k.re.test(seen)) {
                return { id: k.id, retry: k.retry, msg: k.msg, tip: k.tip + '（ffmpeg 以' + t.replace('ffmpeg 退出码 ', '退出码 ') + ' 结束）' };
            }
        }
        if (/Aborted\(/i.test(seen)) {
            return { id: 'mem', retry: true, msg: '引擎异常中止（无更多信息，按内存类处理）', tip: '已重建引擎重试一次；若稳定复现请把诊断发我' };
        }
    }
    if (/退出码 -1/.test(t) && /memory|Aborted\(/i.test(tail || '')) return ERR_KINDS[0];
    return { id: 'unknown', retry: false, msg: '未知错误', tip: '把上面的诊断块复制给我，我按实际情况定位' };
}

function tokenize(s) {
    const out = [];
    let cur = '', q = null;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (q) { if (ch === q) q = null; else cur += ch; }
        else if (ch === '"' || ch === "'") q = ch;
        else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } }
        else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
}

function probeLength(file, ext) {
    if (!(VIDEO_EXT.indexOf(ext) >= 0 || AUDIO_EXT.indexOf(ext) >= 0 || /^(video|audio)\//.test(file.type || ''))) {
        kvLen.textContent = '由 ffmpeg 读取';
        return;
    }
    const url = URL.createObjectURL(file);
    const el = document.createElement(VIDEO_EXT.indexOf(ext) >= 0 ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
        pickedDur = (isFinite(el.duration) && el.duration > 0) ? el.duration : 0;
        kvLen.textContent = hms(el.duration) + ' (' + el.duration.toFixed(1) + 's)';
        try { renderPanel(); } catch (e) {}
        URL.revokeObjectURL(url);
    };
    el.onerror = () => {
        kvLen.textContent = '由 ffmpeg 读取';
        URL.revokeObjectURL(url);
    };
    el.src = url;
}

function pick(file) {
    if (!file) return;
    const ext = extOf(file.name);
    if (SUPPORTED_EXT.indexOf(ext) < 0) {
        const shown = file.name.indexOf('.') > 0 ? '.' + ext : '「' + file.name + '」';
        termWrite('[ERR] 不支持的格式 ' + shown + ' - 支持 mp4 mov mkv webm avi / mp3 wav m4a aac flac ogg opus / gif png jpg webp bmp', 'l-err');
        setStatus('[ERR] 格式不支持', 'err');
        fileInput.value = '';
        return;
    }
    if (picked && picked.url) URL.revokeObjectURL(picked.url);
    picked = { file, name: file.name, ext: ext || 'bin' };
    pickedDur = 0;
    panelBase = null;
    panelVals = {};
    panelOut = 'out_panel';
    fcName.textContent = file.name;
    fcDur.textContent = '';

    fileKv.hidden = false;
    kvSize.textContent = fmtSize(file.size);
    kvType.textContent = (file.type || ext.toUpperCase());
    kvLen.textContent = '读取中…';
    probeLength(file, picked.ext);
    cmdInput.disabled = false;
    runBtn.disabled = false;
    clearBtn.disabled = false;
    loudBtn.disabled = (tplFamily(picked.ext) === 'image');
    renderTemplates();
    applyPanel();
    renderInputPreview();
    cmdInput.focus({ preventScroll: true });
    setStatus('[--] 待命');
    termWrite('[OK] 已加载 ' + file.name + '（' + fmtSize(file.size) + '）', 'l-sys');
}

function renderQueue() {
    if (!queueList) return;
    queueList.textContent = '';
    if (!queue.length) { queueBox.hidden = true; return; }
    queueBox.hidden = false;
    queue.forEach(function (q, i) {
        const row = document.createElement('div');
        row.className = 'q-row' + (q.done ? ' done' : '') + (q.fail ? ' fail' : '');
        const idx = document.createElement('span');
        idx.className = 'q-idx';
        idx.textContent = (q.done ? '✓' : (q.fail ? '×' : String(i + 1)));
        const nm = document.createElement('span');
        nm.className = 'q-name';
        nm.textContent = q.file.name;
        const st = document.createElement('span');
        st.className = 'q-st';
        st.textContent = q.done ? (q.outName || '完成') : (q.fail ? '失败' : fmtSize(q.file.size));
        row.appendChild(idx); row.appendChild(nm); row.appendChild(st);
        queueList.appendChild(row);
    });
}

function startBatch(files) {
    if (picked2) reset2();
    queue = files.map(function (f) { return { file: f, done: false, fail: false, outName: '' }; });
    batchMode = true;
    pick(queue[0].file);
    renderList();
    termWrite('[ .. ] 批量模式：' + queue.length + ' 个文件，当前命令会依次应用到每一个', 'l-sys');
}

async function runBatch() {
    if (!queue.length) return;
    const raw = cmdInput.value;
    const inst = await loadEngine();
    for (let i = 0; i < queue.length; i++) {
        const q = queue[i];
        if (q.done || q.fail) continue;
        const name = q.file.name;
        const base = name.replace(/\.[^.]+$/, '');
        let cmd = raw.replace(/-i\s+(\S+|"[^"]*")/, '-i ' + quoteName(name));
        cmd = cmd.replace(/(\s)(\S+|"[^"]*")$/, '$1' + quoteName('out_' + base + '.' + (extOf(name) || 'bin')));
        const args = tokenize(cmd);
        if (!args.length) continue;
        let full = args.some((a, k) => a === '-i' && k + 1 < args.length) ? args : ['-i', name].concat(args);
        full = withThreads(full);
        const bad = preflight(full);
        if (bad.length) {
            q.fail = true;
            termWrite('[ERR] ' + name + '：参数不被支持，已跳过', 'l-err');
            renderList();
            continue;
        }
        setStatus('[ .. ] 批量 ' + (i + 1) + '/' + queue.length);
        termWrite('$ ffmpeg [批量 ' + (i + 1) + '/' + queue.length + '] ' + name, 'l-sys');
        try {
            await inst.writeFile(name, new Uint8Array(await q.file.arrayBuffer()));
            const code = await inst.exec(full);
            if (code !== 0) throw new Error('退出码 ' + code);
            const names = await inst.listDir('/');
            const all = names.filter((e) => !e.isDir && e.name.charAt(0) !== '.').map((e) => e.name);
            const want = full[full.length - 1];
            const outs = all.filter((n) => n !== name);
            const outName = outs.indexOf(want) >= 0 ? want : (outs[outs.length - 1] || want);
            const data = await inst.readFile(outName);
            if (!data || !data.length) throw new Error('输出为空');
            q.done = true;
            q.outName = outName + ' - ' + fmtSize(data.length);
            const url = URL.createObjectURL(new Blob([data], { type: mimeOf(outName) }));
            const a = document.createElement('a');
            a.href = url;
            a.download = outName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 8000);
            for (const n of all) { try { await inst.deleteFile(n); } catch (e) {} }
            termWrite('[OK] ' + name + ' -> ' + outName + '（已触发下载）', 'l-sys');
        } catch (err) {
            q.fail = true;
            termWrite('[ERR] ' + name + '：' + (err && err.message ? err.message : err), 'l-err');
            try {
                const names = await inst.listDir('/');
                for (const e of names) { if (!e.isDir) { try { await inst.deleteFile(e.name); } catch (x) {} } }
            } catch (e) {}
        }
        renderList();
    }
    const okN = queue.filter(q => q.done).length;
    const failN = queue.filter(q => q.fail).length;
    termWrite('[ OK ] 批量完成：成功 ' + okN + ' / 失败 ' + failN, 'l-sys');
    setStatus(okN && !failN ? '[OK] 完成' : (failN ? '[ERR] 部分失败' : '[OK] 完成'), okN && !failN ? 'ok' : '');
    LabPiko.set(failN ? 'daze' : 'idle');
    engineRuns += queue.length;
    if (engineRuns >= 3) dropEngine();
}

function addFiles(fs) {
    if (!fs || !fs.length) return;
    let added = 0;
    const firstTime = !mediaFiles.length;
    for (let i = 0; i < fs.length; i++) {
        const f = fs[i];
        const ext = extOf(f.name);
        if (['srt', 'ass'].indexOf(ext) >= 0) {
            subEntry = { file: f, name: f.name, ext: ext, sub: true };
            termWrite('[OK] 字幕文件：' + f.name, 'l-sys');
            continue;
        }
        if (SUPPORTED_EXT.indexOf(ext) < 0) {
            termWrite('[ERR] 不支持的格式 ' + (ext ? '.' + ext : '「' + f.name + '」') + '，已跳过', 'l-err');
            continue;
        }
        mediaFiles.push({ file: f, name: f.name, ext: ext, done: false, fail: false, outName: '' });
        added++;
    }
    if (!mediaFiles.length) { renderList(); if (subEntry && picked) renderTemplates(); return; }
    if (added > 1) termWrite('[ .. ] 已加入 ' + added + ' 个文件（共 ' + mediaFiles.length + ' 个）', 'l-sys');
    refreshRoles(firstTime);
}

function refreshRoles(repick) {
    if (mainIdx >= mediaFiles.length) mainIdx = 0;
    const n = mediaFiles.length;
    if (n > 2) { batchMode = true; queue = mediaFiles; }
    else { batchMode = false; queue = []; }
    const main = mediaFiles[mainIdx];
    const other = mediaFiles[mainIdx === 0 ? 1 : 0];
    picked2 = subEntry || (n >= 2 && other && tplFamily(other.ext) === tplFamily(main.ext) ? { file: other.file, name: other.name, ext: other.ext, sub: false } : null);
    if (repick || !picked || picked.name !== main.name) {
        pick(main.file);
    } else {
        renderTemplates();
        applyPanel();
    }
    renderList();
    if (batchMode) termWrite('[ .. ] 共 ' + n + ' 个文件：RUN 用当前命令逐个处理；点「第二」文件再点组合模板则只处理这两个', 'l-sys');
    else if (picked2 && !picked2.sub && picked) termWrite('[ .. ] 两个文件：组合模板已出现在下方', 'l-sys');
    else if (picked2 && picked2.sub && picked) termWrite('[ .. ] 烧字幕模板已出现在下方', 'l-sys');
}

function removeAt(i) {
    if (i === -1) { subEntry = null; picked2 = null; renderList(); renderTemplates(); return; }
    if (mediaFiles[i]) mediaFiles.splice(i, 1);
    if (!mediaFiles.length) { resetFile(); return; }
    if (mainIdx >= mediaFiles.length) mainIdx = 0;
    refreshRoles(true);
}

function setMain(i) {
    if (!mediaFiles[i] || i === mainIdx) return;
    mainIdx = i;
    refreshRoles(true);
}

function renderList() {
    if (!fileListEl) return;
    fileListEl.textContent = '';
    if (!mediaFiles.length && !subEntry) { fileListEl.hidden = true; return; }
    fileListEl.hidden = false;
    const mkRow = function (idx, name, stText, role, cls) {
        const row = document.createElement('div');
        row.className = 'fl-row' + (cls ? ' ' + cls : '');
        const tag = document.createElement('span');
        tag.className = 'fl-tag';
        tag.textContent = role;
        const nm = document.createElement('span');
        nm.className = 'fl-name';
        nm.textContent = name;
        const st = document.createElement('span');
        st.className = 'fl-st';
        st.textContent = stText;
        const x = document.createElement('span');
        x.className = 'fl-x';
        x.textContent = '×';
        x.title = '移除';
        x.addEventListener('click', function (e) { e.stopPropagation(); removeAt(idx); });
        row.appendChild(tag); row.appendChild(nm); row.appendChild(st); row.appendChild(x);
        if (idx >= 0 && idx !== mainIdx) row.addEventListener('click', function () { setMain(idx); });
        return row;
    };
    mediaFiles.forEach(function (m, i) {
        const isSecond = picked2 && !picked2.sub && picked2.name === m.name;
        const role = batchMode ? (i === mainIdx ? '主' : (isSecond ? '第二' : '队列')) : (i === mainIdx ? '主' : '第二');
        const cls = (m.done ? 'done' : '') + (m.fail ? ' fail' : '') + (i === mainIdx ? ' main' : '');
        const st = m.done ? (m.outName || '完成') : (m.fail ? '失败' : fmtSize(m.file.size));
        fileListEl.appendChild(mkRow(i, m.name, st, role, cls));
    });
    if (subEntry) fileListEl.appendChild(mkRow(-1, subEntry.name, 'srt/ass', '字幕', 'sub'));
}

function pick2(file) {
    if (!file) return;
    const ext = extOf(file.name);
    if (!picked) {
        termWrite('[ERR] 先选主文件，再选第二个', 'l-err');
        return;
    }
    const isSub = ['srt', 'ass'].indexOf(ext) >= 0;
    const sameFam = tplFamily(ext) === tplFamily(picked.ext);
    if (!isSub && !sameFam) {
        termWrite('[ERR] 第二个文件类型要和主文件一致（' + FAM_NAME[tplFamily(picked.ext)] + '），或选 .srt/.ass 字幕', 'l-err');
        fileInput2.value = '';
        return;
    }
    picked2 = { file, name: file.name, ext, sub: isSub };
    fcName2.textContent = file.name + (isSub ? '（字幕）' : '');
    chip2.classList.add('show');
    renderTemplates();
    termWrite('[OK] 第二个文件：' + file.name + (isSub ? ' - 烧字幕模板已就绪' : ' - 组合模板已出现在下方'), 'l-sys');
}

function reset2() {
    picked2 = null;
    chip2.classList.remove('show');
    fileInput2.value = '';
    renderTemplates();
    termWrite('[--] 已移除第二个文件', 'l-sys');
}

function renderInputPreview() {
    if (!inPrev) return;
    if (inUrl) { URL.revokeObjectURL(inUrl); inUrl = ''; }
    inPrev.textContent = '';
    if (!picked) { inPrev.hidden = true; return; }
    inUrl = URL.createObjectURL(picked.file);
    inPrev.appendChild(mediaEl(inUrl, picked.name));
    inPrev.hidden = false;
}

function resetFile() {
    queue = [];
    batchMode = false;
    mediaFiles = [];
    mainIdx = 0;
    subEntry = null;
    picked2 = null;
    renderList();
    picked = null;
    if (loudBtn) loudBtn.disabled = true;
    renderInputPreview();
    chip.classList.remove('show');
    fileKv.hidden = true;
    cmdInput.disabled = true;
    runBtn.disabled = true;
    cmdInput.value = '';
    renderTemplates();
    setStatus('[--] 待命');
    termWrite('[--] 已移除输入文件', 'l-sys');
}

function clearAll() {
    term.textContent = '';
    lineCount = 0;
    hProgress.textContent = '0.0%';
    hPos.textContent = '-';
    hSpeed.textContent = '-';
    hOut.textContent = '-';
    hElapsed.textContent = '00:00';
    barFill.style.width = '0';
    setStatus('[--] 待命');
}

function showResult(blob, name) {
    if (outUrl) URL.revokeObjectURL(outUrl);
    outUrl = URL.createObjectURL(blob);
    res.textContent = '';
    res.appendChild(mediaEl(outUrl, name));
    const meta = document.createElement('div');
    meta.className = 'res-meta';
    meta.textContent = name + ' - ' + fmtSize(blob.size);
    res.appendChild(meta);
    const a = document.createElement('a');
    a.className = 'btn-alt';
    a.href = outUrl;
    a.download = name;
    a.textContent = 'DOWNLOAD';
    a.style.display = 'inline-block';
    a.style.marginTop = '10px';
    a.style.textDecoration = 'none';
    res.appendChild(a);
}

async function run() {
    if (busy || !picked) return;
    const comboRef = picked2 && cmdInput.value.indexOf(picked2.name) >= 0;
    if (batchMode && queue.length > 1 && !comboRef) {
        busy = true;
        LabPiko.set('load');
        runBtn.disabled = true;
        clearBtn.disabled = true;
        try { await runBatch(); } finally {
            busy = false;
            runBtn.disabled = false;
            clearBtn.disabled = false;
        }
        return;
    }
    const args = tokenize(cmdInput.value);
    if (!args.length) {
        termWrite('[WARN] 指令为空，先看手册 /manual 了解怎么拼参数', 'l-err');
        return;
    }
    const retry = requeue;
    requeue = false;
    if (!retry) {
        hist.push(cmdInput.value.trim());
        hIdx = -1;
    }
    const hasInput = args.some((a, i) => a === '-i' && i + 1 < args.length);
    const inName = picked.name;
    let full = hasInput ? args : ['-i', inName].concat(args);
    const outExt = extOf(args[args.length - 1]);
    if (!retry && ffmpeg && (engineRuns >= 3 || (lastOutExt && lastOutExt !== outExt))) dropEngine();
    lastOutExt = outExt;
    const badArgs = preflight(full);
    if (badArgs.length) {
        setStatus('[ERR] 参数不被支持', 'err');
        badArgs.forEach(function (b) {
            if (b.why) termWrite('[ERR] ' + b.kind + ' ' + b.name + '：' + b.why, 'l-err');
            else termWrite('[ERR] 引擎里没有这个' + b.kind + '：' + b.name + (b.near ? '（你可能想用 ' + b.near + '）' : ''), 'l-err');
        });
        termWrite('[ .. ] 微调面板里列出的都是这台引擎实测支持的项，可照着改', 'l-sys');
        return;
    }
    full = withThreads(full);
    full = withGuard(full);
    if (guardApplied) termWrite('[ .. ] 检测到重滤镜且未设分辨率，已先缩到 720p 控制内存（可在微调里改）', 'l-sys');
    errBuf = [];
    busy = true;
    LabPiko.set('load');
    runBtn.disabled = true;
    clearBtn.disabled = true;
    total = 0; pos = 0;
    hProgress.textContent = '0.0%';
    hPos.textContent = '-';
    hSpeed.textContent = '-';
    hOut.textContent = '-';
    barFill.style.width = '0';
    t0 = Date.now();
    hElapsed.textContent = '00:00';
    lastLogAt = Date.now();
    timer = setInterval(() => {
        hElapsed.textContent = hms((Date.now() - t0) / 1000);
        if (busy && lastLogAt && Date.now() - lastLogAt > 60000) {
            lastLogAt = Date.now() + 3600000;
            termWrite('[WARN] 引擎 60 秒没有任何输出，判定为无响应，正在重建引擎并重试一次', 'l-err');
            busy = false;
            requeue = true;
            dropEngine();
            clearInterval(timer);
            setTimeout(run, 200);
        }
    }, 500);
    setStatus('[ .. ] 处理中');
    termWrite('$ ffmpeg ' + full.join(' '), 'l-sys');
    try {
        const inst = await loadEngine();
        await inst.writeFile(inName, new Uint8Array(await picked.file.arrayBuffer()));
        if (picked2) {
            const bytes2 = new Uint8Array(await picked2.file.arrayBuffer());
            try { await inst.writeFile('/' + picked2.name, bytes2); } catch (e) {}
            try { await inst.writeFile(picked2.name, bytes2); } catch (e) {}
        }
        const flatCmd = full.join(' ');
        for (const m of mediaFiles) {
            if (m.name === inName || (picked2 && m.name === picked2.name)) continue;
            if (flatCmd.indexOf(m.name) >= 0) {
                try { await inst.writeFile(m.name, new Uint8Array(await m.file.arrayBuffer())); } catch (e) {}
            }
        }
        if (/subtitles=|drawtext=/.test(full.join(' '))) {
            const ok = await ensureFont(inst);
            if (!ok) termWrite('[WARN] 字体下载失败，字幕可能显示为方块', 'l-err');
        }
        const code = await inst.exec(full);
        if (code !== 0) throw new Error('ffmpeg 退出码 ' + code);
        const names = await inst.listDir('/');
        const all = names.filter((e) => !e.isDir && e.name.charAt(0) !== '.').map((e) => e.name);
        const want = args[args.length - 1];
        const outs = all.filter((n) => n !== inName);
        if (!outs.length && !(all.indexOf(want) >= 0 && want !== inName)) {
            throw new Error('没有生成输出文件，检查指令里是否写了输出名');
        }
        const outName = outs.indexOf(want) >= 0 ? want : (outs[outs.length - 1] || want);
        try { await inst.deleteFile(inName); } catch (e) {}
        const data = await inst.readFile(outName);
        if (!data || !data.length) throw new Error('输出文件是空的');
        showResult(new Blob([data], { type: mimeOf(outName) }), outName);
        setStatus('[OK] 完成', 'ok');
        LabPiko.set('idle');
        termWrite('[OK] 输出 ' + outName + '（' + fmtSize(data.length) + '），已可下载', 'l-sys');
        for (const n of all) { try { await inst.deleteFile(n); } catch (e) {} }
        if (picked2 && picked2.name !== inName) { try { await inst.deleteFile(picked2.name); } catch (e) {} }
        if (HEAVY_RE.test(full.join(' '))) dropEngine();
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        const cls = classifyErr(msg, errBuf.join(' '));
        if (cls.retry && !retry) {
            termWrite('[WARN] ' + cls.msg + '，已重建引擎并重试一次 - ' + cls.tip, 'l-err');
            requeue = true;
            dropEngine();
        } else {
            setStatus('[ERR] 失败', 'err');
            LabPiko.set('daze');
            termWrite('[ERR] ' + msg, 'l-err');
            termWrite('[WARN] ' + cls.msg + '：' + cls.tip, 'l-err');
            if (cls.id === 'mem' || cls.id === 'engine') dropEngine();
            diagBlock(full.join(' '), cls, msg);
        }
    } finally {
        clearInterval(timer);
        hElapsed.textContent = hms((Date.now() - t0) / 1000);
        busy = false;
        runBtn.disabled = false;
        clearBtn.disabled = false;
        if (requeue) setTimeout(run, 120);
    }
}


const BOOT = [
    '[ OK ] 本地模式 - 文件不上传，全部在本机完成',
    '[ .. ] 正在加载 ffmpeg 引擎，首次下载约 7MB（解压后约 31MB），之后自动缓存',
    '[ .. ] 用法：选文件，写参数，回车执行；参数说明见 /manual'
];

let engineBytes = 0;
let engineBlob = null;

function wasmSimdOk() {
    try {
        const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
        return WebAssembly.validate(bytes);
    } catch (e) {
        return false;
    }
}

function probeEngineSize() {
    if (engineBytes > 0) return Promise.resolve(engineBytes);
    return fetch(WASM_URL, { headers: { Range: 'bytes=0-0' } }).then((resp) => {
        const m = /\/(\d+)\s*$/.exec(resp.headers.get('content-range') || '');
        if (m) engineBytes = parseInt(m[1], 10) || 0;
        return engineBytes;
    }).catch(() => 0);
}

const IDB_NAME = 'sts-lab-assets';
const IDB_STORE = 'files';
const WASM_KEY = 'ffmpeg-core.wasm|esm-0.12.10-p1';

function idbOpen() {
    return new Promise(function (res, rej) {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
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
    });
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

async function prefetchEngine(onProgress) {
    try {
        const hit = await idbGet(WASM_KEY);
        if (hit && hit.size) {
            engineBytes = hit.size;
            if (onProgress) onProgress(1, hit.size, hit.size);
            termWrite('[ OK ] 引擎来自本机缓存（IndexedDB），无需重新下载', 'l-sys');
            return hit instanceof Blob ? hit : new Blob([hit], { type: 'application/wasm' });
        }
    } catch (e) {}
    try {
        const total = await probeEngineSize();
        const resp = await fetch(WASM_URL);
        if (!resp.ok || !resp.body) return null;
        const reader = resp.body.getReader();
        const chunks = [];
        let got = 0;
        for (;;) {
            const r = await reader.read();
            if (r.done) break;
            chunks.push(r.value);
            got += r.value.length;
            if (onProgress) onProgress(total > 0 ? Math.min(got / total, 1) : null, got, total);
        }
        if (onProgress) onProgress(1, got, total || got);
        const blob = new Blob(chunks, { type: 'application/wasm' });
        idbPut(WASM_KEY, blob).then(function (ok) {
            if (ok) termWrite('[ OK ] 引擎已存入本机缓存，下次打开直接读取', 'l-sys');
        });
        return blob;
    } catch (e) {
        return null;
    }
}

function boot() {
    if (!wasmSimdOk()) {
        termWrite('[ERR] 当前浏览器内核不支持 WebAssembly SIMD，引擎无法运行', 'l-err');
        termWrite('[WARN] 请换新版 Chrome / Edge（或浏览器里的极速模式）打开本页；这不是网络问题，刷新也没用', 'l-err');
        LabBoot.hide();
        setStatus('[ERR] 浏览器不支持', 'err');
        if (engineNote) engineNote.textContent = '[ERR] 浏览器内核过旧';
        return;
    }
    LabBoot.phase('正在加载引擎');
    LabBoot.drive();
    termWrite(BOOT[0], 'l-sys');
    termWrite(BOOT[1], 'l-sys');
    termWrite(BOOT[2], 'l-sys');
    termWrite('[ .. ] 输入文件按原名放进工作区，指令里写 -i 文件名 即可', 'l-sys');
    let booted = false;
    const bootTimer = setTimeout(() => {
        if (booted) return;
        booted = true;
        termWrite('[WARN] 引擎加载超时（30 秒），已跳过加载动画', 'l-err');
        termWrite('[WARN] 可以直接写指令，执行时会重新尝试加载引擎', 'l-err');
        setStatus('[WARN] 引擎未就绪', 'err');
        LabBoot.hide();
    }, 30000);
    prefetchEngine((ratio, got, total) => {
        if (ratio === null) {
            LabBoot.drive();
            LabBoot.phase('正在加载引擎 ' + (got / 1048576).toFixed(1) + ' MB');
        } else {
            LabBoot.progress(ratio, '正在加载引擎 ' + (got / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB');
        }
    }).then((blob) => {
        engineBlob = blob;
        LabBoot.progress(1, '正在启动引擎');
        return loadEngine();
    }).then(() => {
        if (booted) return;
        booted = true;
        clearTimeout(bootTimer);
        setStatus('[--] 待命');
        LabBoot.hide();
    }).catch((err) => {
        if (booted) return;
        booted = true;
        clearTimeout(bootTimer);
        const em = err && err.message ? err.message : String(err);
        termWrite('[ERR] 引擎加载失败：' + em, 'l-err');
        if (/Simd128|simd/i.test(em)) termWrite('[WARN] 浏览器内核不支持 WebAssembly SIMD：换新版 Chrome / Edge（或极速模式）再打开', 'l-err');
        else termWrite('[WARN] 可按 Ctrl+Shift+R 强刷一次；仍失败就换个网络或浏览器再试', 'l-err');
        LabBoot.hide();
    });
}

fileInput.accept = SUPPORTED_EXT.map((e) => '.' + e).join(',');
fileInput.multiple = true;
if (dz2) dz2.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const fs = ev.dataTransfer && ev.dataTransfer.files;
    if (fs && fs.length) addFiles(Array.prototype.slice.call(fs));
});
dz.addEventListener('click', () => fileInput.click());
dz.addEventListener('dragover', (ev) => { ev.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', (ev) => {
    ev.preventDefault();
    dz.classList.remove('drag');
    const fs = ev.dataTransfer && ev.dataTransfer.files;
    if (fs && fs.length) addFiles(Array.prototype.slice.call(fs));
});
fileInput.addEventListener('change', () => {
    const fs = fileInput.files;
    if (fs && fs.length) addFiles(Array.prototype.slice.call(fs));
    fileInput.value = '';
});
fcX.addEventListener('click', resetFile);
runBtn.addEventListener('click', run);
loudBtn.addEventListener('click', analyzeLoudness);
clearBtn.addEventListener('click', clearAll);
cmdInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { run(); return; }
    if (ev.key === 'ArrowUp') {
        if (!hist.length) return;
        hIdx = hIdx < 0 ? hist.length - 1 : Math.max(0, hIdx - 1);
        cmdInput.value = hist[hIdx];
        ev.preventDefault();
    } else if (ev.key === 'ArrowDown') {
        if (hIdx < 0) return;
        hIdx = hIdx >= hist.length - 1 ? -1 : hIdx + 1;
        cmdInput.value = hIdx < 0 ? '' : hist[hIdx];
        ev.preventDefault();
    }
});
boot();

/* i18n: EN sweep for dynamically rendered strings (sts i18n campaign)
   Two tiers: exact-match dictionary for standing UI (task templates, parameter
   panel labels, dropdown options, format descriptions) + regex fallbacks for
   dynamic log/status lines with embedded values. */
(function () {
    if (!window.__stsEN) return;
    var EN = {
        '音量统一': 'Loudness normalize', '目标码率': 'Target bitrate', '取多长': 'Duration to keep', '目标体积': 'Target size', '音量倍数': 'Volume factor',
        '压缩 720p（看片够用）': 'Compress 720p (good enough for viewing)', '压缩 480p（发群省流量）': 'Compress 480p (small for group chats)',
        '换封装为 MP4（秒完成）': 'Remux to MP4 (instant)', '裁一段 10s-30s': 'Trim a 10s-30s clip', '提音频存 MP3': 'Extract audio to MP3',
        '截封面图（第 3 秒）': 'Grab a cover frame (at 3s)', '转 GIF（5 秒 12fps）': 'To GIF (5s, 12fps)', '竖屏 9:16 短视频': 'Vertical 9:16 short video',
        '两倍速（音画同步）': 'Double speed (AV in sync)', '音量 x 倍（滑条）': 'Volume x factor (slider)', '帧率（滑条）': 'Frame rate (slider)',
        '亮度对比度（滑条）': 'Brightness & contrast (slider)', '晚清全损压缩': 'Late-Qing ultra-lossy', '来回循环 GIF（正放+倒放）': 'Boomerang GIF (forward + reverse)',
        '智能封面（自动选代表帧）': 'Smart cover (auto-picks a key frame)', '九宫格拼图（3x3）': '3x3 contact sheet', '转 MP3 192k（通用）': 'To MP3 192k (universal)',
        '压缩到 128k（省体积）': 'Compress to 128k (small)', '转 WAV 无损': 'To WAV (lossless)', '音量拉齐（响度 -16）': 'Normalize loudness (-16 LUFS)',
        '人声清楚（三件套）': 'Clear vocals (three-step)', '单声道 16k（语音最小）': 'Mono 16k (smallest for voice)', '两倍速（不变调）': 'Double speed (pitch kept)',
        '淡入淡出 2 秒': 'Fade in/out 2s', '采样率声道（滑条）': 'Sample rate & channels (slider)', '削波全损（滑条）': 'Clipped ultra-lossy (slider)',
        '波形图（整段画成一张图）': 'Waveform image (whole clip in one picture)', '频谱图（频率-时间）': 'Spectrogram (frequency over time)',
        '转 JPG（照片通用）': 'To JPG (universal for photos)', '转 WebP（体积最小）': 'To WebP (smallest)', '转 PNG 无损（截图/透明）': 'To PNG (screenshots / transparency)',
        '压到宽 1600（发原图）': 'Resize to width 1600 (for sharing originals)', '缩略图 400px': 'Thumbnail 400px', '方图 1:1（头像）': 'Square 1:1 (avatars)',
        '竖版 9:16 封面': 'Vertical 9:16 cover', '灰度黑白': 'Grayscale', '旋转 90°（竖拍摆正）': 'Rotate 90° (straighten portrait shots)',
        '宽度质量（滑条）': 'Width & quality (slider)', '裁剪旋转（滑条）': 'Crop & rotate (slider)', '抽出纯视频（删音轨，秒完成）': 'Video only (drop audio track, instant)',
        '转成 MP4（重编码）': 'Convert to MP4 (re-encode)', '重压一遍（体积更小）': 'Re-encode smaller', '转 MP3 320k（高码率）': 'To MP3 320k (high bitrate)',
        '转 WAV 无损（给剪辑用）': 'To WAV lossless (for editing)', '转 FLAC（无损但更小）': 'To FLAC (lossless but smaller)', '转 WebP 无损（更小）': 'To WebP lossless (smaller)',
        '转 PNG 无损（保留透明）': 'To PNG lossless (keeps transparency)', '导出首帧 JPG（当封面）': 'Export first frame as JPG (cover)', '转成动图 WebP（更小）': 'To animated WebP (smaller)',
        '视频': 'Video', '音频': 'Audio', '图片': 'Image', '原样': 'As-is', '最通用，手机电脑都能放': 'The most universal - plays anywhere',
        '能装几乎所有编码': 'Holds almost any codec', '无声动图，只适合超短片段': 'Silent animation - only for very short clips',
        'MP3（只要声音）': 'MP3 (audio only)', '丢掉画面，只存音轨': 'Drops the picture, keeps the audio track',
        'OGG（只要声音）': 'OGG (audio only)', '开源格式，体积更小': 'Open format, smaller files', '哪儿都能放': 'Plays everywhere',
        '同体积音质更好': 'Better sound at the same size', '开源格式，体积最小': 'Open format, smallest files',
        '不压缩，给剪辑软件用': 'Uncompressed - for editors', '无损，但比 WAV 小一半': 'Lossless at about half of WAV',
        '照片通用': 'Universal for photos', '截图、要透明就用它': 'For screenshots and transparency', '网页用，体积最小': 'For the web, smallest files',
        '最多 256 色': '256 colors max', '老式无压缩位图': 'Old uncompressed bitmap',
        'H.264（兼容最好）': 'H.264 (best compatibility)', 'H.265（更小，但很慢）': 'H.265 (smaller but slow)', 'VP9（WebM 用）': 'VP9 (for WebM)',
        'VP8（老 WebM）': 'VP8 (legacy WebM)', 'MPEG-4（老设备）': 'MPEG-4 (legacy devices)',
        '不调': 'Off', '方图 1:1': 'Square 1:1', '竖版 9:16': 'Vertical 9:16', '横版 16:9': 'Widescreen 16:9', '老电视 4:3': 'Old TV 4:3', '默认': 'Default',
        'lanczos（更锐）': 'lanczos (sharper)', 'neighbor（像素风）': 'neighbor (pixel look)', 'spline（平滑）': 'spline (smooth)',
        '不翻': 'No flip', '水平镜像': 'Mirror horizontally', '垂直镜像': 'Mirror vertically', '原色': 'Original', '灰度': 'Grayscale', '声音': 'Sound',
        '1 倍是原样，小了听不见、大了会破音': '1x is unchanged - too quiet inaudible, too loud clips',
        '静音': 'Mute', '4 倍': '4x', '采样率': 'Sample rate', '不改': 'Keep', '电话音': 'Telephone', '很省': 'Tiny', '人声够用': 'Fine for voice',
        '较好': 'Good', '接近标准': 'Near standard', '音乐标准': 'Music standard', '视频标准': 'Video standard', '声道': 'Channels', '单声道': 'Mono',
        '省一半体积': 'Half the size', '双声道': 'Stereo', '左右分开': 'Left and right apart', '低音': 'Bass',
        '闷/轰头就往下调，缺厚度往上调': 'Muffled or boomy? lower it; thin? raise it', '高音': 'Treble',
        '发闷往上调，齿音刺耳往下调': 'Dull? raise it; sibilant? lower it', '动态压缩': 'Dynamic compression',
        '把忽大忽小的音量压平，人声更稳': 'Flattens loud/quiet swings - steadier vocals', '降噪': 'Noise reduction',
        '麦克风底噪、空调嗡嗡声': 'Mic hiss, air-conditioner hum', '去咔哒声': 'De-crackle', '录音里的爆音、黑胶噼啪声': 'Pops and vinyl crackle',
        '防破音': 'Anti-clipping', '拉过音量后限制峰值，避免削顶': 'Caps peaks after boosting to avoid clipping',
        '整段拉到同一个响度，不再忽大忽小': 'Pulls the whole clip to one loudness - no more swings',
        '-30 很小': '-30 quiet', '-6 很大': '-6 loud', '自动增益': 'Auto gain',
        '忽大忽小的录音；和"音量统一"二选一': 'For uneven recordings; pick this or "Loudness normalize", not both',
        '淡入淡出': 'Fade in/out', '开头渐渐出现、结尾渐渐消失': 'Fades in at the start, out at the end',
        '0.5 秒': '0.5s', '10 秒': '10s', '立体声宽度': 'Stereo width', '收窄': 'Narrower', '加宽': 'Wider', '变调': 'Pitch shift',
        '只改音高不改速度，1 就是原样': 'Pitch without speed; 1 is unchanged', '更低': 'Lower', '更高': 'Higher', '播放速度': 'Playback speed',
        '0.5 倍慢放，2 倍加速，音调不变': '0.5x slow-mo, 2x fast - pitch unchanged', '慢放': 'Slower', '加速': 'Faster',
        '去掉静音': 'Remove silence', '开头/结尾的空白段直接切掉': 'Cuts blank stretches at the head/tail',
        '去掉开头': 'Trim head', '去掉首尾': 'Trim both ends', '去掉低频噪声': 'Cut low-frequency noise',
        '切掉嗡嗡声、空调声和电流底噪': 'Removes hum, air-con and mains buzz', '不切': 'Keep', '切掉高频': 'Cut high frequencies',
        '去齿音、嘶声和刺耳的高频，人声反而更柔': 'Removes sibilance and harsh highs - softer vocals',
        '老式失真：位深': 'Vintage bitcrush: bit depth', '越小越像老电话、老游戏机': 'Lower = more old-phone / retro-console',
        '2 位 最糊': '2-bit, mushiest', '16 位 清晰': '16-bit, clean', '老式失真：采样保持': 'Vintage bitcrush: sample hold',
        '越大越像卡带跳帧的机械声': 'Higher = more broken-cassette jitter', '2 倍': '2x', '64 倍': '64x', '中频（人声）': 'Mids (vocals)',
        '鼻音重往下调，人声发闷往上调': 'Nasal? lower it; boxy vocals? raise it', '回声': 'Echo', '空旷感、舞台感；开会录音别开': 'Space and stage feel; skip it for meetings',
        '明显': 'Strong', '声道处理': 'Channel handling', '只留一边、左右互换，或混成单声道': 'Keep one side, swap sides, or fold to mono',
        '左右互换': 'Swap L/R', '只留左': 'Left only', '只留右': 'Right only', '混成单声道': 'Fold to mono',
        '输出质量': 'Output quality', '视频编码器': 'Video codec', '自动（推荐）': 'Auto (recommended)', '质量模式': 'Quality mode',
        '恒定质量（推荐）': 'Constant quality (recommended)', '画质 CRF': 'Quality (CRF)', '数字越小越清晰、文件越大': 'Lower = sharper, bigger files',
        '14 最清晰': '14 sharpest', '51 最省体积': '51 smallest', '画质（qscale）': 'Quality (qscale)', 'MPEG-4 用这个：越小越清晰': 'For MPEG-4: lower = sharper',
        '2 最好': '2 best', '31 最省': '31 smallest', '按体积倒推码率，适合要控制大小的场合': 'Back-computes bitrate from size - for fixed-size targets',
        '200k 更省': '200k smaller', '12M 更清晰': '12M sharper',
        '按时长自动算码率，压到指定大小附近；与"目标码率"二选一；浏览器读不到时长会自动用引擎探测': 'Auto bitrate from duration to hit the target size; exclusive with "Target bitrate"; if the browser cannot read duration, the engine probes it',
        '编码速度': 'Encode speed', '越慢同画质体积越小，但等得久': 'Slower = smaller at same quality, but longer waits',
        '最快': 'Fastest', '最慢最小': 'Slowest, smallest', '画面类型': 'Content type', '动画片选 animation，胶片颗粒选 grain': 'Pick animation for cartoons, grain for film look',
        '兼容档位': 'Compatibility profile', '老设备放不了就降到 baseline': 'Drop to baseline for old devices', '自动': 'Auto',
        'baseline（最老设备）': 'baseline (oldest devices)', '像素格式': 'Pixel format',
        'yuv420p 兼容性最好；444 保留更多色彩': 'yuv420p plays everywhere; 444 keeps more color',
        'yuv420p（最兼容）': 'yuv420p (most compatible)', 'yuv444p（色彩最全）': 'yuv444p (fullest color)',
        '关键帧间隔': 'Keyframe interval', '越小越容易拖进度条，体积略大': 'Lower = smoother seeking, slightly bigger', '更密': 'Denser', '更稀': 'Sparser', ' 帧': ' frames',
        '拍摄信息': 'Capture metadata', '抹掉可以去掉拍摄设备、GPS 等元数据': 'Stripping removes device, GPS and other metadata',
        '保留': 'Keep', '抹掉元数据': 'Strip metadata', '音轨': 'Audio tracks', '只留第一条': 'Keep first only', '去掉声音': 'Remove audio',
        '多音轨视频可以只留第一条': 'Multi-track videos can keep just the first', '画面': 'Picture', '分辨率': 'Resolution',
        '480p 手机看够用，1080p 适合存档': '480p is fine on phones, 1080p for archiving', '360p 更省': '360p smaller', '1080p 更清晰': '1080p sharper',
        '缩放算法': 'Scaling algorithm', 'lanczos 最锐，neighbor 适合像素风素材': 'lanczos is sharpest; neighbor suits pixel art',
        '帧率': 'Frame rate', '每秒多少张画面，越低越省体积': 'Frames per second - lower = smaller', '省流量': 'Smaller', '更流畅': 'Smoother',
        '颜色数': 'Color count', '只对 GIF 生效，越少越省': 'GIF only - fewer colors = smaller', '2 色': '2 colors', '64 色': '64 colors', ' 色': ' colors',
        '画面裁切': 'Aspect crop', '竖版给短视频，方图给头像': 'Vertical for shorts, square for avatars', '补黑边': 'Pad',
        '不裁切，按比例补黑边': 'No cropping - pads with black bars', '旋转': 'Rotate', '翻转': 'Flip', '颜色': 'Color', '亮度': 'Brightness',
        '想让画面亮一点就往右拖': 'Drag right to brighten', '更暗': 'Darker', '更亮': 'Brighter', '对比度': 'Contrast',
        '越大画面越硬，越小越灰': 'Higher = punchier, lower = flatter', '更平': 'Flatter', '更硬': 'Punchier', '饱和度': 'Saturation',
        '颜色浓淡，0 就是黑白': 'Color intensity - 0 is black & white', '黑白': 'B&W', '更艳': 'More vivid', '伽马': 'Gamma',
        '调中间调的明暗，暗部发闷可以调': 'Adjusts midtones - helps murky shadows', '色相': 'Hue',
        '整体偏色，用来纠正偏绿偏红': 'Overall tint - fixes green/red casts', '锐化': 'Sharpen',
        '压过之后画质发肉可以补一点': 'Adds back a little bite after compression', '不锐': 'Off', '很锐': 'Strong',
        '画面淡入淡出': 'Video fade in/out', '开头渐渐出现、结尾渐渐消失（结尾位置按素材时长自动算）': 'Fades in at the start, out at the end (end point computed from duration)',
        '5 秒': '5s', '暗光噪点、手机夜拍都能压一点': 'Tones down low-light and night-shot noise', '去隔行': 'Deinterlace',
        '电视录制、老 DV 素材有横条纹时用': 'For comb teeth on TV recordings and old DV footage', 'yadif（快）': 'yadif (fast)', 'bwdif（更好）': 'bwdif (better)',
        '去色带': 'Deband', '天空、渐变处一圈圈的色带': 'Banding rings in skies and gradients', '防抖': 'Stabilize',
        '手持拍摄的轻微抖动；抖太狠救不回来': 'For mild handheld shake; heavy shake cannot be saved',
        '音轨码率': 'Audio bitrate', '画面之外的声音体积': 'The sound part of the file size', '32k 省': '32k small', '320k 好': '320k quality',
        '时间': 'Timing', '从第几秒开始': 'Start at (seconds)', '裁掉开头的一部分': 'Trims the beginning', '开头': 'Start', '越往后': 'later',
        '只保留这段时间，多余部分丢掉': 'Keeps only this window and drops the rest', '1 秒': '1s', '更长': 'Longer', '到第几秒结束': 'End at (seconds)',
        '按结束时间点裁剪；与"取多长"二选一，启用一个会自动关另一个': 'Crop by end point; exclusive with "Duration to keep" - enabling one turns the other off',
        '倒放': 'Reverse', '整套倒着放；长视频吃内存，建议先裁短': 'Plays backwards; long videos eat memory - trim first',
        '正序': 'Forward', 'VBR 通常同体积更好听': 'VBR usually sounds better at the same size', '固定码率': 'Fixed bitrate',
        '恒定质量 VBR': 'Constant quality VBR', '恒定质量 VBR（推荐）': 'Constant quality VBR (recommended)', '码率': 'Bitrate',
        '越高越好听、文件越大': 'Higher = better sound, bigger files', '8k 最小': '8k smallest', '320k 最好': '320k best',
        '质量等级': 'Quality level', '数字越小音质越好、文件越大': 'Lower = better sound, bigger files', '0 最好': '0 best', '9 最省': '9 smallest',
        'VBR 开关': 'VBR toggle', '开启（更好）': 'On (better)', '位深': 'Bit depth', '位数越高越无损、体积越大': 'Higher = closer to lossless, bigger',
        '16 位（通用）': '16-bit (universal)', '24 位（更好）': '24-bit (better)', '8 位（最省）': '8-bit (smallest)',
        '压缩级别': 'Compression level', '越高越小、越慢，音质不变': 'Higher = smaller and slower, sound unchanged', '最小': 'Min',
        '长音频吃内存，建议先裁短': 'Long audio eats memory - trim first', '尺寸模式': 'Size mode',
        '长边不超过是照片最常见的压法': 'Long-edge cap is the usual photo compression', '指定宽度': 'Fixed width', '长边不超过': 'Long edge max',
        '保持原尺寸': 'Keep original size', '宽度': 'Width', '越小越省流量，1600 够发原图': 'Smaller = less traffic; 1600 keeps original detail',
        '质量': 'Quality', '越高越清晰、文件越大': 'Higher = sharper, bigger files', '最低': 'Min', '最高': 'Max', ' 分': ' pts', '无损': 'Lossless',
        '无损 WebP 比 PNG 小三四成': 'Lossless WebP runs 30-40% smaller than PNG', '关（有损）': 'Off (lossy)', '开（无损）': 'On (lossless)',
        '只影响体积和耗时，不掉画质': 'Affects size and time only, never quality',
        '截图要透明选 RGBA，要小选灰度': 'Pick RGBA for transparent screenshots, grayscale for size',
        '8 位灰度': '8-bit grayscale', '24 位色': '24-bit color', '带透明 RGBA': 'RGBA with alpha', '缩过之后补一点细节': 'Adds back detail after downscaling',
        '方图适合头像、竖版适合短视频封面': 'Square for avatars, vertical for short-video covers', '动图帧率': 'Animation frame rate',
        '只对 GIF/WebP 动图有效': 'GIF/WebP animation only', '更省': 'Smaller', '动图时长': 'Animation duration',
        '只对 GIF/WebP 动图有效，切掉多余部分': 'GIF/WebP animation only - trims the excess',
        '抹掉 EXIF（拍摄设备、GPS）': 'Strip EXIF (device, GPS)',
        '[ OK ] 中文字体已下载并存入本机缓存（下次直接用）': '[ OK ] Chinese font downloaded and cached (used directly next time)',
        '拼接成一条（首尾相接）': 'Concatenate into one (end to end)', '转场拼接（交叉渐变 1 秒）': 'Transition join (1s crossfade)',
        '混成一条音轨（叠在一起）': 'Mix into one audio track (overlaid)', '转场拼接（1 秒交叉溶解）': 'Transition join (1s cross dissolve)',
        '画面并排（左右分屏，声音叠加）': 'Side-by-side (split screen, audio mixed)',
        '原配方，最通用': 'Original recipe, most universal', 'MP4 极限版（80x45, 2fps）': 'MP4 extreme (80x45, 2fps)',
        '比原配方再砍一半，块状最大': 'Halves the original again - maximum blockiness', 'MKV（原配方换壳）': 'MKV (same recipe, new shell)',
        '同 MP4 参数，MKV 容器': 'Same MP4 parameters in an MKV container', 'GIF（4fps 8 色，10 秒）': 'GIF (4fps, 8 colors, 10s)',
        '没有声音，色块感最强': 'Silent, with the strongest blocks', 'MP4 纯视频（删音轨）': 'MP4 video only (no audio)', '只留 4fps 画面': 'Keeps only the 4fps picture',
        'MP3（只留 8k 声音）': 'MP3 (8k audio only)', '画面丢掉，留废音质': 'Drops the picture, keeps wrecked audio',
        'JPG 封面（第 1 帧）': 'JPG cover (frame 1)', '单帧 200px 灰度': 'Single 200px grayscale frame', '原配方，体积最小': 'Original recipe, smallest',
        'MP3（8k 单声道）': 'MP3 (8k mono)', '苹果设备友好': 'Apple-device friendly', 'WAV（8-bit 电话音）': 'WAV (8-bit telephone)',
        '无压缩外壳装 8kHz': 'Uncompressed shell around 8kHz', 'FLAC（无损装废音质）': 'FLAC (lossless shell, wrecked audio)',
        '无损容器存最差的音': 'Lossless container for the worst sound', 'OGG 16k（轻损一档）': 'OGG 16k (one notch less wrecked)',
        '没那么烂，能听清话': 'Not as bad - words stay audible', '原配方，块状灰阶': 'Original recipe, blocky grayscale',
        'PNG（8-bit 灰度）': 'PNG (8-bit grayscale)', '无损容器存 200px 灰图': 'Lossless shell around a 200px gray frame',
        'WebP（q5 灰度）': 'WebP (q5 grayscale)', '体积最小': 'Smallest', 'GIF（8 色灰度）': 'GIF (8-color grayscale)', '色带最明显': 'Bands show the most',
        'BMP（8 位灰度）': 'BMP (8-bit grayscale)', '1995 年的画质': '1995-grade picture', 'JPG 更狠（80px）': 'JPG harsher (80px)',
        '看不见，但存在': 'Invisible, but it exists',
        '这种格式浏览器放不了预览（': 'This format cannot preview in the browser (',
        '未知': 'unknown', '），文件本身没问题，下载后用本地播放器打开就行': '). The file itself is fine - download and open it in a local player',
        '文件名': 'Filename', '第二个文件': 'Second file',
        '晚清全损压缩 - 选导出格式（': 'Late-Qing ultra-lossy - pick an export format (',
        ' 种)': ' kinds)', '[ .. ] 晚清全损压缩 - ': '[ .. ] Late-Qing ultra-lossy - ',
        '输出格式': 'Output format', '点一下切换这一项': 'Tap to switch this item', '；点一下启用或关闭这一项': '; tap to enable or disable',
        '选文件后可用': 'Available after picking a file', '改动即时写进指令': 'Changes write into the command instantly',
        '点标题展开 - 滑动条调参，实时写进指令': 'Tap a heading to expand - sliders write into the command live',
        '收起高级项': 'Collapse advanced items', '更多 ': 'More ', ' 项（编解码、滤镜、兼容性）': ' items (codecs, filters, compatibility)',
        '标着"关"的项不写进指令，拖一下滑条或用标签点亮即生效；参数追加在指令末尾，同名参数以后者为准。不熟的项目先别动，用上面的快捷模板和预设即可。': 'Items marked "Off" stay out of the command until you move a slider or light a tag; parameters append at the end and later same-name ones win. Leave unfamiliar items alone - the quick templates and presets above are enough.',
        '快捷模板 - ': 'Quick templates - ', '，点一下填入指令': ' - tap to fill the command', '快捷模板 - 选文件后可用': 'Quick templates - available after picking a file',
        '[ .. ] 已展开参数面板：': '[ .. ] Parameter panel expanded: ', '（拖动滑条调整）': '(adjust with the sliders)',
        '[ .. ] 已填入模板：': '[ .. ] Template filled in: ',
        '字幕 - 用「': 'Subtitles - with "', '烧录字幕（中文可渲染，字体自动下载）': 'Burn subtitles (Chinese renders; font auto-downloads)',
        '[ .. ] 烧字幕：首次会下载约 11MB 中文字体（之后走本机缓存）': '[ .. ] Subtitles: first run downloads ~11MB Chinese font (cached afterwards)',
        '组合 - 与「': 'Combo - process with "', '」一起处理': '', '[ .. ] 已填入组合模板：': '[ .. ] Combo template filled in: ',
        '（输出名可自行修改）': '(output name is editable)', '全部 ': 'All ', ' 个一起': ' together',
        ' 个文件，输出名可自行修改）': ' files; output name is editable)', '拼接全部 ': 'Concatenate all ',
        ' 个（首尾相接）': ' (end to end)', '网格并排 ': 'Grid side-by-side ', ' 个（2 列，声音叠加）': ' (2 columns, audio mixed)',
        '全部混成一条音轨（声音叠加）': 'Mix everything into one audio track',
        '[WARN] 参数面板渲染失败：': '[WARN] Parameter panel failed to render: ',
        '[diag] 命令: ': '[diag] Command: ', '[diag] 类别: ': '[diag] Category: ', '[diag] ffmpeg 末尾: ': '[diag] ffmpeg tail: ',
        'sts-lab 诊断': 'sts-lab diagnostics', '命令: ': 'Command: ', '类别: ': 'Category: ', '原始错误: ': 'Original error: ',
        'ffmpeg末尾: ': 'ffmpeg tail: ', '引擎: esm-0.12.10-p1 / 单线程注入': 'Engine: esm-0.12.10-p1 / single-thread injection',
        '复制诊断': 'Copy diagnostics', '已复制': 'Copied', '复制失败，请手动选中': 'Copy failed - please select manually',
        '[ .. ] 浏览器读不到时长，用引擎快速探测…': '[ .. ] Browser cannot read duration - probing via engine…',
        '[ OK ] 时长 ': '[ OK ] Duration ', '（探测所得）': '(probed)',
        '[WARN] 探测不到时长，"目标体积"用不了，请改用"目标码率"': '[WARN] Could not probe duration - "Target size" is unavailable, use "Target bitrate"',
        '[WARN] 图片没有响度，不用分析': '[WARN] Images have no loudness - skipping analysis',
        '[ .. ] 分析中': '[ .. ] Analyzing', '[ .. ] 正在分析响度（volumedetect，几秒钟）': '[ .. ] Analyzing loudness (volumedetect, a few seconds)',
        '[WARN] 没有读到音频响度（这段素材可能没有音轨）': '[WARN] No loudness read (this clip may have no audio track)',
        '[--] 待命': '[--] Standby', '[ OK ] 响度分析：均值 ': '[ OK ] Loudness: mean ', ' / 峰值 ': ' / peak ',
        '[WARN] 峰值已接近满格，再调大音量会破音': '[WARN] Peak is near full - louder will clip',
        '[ .. ] 提示：想整体拉响，拖"音量倍数"到 ': '[ .. ] Tip: to get louder overall, drag "Volume factor" to about ',
        'x 左右；忽大忽小就开"音量统一"': 'x; for uneven levels turn on "Loudness normalize"',
        '[ .. ] 已把"音量统一"目标设为 ': '[ .. ] "Loudness normalize" target set to ', ' LUFS（按实测均值），可在面板里微调': ' LUFS (from the measured mean); fine-tune in the panel',
        '[ERR] 响度分析失败：': '[ERR] Loudness analysis failed: ', '[ERR] 失败': '[ERR] Failed',
        '[ .. ] 引擎加载中': '[ .. ] Engine loading', '[ .. ] 加载引擎': '[ .. ] Loading engine',
        '[OK] 引擎就绪': '[OK] Engine ready', '[OK] 引擎就绪，可以开始处理': '[OK] Engine ready - go ahead',
        '[ERR] 引擎加载失败': '[ERR] Engine failed to load',
        'WebM 需要 VP8/VP9，而这两个编码器在本引擎会崩（已实测）。改用 MKV 可以装同样的编码组合': 'WebM needs VP8/VP9, and both codecs crash in this engine (tested). Switch to MKV to keep the same codec combo',
        '编码器': 'codec', '滤镜': 'filter',
        'libvpx(VP8) 在本引擎必崩（已实测），改用 H.264 即可': 'libvpx(VP8) crashes in this engine (tested) - use H.264 instead',
        'libvpx-vp9 在本引擎必崩（已实测），改用 H.264 即可': 'libvpx-vp9 crashes in this engine (tested) - use H.264 instead',
        'libopus 在立体声/48k 输入下会崩，改用 libvorbis 或 aac': 'libopus crashes on stereo/48k input - use libvorbis or aac',
        '引擎内存不足': 'Engine out of memory', '先降分辨率或裁短再试；已自动重建引擎重试一次': 'Lower the resolution or trim first; the engine was rebuilt and retried once',
        '引擎自身缺陷（wasm 内部调用签名不匹配）': 'Engine defect (wasm internal signature mismatch)',
        '与你的文件无关：把重滤镜或编码器换一种，或改用模板里的等价写法': 'Not your file: swap the heavy filter or codec, or use the equivalent from a template',
        '命令里有引擎不认的名字': 'The command contains a name the engine does not know',
        '对照微调面板或 /manual 参数表；手写注意拼写': 'Check the fine-tune panel or the /manual tables; watch spelling when typing by hand',
        '参数或输入被 ffmpeg 拒绝': 'ffmpeg rejected a parameter or input', '看上面 ffmpeg 自己报的最后几行': 'See the last lines ffmpeg itself reported above',
        '引擎或资源加载失败': 'Engine or resource failed to load', '刷新重试；持续失败检查网络': 'Refresh and retry; if it persists, check the network',
        '转换没有产出结果': 'The conversion produced no result', '检查输出文件名与参数是否完整': 'Check the output filename and that parameters are complete',
        '（ffmpeg 以 ': '(ffmpeg exited with ', 'ffmpeg 退出码 ': 'ffmpeg exit code ', '退出码 ': 'exit code ', ' 结束）': ')',
        '引擎异常中止（无更多信息，按内存类处理）': 'Engine aborted abnormally (no further info; treat as memory)',
        '已重建引擎重试一次；若稳定复现请把诊断发我': 'Engine rebuilt and retried once; if it reproduces, send over the diagnostics',
        '未知错误': 'Unknown error', '把上面的诊断块复制给我，我按实际情况定位': 'Copy the diagnostics block above and I will pinpoint it',
        '由 ffmpeg 读取': 'read by ffmpeg',
        '[ERR] 不支持的格式 ': '[ERR] Unsupported format ',
        ' - 支持 mp4 mov mkv webm avi / mp3 wav m4a aac flac ogg opus / gif png jpg webp bmp': ' - supports mp4 mov mkv webm avi / mp3 wav m4a aac flac ogg opus / gif png jpg webp bmp',
        '[ERR] 格式不支持': '[ERR] Format not supported', '读取中…': 'Reading…',
        '[OK] 已加载 ': '[OK] Loaded ', '完成': 'Done', '失败': 'Failed',
        '[ .. ] 批量模式：': '[ .. ] Batch mode: ', ' 个文件，当前命令会依次应用到每一个': ' files - the current command applies to each in turn',
        '：参数不被支持，已跳过': ': parameter unsupported, skipped', '[ .. ] 批量 ': '[ .. ] Batch ',
        '$ ffmpeg [批量 ': '$ ffmpeg [batch ', '输出为空': 'Output is empty', '（已触发下载）': '(download triggered)',
        '[ OK ] 批量完成：成功 ': '[ OK ] Batch done: ', ' / 失败 ': ' / failed ',
        '[OK] 完成': '[OK] Done', '[ERR] 部分失败': '[ERR] Partial failure', '[OK] 字幕文件：': '[OK] Subtitle file: ',
        '，已跳过': ', skipped', '[ .. ] 已加入 ': '[ .. ] Added ', ' 个文件（共 ': ' files (', ' 个)': ' total)',
        '[ .. ] 共 ': '[ .. ] ', ' 个文件：RUN 用当前命令逐个处理；点「第二」文件再点组合模板则只处理这两个': ' files: RUN applies the current command to each; pick "Second" then a combo template to process just those two',
        '[ .. ] 两个文件：组合模板已出现在下方': '[ .. ] Two files: the combo template appeared below',
        '[ .. ] 烧字幕模板已出现在下方': '[ .. ] The burn-subtitles template appeared below',
        '移除': 'Remove', '第二': 'Second', '队列': 'Queue', '字幕': 'Subs',
        '[ERR] 先选主文件，再选第二个': '[ERR] Pick the main file first, then the second',
        '[ERR] 第二个文件类型要和主文件一致（': '[ERR] The second file must match the main file type (',
        '），或选 .srt/.ass 字幕': '), or pick an .srt/.ass subtitle', '（字幕）': ' (subtitles)',
        '[OK] 第二个文件：': '[OK] Second file: ', ' - 烧字幕模板已就绪': ' - burn-subtitles template ready',
        ' - 组合模板已出现在下方': ' - combo template appeared below', '[--] 已移除第二个文件': '[--] Second file removed',
        '[--] 已移除输入文件': '[--] Input removed', '[WARN] 指令为空，先看手册 /manual 了解怎么拼参数': '[WARN] Command is empty - see the /manual for how to assemble parameters',
        '[ERR] 参数不被支持': '[ERR] Parameter unsupported', '[ERR] 引擎里没有这个': '[ERR] The engine does not have this',
        '（你可能想用 ': ' (you may want ', '[ .. ] 微调面板里列出的都是这台引擎实测支持的项，可照着改': '[ .. ] Everything in the fine-tune panel is verified against this engine - safe to tweak',
        '[ .. ] 检测到重滤镜且未设分辨率，已先缩到 720p 控制内存（可在微调里改）': '[ .. ] Heavy filter without a set resolution - pre-scaled to 720p to control memory (adjustable in fine-tune)',
        '[WARN] 引擎 60 秒没有任何输出，判定为无响应，正在重建引擎并重试一次': '[WARN] No engine output for 60s - judged unresponsive; rebuilding the engine and retrying once',
        '[ .. ] 处理中': '[ .. ] Processing', '[WARN] 字体下载失败，字幕可能显示为方块': '[WARN] Font download failed - subtitles may show boxes',
        '没有生成输出文件，检查指令里是否写了输出名': 'No output file produced - check the command names an output',
        '输出文件是空的': 'The output file is empty', '[OK] 输出 ': '[OK] Output ', '），已可下载': '), ready to download',
        '，已重建引擎并重试一次 - ': ', engine rebuilt and retried once - ',
        '[ OK ] 本地模式 - 文件不上传，全部在本机完成': '[ OK ] Local mode - files never upload, everything happens on this machine',
        '[ .. ] 正在加载 ffmpeg 引擎，首次下载约 7MB（解压后约 31MB），之后自动缓存': '[ .. ] Loading the ffmpeg engine - first run downloads ~7MB (~31MB unpacked), cached afterwards',
        '[ .. ] 用法：选文件，写参数，回车执行；参数说明见 /manual': '[ .. ] Usage: pick a file, write parameters, Enter to run; parameter docs in /manual',
        '[ OK ] 引擎来自本机缓存（IndexedDB），无需重新下载': '[ OK ] Engine from local cache (IndexedDB) - no re-download',
        '[ OK ] 引擎已存入本机缓存，下次打开直接读取': '[ OK ] Engine cached locally - next open reads straight from disk',
        '[ERR] 当前浏览器内核不支持 WebAssembly SIMD，引擎无法运行': '[ERR] This browser engine lacks WebAssembly SIMD - the engine cannot run',
        '[WARN] 请换新版 Chrome / Edge（或浏览器里的极速模式）打开本页；这不是网络问题，刷新也没用': '[WARN] Open this page in a newer Chrome / Edge (or speed mode); not a network issue - refreshing will not help',
        '[ERR] 浏览器不支持': '[ERR] Browser unsupported', '[ERR] 浏览器内核过旧': '[ERR] Browser engine too old',
        '正在加载引擎': 'Loading engine', '[ .. ] 输入文件按原名放进工作区，指令里写 -i 文件名 即可': '[ .. ] Your file lands in the workspace under its own name - just write -i filename',
        '[WARN] 引擎加载超时（30 秒），已跳过加载动画': '[WARN] Engine load timed out (30s) - skipped the loading animation',
        '[WARN] 可以直接写指令，执行时会重新尝试加载引擎': '[WARN] You can type a command now - the engine loads again on run',
        '[WARN] 引擎未就绪': '[WARN] Engine not ready', '正在加载引擎 ': 'Loading engine ', '正在启动引擎': 'Starting engine',
        '[ERR] 引擎加载失败：': '[ERR] Engine failed to load: ',
        '[WARN] 浏览器内核不支持 WebAssembly SIMD：换新版 Chrome / Edge（或极速模式）再打开': '[WARN] This engine lacks WebAssembly SIMD: open in a newer Chrome / Edge (or speed mode)',
        '[WARN] 可按 Ctrl+Shift+R 强刷一次；仍失败就换个网络或浏览器再试': '[WARN] Try Ctrl+Shift+R to hard-refresh; if it still fails, try another network or browser'
    };
    var ENRX = [
        [/^当前模型 .*$/, function (m) { return m[0].replace(/^当前模型 /, 'Current model '); }],
        [/^正在下载模型 .+$/, function () { return 'Downloading model'; }],
        [/^正在转写 .+$/, function () { return 'Transcribing'; }],
        [/^转写完成，共 .+$/, function () { return 'Transcription complete'; }],
        [/^\[OK\] 已加载 .+$/, function () { return '[OK] Loaded'; }],
        [/^\[ \.\. \] 已加入 .+$/, function () { return '[ .. ] Files added (batch ready)'; }],
        [/^\[ \.\. \] 共 .+$/, function () { return '[ .. ] Batch listed'; }],
        [/^\[ OK \] 批量完成：.+$/, function () { return '[ OK ] Batch finished'; }],
        [/^\[ OK \] 时长 .+$/, function () { return '[ OK ] Duration probed'; }],
        [/^\[ OK \] 响度分析：.+$/, function () { return '[ OK ] Loudness measured'; }],
        [/^\[ \.\. \] 提示：想整体拉响.+$/, function () { return '[ .. ] Tip: to get louder overall, drag "Volume factor" up; for uneven levels turn on "Loudness normalize"'; }],
        [/^\[ \.\. \] 已把"音量统一"目标设为 .+$/, function () { return '[ .. ] "Loudness normalize" target set from the measured mean'; }],
        [/^\[ERR\] 响度分析失败：.+$/, function () { return '[ERR] Loudness analysis failed'; }],
        [/^\[ERR\] 引擎加载失败：.+$/, function () { return '[ERR] Engine failed to load'; }],
        [/^\[OK\] 第二个文件：.+$/, function () { return '[OK] Second file selected'; }],
        [/^\[ERR\] 第二个文件类型要和主文件一致.+$/, function () { return '[ERR] The second file must match the main file type, or pick an .srt/.ass subtitle'; }],
        [/^\[\.\.\.\] 检测到 .+$/, function () { return '[...] Detected regions'; }],
        [/^检测到 .+$/, function () { return 'Regions detected - reading text'; }],
        [/^\$ ffmpeg \[批量 .+$/, function () { return '$ ffmpeg [batch]'; }],
        [/：参数不被支持，已跳过$/, ': unsupported parameter skipped'],
        [/^出错了：.+$/, function () { return 'Something went wrong'; }],
        [/^转写失败：.+$/, function () { return 'Transcription failed'; }],
        [/^识别失败：.+$/, function () { return 'Recognition failed'; }],
        [/^\[ERR\] 不支持的格式 .+$/, function () { return '[ERR] Unsupported format - supports mp4 mov mkv webm avi / mp3 wav m4a aac flac ogg opus / gif png jpg webp bmp'; }],
        [/^完成 - .+$/, function () { return 'Done'; }],
        [/^\[WARN\] 参数面板渲染失败：.+$/, function () { return '[WARN] Parameter panel failed to render'; }],
        [/^\[ \.\. \] 晚清全损压缩 - .+$/, function () { return '[ .. ] Late-Qing ultra-lossy'; }],
        [/^晚清全损压缩 - 选导出格式（.+$/, function () { return 'Late-Qing ultra-lossy - pick an export format'; }]
    ];
    var busy = false;
    function sweep() {
        var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var n, k, i;
        while ((n = w.nextNode())) {
            k = n.nodeValue.trim();
            if (!k) continue;
            if (EN[k] !== undefined) { n.nodeValue = n.nodeValue.replace(k, EN[k]); continue; }
            for (i = 0; i < ENRX.length; i++) {
                if (ENRX[i][0].test(k)) { n.nodeValue = n.nodeValue.replace(k, ENRX[i][1](ENRX[i][0].exec(k))); break; }
            }
        }
    }
    try { sweep(); } catch (e) {}
    window.addEventListener('load', function () {
        try { sweep(); } catch (e) {}
        setTimeout(function () { try { sweep(); } catch (e) {} }, 900);
        setTimeout(function () { try { sweep(); } catch (e) {} }, 2500);
    });
    try {
        new MutationObserver(function () {
            if (busy) return;
            busy = true;
            try { sweep(); } catch (e) {} finally { busy = false; }
        }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
})();
