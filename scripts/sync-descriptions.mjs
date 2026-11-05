// 把 config/projects.json 里的“系统说明”回填到数据库 pm_projects.description（只补空的，不覆盖已有说明）。
// 用法：node scripts/sync-descriptions.mjs [--apply]   不带 --apply 只列出将要回填的内容。
// 连接配置同调度枢纽：config/data-source.json 或环境变量 NOCODB_URL / NOCODB_TOKEN / PM_PROJECTS_TABLE_ID。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { readSourceConfig, fetchRows } = require('../lib/card-source.js');
const apply = process.argv.includes('--apply');

const config = readSourceConfig(root);
const files = JSON.parse(fs.readFileSync(path.join(root, 'config', 'projects.json'), 'utf8')).filter(item => item.description);
const rows = await fetchRows(config, 10000);
const rowPort = row => Number(row.web_port) || null;
const updates = [];
for (const row of rows) {
  if (String(row.description || '').trim()) continue;
  const name = String(row.name || '').trim();
  const label = String(row.version_label || '').trim();
  const match = files.find(file => file.id === String(row.code || ''))
    || files.find(file => file.name === name && (!label || !file.versionLabel || file.versionLabel === label))
    || files.find(file => rowPort(row) && file.webPort === rowPort(row));
  if (match) updates.push({ id: row.id, name, description: match.description });
}
if (!updates.length) { console.log('没有需要回填的说明（库里的说明都已填写，或 projects.json 里没有对应系统）。'); process.exit(0); }
for (const item of updates) console.log(`#${item.id} ${item.name}：${item.description}`);
if (!apply) { console.log(`\n共 ${updates.length} 条。确认无误后加 --apply 写入数据库。`); process.exit(0); }
const response = await fetch(`${config.url}/api/v2/tables/${config.tableId}/records`, {
  method: 'PATCH', headers: { 'xc-token': config.token, 'Content-Type': 'application/json' },
  body: JSON.stringify(updates.map(({ id, description }) => ({ id, description })))
});
if (!response.ok) { console.error(`写入失败（HTTP ${response.status}）：${await response.text()}`); process.exit(1); }
console.log(`\n已回填 ${updates.length} 条说明。`);
