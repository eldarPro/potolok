import React from 'react';
import { Line } from 'react-konva';
import { hexRgb } from '../lib/fabric';

/*
 * The fabric in the glow view, drawn over the light (inside the room's clip):
 * everything under it is multiplied by its colour, so light on a white fabric
 * stays as it is, on a coloured one takes its colour, and a black fabric
 * swallows it. Only the colour: a matte, satin or gloss surface shows as
 * highlights that depend on where one looks from, and a plan has no such
 * point — drawn anyway they looked made up.
 */
export const FabricGlow: React.FC<{ outline: { x: number; y: number }[]; color: string }> = ({ outline, color }) => {
  const [r, g, b] = hexRgb(color);
  // white leaves the light as it is — and so does near-white, the tint price
  // lists give a white fabric to tell it apart in a list
  if (outline.length < 3 || Math.min(r, g, b) >= 215) return null;
  return (
    <Line
      points={outline.flatMap(p => [p.x, p.y])} closed listening={false}
      fill={`rgb(${r},${g},${b})`} globalCompositeOperation="multiply"
    />
  );
};
