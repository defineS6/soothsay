import { readJson, readQueryString, sendJson } from '../_vercel-store.js';
import {
  readWebdavFile,
  testWebdavConnection,
  validateWebdavPayload,
  writeWebdavFile,
  type WebdavPayload,
  type WebdavResult
} from '../../server/src/shared/webdav.js';

/**
 * Vercel 部署下的 WebDAV 代理入口。
 * 三个动作合并到同一个动态路由，避免占用 Hobby 套餐有限的 Serverless 函数额度。
 */
const ACTIONS: Record<string, { requireContent: boolean; run: (payload: WebdavPayload) => Promise<WebdavResult> }> = {
  test: { requireContent: false, run: testWebdavConnection },
  download: { requireContent: false, run: readWebdavFile },
  upload: { requireContent: true, run: writeWebdavFile }
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const action = ACTIONS[readQueryString(req, 'action')];
  if (!action) {
    sendJson(res, 404, { error: '未知的 WebDAV 操作。' });
    return;
  }

  let payload: WebdavPayload;
  try {
    payload = (await readJson(req)) as WebdavPayload;
  } catch {
    sendJson(res, 400, { error: '请求体必须是 JSON。' });
    return;
  }

  const validationError = validateWebdavPayload(payload, action.requireContent);
  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  const result = await action.run(payload);
  sendJson(res, result.status, result.body);
}
