import { handle } from '@hono/node-server/vercel';
import { createApp } from '../server/src/app';

export const config = {
  api: {
    bodyParser: false
  }
};

const app = createApp({
  serveStaticAssets: false,
  mountApiUploads: true
});

export default handle(app);
