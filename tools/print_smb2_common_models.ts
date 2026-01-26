import fs from "node:fs";
import path from "node:path";

import ArrayBufferSlice from "../src/noclip/ArrayBufferSlice.js";
import { parseAVTpl } from "../src/noclip/SuperMonkeyBall/AVTpl.js";
import { parseGma } from "../src/noclip/SuperMonkeyBall/Gma.js";

function loadFileBuffer(filePath: string): ArrayBufferSlice {
    const data = fs.readFileSync(filePath);
    return new ArrayBufferSlice(data.buffer, data.byteOffset, data.byteLength);
}

const root = path.resolve(__dirname, "..");
const commonGmaPath = path.join(root, "smb2_content", "test", "init", "common.gma");
const commonTplPath = path.join(root, "smb2_content", "test", "init", "common.tpl");

const tpl = parseAVTpl(loadFileBuffer(commonTplPath), "common");
const gma = parseGma(loadFileBuffer(commonGmaPath), tpl);

const wanted = [0x5f, 0x60];
for (const id of wanted) {
    const model = gma.idMap.get(id);
    if (!model) {
        console.log(`${id.toString(16)}: <missing>`);
        continue;
    }
    console.log(`${id.toString(16)}: ${model.name}`);
}
