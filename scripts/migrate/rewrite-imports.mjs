// Temporary migration helper: rewrite relative imports after the folder move. Deleted in Task 8.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
// old dir (relative to root) → new dir
const MOVES = [
  ['backend/src', 'src/server'],
  ['backend/tests', 'tests'],
  ['backend/prisma', 'prisma'],
  ['backend/scripts', 'scripts'],
  ['frontend/src', 'src/client'],
];
const toNew = (oldAbs) => {
  const rel = path.relative(root, oldAbs).split(path.sep).join('/');
  for (const [from, to] of MOVES) if (rel === from || rel.startsWith(`${from}/`)) return path.join(root, to + rel.slice(from.length));
  return oldAbs;
};
const toOld = (newAbs) => {
  const rel = path.relative(root, newAbs).split(path.sep).join('/');
  for (const [from, to] of MOVES) if (rel === to || rel.startsWith(`${to}/`)) return path.join(root, from + rel.slice(to.length));
  return newAbs;
};
const SPEC = /((?:import|export)\s[^'"]*?from\s*|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;

function rewrite(file, source) {
  const oldFile = toOld(file);
  return source.replace(SPEC, (all, head, q, spec) => {
    const target = toNew(path.resolve(path.dirname(oldFile), spec));
    let next = path.relative(path.dirname(file), target).split(path.sep).join('/');
    if (!next.startsWith('.')) next = `./${next}`;
    return `${head}${q}${next}${q}`;
  });
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.name === 'node_modules') return [];
  return d.isDirectory() ? walk(p) : /\.(m?js|jsx)$/.test(d.name) ? [p] : [];
});

// Arguments are moved folders or moved files. Never pass the root scripts/ folder: dev.mjs etc. did not move.
let changed = 0;
const targets = process.argv.slice(2).map((p) => path.join(root, p));
for (const file of targets.flatMap((p) => (fs.statSync(p).isDirectory() ? walk(p) : [p]))) {
  const before = fs.readFileSync(file, 'utf8');
  const after = rewrite(file, before);
  if (after !== before) { fs.writeFileSync(file, after); changed += 1; }
}
console.log(`[rewrite-imports] updated ${changed} files`);
