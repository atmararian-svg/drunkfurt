// Builds the whole site into one HTML file (dist-single/drunkfurt.html): `node tools/singlefile.mjs [--dev]`.
// --dev keeps the inspection hooks (window.__drunkfurt and friends) for automated checks.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const dev = process.argv.includes('--dev');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
execSync(`npx vite build -c vite.single.config.ts${dev ? ' --mode development' : ''}`, { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: dev ? 'development' : 'production' } });
const dist = path.join(root, 'dist-single');
const assets = fs.readdirSync(path.join(dist, 'assets'));
const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`expected one script, got ${js.join(', ')}`);
const read = (f) => fs.readFileSync(path.join(dist, 'assets', f), 'utf8');
// a script's text must not close its own tag early
const script = read(js[0]).replace(/<\/script/gi, '<\\/script');
const style = css.map(read).join('\n').replace(/<\/style/gi, '<\\/style');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>DRUNKFURT</title>
<meta name="description" content="DRUNKFURT: a scroll-driven 3D comic set in Frankfurt am Main at night.">
<meta name="theme-color" content="#101010">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wdth,wght@125,800&family=JetBrains+Mono:wght@400..800&display=swap">
<style>${style}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${script}</script>
</body>
</html>
`;
const out = path.join(dist, 'drunkfurt.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out}: ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
