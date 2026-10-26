import { FileUtilsBase } from '../common/index.js';
export class FileUtils extends FileUtilsBase {
    static async read(url) {
        const res = await fetch(url);
        return await res.text();
    }
}
//# sourceMappingURL=FileUtils.js.map