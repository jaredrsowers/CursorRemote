import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

const repoRoot = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as { version: string };
const version = pkg.version;
const extDir = join(homedir(), '.cursor', 'extensions', `cursor-remote.cursor-remote-${version}`);

function run(cmd: string): void {
  execSync(cmd, { cwd: repoRoot, stdio: 'inherit', shell: true });
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else cpSync(from, to);
  }
}

console.log(`Building CursorRemote ${version}...`);
run('npx tsc');

const clientDist = join(repoRoot, 'dist', 'client');
if (existsSync(clientDist)) rmSync(clientDist, { recursive: true, force: true });
copyDir(join(repoRoot, 'src', 'client'), clientDist);
cpSync(
  join(repoRoot, 'node_modules', 'socket.io', 'client-dist', 'socket.io.min.js'),
  join(clientDist, 'vendor-socket.io.min.js')
);
cpSync(
  join(repoRoot, 'node_modules', 'socket.io', 'client-dist', 'socket.io.min.js.map'),
  join(clientDist, 'vendor-socket.io.min.js.map')
);

run('npm run build:ext');

if (!existsSync(extDir)) {
  console.error(
    `Extension folder not found: ${extDir}\n` +
      `Install the VSIX first: cursor --install-extension releases/cursor-remote-${version}.vsix`
  );
  process.exit(1);
}

cpSync(join(repoRoot, 'dist', 'extension.cjs'), join(extDir, 'dist', 'extension.cjs'));
cpSync(join(repoRoot, 'dist', 'server', 'bundle.mjs'), join(extDir, 'dist', 'server', 'bundle.mjs'));
copyDir(clientDist, join(extDir, 'dist', 'client'));

console.log(`Deployed to ${extDir}`);
console.log('Next: CursorRemote: Restart Server (or Developer: Reload Window), then hard-refresh the web client.');
