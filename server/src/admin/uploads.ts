import fs from 'node:fs/promises';
import path from 'node:path';
import { isPostgresEnabled, savePostgresUpload } from '../storage/postgres.js';
import { UPLOAD_DIR } from '../storage/paths.js';

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

export async function saveUpload(file: File) {
  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    throw new Error('仅支持 png、jpg、webp、gif、svg 图片');
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    throw new Error('图片大小需大于 0 且不超过 4MB');
  }

  const basename = path
    .basename(file.name, path.extname(file.name))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const filename = `${Date.now()}-${basename || 'image'}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (isPostgresEnabled()) {
    await savePostgresUpload(filename, file.type, buffer);
    return `/uploads/${filename}`;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}
