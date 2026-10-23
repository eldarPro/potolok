// Cloudflare Worker proxy for AI image editing.
//
// Three backends, picked by the PROVIDER var (see wrangler.toml):
//   - "workers-ai" (default): FLUX.2 [klein] 4B via the Workers AI binding —
//     no external API or keys, covered by the daily free Neurons allowance.
//   - "dashscope": Qwen-Image via DashScope, described below.
//   - "bfl": FLUX 3 Image / Image Klein via api.bfl.ai (BFL_MODEL var). Takes
//     the sketch's fixture layout as bounding boxes.
//   - "proxyapi": proxyapi.ru, a Russian OpenAI-compatible aggregator payable with
//     Russian cards (PROXYAPI_MODEL var, e.g. "black-forest-labs/flux-3-image-klein").
//     FLUX 3 models there get the same bounding boxes.
//
// DashScope's REST API has no CORS support, so the browser app can't call it
// directly — every call fails at the preflight check regardless of
// credentials. This Worker calls DashScope server-to-server (no CORS
// concern there) and holds the credentials as Worker secrets, so they never
// have to live on-device either.
//
// Deploy: wrangler deploy
//         (for DashScope also: wrangler secret put DASHSCOPE_API_KEY /
//          DASHSCOPE_WORKSPACE_ID)

// No @cloudflare/workers-types in this project; just the slice of the AI binding we use.
interface AiBinding {
  run(model: string, inputs: unknown): Promise<unknown>;
}

export interface Env {
  AI: AiBinding;
  /** Overrides WORKERS_AI_MODEL, e.g. "@cf/black-forest-labs/flux-2-klein-9b" */
  WORKERS_AI_MODEL?: string;
  PROVIDER?: 'workers-ai' | 'dashscope' | 'bfl' | 'proxyapi';
  PROXYAPI_KEY?: string;
  /** vendor/name as in proxyapi.ru's catalog */
  PROXYAPI_MODEL?: string;
  BFL_API_KEY?: string;
  /** "flux-3-image-klein" (default) or "flux-3-image" */
  BFL_MODEL?: string;
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_WORKSPACE_ID?: string;
  ALLOWED_ORIGIN?: string;
}

const MODEL = 'qwen-image-3.0';
const WORKERS_AI_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
// FLUX follows non-English instructions poorly (adds fixtures it was told not
// to, ignores constraints), so prompts are translated to English first.
const TRANSLATE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
// Output is billed per 512x512 tile, so cap the long side at ~1 MP.
const WORKERS_AI_MAX_DIM = 1024;

/** Variants the client may ask for in one request (it lets the user pick the best). */
const MAX_VARIANTS = 4;

/** Fixture box in the input image: [top, left, bottom, right] on a 0–1000 grid (see the app's roomScene). */
interface LayoutBox {
  id: string;
  bbox: [number, number, number, number];
  desc: string;
}

/** Result of a backend call: data URLs, or an error response to send as-is. */
type EditResult = { images: string[] } | { error: Response };

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(env), 'Content-Type': 'application/json' },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405, env);
    }

    let body: { image?: string; prompt?: string; n?: number; layout?: LayoutBox[] };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON body' }, 400, env);
    }
    const { image, prompt } = body;
    if (!image || !prompt) return jsonResponse({ error: 'missing image or prompt' }, 400, env);
    const n = Math.min(MAX_VARIANTS, Math.max(1, Math.floor(Number(body.n) || 1)));

    const result = env.PROVIDER === 'dashscope' ? await editWithDashScope(image, prompt, n, env)
      : env.PROVIDER === 'bfl' ? await editWithBfl(image, prompt, n, validLayout(body.layout), env)
      : env.PROVIDER === 'proxyapi' ? await editWithProxyApi(image, prompt, n, validLayout(body.layout), env)
      : await editWithWorkersAi(image, prompt, n, env);
    if ('error' in result) return result.error;
    // `image` (the first variant) keeps older clients working
    return jsonResponse({ image: result.images[0], images: result.images }, 200, env);
  },
};

async function editWithDashScope(image: string, prompt: string, n: number, env: Env): Promise<EditResult> {
  const endpoint = `https://${env.DASHSCOPE_WORKSPACE_ID}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`;

  let dsRes: Response;
  try {
    dsRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DASHSCOPE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        input: {
          messages: [{
            role: 'user',
            content: [{ image }, { text: prompt }],
          }],
        },
        parameters: { n, negative_prompt: ' ', prompt_extend: true, watermark: false },
      }),
    });
  } catch {
    return { error: jsonResponse({ error: 'network error calling DashScope' }, 502, env) };
  }

  if (!dsRes.ok) {
    let detail = '';
    try {
      const errJson = await dsRes.json() as { message?: string; code?: string };
      detail = errJson?.message ?? errJson?.code ?? '';
    } catch { /* body wasn't JSON */ }
    return { error: jsonResponse({ error: 'dashscope_error', detail: detail || `HTTP ${dsRes.status}` }, 502, env) };
  }

  const data = await dsRes.json() as {
    output?: { choices?: [{ finish_reason?: string; message?: { content?: { image?: string }[] } }] };
  };
  const choice = data.output?.choices?.[0];
  if (choice?.finish_reason === 'content_filter') {
    return { error: jsonResponse({ error: 'blocked' }, 422, env) };
  }

  const imageUrls = (choice?.message?.content ?? []).map(c => c.image).filter((u): u is string => !!u);
  if (!imageUrls.length) return { error: jsonResponse({ error: 'no_image_in_response' }, 502, env) };

  // Fetch the temporary OSS result URLs (expire in 24h) server-side and
  // inline them, so the client always gets stable, storable image bytes.
  const downloads = await Promise.all(imageUrls.map(async url => {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) return null;
      const mimeType = imgRes.headers.get('content-type') || 'image/png';
      return `data:${mimeType};base64,${arrayBufferToBase64(await imgRes.arrayBuffer())}`;
    } catch {
      return null;
    }
  }));
  const images = downloads.filter((d): d is string => !!d);
  if (!images.length) return { error: jsonResponse({ error: 'failed to download generated image' }, 502, env) };
  return { images };
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

/** Reads width/height from a JPEG's SOF marker (the client always sends JPEG). */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0..SOF15, excluding DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

/** Keeps the input's aspect ratio, long side capped, both sides multiples of 16. */
function outputSize(size: { width: number; height: number } | null): { width: number; height: number } {
  if (!size) return { width: WORKERS_AI_MAX_DIM, height: 768 };
  const scale = Math.min(1, WORKERS_AI_MAX_DIM / Math.max(size.width, size.height));
  const snap = (v: number) => Math.min(1920, Math.max(256, Math.round((v * scale) / 16) * 16));
  return { width: snap(size.width), height: snap(size.height) };
}

/** Best effort: on any failure the original prompt is used as-is. */
async function translateToEnglish(prompt: string, env: Env): Promise<string> {
  if (/^[\x00-\x7F]*$/.test(prompt)) return prompt;
  try {
    const res = await env.AI.run(TRANSLATE_MODEL, {
      messages: [
        {
          role: 'system',
          content: 'You translate instructions for an image editing model into English. ' +
            'Translate the user message faithfully, keeping every detail, number and constraint. ' +
            'Keep tags in angle brackets such as <spot_1> exactly as they are. ' +
            'Output only the translation — no quotes, notes or explanations.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 1024,
    }) as { response?: string };
    const text = res?.response?.trim();
    return text || prompt;
  } catch {
    return prompt;
  }
}

async function editWithWorkersAi(image: string, prompt: string, n: number, env: Env): Promise<EditResult> {
  prompt = await translateToEnglish(prompt, env);
  const blob = dataUrlToBlob(image);
  if (!blob) return { error: jsonResponse({ error: 'image must be a base64 data URL' }, 400, env) };
  const size = outputSize(jpegSize(new Uint8Array(await blob.arrayBuffer())));

  // One model call per variant, in parallel; a different seed each so they actually differ
  const results = await Promise.all(Array.from({ length: n }, () =>
    runFlux(blob, prompt, size, Math.floor(Math.random() * 2 ** 31), env)));
  const images = results.filter((r): r is { image: string } => 'image' in r).map(r => r.image);
  if (images.length) return { images };
  return results[0] as { error: Response };
}

async function runFlux(
  blob: Blob, prompt: string, { width, height }: { width: number; height: number }, seed: number, env: Env,
): Promise<{ image: string } | { error: Response }> {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('input_image_0', blob);
  form.append('width', String(width));
  form.append('height', String(height));
  form.append('seed', String(seed));
  // The binding wants a raw multipart stream; serialising through a Request is
  // the documented way to get one (and its boundary-carrying content type).
  const formRequest = new Request('http://dummy', { method: 'POST', body: form });

  let res: { image?: string };
  try {
    res = await env.AI.run(env.WORKERS_AI_MODEL || WORKERS_AI_MODEL, {
      multipart: {
        body: formRequest.body,
        contentType: formRequest.headers.get('content-type') || 'multipart/form-data',
      },
    }) as { image?: string };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    if (/nsfw|safety|flagged/i.test(detail)) return { error: jsonResponse({ error: 'blocked' }, 422, env) };
    return { error: jsonResponse({ error: 'workers_ai_error', detail }, 502, env) };
  }

  if (!res?.image) return { error: jsonResponse({ error: 'no_image_in_response' }, 502, env) };
  // Base64 without a header; FLUX returns JPEG.
  return { image: res.image.startsWith('data:') ? res.image : `data:image/jpeg;base64,${res.image}` };
}

function validLayout(layout: unknown): LayoutBox[] {
  if (!Array.isArray(layout)) return [];
  return layout.filter((b): b is LayoutBox =>
    !!b && typeof b.id === 'string' && /^[a-z_]+_\d+$/.test(b.id) && typeof b.desc === 'string' &&
    Array.isArray(b.bbox) && b.bbox.length === 4 && b.bbox.every((v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000),
  ).slice(0, 60);
}

/**
 * FLUX 3 takes boxes inside the prompt: the instruction names each element as
 * <id>, followed by a JSON array of rows (docs.bfl.ml "Bounding boxes").
 * `from: null` rows generate the element at `tgt_bbox`, so every fixture is
 * re-drawn photorealistically exactly where the sketch has it.
 */
function bflPrompt(instruction: string, layout: LayoutBox[]): string {
  if (!layout.length) return instruction;
  const tags = layout.map(b => `<${b.id}>`).join(', ');
  const rows = layout.map(b => ({ id: b.id, from: null, src_bbox: null, tgt_bbox: b.bbox, desc: b.desc }));
  return `In <ref_image_0>: ${instruction} The ceiling light fixtures are exactly ${tags} — ` +
    `one fixture per box, and no other light fixtures anywhere on the ceiling. ${JSON.stringify(rows)}`;
}

const BFL_POLL_MS = 1000;
const BFL_TIMEOUT_MS = 120_000;

async function editWithBfl(image: string, prompt: string, n: number, layout: LayoutBox[], env: Env): Promise<EditResult> {
  if (!env.BFL_API_KEY) return { error: jsonResponse({ error: 'BFL_API_KEY not set' }, 500, env) };
  const model = env.BFL_MODEL || 'flux-3-image-klein';
  const base64 = image.replace(/^data:[^;,]+;base64,/, '');
  const fullPrompt = bflPrompt(await translateToEnglish(prompt, env), layout);

  const results = await Promise.all(Array.from({ length: n }, () =>
    runBfl(model, fullPrompt, base64, Math.floor(Math.random() * 2 ** 32), env)));
  const images = results.filter((r): r is { image: string } => 'image' in r).map(r => r.image);
  if (images.length) return { images };
  return results[0] as { error: Response };
}

async function runBfl(
  model: string, prompt: string, base64: string, seed: number, env: Env,
): Promise<{ image: string } | { error: Response }> {
  const headers = { 'Content-Type': 'application/json', 'x-key': env.BFL_API_KEY! };
  let submit: { polling_url?: string; detail?: unknown };
  try {
    const res = await fetch(`https://api.bfl.ai/v1/${model}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, images: [base64], seed, resolution: '1k', output_format: 'jpeg' }),
    });
    submit = await res.json();
    if (!res.ok || !submit.polling_url) {
      return { error: jsonResponse({ error: 'bfl_error', detail: JSON.stringify(submit.detail ?? submit).slice(0, 500) }, 502, env) };
    }
  } catch {
    return { error: jsonResponse({ error: 'network error calling BFL' }, 502, env) };
  }

  const deadline = Date.now() + BFL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, BFL_POLL_MS));
    let poll: { status?: string; result?: { sample?: string } };
    try {
      poll = await (await fetch(submit.polling_url, { headers })).json();
    } catch {
      continue; // transient — keep polling until the deadline
    }
    if (poll.status === 'Pending' || poll.status === 'Reasoning' || poll.status === 'Generating') continue;
    if (poll.status === 'Ready' && poll.result?.sample) {
      const img = await fetch(poll.result.sample);
      if (!img.ok) return { error: jsonResponse({ error: 'failed to download generated image' }, 502, env) };
      const mime = img.headers.get('content-type') || 'image/jpeg';
      return { image: `data:${mime};base64,${arrayBufferToBase64(await img.arrayBuffer())}` };
    }
    if (/moderat/i.test(poll.status ?? '')) return { error: jsonResponse({ error: 'blocked' }, 422, env) };
    return { error: jsonResponse({ error: 'bfl_error', detail: poll.status ?? 'unknown status' }, 502, env) };
  }
  return { error: jsonResponse({ error: 'bfl_error', detail: 'timed out waiting for BFL' }, 504, env) };
}

/** OpenAI-style `/v1/images/edits` (multipart) on proxyapi.ru; the image comes back as `data[].b64_json`. */
async function editWithProxyApi(image: string, prompt: string, n: number, layout: LayoutBox[], env: Env): Promise<EditResult> {
  if (!env.PROXYAPI_KEY) return { error: jsonResponse({ error: 'PROXYAPI_KEY not set' }, 500, env) };
  const model = env.PROXYAPI_MODEL || 'black-forest-labs/flux-3-image-klein';
  const blob = dataUrlToBlob(image);
  if (!blob) return { error: jsonResponse({ error: 'image must be a base64 data URL' }, 400, env) };
  let text = await translateToEnglish(prompt, env);
  // only FLUX 3 understands the box rows; other models would take the JSON as literal text
  if (/flux-3/.test(model)) text = bflPrompt(text, layout);

  // one request per variant: not every model behind the aggregator honours `n`
  const results = await Promise.all(Array.from({ length: n }, async (): Promise<{ image: string } | { error: Response }> => {
    if (model.startsWith('google/')) return runProxyGemini(model.slice('google/'.length), text, image, env);
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', text);
    form.append('image', blob, 'image.jpg');
    let res: Response;
    try {
      res = await fetch('https://api.proxyapi.ru/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.PROXYAPI_KEY}` },
        body: form,
      });
    } catch {
      return { error: jsonResponse({ error: 'network error calling ProxyAPI' }, 502, env) };
    }
    const json = await res.json().catch(() => null) as
      { data?: { b64_json?: string; url?: string }[]; detail?: unknown; error?: unknown } | null;
    if (!res.ok) {
      const detail = JSON.stringify(json?.detail ?? json?.error ?? `HTTP ${res.status}`).slice(0, 500);
      if (/moderat|safety|policy/i.test(detail)) return { error: jsonResponse({ error: 'blocked' }, 422, env) };
      return { error: jsonResponse({ error: 'proxyapi_error', detail }, 502, env) };
    }
    const item = json?.data?.[0];
    if (item?.b64_json) {
      const mime = item.b64_json.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
      return { image: `data:${mime};base64,${item.b64_json}` };
    }
    if (item?.url) {
      const img = await fetch(item.url);
      if (img.ok) {
        const mime = img.headers.get('content-type') || 'image/png';
        return { image: `data:${mime};base64,${arrayBufferToBase64(await img.arrayBuffer())}` };
      }
    }
    return { error: jsonResponse({ error: 'no_image_in_response' }, 502, env) };
  }));
  const images = results.filter((r): r is { image: string } => 'image' in r).map(r => r.image);
  if (images.length) return { images };
  return results[0] as { error: Response };
}

/** Gemini image models aren't on ProxyAPI's /images/edits — they take Google's native generateContent. */
async function runProxyGemini(model: string, prompt: string, image: string, env: Env): Promise<{ image: string } | { error: Response }> {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(image);
  if (!match) return { error: jsonResponse({ error: 'image must be a base64 data URL' }, 400, env) };
  let res: Response;
  try {
    res = await fetch(`https://api.proxyapi.ru/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': env.PROXYAPI_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: match[1], data: match[2] } }, { text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });
  } catch {
    return { error: jsonResponse({ error: 'network error calling ProxyAPI' }, 502, env) };
  }
  type Part = { inlineData?: { mimeType?: string; data?: string } };
  const json = await res.json().catch(() => null) as
    { candidates?: { finishReason?: string; content?: { parts?: Part[] } }[]; detail?: unknown; error?: unknown } | null;
  if (!res.ok) {
    return { error: jsonResponse({ error: 'proxyapi_error', detail: JSON.stringify(json?.detail ?? json?.error ?? `HTTP ${res.status}`).slice(0, 500) }, 502, env) };
  }
  const candidate = json?.candidates?.[0];
  const data = candidate?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
  if (data?.data) return { image: `data:${data.mimeType || 'image/png'};base64,${data.data}` };
  if (/SAFETY|PROHIBITED|BLOCK/i.test(candidate?.finishReason ?? '')) return { error: jsonResponse({ error: 'blocked' }, 422, env) };
  return { error: jsonResponse({ error: 'no_image_in_response' }, 502, env) };
}
