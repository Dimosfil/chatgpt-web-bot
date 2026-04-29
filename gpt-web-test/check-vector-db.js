const fs = require('fs');
const path = require('path');

function exists(p) {
 try {
 return fs.existsSync(p);
 } catch {
 return false;
 }
}

function findFiles(dir, patterns, maxDepth = 5, depth = 0, found = []) {
 if (!exists(dir) || depth > maxDepth) return found;

 let entries = [];
 try {
 entries = fs.readdirSync(dir, { withFileTypes: true });
 } catch {
 return found;
 }

 for (const entry of entries) {
 const fullPath = path.join(dir, entry.name);

 if (entry.isDirectory()) {
 if (['node_modules', '.git', '.idea'].includes(entry.name)) continue;
 findFiles(fullPath, patterns, maxDepth, depth + 1, found);
 continue;
 }

 const name = entry.name.toLowerCase();
 if (patterns.some((pattern) => name.includes(pattern))) {
 found.push(fullPath);
 }
 }

 return found;
}

function checkVectorDb() {
 const targets = [
 process.cwd(),
 'C:/Users/Fil-Server/.openclaw',
 'C:/Users/Fil-Server/.openclaw/workspace',
 'C:/AI/chatgpt-web-bot'
 ];

 const patterns = [
 'vec',
 'vector',
 'sqlite',
 '.db',
 '.sqlite',
 '.sqlite3'
 ];

 const results = [];

 for (const target of targets) {
 const files = findFiles(target, patterns, 6);
 results.push({
 target,
 exists: exists(target),
 files
 });
 }

 const allFiles = results.flatMap((r) => r.files);
 const vectorCandidates = allFiles.filter((file) => {
 const lower = file.toLowerCase();
 return lower.includes('vec') || lower.includes('vector') || lower.endsWith('.db') || lower.endsWith('.sqlite') || lower.endsWith('.sqlite3');
 });

 const report = {
 ok: vectorCandidates.length > 0,
 message: vectorCandidates.length > 0
 ? 'Похожие файлы векторной/SQLite БД найдены.'
 : 'Похожие файлы векторной/SQLite БД не найдены.',
 checkedAt: new Date().toISOString(),
 vectorCandidates,
 scanned: results
 };

 console.log(JSON.stringify(report, null, 2));

 process.exit(report.ok ? 0 : 1);
}

checkVectorDb();
