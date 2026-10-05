// Temporary migration helper: react-router-dom → src/client/navigation.jsx (tests → src/client/test/router.jsx).
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src', 'client');
const nav = path.join(root, 'navigation.jsx');
const testRouter = path.join(root, 'test', 'router.jsx');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|jsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
let n = 0;
for (const file of walk(root)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes("'react-router-dom'")) continue;
  const isTest = /__tests__|\.test\.|[\\/]test[\\/]/.test(file);
  let rel = path.relative(path.dirname(file), isTest ? testRouter : nav).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  fs.writeFileSync(file, src.replaceAll("'react-router-dom'", `'${rel}'`));
  n += 1;
}
console.log(`[rewrite-router-imports] updated ${n} files`);
