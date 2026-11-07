import jsPDF from 'jspdf';
import { MasterProfile, Project, Room } from '../types';
import { loadPdfFonts } from './estimatePdf';
import { ShrunkRoom, diagonalLabelSpots, fitBox, fmtPct, shrinkRoom, uprightDeg } from './shrink';
import { Point } from './geometry';

type T = (key: string, vars?: Record<string, string | number>) => string;
type RGB = [number, number, number];

const W = 210;
const H = 297;
const M = 15;
const BOTTOM = 280;
const INK: RGB = [17, 24, 39];
const GREY: RGB = [75, 85, 99];
const LIGHT: RGB = [156, 163, 175];
const BLUE: RGB = [37, 99, 235];
const PT = 0.3528; // mm per pt

const num = (v: number) => v.toFixed(2).replace('.', ',');

/**
 * The order the workshop cuts from: one A4 page per room — a large drawing
 * with corner letters and every size already shrunk, then the walls and
 * diagonals as tables. A banner up top says the shrink is already taken off,
 * so the workshop doesn't take it off a second time.
 */
export async function buildWorkshopPdf(project: Project, rooms: Room[], pct: number, master: MasterProfile, t: T): Promise<jsPDF> {
  const f = await loadPdfFonts();
  const doc = new jsPDF('p', 'mm', 'a4');
  doc.addFileToVFS('NotoSans-Regular.ttf', f.regular);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', f.bold);
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');

  const font = (size: number, bold = false, color: RGB = INK) => {
    doc.setFontSize(size);
    doc.setFont('NotoSans', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
  };
  const date = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
  const client = [project.clientName, project.address].filter(Boolean).join(' · ');
  const masterLine = [master.name, master.phone].filter(Boolean).join(', ');

  rooms.forEach((room, idx) => {
    const sr = shrinkRoom(room, pct);
    if (!sr) return;
    if (idx > 0) doc.addPage();
    let y = 20;

    // header
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

    // the shrink banner
    doc.setFillColor(255, 251, 235); doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.4);
    doc.roundedRect(M, y, W - 2 * M, 13, 1.5, 1.5, 'FD');
    font(10.5, true, [120, 53, 15]);
    doc.text(t('ws.bannerTitle', { pct: fmtPct(pct) }), M + 4, y + 5.4);
    font(9, false, [146, 64, 14]);
    doc.text(t('ws.bannerText'), M + 4, y + 10);
    y += 21;

    // room title + facts
    font(14, true);
    doc.text(`${idx + 1}. ${room.name}`, M, y);
    font(9.5, false, GREY);
    doc.text(`${t('pdf.corners')}: ${sr.corners.length}`, W - M, y, { align: 'right' });
    y += 6;
    const facts: [string, string][] = [
      ...(room.fabric ? [[t('ws.fabric'), room.fabric.title] as [string, string]] : []),
      [t('pdf.area'), `${num(sr.areaSqm)} м²`],
      [t('pdf.perimeter'), `${num(sr.perimeterM)} ${t('unit.m')}`],
    ];
    let x = M;
    for (const [k, v] of facts) {
      font(9.5, false, GREY); doc.text(`${k}: `, x, y); x += doc.getTextWidth(`${k}: `);
      font(9.5, true); doc.text(v, x, y); x += doc.getTextWidth(v) + 6;
    }
    y += 4;

    // the drawing takes what the tables leave
    const rows = Math.max(sr.walls.length, sr.diagonals.length);
    const tableH = 7 + rows * 5.6;
    const drawH = Math.max(80, Math.min(150, BOTTOM - y - 6 - tableH - 4));
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, W - 2 * M, drawH, 2, 2, 'S');
    drawRoom(doc, sr, M, y, W - 2 * M, drawH, font);
    y += drawH + 6;

    // tables
    const colW = (W - 2 * M - 6) / 2;
    const wallRows = sr.walls.map(w => [w.arc ? `${w.name} (${t('ws.arc')})` : w.name, String(w.cm)]);
    const diagRows = sr.diagonals.map(d => [d.name, String(d.cm)]);
    table(doc, M, y, colW, [t('ws.wall'), t('ws.cm')], wallRows, font);
    if (diagRows.length) table(doc, M + colW + 6, y, colW, [t('ws.diagonal'), t('ws.cm')], diagRows, font);
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

type Font = (size: number, bold?: boolean, color?: RGB) => void;

/** Text centred on (x, y), turned to run along `dir` (screen coords, y down) */
function centred(doc: jsPDF, text: string, x: number, y: number, size: number, dir: Point = { x: 1, y: 0 }) {
  const deg = uprightDeg(dir);
  const r = deg * Math.PI / 180;
  const along = { x: Math.cos(r), y: Math.sin(r) }, down = { x: -Math.sin(r), y: Math.cos(r) };
  const w = doc.getTextWidth(text), h = size * PT * 0.7;
  doc.text(text, x - along.x * w / 2 + down.x * h / 2, y - along.y * w / 2 + down.y * h / 2, { angle: -deg });
}

function drawRoom(doc: jsPDF, sr: ShrunkRoom, bx: number, by: number, bw: number, bh: number, font: Font) {
  const fit = fitBox(sr.outline, bw, bh, 16);
  const T = (p: Point) => { const q = fit(p); return { x: bx + q.x, y: by + q.y }; };
  const outline = sr.outline.map(T);

  // fill + walls
  doc.setFillColor(243, 246, 250); doc.setDrawColor(...INK); doc.setLineWidth(0.6);
  const segs = outline.slice(1).map((p, i) => [p.x - outline[i].x, p.y - outline[i].y]);
  segs.push([outline[0].x - outline[outline.length - 1].x, outline[0].y - outline[outline.length - 1].y]);
  doc.lines(segs, outline[0].x, outline[0].y, [1, 1], 'FD', true);

  // diagonals, dashed, sizes on white chips
  const diags = sr.diagonals.map(d => ({ a: T(d.a), b: T(d.b), cm: d.cm }));
  doc.setDrawColor(...LIGHT); doc.setLineWidth(0.25); doc.setLineDashPattern([1.4, 1], 0);
  diags.forEach(d => doc.line(d.a.x, d.a.y, d.b.x, d.b.y));
  doc.setLineDashPattern([], 0);
  const size = 8.5;
  font(size, false, GREY);
  diagonalLabelSpots(diags, 11, 5).forEach((s, i) => {
    const text = String(diags[i].cm);
    const w = doc.getTextWidth(text) + 2.4, h = 4.4;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(s.x - w / 2, s.y - h / 2, w, h, 0.8, 0.8, 'F');
    centred(doc, text, s.x, s.y, size);
  });

  // wall sizes, outside each wall
  font(10, true);
  sr.walls.forEach(w => {
    const m = T(w.mid);
    const gap = w.arc ? 5.5 : 4.2; // an arc curves away from its chord — keep clear of it
    centred(doc, String(w.cm), m.x + w.out.x * gap, m.y + w.out.y * gap, 10, w.dir);
  });

  // corners
  sr.corners.forEach(c => {
    const p = T(c.p);
    doc.setFillColor(...INK);
    doc.circle(p.x, p.y, 0.7, 'F');
    font(10, true, BLUE);
    centred(doc, c.label, p.x + c.out.x * 4, p.y + c.out.y * 4, 10);
  });
}

function table(doc: jsPDF, x: number, y: number, w: number, head: [string, string], rows: string[][], font: Font) {
  const rh = 5.6, c2 = w * 0.4;
  let yy = y;
  const row = (cells: string[], header: boolean) => {
    if (yy + rh > BOTTOM) { doc.addPage(); yy = 20; }
    if (header) { doc.setFillColor(243, 244, 246); doc.rect(x, yy, w, rh + 1, 'F'); }
    const h = header ? rh + 1 : rh;
    doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.25);
    doc.rect(x, yy, w, h, 'S');
    doc.line(x + w - c2, yy, x + w - c2, yy + h);
    font(9.5, header);
    doc.text(cells[0], x + 2.5, yy + h / 2 + 1.2);
    font(9.5, true);
    doc.text(cells[1], header ? x + w - c2 + 2.5 : x + w - 2.5, yy + h / 2 + 1.2, { align: header ? 'left' : 'right' });
    yy += h;
  };
  row(head, true);
  rows.forEach(r => row(r, false));
}
