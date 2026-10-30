// Generate illustration candidates from the standard style prompt (images/style-prompt.md).
//
//   RECRAFT_API_TOKEN=... node scripts/generate-illustration.mjs \
//     --name kitchen --scene "a kitchen table with a cup, a plate and a loaf of bread" [--n 2] [--out <dir>]
//
// Candidates are written to --out (default: images/candidates/, git-ignored) with a JSON sidecar
// holding the full prompt and settings. Chosen images are copied to src/assets/illustrations/ and
// recorded in images/manifest.json; candidates never go into the site directly.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    name: { type: 'string' },
    scene: { type: 'string' },
    n: { type: 'string', default: '2' },
    out: { type: 'string', default: join(root, 'images', 'candidates') },
    seed: { type: 'string' },
  },
});

if (!args.name || !args.scene) {
  console.error('Usage: node scripts/generate-illustration.mjs --name <slug> --scene "<what to show>" [--n 2] [--out dir]');
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(args.name)) {
  console.error('--name must be a lowercase slug (a-z, 0-9, -).');
  process.exit(1);
}
const token = process.env.RECRAFT_API_TOKEN;
if (!token) {
  console.error('RECRAFT_API_TOKEN is not set.');
  process.exit(1);
}

const styleDoc = readFileSync(join(root, 'images', 'style-prompt.md'), 'utf8');
const settings = JSON.parse(styleDoc.match(/```json\n([\s\S]*?)```/)[1]);
const template = styleDoc.match(/```prompt\n([\s\S]*?)```/)[1].trim();
const prompt = template.replace('{scene}', args.scene.trim().replace(/\.$/, ''));

const body = {
  prompt,
  model: settings.model,
  style: settings.style,
  size: settings.size,
  n: Number(args.n),
  response_format: 'url',
  controls: {
    colors: settings.colors,
    background_color: { rgb: settings.background },
  },
};
if (args.seed) body.random_seed = Number(args.seed);

const res = await fetch('https://external.api.recraft.ai/v1/images/generations', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`Recraft API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const result = await res.json();

mkdirSync(args.out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
let i = 0;
for (const item of result.data ?? []) {
  i += 1;
  const file = await fetch(item.url);
  const type = file.headers.get('content-type') ?? '';
  const ext = type.includes('svg') ? 'svg' : type.includes('png') ? 'png' : 'webp';
  const base = `${args.name}-${stamp}-${i}`;
  writeFileSync(join(args.out, `${base}.${ext}`), Buffer.from(await file.arrayBuffer()));
  writeFileSync(
    join(args.out, `${base}.json`),
    JSON.stringify({ name: args.name, scene: args.scene, prompt, request: { ...body, prompt: undefined }, created: new Date().toISOString() }, null, 2),
  );
  console.log(join(args.out, `${base}.${ext}`));
}
if (result.credits !== undefined) console.log(`credits used: ${result.credits}`);
