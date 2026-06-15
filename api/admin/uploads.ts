import { readMultipartFile, requireAdmin, saveUpload, sendJson } from '../_vercel-store.js';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    const file = await readMultipartFile(req);
    if (!file) {
      sendJson(res, 400, { error: '请上传图片文件' });
      return;
    }
    const url = await saveUpload(file);
    sendJson(res, 201, { url });
  } catch (error: any) {
    sendJson(res, 400, { error: error?.message ?? '图片上传失败' });
  }
}
