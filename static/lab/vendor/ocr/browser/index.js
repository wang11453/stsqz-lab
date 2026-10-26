import Ocr, { registerBackend } from '../common/index.js';
import { splitIntoLineImages } from '../common/backend/splitIntoLineImages.js';
import { InferenceSession } from '../ort.mjs';
import { FileUtils } from './FileUtils.js';
import { ImageRaw } from './ImageRaw.js';
registerBackend({ FileUtils, ImageRaw, InferenceSession, splitIntoLineImages });
export * from '../common/index.js';
export default Ocr;
//# sourceMappingURL=index.js.map