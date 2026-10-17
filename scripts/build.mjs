// Build sem dependências de runtime: compila TypeScript e copia os arquivos estáticos para dist/.
import { spawnSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watchMode = process.argv.includes('--watch');

function tscBin() {
  const local = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  return existsSync(local) ? local : 'tsc';
}

function copyStatic() {
  mkdirSync(dist, { recursive: true });
  cpSync(join(root, 'index.html'), join(dist, 'index.html'));
  cpSync(join(root, 'styles'), join(dist, 'styles'), { recursive: true });
  cpSync(join(root, 'public'), dist, { recursive: true, force: false, errorOnExist: false });
  // config.js nunca é sobrescrito se já existir em dist (permite configurar após o build)
  if (!existsSync(join(dist, 'config.js'))) cpSync(join(root, 'config.js'), join(dist, 'config.js'));
}

if (!watchMode) {
  rmSync(join(dist, 'js'), { recursive: true, force: true });
  const r = spawnSync(tscBin(), ['-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  copyStatic();
  console.log('✓ build concluído em dist/');
} else {
  copyStatic();
  spawn(tscBin(), ['-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  for (const p of ['index.html', 'styles', 'public']) {
    watch(join(root, p), { recursive: true }, () => { try { copyStatic(); } catch {} });
  }
  import('./serve.mjs');
}
