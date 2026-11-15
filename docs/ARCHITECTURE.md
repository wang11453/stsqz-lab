# 架构说明

lab 子站是纯静态站点。全部文件处理在用户浏览器本地完成，服务器只负责托管静态文件。

## 技术栈

- WebAssembly：ONNX Runtime Web（模型推理）、ffmpeg.wasm（音视频处理）
- Transformers.js：Whisper 语音识别模型（tiny / base / small 三档）
- PaddleOCR 浏览器版：文字识别
- Service Worker + Web Worker：后台处理不卡界面

## 模块

| 目录 | 功能 |
| --- | --- |
| transcribe | 语音转文字，支持导出 SRT 字幕 |
| rmbg | 一键抠图（MODNet 人像分割） |
| ocr | 文字识别（PaddleOCR） |
| audioconvert | 音视频剪辑、格式转换、压缩（ffmpeg.wasm） |
| anime | 照片动漫化（新海诚、宫崎骏风格迁移） |
| pdf | PDF 工具 |

## 模型文件

模型文件托管在 `static/lab/models/Xenova/` 下：

- whisper-tiny：约 40 MB，已内置
- whisper-base：约 75 MB，已内置
- whisper-small：约 240 MB，不在仓库内。从 [Xenova/whisper-small](https://huggingface.co/Xenova/whisper-small) 下载放到 `models/Xenova/whisper-small/` 对应目录
- modnet：抠图模型，已内置

## 数据隐私

用户文件在浏览器内处理，不经过任何服务器。详见 [PRIVACY.md](PRIVACY.md)。
