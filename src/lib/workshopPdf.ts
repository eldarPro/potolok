import jsPDF from 'jspdf';
import { MasterProfile, Project, Room, Shrink } from '../types';
import { loadPdfFonts } from './estimatePdf';
import { ShrunkRoom, diagonalLabelSpots, fitBox, fmtPct, roomShrink, sameShrink, shrinkRoom, uprightDeg } from './shrink';
import { Point } from './geometry';

type T = (key: string, vars?: Record<string, string | number>) => string;
type RGB = [number, number, number];

const W = 210;
const H = 297;
const M = 15;
const BOTTOM = 280;
const INK: RGB = [17, 24, 39];
const GREY: RGB = [75, 85, 99];
const MUTED: RGB = [107, 114, 128];
const LIGHT: RGB = [156, 163, 175];
const BLUE: RGB = [37, 99, 235];
const AMBER: RGB = [245, 158, 11];
const AMBER_INK: RGB = [146, 64, 14];
const PT = 0.3528; // mm per pt

const num = (v: number) => v.toFixed(2).replace('.', ',');

type Font = (size: number, bold?: boolean, color?: RGB) => void;

/** "7 %" or "по длине 7 %, по ширине 8 %" */
const shrinkText = (p: { x: number; y: number }, t: T) =>
  p.x === p.y ? `${fmtPct(p.x)} %` : t('ws.axesText', { x: fmtPct(p.x), y: fmtPct(p.y) });

/**
 * The order the workshop cuts from. The first page lists the rooms with the
 * shrink each goes with; then one page per room — a large drawing with corner
 * letters, each size cut (shrink taken off) and, smaller in brackets, as
 * measured — and the walls and diagonals as tables. The banner up top says the
 * shrink is already taken off, so the workshop doesn't take it off again.
 */
export async function buildWorkshopPdf(project: Project, rooms: Room[], order: Shrink, master: MasterProfile, t: T): Promise<jsPDF> {
  const f = await loadPdfFonts();
  const doc = new jsPDF('p', 'mm', 'a4');
  doc.addFileToVFS('NotoSans-Regular.ttf', f.regular);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', f.bold);
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');

  const font: Font = (size, bold = false, color = INK) => {
    doc.setFontSize(size);
    doc.setFont('NotoSans', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
  };
  const date = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
  const client = [project.clientName, project.address].filter(Boolean).join(' · ');
  const masterLine = [master.name, master.phone].filter(Boolean).join(', ');

  const items = rooms
    .map(room => ({ room, sr: shrinkRoom(room, roomShrink(room, order)) }))
    .filter((x): x is { room: Room; sr: ShrunkRoom } => !!x.sr);
  const shrinks = items.map(x => roomShrink(x.room, order));
  const allSame = shrinks.every(s => sameShrink(s, shrinks[0]));

  // ── header, banner, the rooms at a glance ──
  let y = 20;
  font(17, true);
  doc.text(t('ws.pdfTitle'), M, y);
  font(9, false, GREY);
  doc.text(date, W - M, y - 4, { align: 'right' });
  if (masterLine) doc.text(`${t('ws.master')}: ${masterLine}`, W - M, y + 0.5, { align: 'right' });
  if (master.company) doc.text(master.company, W - M, y + 5, { align: 'right' });
  y += 6;
  doc.text(doc.splitTextToSize(client, 110) as string[], M, y);
  y += 6;
  doc.setDrawColor(...INK); doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 5;

  doc.setFillColor(255, 251, 235); doc.setDrawColor(...AMBER); doc.setLineWidth(0.4);
  doc.roundedRect(M, y, W - 2 * M, 13, 1.5, 1.5, 'FD');
  font(10.5, true, [120, 53, 15]);
  doc.text(allSame && items.length
    ? t('ws.bannerTitle', { pct: shrinkText(items[0].sr.pct, t) })
    : t('ws.bannerMixed'), M + 4, y + 5.4);
  font(9, false, AMBER_INK);
  doc.text(t('ws.bannerText'), M + 4, y + 10);
  y += 19;

  if (items.length > 1) {
    y = table(doc, M, y, W - 2 * M,
      [t('ws.no'), t('ws.room'), t('ws.fabric'), t('ws.shrink'), t('ws.areaCut')],
      items.map(({ room, sr }, i) => [String(i + 1), room.name, room.fabric?.title ?? '—', shrinkText(sr.pct, t), num(sr.areaSqm)]),
      [0.06, 0.2, 0.25, 0.33, 0.16], ['l', 'l', 'l', 'l', 'r'], font, [false, false, false, true, true]);
    y += 8;
  }

  items.forEach(({ room, sr }, idx) => {
    const rows = Math.max(sr.walls.length, sr.diagonals.length);
    const tableH = 7 + rows * 5.6;
    // a room starts a fresh page unless it fits whole under the summary
    if (idx > 0 || y + 20 + 80 + tableH > BOTTOM) {
      doc.addPage();
      y = 14;
      font(8.5, false, MUTED);
      doc.text(`${t('ws.pdfTitle')} · ${date}`, M, y);
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.line(M, y + 2.5, W - M, y + 2.5);
      y += 11;
    }

    // title + the shrink this room goes with
    font(14, true);
    doc.text(`${idx + 1}. ${room.name}`, M, y);
    const badge = sr.pct.x === sr.pct.y
      ? t('ws.badgeOne', { pct: fmtPct(sr.pct.x) })
      : t('ws.badgeAxes', { x: fmtPct(sr.pct.x), y: fmtPct(sr.pct.y) });
    font(9.5, true, AMBER_INK);
    const bw = doc.getTextWidth(badge) + 6;
    doc.setFillColor(254, 243, 199); doc.setDrawColor(...AMBER); doc.setLineWidth(0.3);
    doc.roundedRect(W - M - bw, y - 4.6, bw, 6.4, 1.2, 1.2, 'FD');
    doc.text(badge, W - M - bw / 2, y, { align: 'center' });
    y += 6;

    // facts: cut, and as measured in brackets
    let x = M;
    const fact = (k: string, v: string, real?: string) => {
      font(9.5, false, GREY); doc.text(`${k}: `, x, y); x += doc.getTextWidth(`${k}: `);
      font(9.5, true); doc.text(v, x, y); x += doc.getTextWidth(v);
      if (real) { font(9, false, MUTED); doc.text(` (${real})`, x, y); x += doc.getTextWidth(` (${real})`); }
      x += 5;
    };
    if (room.fabric) fact(t('ws.fabric'), room.fabric.title);
    fact(t('pdf.area'), `${num(sr.areaSqm)} м²`, `${t('ws.measured')} ${num(sr.realAreaSqm)} м²`);
    fact(t('pdf.perimeter'), `${num(sr.perimeterM)} ${t('unit.m')}`, `${num(sr.realPerimeterM)} ${t('unit.m')}`);
    fact(t('pdf.corners'), String(sr.corners.length));
    y += 4;

    // the drawing takes what the tables leave
    const drawH = Math.max(80, Math.min(150, BOTTOM - y - 10 - tableH - 4));
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, W - 2 * M, drawH, 2, 2, 'S');
    drawRoom(doc, sr, M, y, W - 2 * M, drawH, font, t);
    y += drawH + 4.5;
    font(8.5, false, MUTED);
    doc.text(t('ws.legend'), M, y);
    y += 3.5;

    // tables
    const colW = (W - 2 * M - 6) / 2;
    const heads = [t('ws.colReal'), t('ws.colCut')];
    const fr = [0.36, 0.32, 0.32];
    const al: ('l' | 'r')[] = ['l', 'r', 'r'];
    const bold = [false, false, true];
    table(doc, M, y, colW, [t('ws.wall'), ...heads],
      sr.walls.map(w => [w.arc ? `${w.name} (${t('ws.arc')})` : w.name, String(w.realCm), String(w.cm)]), fr, al, font, bold, true);
    if (sr.diagonals.length) {
      table(doc, M + colW + 6, y, colW, [t('ws.diagonal'), ...heads],
        sr.diagonals.map(d => [d.name, String(d.realCm), String(d.cm)]), fr, al, font, bold, true);
    }
  });

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
    doc.line(M, H - 14, W - M, H - 14);
    font(8, false, LIGHT);
    doc.text(client, M, H - 9.5);
    doc.text(t('ws.page', { n: p, total: pages }), W - M, H - 9.5, { align: 'right' });
  }
  return doc;
}

/** Text centred on (x, y), turned to run along `dir` (screen coords, y down) */
function centred(doc: jsPDF, text: string, x: number, y: number, size: number, dir: Point = { x: 1, y: 0 }) {
  const deg = uprightDeg(dir);
  const r = deg * Math.PI / 180;
  const along = { x: Math.cos(r), y: Math.sin(r) }, down = { x: -Math.sin(r), y: Math.cos(r) };
  const w = doc.getTextWidth(text), h = size * PT * 0.7;
  doc.text(text, x - along.x * w / 2 + down.x * h / 2, y - along.y * w / 2 + down.y * h / 2, { angle: -deg });
}

/** A double-headed arrow with a label on a white chip in the middle */
function axisArrow(doc: jsPDF, a: Point, b: Point, label: string, font: Font) {
  doc.setDrawColor(...AMBER); doc.setFillColor(...AMBER); doc.setLineWidth(0.5);
  doc.line(a.x, a.y, b.x, b.y);
  const head = (tip: Point, from: Point) => {
    const l = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
    const ux = (tip.x - from.x) / l, uy = (tip.y - from.y) / l;
    doc.triangle(tip.x, tip.y, tip.x - ux * 2.4 - uy * 1.2, tip.y - uy * 2.4 + ux * 1.2, tip.x - ux * 2.4 + uy * 1.2, tip.y - uy * 2.4 - ux * 1.2, 'F');
  };
  head(a, b); head(b, a);
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  font(8.5, true, AMBER_INK);
  const w = doc.getTextWidth(label) + 4, h = 4.6;
  doc.setFillColor(254, 243, 199);
  if (vertical) doc.roundedRect(m.x - h / 2, m.y - w / 2, h, w, 1.2, 1.2, 'F');
  else doc.roundedRect(m.x - w / 2, m.y - h / 2, w, h, 1.2, 1.2, 'F');
  centred(doc, label, m.x, m.y, 8.5, vertical ? { x: 0, y: -1 } : { x: 1, y: 0 });
}

function drawRoom(doc: jsPDF, sr: ShrunkRoom, bx: number, by: number, bw: number, bh: number, font: Font, t: T) {
  const axes = sr.pct.x !== sr.pct.y;
  const fit = fitBox(sr.outline, bw - (axes ? 10 : 0), bh - (axes ? 8 : 0), 19);
  const T = (p: Point) => { const q = fit(p); return { x: bx + q.x, y: by + q.y }; };
  const outline = sr.outline.map(T);

  // fill + walls
  doc.setFillColor(243, 246, 250); doc.setDrawColor(...INK); doc.setLineWidth(0.6);
  const segs = outline.slice(1).map((p, i) => [p.x - outline[i].x, p.y - outline[i].y]);
  segs.push([outline[0].x - outline[outline.length - 1].x, outline[0].y - outline[outline.length - 1].y]);
  doc.lines(segs, outline[0].x, outline[0].y, [1, 1], 'FD', true);

  // diagonals, dashed; cut size over the measured one on a white chip
  const diags = sr.diagonals.map(d => ({ a: T(d.a), b: T(d.b), cm: d.cm, real: d.realCm }));
  doc.setDrawColor(...LIGHT); doc.setLineWidth(0.25); doc.setLineDashPattern([1.4, 1], 0);
  diags.forEach(d => doc.line(d.a.x, d.a.y, d.b.x, d.b.y));
  doc.setLineDashPattern([], 0);
  diagonalLabelSpots(diags, 11, 8.5).forEach((s, i) => {
    const cut = String(diags[i].cm), real = `(${diags[i].real})`;
    font(8.5); const w1 = doc.getTextWidth(cut);
    font(7); const w2 = doc.getTextWidth(real);
    const w = Math.max(w1, w2) + 2.6, h = 7.6;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(s.x - w / 2, s.y - h / 2, w, h, 0.8, 0.8, 'F');
    font(8.5, false, GREY); centred(doc, cut, s.x, s.y - 1.5, 8.5);
    font(7, false, LIGHT); centred(doc, real, s.x, s.y + 2.1, 7);
  });

  // wall sizes outside each wall: cut, then the measured one further out
  sr.walls.forEach(w => {
    const m = T(w.mid);
    const gap = w.arc ? 5.5 : 4.2; // an arc curves away from its chord — keep clear of it
    font(10, true); centred(doc, String(w.cm), m.x + w.out.x * gap, m.y + w.out.y * gap, 10, w.dir);
    font(7.5, false, LIGHT); centred(doc, `(${w.realCm})`, m.x + w.out.x * (gap + 3.9), m.y + w.out.y * (gap + 3.9), 7.5, w.dir);
  });

  // corners
  sr.corners.forEach(c => {
    const p = T(c.p);
    doc.setFillColor(...INK);
    doc.circle(p.x, p.y, 0.7, 'F');
    font(10, true, BLUE);
    centred(doc, c.label, p.x + c.out.x * 4, p.y + c.out.y * 4, 10);
  });

  // which way is the length and which the width, when they shrink differently
  if (axes) {
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    axisArrow(doc, { x: Math.min(...xs), y: by + bh - 4 }, { x: Math.max(...xs), y: by + bh - 4 }, t('ws.lenShort', { pct: fmtPct(sr.pct.x) }), font);
    axisArrow(doc, { x: bx + bw - 5, y: Math.min(...ys) }, { x: bx + bw - 5, y: Math.max(...ys) }, t('ws.widShort', { pct: fmtPct(sr.pct.y) }), font);
  }
}

/**
 * A plain table: columns as fractions of `w`, each aligned left or right.
 * Returns where it ended; runs onto a new page when it reaches the bottom.
 */
function table(
  doc: jsPDF, x: number, y: number, w: number, head: string[], rows: string[][],
  frac: number[], align: ('l' | 'r')[], font: Font, bold: boolean[], greyFirstNumbers = false,
): number {
  const rh = 5.6;
  const xs = frac.reduce<number[]>((acc, f, i) => [...acc, acc[i] + f * w], [x]);
  let yy = y;
  const row = (cells: string[], header: boolean) => {
    const h = header ? rh + 1 : rh;
    if (yy + h > BOTTOM) { doc.addPage(); yy = 20; }
    if (header) { doc.setFillColor(243, 244, 246); doc.rect(x, yy, w, h, 'F'); }
    doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.25);
    doc.rect(x, yy, w, h, 'S');
    xs.slice(1, -1).forEach(cx => doc.line(cx, yy, cx, yy + h));
    cells.forEach((c, i) => {
      const grey = !header && greyFirstNumbers && i === 1;
      font(header ? 8.5 : 9.5, header || bold[i], grey ? MUTED : INK);
      const right = align[i] === 'r';
      const text = (doc.splitTextToSize(c, xs[i + 1] - xs[i] - 4) as string[])[0];
      doc.text(text, right ? xs[i + 1] - 2.2 : xs[i] + 2.2, yy + h / 2 + 1.2, { align: right ? 'right' : 'left' });
    });
    yy += h;
  };
  row(head, true);
  rows.forEach(r => row(r, false));
  return yy;
}
