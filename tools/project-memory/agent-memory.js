/**
 * Agent Memory SQLite вЂ” СѓРїСЂР°РІР»РµРЅРёРµ Р±Р°Р·РѕР№ РїР°РјСЏС‚Рё Р°РіРµРЅС‚РѕРІ
 *
 * РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ:
 *   node tools/project-memory/agent-memory.js init          вЂ” СЃРѕР·РґР°С‚СЊ/СЃР±СЂРѕСЃРёС‚СЊ С‚Р°Р±Р»РёС†С‹
 *   node tools/project-memory/agent-memory.js index-files   вЂ” РїСЂРѕРёРЅРґРµРєСЃРёСЂРѕРІР°С‚СЊ С„Р°Р№Р»С‹ РїСЂРѕРµРєС‚Р°
 *   node tools/project-memory/agent-memory.js note <topic> <title> <body> [--evidence path] вЂ” РґРѕР±Р°РІРёС‚СЊ Р·Р°РјРµС‚РєСѓ
 *   node tools/project-memory/agent-memory.js notes         вЂ” РїРѕРєР°Р·Р°С‚СЊ РІСЃРµ Р·Р°РјРµС‚РєРё
 *   node tools/project-memory/agent-memory.js search <query> вЂ” РїРѕРёСЃРє РїРѕ Р·Р°РјРµС‚РєР°Рј (FTS5)
 *   node tools/project-memory/agent-memory.js failure <symptom> <cause> <fix> [--evidence path]
 *   node tools/project-memory/agent-memory.js failures      вЂ” РїРѕРєР°Р·Р°С‚СЊ РІСЃРµ СѓРїР°РІС€РёРµ РѕС€РёР±РєРё
 *   node tools/project-memory/agent-memory.js stats         вЂ” СЃС‚Р°С‚РёСЃС‚РёРєР° Р‘Р”
 *   node tools/project-memory/agent-memory.js export-notes  вЂ” СЌРєСЃРїРѕСЂС‚ Р·Р°РјРµС‚РѕРє РІ NOTES.md
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'project_memory.sqlite');
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const NOTE_FILE = path.join(__dirname, 'NOTES.md');

let db;
function getDb() {
  if (!db) {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// в”Ђв”Ђв”Ђ Schema в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL DEFAULT (datetime('now')),
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  evidence TEXT,
  updated TEXT
);

CREATE TABLE IF NOT EXISTS failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL DEFAULT (datetime('now')),
  symptom TEXT NOT NULL,
  cause TEXT NOT NULL,
  fix TEXT NOT NULL,
  evidence TEXT,
  fixed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL DEFAULT (datetime('now')),
  command TEXT NOT NULL,
  purpose TEXT,
  last_result TEXT,
  updated TEXT
);

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  extension TEXT,
  size INTEGER,
  modified TEXT,
  indexed TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FTS5 РґР»СЏ РїРѕР»РЅРѕС‚РµРєСЃС‚РѕРІРѕРіРѕ РїРѕРёСЃРєР°
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  topic, title, body, evidence,
  content='notes',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, topic, title, body, evidence)
  VALUES (new.id, new.topic, new.title, new.body, new.evidence);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, topic, title, body, evidence)
  VALUES ('delete', old.id, old.topic, old.title, old.body, old.evidence);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, topic, title, body, evidence)
  VALUES ('delete', old.id, old.topic, old.title, old.body, old.evidence);
  INSERT INTO notes_fts(rowid, topic, title, body, evidence)
  VALUES (new.id, new.topic, new.title, new.body, new.evidence);
END;
`;

// в”Ђв”Ђв”Ђ Commands в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function cmdInit() {
  const db = getDb();
  db.exec(SCHEMA);
  console.log('вњ“ Schema initialized at', DB_PATH);
}

function cmdStats() {
  const db = getDb();
  const tables = ['notes', 'failures', 'commands', 'files'];
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).get();
    console.log(`  ${t}: ${row.cnt} rows`);
  }
  // Р Р°Р·РјРµСЂ
  const stat = fs.statSync(DB_PATH);
  const mb = (stat.size / 1024 / 1024).toFixed(2);
  console.log(`  size: ${mb} MB`);
}

function cmdIndexFiles() {
  const db = getDb();
  const insert = db.prepare(
    'INSERT OR REPLACE INTO files (path, extension, size, modified) VALUES (?, ?, ?, ?)'
  );

  function walk(dir) {
    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(PROJECT_ROOT, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'logs' || entry.name === 'debug') continue;
        count += walk(full);
      } else if (entry.isFile()) {
        const stat = fs.statSync(full);
        const ext = path.extname(entry.name).toLowerCase();
        try {
          insert.run(rel, ext, stat.size, stat.mtime.toISOString());
          count++;
        } catch (e) {
          // skip
        }
      }
    }
    return count;
  }

  const total = walk(SRC_DIR);
  console.log(`вњ“ Indexed ${total} files`);
}

function cmdNote(args) {
  if (args.length < 3) {
    console.error('Usage: node agent-memory.js note <topic> <title> <body> [--evidence path]');
    process.exit(1);
  }
  const [topic, title, ...rest] = args;
  const evIdx = rest.indexOf('--evidence');
  let body, evidence;
  if (evIdx >= 0) {
    evidence = path.resolve(PROJECT_ROOT, rest[evIdx + 1] || '').replace(/\\/g, '/');
    body = rest.slice(0, evIdx).join(' ');
  } else {
    body = rest.join(' ');
  }
  const db = getDb();
  const stmt = db.prepare('INSERT INTO notes (topic, title, body, evidence) VALUES (?, ?, ?, ?)');
  const result = stmt.run(topic, title, body, evidence || null);
  console.log(`вњ“ Note #${result.lastInsertRowid} created`);
}

function cmdNotes() {
  const db = getDb();
  const rows = db.prepare('SELECT id, created, topic, title, substr(body, 1, 200) as body_preview, evidence FROM notes ORDER BY id DESC').all();
  if (!rows.length) { console.log('No notes.'); return; }
  for (const r of rows) {
    console.log(`[#${r.id}] ${r.created} | ${r.topic}: ${r.title}`);
    console.log(`  ${r.body_preview}${r.body_preview && r.body_preview.length >= 200 ? '...' : ''}`);
    if (r.evidence) console.log(`  evidence: ${r.evidence}`);
    console.log('');
  }
}

function cmdSearch(query) {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT n.id, n.created, n.topic, n.title, substr(n.body, 1, 300) as body_preview, n.evidence
      FROM notes_fts f
      JOIN notes n ON n.id = f.rowid
      WHERE notes_fts MATCH ?
      ORDER BY rank
      LIMIT 10
    `).all(query);
    if (!rows.length) { console.log('No results.'); return; }
    for (const r of rows) {
      console.log(`[#${r.id}] ${r.created} | ${r.topic}: ${r.title}`);
      console.log(`  ${r.body_preview}${r.body_preview && r.body_preview.length >= 300 ? '...' : ''}`);
      if (r.evidence) console.log(`  evidence: ${r.evidence}`);
      console.log('');
    }
  } catch (e) {
    console.error('Search error:', e.message);
    // fallback: LIKE search
    const rows = db.prepare(`
      SELECT id, created, topic, title, substr(body, 1, 300) as body_preview, evidence
      FROM notes
      WHERE topic LIKE ? OR title LIKE ? OR body LIKE ?
      ORDER BY id DESC
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
    if (!rows.length) { console.log('No results.'); return; }
    for (const r of rows) {
      console.log(`[#${r.id}] ${r.created} | ${r.topic}: ${r.title}`);
      console.log(`  ${r.body_preview}${r.body_preview && r.body_preview.length >= 300 ? '...' : ''}`);
      if (r.evidence) console.log(`  evidence: ${r.evidence}`);
      console.log('');
    }
  }
}

function cmdFailure(args) {
  if (args.length < 3) {
    console.error('Usage: node agent-memory.js failure <symptom> <cause> <fix> [--evidence path]');
    process.exit(1);
  }
  const [symptom, cause, ...rest] = args;
  const evIdx = rest.indexOf('--evidence');
  let fix, evidence;
  if (evIdx >= 0) {
    evidence = path.resolve(PROJECT_ROOT, rest[evIdx + 1] || '').replace(/\\/g, '/');
    fix = rest.slice(0, evIdx).join(' ');
  } else {
    fix = rest.join(' ');
  }
  const db = getDb();
  const stmt = db.prepare('INSERT INTO failures (symptom, cause, fix, evidence) VALUES (?, ?, ?, ?)');
  const result = stmt.run(symptom, cause, fix, evidence || null);
  console.log(`вњ“ Failure #${result.lastInsertRowid} recorded`);
}

function cmdFailures() {
  const db = getDb();
  const rows = db.prepare('SELECT id, created, symptom, substr(cause, 1, 100) as cause_preview, substr(fix, 1, 100) as fix_preview, fixed FROM failures ORDER BY id DESC').all();
  if (!rows.length) { console.log('No failures recorded.'); return; }
  for (const r of rows) {
    console.log(`[#${r.id}] ${r.created} | fixed=${r.fixed ? 'вњ“' : 'вњ—'}`);
    console.log(`  symptom: ${r.symptom}`);
    console.log(`  cause: ${r.cause_preview}`);
    console.log(`  fix: ${r.fix_preview}`);
    console.log('');
  }
}

function cmdExportNotes() {
  const db = getDb();
  const rows = db.prepare('SELECT id, created, topic, title, body, evidence FROM notes ORDER BY id').all();
  const lines = [
    '# Durable Notes вЂ” chatgpt-web-bot',
    '',
    'РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЌРєСЃРїРѕСЂС‚РёСЂРѕРІР°РЅРѕ РёР· `project_memory.sqlite`.',
    'SQLite вЂ” Р»РѕРєР°Р»СЊРЅС‹Р№ РїРѕРёСЃРєРѕРІС‹Р№ РёРЅРґРµРєСЃ, СЌС‚РѕС‚ Markdown вЂ” С‡РµР»РѕРІРµРєРѕС‡РёС‚Р°РµРјР°СЏ РєРѕРїРёСЏ.',
    '',
    '---',
    ''
  ];
  for (const r of rows) {
    lines.push(`## ${r.topic}: ${r.title}`);
    lines.push('');
    lines.push(`_Created: ${r.created} | ID: #${r.id}_`);
    lines.push('');
    lines.push(r.body);
    lines.push('');
    if (r.evidence) {
      lines.push(`_Evidence: \`${r.evidence}\'_`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  if (rows.length === 0) {
    lines.push('_No notes yet._');
  }
  fs.writeFileSync(NOTE_FILE, '\uFEFF' + lines.join('\n'), 'utf8');
  console.log(`вњ“ Exported ${rows.length} notes to ${NOTE_FILE}`);
}

// в”Ђв”Ђв”Ђ Main в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const cmd = process.argv[2];
const args = process.argv.slice(3);

switch (cmd) {
  case 'init':
    cmdInit();
    break;
  case 'stats':
    cmdStats();
    break;
  case 'index-files':
    cmdIndexFiles();
    break;
  case 'note':
    cmdNote(args);
    break;
  case 'notes':
    cmdNotes();
    break;
  case 'search':
    cmdSearch(args.join(' '));
    break;
  case 'failure':
    cmdFailure(args);
    break;
  case 'failures':
    cmdFailures();
    break;
  case 'export-notes':
    cmdExportNotes();
    break;
  default:
    console.log(`Usage:
  node tools/project-memory/agent-memory.js init
  node tools/project-memory/agent-memory.js index-files
  node tools/project-memory/agent-memory.js note <topic> <title> <body> [--evidence path]
  node tools/project-memory/agent-memory.js notes
  node tools/project-memory/agent-memory.js search <query>
  node tools/project-memory/agent-memory.js failure <symptom> <cause> <fix> [--evidence path]
  node tools/project-memory/agent-memory.js failures
  node tools/project-memory/agent-memory.js stats
  node tools/project-memory/agent-memory.js export-notes
`);
    process.exit(0);
}
