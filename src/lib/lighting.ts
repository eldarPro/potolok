import { LightingType, LightingPlacement, LightingUnit } from '../types';

export interface LightingMeta {
  label: string;
  placement: LightingPlacement;
  unit: LightingUnit;
}

export const LIGHTING_META: Record<LightingType, LightingMeta> = {
  spot:       { label: 'Спот',            placement: 'point', unit: 'pcs'   },
  chandelier: { label: 'Люстра',          placement: 'point', unit: 'pcs'   },
  track_spot: { label: 'Трек-спот',       placement: 'point', unit: 'pcs'   },
  strip:      { label: 'LED-лента',       placement: 'path',  unit: 'meter' },
  line:       { label: 'Световая линия',  placement: 'path',  unit: 'meter' },
  track:      { label: 'Трек',            placement: 'path',  unit: 'meter' },
};

export const LIGHTING_TYPES = Object.entries(LIGHTING_META) as [LightingType, LightingMeta][];

export const POINT_SYMBOLS = ['⊙', '◎', '●', '◉', '✦', '★', '✶', '❋', '⬤', '✤', '✺', '✻', '⊕', '○', '✷', '❂'];

export const UNIT_LABEL: Record<LightingUnit, string> = {
  pcs: 'шт',
  meter: 'м',
};
