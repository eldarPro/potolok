import jsPDF from 'jspdf';
import { Project } from '../types';
import { advanceOf, fmtAdvanceDate, remainingAfter } from './advance';
import { EstimateSide, ProjectEstimate, lineTotal, roomCorners } from './pricing';
import { fmtRub, itemTitle, lineCalc, sectionedItems } from './estimateFormat';
import regularUrl from '../assets/fonts/NotoSans-Regular.ttf?url';
import boldUrl from '../assets/fonts/NotoSans-Bold.ttf?url';

type T = (key: string, vars?: Record<string, string | number>) => string;

// Noto Sans has no U+2212 minus sign, so amounts take an en dash in the PDF
const MINUS = '\u2013';
const signed = (v: number) => `${v < 0 ? MINUS : '+'}${fmtRub(Math.abs(v))}`;

// jsPDF's built-in fonts have no Cyrillic, so embed Noto Sans. The files are
// fetched once, on the first PDF, and kept as base64 for the session.
let fonts: Promise<{ regular: string; bold: string }> | null = null;

const toBase64 = async (url: string) => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export const loadPdfFonts = () => {
  if (!fonts) {
    fonts = Promise.all([toBase64(regularUrl), toBase64(boldUrl)])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch(e => { fonts = null; throw e; });
  }
  return fonts;
};

const W = 210;
const MARGIN = 15;
const BOTTOM = 282;
const GREY: [number, number, number] = [110, 116, 128];
const BLACK: [number, number, number] = [17, 24, 39];

/** The client estimate or the crew work order as an A4 PDF */
export async function buildEstimatePdf(project: Project, est: ProjectEstimate, side: EstimateSide, t: T): Promise<jsPDF> {
  const f = await loadPdfFonts();
  const doc = new jsPDF('p', 'mm', 'a4');
  doc.addFileToVFS('NotoSans-Regular.ttf', f.regular);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', f.bold);
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');

  let y = 20;
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = 20; } };
  const font = (size: number, bold = false, color = BLACK) => {
    doc.setFontSize(size);
    doc.setFont('NotoSans', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
  };
  const right = (text: string, yy: number) => doc.text(text, W - MARGIN, yy, { align: 'right' });
  const rule = () => { doc.setDrawColor(220, 223, 228); doc.line(MARGIN, y, W - MARGIN, y); };
  /** A label on the left with an amount on the right */
  const row = (label: string, amount: string, size = 11, bold = false) => {
    ensure(7);
    font(size, bold);
    doc.text(label, MARGIN, y);
    right(amount, y);
    y += size >= 14 ? 8 : 6;
  };

  font(18, true);
  doc.text(t(side === 'client' ? 'pdf.title' : 'pdf.workerTitle'), MARGIN, y); y += 10;
  font(11);
  doc.text(`${t('pdf.client')}: ${project.clientName}`, MARGIN, y); y += 6;
  if (project.phone) { doc.text(`${t('pdf.phone')}: ${project.phone}`, MARGIN, y); y += 6; }
  if (project.address) { doc.text(`${t('pdf.address')}: ${project.address}`, MARGIN, y); y += 6; }
  doc.text(`${t('pdf.date')}: ${new Date().toLocaleDateString('ru')}`, MARGIN, y); y += 6;
  rule(); y += 8;

  est.rooms.forEach((r, i) => {
    const groups = sectionedItems(r.items, side);
    if (side === 'worker' && groups.length === 0) return;
    ensure(20);
    font(12, true);
    doc.text(`${i + 1}. ${r.room.name}`, MARGIN, y);
    right(fmtRub(side === 'client' ? r.client : r.worker), y);
    y += 5;
    font(9, false, GREY);
    doc.text(`${t('pdf.area')}: ${r.room.areaSqm.toFixed(2)} м²   ${t('pdf.perimeter')}: ${r.room.perimeterM.toFixed(2)} ${t('unit.m')}   ${t('pdf.corners')}: ${roomCorners(r.room)}`, MARGIN, y);
    y += 6;
    for (const g of groups) for (const item of g.items) {
      ensure(10);
      font(10.5);
      const title = doc.splitTextToSize(itemTitle(item, t), 120) as string[];
      doc.text(title, MARGIN + 4, y);
      right(fmtRub(lineTotal(item, side)), y);
      y += 4.6 * title.length;
      font(9, false, GREY);
      doc.text(lineCalc(item, side, t), MARGIN + 4, y);
      y += 6;
    }
    y += 2;
  });

  // own lines: works without a room, a block of their own after the rooms
  const lines = side === 'client' ? est.pricing.clientLines : est.pricing.workerLines;
  const linesSum = lines.reduce((sum, l) => sum + l.amount, 0);
  const amount = (v: number) => (v < 0 ? `${MINUS}${fmtRub(-v)}` : fmtRub(v));
  if (lines.length > 0) {
    ensure(14);
    font(12, true);
    doc.text(t('sum.extra'), MARGIN, y);
    right(amount(linesSum), y);
    y += 7;
    for (const l of lines) {
      ensure(7);
      font(10.5);
      const title = doc.splitTextToSize(l.title, 120) as string[];
      doc.text(title, MARGIN + 4, y);
      right(amount(l.amount), y);
      y += 4.6 * title.length + 2;
    }
    y += 2;
  }

  rule(); y += 7;
  if (side === 'client') {
    const p = est.pricing;
    if (est.discount > 0 || lines.length > 0) {
      row(t('sum.rooms'), fmtRub(est.clientSubtotal));
      if (est.discount > 0) row(t('sum.discountRooms', { pct: p.discountPct }), `${MINUS}${fmtRub(est.discount)}`);
      if (lines.length > 0) row(t('sum.extra'), signed(linesSum));
      y += 2;
    }
    const adv = advanceOf(project);
    if (adv) {
      row(t(est.discount > 0 || lines.length > 0 ? 'sum.total' : 'adv.cost'), fmtRub(est.clientTotal));
      row(t('adv.pdfRow', { date: fmtAdvanceDate(adv.date, true) }), `${MINUS}${fmtRub(adv.amount)}`);
      y += 2;
      row(t('adv.left'), fmtRub(remainingAfter(est.clientTotal, adv)), 15, true);
    } else {
      row(t('sum.totalLabel'), fmtRub(est.clientTotal), 15, true);
    }
    font(10, false, GREY);
    const sqm = est.rooms.reduce((s, r) => s + r.room.areaSqm, 0);
    doc.text(`(${sqm.toFixed(2)} м² ${t('pdf.totalArea')})`, MARGIN, y);
  } else {
    if (lines.length > 0) {
      row(t('sum.rooms'), fmtRub(est.workerSubtotal));
      row(t('sum.extra'), signed(linesSum));
      y += 2;
    }
    row(t('pdf.workerPay'), fmtRub(est.workerTotal), 15, true);
  }
  return doc;
}
