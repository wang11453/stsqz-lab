# stsqz-lab

浏览器端 AI 工具站。抠图、OCR 文字识别、语音转字幕、音视频处理、照片动漫化。
所有处理在你的浏览器本地完成，文件不上传，不经过任何服务器。

在线版地址：[lab.stsqz.com](https://lab.stsqz.com)

## 功能

- 一键抠图：人像和物体的背景移除
- OCR 文字识别：图片里的文字直接提取
- 语音转文字：音频转文字，支持导出 SRT 字幕
- 音视频处理：剪辑、格式转换、压缩
- 照片动漫化：新海诚和宫崎骏风格转换

## 使用

打开网页就能用。不需要注册，不需要安装，文件只存在你自己的设备上。

## 部署

git clone 后用任意静态服务器托管本目录即可。

模型文件（whisper-small 档）从 HuggingFace 下载：[Xenova/whisper-small](https://huggingface.co/Xenova/whisper-small)，放到 `static/lab/models/Xenova/whisper-small/`。tiny 和 base 档已内置。

## 原理

处理逻辑基于 WebAssembly 在浏览器内运行，服务器只负责托管静态文件。
所以本站没有账号系统，没有上传接口，也没有任何数据存储。

## 相关链接

- 主站：[stsqz.com](https://stsqz.com)
- 文档站：[docs.stsqz.com](https://docs.stsqz.com)

## 协议

MIT
