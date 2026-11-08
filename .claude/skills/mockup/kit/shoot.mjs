// Съёмка мокапов + автопроверка вёрстки.
//   node .claude/skills/mockup/kit/shoot.mjs screenshots/<тема> [mock.html]
// Каждый .shot снимается в <тема>/<data-name>.png (без data-name: shot-N.png),
// весь лист — в <тема>/0-overview.png. Затем печатаются найденные проблемы.
import { createRequire } from 'module';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

const dir = resolve(process.argv[2] || '.');
const file = join(dir, process.argv[3] || 'mock.html');
if (!existsSync(file)) { console.error(`нет файла ${file}`); process.exit(1); }

// playwright из node_modules ближайшего проекта (ищем вверх от папки мокапа)
let pw;
for (let d = dir; ; d = resolve(d, '..')) {
  const p = join(d, 'node_modules/playwright/index.mjs');
  if (existsSync(p)) { pw = await import(p); break; }
  if (d === '/') { pw = createRequire(import.meta.url)('playwright'); break; }
}

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1340, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(`JS: ${e.message}`));
page.on('console', m => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('requestfailed', r => errors.push(`не загрузилось: ${r.url()}`));
await page.goto('file://' + file);
await page.waitForTimeout(150);

const shots = await page.$$('.shot');
const names = [];
for (let i = 0; i < shots.length; i++) {
  const name = (await shots[i].getAttribute('data-name')) || `shot-${i + 1}`;
  names.push(name);
  await shots[i].screenshot({ path: join(dir, `${name}.png`) });
}
await page.screenshot({ path: join(dir, '0-overview.png'), fullPage: true });

// ── проверки ──
const issues = await page.evaluate(() => {
  const out = [];
  const shotName = el => el.closest('.shot')?.getAttribute('data-name') || '?';
  const txt = el => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  document.querySelectorAll('.phone').forEach(ph => {
    const P = ph.getBoundingClientRect(), name = shotName(ph);
    // 1. контент не влез в .body по высоте
    ph.querySelectorAll('.body').forEach(b => {
      if (b.scrollHeight > b.clientHeight + 2) out.push(`[${name}] .body обрезан снизу на ${b.scrollHeight - b.clientHeight}px — убери блок или ужми`);
    });
    // 2. HTML-текст за краем телефона
    ph.querySelectorAll('*').forEach(el => {
      if (el.closest('svg') || !el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > P.right + 1 || r.left < P.left - 1)) out.push(`[${name}] текст за краем экрана: «${txt(el)}»`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow === 'hidden') out.push(`[${name}] текст обрезан по ширине: «${txt(el)}»`);
    });
    // 3. SVG: подписи за рамкой и наложения подписей друг на друга
    ph.querySelectorAll('svg').forEach(s => {
      const S = s.getBoundingClientRect();
      const texts = [...s.querySelectorAll('text')].map(t => ({ t, r: t.getBoundingClientRect() })).filter(o => o.r.width);
      texts.forEach(({ t, r }) => {
        if (r.left < S.left - 1 || r.right > S.right + 1 || r.top < S.top - 1 || r.bottom > S.bottom + 1)
          out.push(`[${name}] SVG-подпись вылезает за рамку: «${txt(t)}»`);
      });
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i].r, b = texts[j].r, area = Math.min(a.width * a.height, b.width * b.height);
        if (inter(a, b) > area * 0.25) out.push(`[${name}] SVG-подписи наложились: «${txt(texts[i].t)}» и «${txt(texts[j].t)}»`);
      }
    });
  });
  return [...new Set(out)];
});

await browser.close();
console.log(`снято: ${names.length} экранов → ${dir}`);
console.log(`  0-overview.png, ${names.map(n => n + '.png').join(', ')}`);
const all = [...errors, ...issues];
if (all.length) { console.log(`\n⚠ проблемы (${all.length}):`); all.forEach(s => console.log('  - ' + s)); }
else console.log('\n✓ проблем вёрстки не найдено');
