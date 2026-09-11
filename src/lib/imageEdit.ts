// Calls our own Cloudflare Worker proxy (see /worker), which holds the
// DashScope credentials server-side and does the actual generation call.
// A direct client → DashScope call isn't possible at all: DashScope's REST
// API has no CORS support, so the browser blocks it at the preflight check
// regardless of credentials. Routing through a server we control sidesteps
// that (server-to-server calls aren't subject to CORS) and, as a bonus,
// keeps credentials off the device entirely.
//
// Set VITE_IMAGE_EDIT_PROXY_URL (in .env.local) to the deployed Worker URL.

const PROXY_URL = import.meta.env.VITE_IMAGE_EDIT_PROXY_URL;

export type ImageEditErrorCode = 'no-proxy' | 'blocked' | 'http' | 'no-image' | 'network';

export class ImageEditError extends Error {
  code: ImageEditErrorCode;
  constructor(message: string, code: ImageEditErrorCode) {
    super(message);
    this.code = code;
  }
}

export async function generateCeilingImage(baseImage: string, prompt: string): Promise<string> {
  if (!PROXY_URL) throw new ImageEditError('proxy URL not configured', 'no-proxy');

  let res: Response;
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: baseImage, prompt }),
    });
  } catch {
    throw new ImageEditError('network error', 'network');
  }

  const json = await res.json().catch(() => null) as { image?: string; error?: string; detail?: string } | null;

  if (!res.ok) {
    if (res.status === 422 || json?.error === 'blocked') throw new ImageEditError('blocked', 'blocked');
    throw new ImageEditError(json?.detail || json?.error || `HTTP ${res.status}`, 'http');
  }
  if (!json?.image) throw new ImageEditError('no image in response', 'no-image');
  return json.image;
}
