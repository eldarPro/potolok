// Calls our own Cloudflare Worker proxy (see /worker), which holds the
// DashScope credentials server-side and does the actual generation call.
// A direct client → DashScope call isn't possible at all: DashScope's REST
// API has no CORS support, so the browser blocks it at the preflight check
// regardless of credentials. Routing through a server we control sidesteps
// that (server-to-server calls aren't subject to CORS) and, as a bonus,
// keeps credentials off the device entirely.
//
// Set VITE_IMAGE_EDIT_PROXY_URL (in .env.local) to the deployed Worker URL.

import type { LayoutBox } from './roomScene';

const PROXY_URL = import.meta.env.VITE_IMAGE_EDIT_PROXY_URL;

export type ImageEditErrorCode = 'no-proxy' | 'blocked' | 'http' | 'no-image' | 'network';

export class ImageEditError extends Error {
  code: ImageEditErrorCode;
  constructor(message: string, code: ImageEditErrorCode) {
    super(message);
    this.code = code;
  }
}

/** Asks for `n` variants of the same edit (the Worker runs them in parallel); resolves to 1..n images. */
/**
 * `layout` — fixture boxes in `baseImage` (from the 3D sketch); only providers that
 * understand boxes use it, the rest ignore it.
 */
export async function generateCeilingImages(
  baseImage: string, prompt: string, n = 1, layout?: LayoutBox[],
): Promise<string[]> {
  if (!PROXY_URL) throw new ImageEditError('proxy URL not configured', 'no-proxy');

  let res: Response;
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: baseImage, prompt, n, layout }),
    });
  } catch {
    throw new ImageEditError('network error', 'network');
  }

  const json = await res.json().catch(() => null) as { image?: string; images?: string[]; error?: string; detail?: string } | null;

  if (!res.ok) {
    if (res.status === 422 || json?.error === 'blocked') throw new ImageEditError('blocked', 'blocked');
    throw new ImageEditError(json?.detail || json?.error || `HTTP ${res.status}`, 'http');
  }
  // `images` from the variants-aware Worker; a single `image` from older deployments
  const images = json?.images?.length ? json.images : json?.image ? [json.image] : [];
  if (!images.length) throw new ImageEditError('no image in response', 'no-image');
  return images;
}
