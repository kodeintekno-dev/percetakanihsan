import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
const names = ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "SEED_ADMIN_PASSWORD"];
const secrets = names.flatMap(name => process.env[name]?.length >= 12 ? [[name, process.env[name]]] : []);
let files = 0;
function walk(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) { walk(filename); continue; }
    if (!/\.(js|json|map|html)$/.test(item.name)) continue;
    files++;
    const content = fs.readFileSync(filename, "utf8");
    for (const [name, value] of secrets) if (content.includes(value)) throw new Error(`Nilai ${name} ditemukan pada bundle browser. Jangan deploy.`);
  }
}
walk(".next/static");
console.log(`PASS: ${files} berkas bundle browser diperiksa; nilai rahasia env yang tersedia tidak ditemukan. Tidak membaca atau mencetak isi rahasia.`);
