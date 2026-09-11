// Cloudflare Worker proxy for DashScope's Qwen-Image-Edit API.
//
// DashScope's REST API has no CORS support, so the browser app can't call it
// directly — every call fails at the preflight check regardless of
// credentials. This Worker calls DashScope server-to-server (no CORS
// concern there) and holds the credentials as Worker secrets, so they never
// have to live on-device either.
//
// Deploy: wrangler secret put DASHSCOPE_API_KEY
//         wrangler secret put DASHSCOPE_WORKSPACE_ID
//         wrangler deploy

export interface Env {
  DASHSCOPE_API_KEY: string;
  DASHSCOPE_WORKSPACE_ID: string;
  ALLOWED_ORIGIN?: string;
}

const MODEL = 'qwen-image-edit';

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

    let body: { image?: string; prompt?: string };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid JSON body' }, 400, env);
    }
    const { image, prompt } = body;
    if (!image || !prompt) return jsonResponse({ error: 'missing image or prompt' }, 400, env);

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
          parameters: { negative_prompt: ' ', prompt_extend: true, watermark: false },
        }),
      });
    } catch {
      return jsonResponse({ error: 'network error calling DashScope' }, 502, env);
    }

    if (!dsRes.ok) {
      let detail = '';
      try {
        const errJson = await dsRes.json() as { message?: string; code?: string };
        detail = errJson?.message ?? errJson?.code ?? '';
      } catch { /* body wasn't JSON */ }
      return jsonResponse({ error: 'dashscope_error', detail: detail || `HTTP ${dsRes.status}` }, 502, env);
    }

    const data = await dsRes.json() as {
      output?: { choices?: [{ finish_reason?: string; message?: { content?: { image?: string }[] } }] };
    };
    const choice = data.output?.choices?.[0];
    if (choice?.finish_reason === 'content_filter') {
      return jsonResponse({ error: 'blocked' }, 422, env);
    }

    const imageUrl = choice?.message?.content?.find(c => c.image)?.image;
    if (!imageUrl) return jsonResponse({ error: 'no_image_in_response' }, 502, env);

    // Fetch the temporary OSS result URL (expires in 24h) server-side and
    // inline it, so the client always gets stable, storable image bytes.
    let imgRes: Response;
    try {
      imgRes = await fetch(imageUrl);
    } catch {
      return jsonResponse({ error: 'failed to download generated image' }, 502, env);
    }
    if (!imgRes.ok) return jsonResponse({ error: 'failed to download generated image' }, 502, env);

    const buffer = await imgRes.arrayBuffer();
    const mimeType = imgRes.headers.get('content-type') || 'image/png';
    const base64 = arrayBufferToBase64(buffer);

    return jsonResponse({ image: `data:${mimeType};base64,${base64}` }, 200, env);
  },
};
