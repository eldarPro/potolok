import { LightingType, LightingPlacement, LightingUnit } from '../types';

export interface LightingMeta {
  label: string;
  placement: LightingPlacement;
  unit: LightingUnit;
}

export const LIGHTING_META: Record<LightingType, LightingMeta> = {
  spot:       { label: 'lt.spot',       placement: 'point', unit: 'pcs'   },
  chandelier: { label: 'lt.chandelier', placement: 'point', unit: 'pcs'   },
  track_spot: { label: 'lt.trackSpot',  placement: 'point', unit: 'pcs'   },
  strip:      { label: 'lt.strip',      placement: 'path',  unit: 'meter' },
  line:       { label: 'lt.line',       placement: 'path',  unit: 'meter' },
  track:      { label: 'lt.track',      placement: 'path',  unit: 'meter' },
};

export const LIGHTING_TYPES = Object.entries(LIGHTING_META) as [LightingType, LightingMeta][];

export const POINT_SYMBOLS = ['⊙', '◎', '●', '◉', '✦', '★', '✶', '❋', '⬤', '✤', '✺', '✻', '⊕', '○', '✷', '❂'];

export const UNIT_LABEL: Record<LightingUnit, string> = {
  pcs: 'unit.pcs',
  meter: 'unit.m',
};
