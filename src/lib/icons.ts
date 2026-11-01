// Icons ionicons doesn't have, in its format (data-URI SVG for <IonIcon icon>).
const svg = (body: string) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>${body}</svg>`;
const stroke = "fill='none' stroke='currentColor' stroke-linecap='round' stroke-width='36'";

/** Bend one wall into an arc: two corners and the curve between them */
export const wallArcIcon = svg(
  `<path d='M80 384 Q256 64 432 384' ${stroke}/>` +
  `<circle cx='80' cy='384' r='36' fill='currentColor'/><circle cx='432' cy='384' r='36' fill='currentColor'/>`,
);

/** Straighten a curved wall back: the same two corners, a straight line */
export const wallLineIcon = svg(
  `<path d='M80 256 H432' ${stroke}/>` +
  `<circle cx='80' cy='256' r='36' fill='currentColor'/><circle cx='432' cy='256' r='36' fill='currentColor'/>`,
);
