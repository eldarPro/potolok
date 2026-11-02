import { useEffect, useMemo, useRef, useState } from 'react';
import { Room } from '../types';
import { Point, pxToMeters } from '../lib/geometry';
import { loadProfiles } from '../lib/storage';
import type { CeilingImage, WorldRect } from '../lib/ceilingRender';

/** Sharper than this many times the whole-room picture — a close-up of the visible part is rendered */
const DETAIL_GAIN = 1.3;

/**
 * The «Визуал» pictures of a room's ceiling: one of the whole room, made when
 * the view opens or the room changes, and a sharper one of the visible part
 * once the drawing is zoomed in past what the first one holds. Both are laid
 * on the drawing in its own coordinates, so panning and zooming just move them.
 */
export function useCeilingVisual(
  room: Room, points: Point[], on: boolean,
  /** screen px per drawing px (the viewport's scale) and the drawing's visible part */
  scale: number, visible: WorldRect | null,
): { base: CeilingImage | null; detail: CeilingImage | null; failed: boolean } {
  const [base, setBase] = useState<CeilingImage | null>(null);
  const [detail, setDetail] = useState<CeilingImage | null>(null);
  const [failed, setFailed] = useState(false);
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
  const needPxPerM = scale / pxToMeters(1) * dpr;
  const scaleRef = useRef(needPxPerM);
  scaleRef.current = needPxPerM;

  // the price list's default profile stands in on walls with none chosen
  const defaultProfile = useMemo(() => on ? loadProfiles().find(p => p.isDefault) ?? null : null, [on]);
  const shown: Room = useMemo(() => ({ ...room, points }), [room, points]);
  // what the picture depends on — not the lights (drawn over it), prices or anything else
  const key = useMemo(() => on ? JSON.stringify([
    points, room.fabric?.color, room.fabric?.title, room.fabric?.finish,
    (room.profileSegments ?? []).map(s => [s.edgeIndex, s.profile.color, s.profile.title, s.profile.profileKind]),
    room.selectedNiches, defaultProfile && [defaultProfile.color, defaultProfile.title, defaultProfile.profileKind],
  ]) : '', [on, points, room, defaultProfile]);

  // the renderer's code, fetched ahead so the first tap doesn't wait for it
  useEffect(() => { void import('../lib/ceilingRender').catch(() => {}); }, []);

  // the whole room — the last picture is kept while the view is off, so
  // turning it back on shows it at once; only a changed room is made anew
  const madeFor = useRef('');
  useEffect(() => {
    setDetail(null);
    if (!on) return;
    if (key === madeFor.current) return;
    let cancelled = false;
    // the first picture at once; after an edit, wait for the edits to settle
    const timer = setTimeout(async () => {
      try {
        const { renderCeiling } = await import('../lib/ceilingRender');
        if (cancelled) return;
        const img = renderCeiling(shown, { pxPerM: scaleRef.current, defaultProfile });
        if (!cancelled) { madeFor.current = key; setBase(img); setFailed(false); }
      } catch (e) {
        console.error('ceiling render failed', e);
        if (!cancelled) setFailed(true);
      }
    }, madeFor.current ? 120 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // a close-up once zoomed in
  const zoomedIn = !!base && needPxPerM > base.pxPerM * DETAIL_GAIN;
  const visKey = visible && zoomedIn ? `${Math.round(visible.x)},${Math.round(visible.y)},${Math.round(visible.width)},${Math.round(needPxPerM)}` : '';
  useEffect(() => {
    if (!on || !base || !visible || !zoomedIn) { setDetail(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { renderCeiling } = await import('../lib/ceilingRender');
        if (cancelled) return;
        // a margin around the screen, so a small pan stays sharp
        const m = 0.15;
        const region = { x: visible.x - visible.width * m, y: visible.y - visible.height * m, width: visible.width * (1 + 2 * m), height: visible.height * (1 + 2 * m) };
        const img = renderCeiling(shown, { pxPerM: needPxPerM, region, defaultProfile });
        if (!cancelled) setDetail(img);
      } catch (e) {
        console.error('ceiling close-up failed', e);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visKey, base]);

  return { base: on ? base : null, detail: on && zoomedIn ? detail : null, failed: on && failed };
}
