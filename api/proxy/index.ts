import {
  callUpstream,
  classifyStatus,
  pipeWebStream,
  proxyCatchMessage,
  proxyCatchStatus,
  readJson,
  sendJson,
  sendSseText,
  validatePayload
} from '../_vercel-proxy.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    sendJson(res, 400, { error: '请求体必须是 JSON。' });
    return;
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  try {
    const upstream = await callUpstream(payload, true);
    if (!upstream.ok) {
      sendJson(res, upstream.status, { error: classifyStatus(upstream.status), status: upstream.status });
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream') && upstream.body) {
      await pipeWebStream(res, upstream.body);
      return;
    }

    const json = await upstream.json().catch(() => null);
    const content =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.delta?.content ??
      (typeof json === 'string' ? json : JSON.stringify(json ?? {}));
    sendSseText(res, String(content));
  } catch (error: any) {
    sendJson(res, proxyCatchStatus(error), { error: proxyCatchMessage(error) });
  }
}
