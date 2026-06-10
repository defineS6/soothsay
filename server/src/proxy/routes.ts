import { Hono } from 'hono';

const PROXY_TIMEOUT_MS = 60_000;

interface ProxyPayload {
  base_url?: string;
  key?: string;
  model?: string;
  messages?: unknown[];
  temperature?: number;
}

export const proxyRoutes = new Hono();

function normalizeChatUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

function classifyStatus(status: number) {
  if (status === 401 || status === 403) return '鉴权失败，请检查 key 与 base_url';
  if (status === 408 || status === 504) return '上游请求超时';
  if (status === 429) return '上游限流，请稍后重试或检查套餐额度';
  if (status >= 500) return '上游服务暂时不可用';
  return '上游返回错误';
}

function validatePayload(payload: ProxyPayload) {
  if (!payload.base_url?.trim()) return '缺少 base_url，请先配置模型端点。';
  if (!payload.key?.trim()) return '缺少 key，请先配置模型凭据。';
  if (!payload.model?.trim()) return '缺少模型名称。';
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) return '缺少 messages。';
  return null;
}

function createSseFromText(content: string) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify({ content })}\n\n`));
      controller.enqueue(encoder.encode('event: done\ndata: [DONE]\n\n'));
      controller.close();
    }
  });
}

async function callUpstream(payload: ProxyPayload, stream: boolean) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    return await fetch(normalizeChatUrl(payload.base_url!), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${payload.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        temperature: Number.isFinite(payload.temperature) ? payload.temperature : 0.7,
        stream
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

proxyRoutes.post('/proxy', async (c) => {
  let payload: ProxyPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: '请求体必须是 JSON。' }, 400);
  }

  const validationError = validatePayload(payload);
  if (validationError) return c.json({ error: validationError }, 400);

  try {
    const upstream = await callUpstream(payload, true);
    if (!upstream.ok) {
      return c.json({ error: classifyStatus(upstream.status), status: upstream.status }, upstream.status as any);
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream') && upstream.body) {
      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        }
      });
    }

    const json = await upstream.json().catch(() => null);
    const content =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.delta?.content ??
      (typeof json === 'string' ? json : JSON.stringify(json ?? {}));
    return new Response(createSseFromText(String(content)), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform'
      }
    });
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? '上游请求超时' : '无法连接上游，请检查 base_url。';
    return c.json({ error: message }, error?.name === 'AbortError' ? 504 : 502);
  }
});

proxyRoutes.post('/proxy/test', async (c) => {
  let payload: ProxyPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: '请求体必须是 JSON。' }, 400);
  }
  const validationError = validatePayload({
    ...payload,
    messages: [{ role: 'user', content: '请只回复 ok' }]
  });
  if (validationError) return c.json({ error: validationError }, 400);

  try {
    const upstream = await callUpstream(
      {
        ...payload,
        messages: [{ role: 'user', content: '请只回复 ok' }],
        temperature: 0
      },
      false
    );
    if (!upstream.ok) {
      return c.json({ error: classifyStatus(upstream.status), status: upstream.status }, upstream.status as any);
    }
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.name === 'AbortError' ? '上游请求超时' : '无法连接上游，请检查 base_url。' }, 502);
  }
});
