import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.SOOTHSAY_DATA_DIR ?? 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const ROLE_FILE = path.join(DATA_DIR, 'roles.json');
