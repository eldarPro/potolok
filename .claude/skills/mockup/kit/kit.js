// Mockup kit helpers. Подключение: <script src="../../.claude/skills/mockup/kit/kit.js"></script>
// до своего <script>. Всё — глобальные функции, без сборки.

/** Вставить SVG-разметку в <svg id> */
const svg = (id, html) => { document.getElementById(id).innerHTML = html; };

/** SVG-текст. o: { fs, c (цвет), a (anchor), w (weight), rot (градусы вокруг точки) } */
const T = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.fs || 12}" fill="${o.c || '#111827'}" text-anchor="${o.a || 'middle'}" font-weight="${o.w || 500}"${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ''}>${s}</text>`;

/** Плашка размера на чертеже (как длина стены). o: { on (выбрана — синяя), w (ширина), warn (оранжевая) } */
const lab = (x, y, t, o = {}) => {
  const w = o.w || Math.max(36, String(t).length * 7.6 + 14);
  const bg = o.on ? '#1E88E5' : o.warn ? '#F59E0B' : '#fff', st = o.on ? '#1E88E5' : o.warn ? '#F59E0B' : '#CBD5E1';
  return `<rect x="${x - w / 2}" y="${y - 11}" width="${w}" height="20" rx="6" fill="${bg}" stroke="${st}"/>` +
    T(x, y + 4, t, { fs: 12, w: 700, c: o.on || o.warn ? '#fff' : '#111827' });
};

/** Размерная линия с засечками и подписью посередине. o: { off (сдвиг подписи), c } */
const dim = (x1, y1, x2, y2, t, o = {}) => {
  const c = o.c || '#6B7280', a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * 4, ny = Math.cos(a) * 4;
  const mx = (x1 + x2) / 2 - Math.sin(a) * (o.off ?? 10), my = (y1 + y2) / 2 + Math.cos(a) * (o.off ?? 10);
  const deg = a * 180 / Math.PI, rot = Math.abs(deg) > 90 ? deg + 180 : deg;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1"/>` +
    `<line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x1 + nx}" y2="${y1 + ny}" stroke="${c}"/>` +
    `<line x1="${x2 - nx}" y1="${y2 - ny}" x2="${x2 + nx}" y2="${y2 + ny}" stroke="${c}"/>` +
    T(mx, my + 4, t, { fs: 11.5, w: 600, c, rot: Math.round(rot) || 0 });
};

/** Многоугольник из [[x,y],...]. attrs — строка атрибутов */
const poly = (pts, attrs = 'fill="#F3F6FA" stroke="#111827" stroke-width="2"') =>
  `<polygon points="${pts.map(p => p.join(',')).join(' ')}" ${attrs}/>`;

/** Кружок с номером (проём, угол, позиция) */
const badge = (x, y, n, c = '#1E88E5') => `<circle cx="${x}" cy="${y}" r="11" fill="${c}"/>` + T(x, y + 4, n, { fs: 12, w: 700, c: '#fff' });

/** Штриховка для отходов/ниш: вставить pattern один раз в <defs>, потом fill="url(#hatch)" */
const HATCH = '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#FCA5A5" stroke-width="2"/></pattern></defs>';

/** Деньги и числа по-русски: rub(71716) → "71 716 ₽", n(3.5) → "3,5" */
const n = (v, d = 0) => Number(v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, ' ');
const rub = (v) => `${n(Math.round(v))} ₽`;

/** HTML нашей клавиатуры NumPad. label — что вводим, prog — «2 из 5», enter — текст зелёной кнопки */
const numpad = (label, { prog = '', enter = 'Готово' } = {}) =>
  `<div class="npad"><div class="hd"><span>${label}</span><i>${prog}</i>⌄</div><div class="gr">` +
  ['1', '2', '3', '⌫', '4', '5', '6', '−', '7', '8', '9', '', '00', '0', ',', ''].map((k, i) =>
    i === 11 ? `<div class="k ok" style="grid-row:span 2">${enter}</div>` : i === 15 ? '' : `<div class="k${k === '⌫' || k === '−' ? ' fn' : ''}">${k}</div>`).join('') +
  '</div></div>';

/** Список строк .li из массива объектов {n, title, sub, right, rightSub, tag, tagCls, numCls, thumb} */
const list = (rows) => rows.map(r => `<div class="li">${r.thumb ? `<div class="thumb">${r.thumb}</div>` : r.n != null ? `<div class="num ${r.numCls || ''}">${r.n}</div>` : ''}` +
  `<div><b>${r.title}</b>${r.tag ? `<span class="tag ${r.tagCls || ''}">${r.tag}</span>` : ''}${r.sub ? `<div class="sub">${r.sub}</div>` : ''}</div>` +
  `${r.right != null ? `<div class="rt">${r.right}${r.rightSub ? `<small>${r.rightSub}</small>` : ''}</div>` : ''}</div>`).join('');

/** Строки сметы для <table class="est"> из [[название, пояснение, сумма], ...] */
const estRows = (rows) => rows.map(([a, s, v, cls]) => `<tr><td>${a}${s ? `<br><small>${s}</small>` : ''}</td><td class="n ${cls || ''}">${typeof v === 'number' ? rub(v) : v}</td></tr>`).join('');
