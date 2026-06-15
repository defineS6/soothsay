import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBaziChart } from '@/bazi/engine';
import { buildFortuneMessages, createChartFactLayer } from '@/persona/prompt';
import type { PersonaEngine, PersonaSkin } from '@server-shared/persona';

interface TestAppContext {
  app: any;
  dataDir: string;
}

interface MockCall {
  authorization?: string;
  body: any;
}

const cleanup: Array<() => Promise<void>> = [];

function authHeader() {
  return `Basic ${Buffer.from('admin:admin123').toString('base64')}`;
}

async function createTestApp(): Promise<TestAppContext> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'soothsay-test-'));
  process.env.SOOTHSAY_DATA_DIR = dataDir;
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'admin123';
  delete process.env.SOOTHSAY_PG_DSN;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_DSN;
  vi.resetModules();
  const [{ createApp }, { ensureRoleStore }] = await Promise.all([
    import('../server/src/app'),
    import('../server/src/storage/role-store')
  ]);
  await ensureRoleStore();
  cleanup.push(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  return { app: createApp(), dataDir };
}

async function readTextFiles(dir: string): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const chunks: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      chunks.push(await readTextFiles(fullPath));
    } else {
      chunks.push(await fs.readFile(fullPath, 'utf8').catch(() => ''));
    }
  }
  return chunks.join('\n');
}

async function startMockOpenAi() {
  const calls: MockCall[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      calls.push({
        authorization: req.headers.authorization,
        body: JSON.parse(raw || '{}')
      });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.write('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"第二段"}}]}\n\n');
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
  );
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    calls,
    server: server as Server
  };
}

afterEach(async () => {
  while (cleanup.length) {
    await cleanup.pop()?.();
  }
  vi.restoreAllMocks();
});

describe('OpenSpec 端到端验收', () => {
  it('走通选大师、排盘、流式解读、追问与换位大师', async () => {
    const { app, dataDir } = await createTestApp();
    const mock = await startMockOpenAi();
    const logs: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((message) => logs.push(String(message)));

    const personaResponse = await app.request('/api/personas');
    const personaData = await personaResponse.json();
    const personas = personaData.personas as PersonaSkin[];
    expect(personas.length).toBeGreaterThanOrEqual(3);

    const chart = createBaziChart(
      {
        calendarType: 'solar',
        year: 1995,
        month: 12,
        day: 18,
        hour: 10,
        minute: 28,
        gender: 'female',
        location: { name: '成都', longitude: 104.0668 }
      },
      new Date(2026, 0, 1, 8, 0, 0)
    );
    expect(chart.pillars.year.ganZhi).toHaveLength(2);

    const firstPersona = personas[0];
    const secondPersona = personas[2];
    const firstMessages = buildFortuneMessages({
      persona: firstPersona,
      chart,
      task: 'bazi_full',
      roleHistory: [],
      sharedProfile: { id: 'default', chart, facts: ['用户正在考虑换城市发展'], updatedAt: new Date().toISOString() }
    });

    const streamResponse = await app.request('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_url: mock.baseUrl,
        key: 'secret-token',
        model: 'mock-model',
        messages: firstMessages
      })
    });
    expect(streamResponse.status).toBe(200);
    expect(await streamResponse.text()).toContain('第一段');

    const followMessages = buildFortuneMessages({
      persona: firstPersona,
      chart,
      task: 'follow_up',
      question: '我适合今年跳槽吗？',
      roleHistory: [
        { id: '1', role: 'assistant', content: '前一次结论：宜稳中求变。', createdAt: new Date().toISOString() }
      ]
    });
    const followResponse = await app.request('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_url: mock.baseUrl,
        key: 'secret-token',
        model: 'mock-model',
        messages: followMessages
      })
    });
    expect(followResponse.status).toBe(200);

    const switchedMessages = buildFortuneMessages({
      persona: secondPersona,
      chart,
      task: 'bazi_full',
      roleHistory: []
    });
    const factLayer = createChartFactLayer(chart);
    expect(firstMessages[0].content).toContain(factLayer);
    expect(switchedMessages[0].content).toContain(factLayer);
    expect(switchedMessages[0].content).not.toContain('前一次结论');
    expect(switchedMessages[0].content).not.toContain(firstPersona.name);

    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0].authorization).toBe('Bearer secret-token');
    expect(mock.calls[0].body.stream).toBe(true);

    const missingCredentials = await app.request('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: firstMessages })
    });
    expect(missingCredentials.status).toBe(400);
    expect(mock.calls).toHaveLength(2);

    const storedText = await readTextFiles(dataDir);
    expect(storedText).not.toContain('secret-token');
    expect(storedText).not.toContain('我适合今年跳槽吗');
    expect(logs.join('\n')).not.toContain('secret-token');
    expect(logs.join('\n')).not.toContain('我适合今年跳槽吗');
  });

  it('验收后台鉴权、图片上传、角色 CRUD 与持久化', async () => {
    const { app } = await createTestApp();

    const unauthorized = await app.request('/api/admin/personas');
    expect(unauthorized.status).toBe(401);

    const form = new FormData();
    form.append(
      'file',
      new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'], 'avatar.svg', {
        type: 'image/svg+xml'
      })
    );
    const upload = await app.request('/api/admin/uploads', {
      method: 'POST',
      headers: { Authorization: authHeader() },
      body: form
    });
    expect(upload.status).toBe(201);
    const uploadData = await upload.json();
    expect(uploadData.url).toMatch(/^\/uploads\//);

    const create = await app.request('/api/admin/personas', {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '验收大师',
        engineId: 'engine-acceptance',
        engine: {
          id: 'engine-acceptance',
          name: '验收体系',
          worldview: '以验收路径、风险校验和可复现步骤作为解读核心。',
          promptRules: ['用验收视角解释命盘。', '先说明依据，再给出可执行动作。']
        },
        avatarUrl: uploadData.url,
        backgroundUrl: uploadData.url,
        mobileBackgroundUrl: `${uploadData.url}?mobile=1`,
        opening: '用现实派方式做验收。',
        customPrompt: '这是验收角色的自定义提示词。',
        tone: { directness: 80, detail: 45 },
        categories: ['bazi', 'daily']
      })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    expect(created.persona.backgroundUrl).toBe(uploadData.url);
    expect(created.persona.mobileBackgroundUrl).toBe(`${uploadData.url}?mobile=1`);

    const update = await app.request(`/api/admin/personas/${created.persona.id}`, {
      method: 'PUT',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '验收大师',
        engineId: 'engine-acceptance',
        avatarUrl: uploadData.url,
        backgroundUrl: `${uploadData.url}?desktop=2`,
        mobileBackgroundUrl: `${uploadData.url}?mobile=2`,
        opening: '用现实派方式做验收。',
        customPrompt: '这是验收角色的自定义提示词。',
        tone: { directness: 80, detail: 45 },
        categories: ['bazi', 'daily']
      })
    });
    expect(update.status).toBe(200);
    const updated = await update.json();
    expect(updated.persona.backgroundUrl).toBe(`${uploadData.url}?desktop=2`);
    expect(updated.persona.mobileBackgroundUrl).toBe(`${uploadData.url}?mobile=2`);

    const list = await app.request('/api/personas');
    const listData = await list.json();
    const createdPersona = listData.personas.find((item: PersonaSkin) => item.id === created.persona.id);
    expect(createdPersona?.customPrompt).toBe('这是验收角色的自定义提示词。');
    expect(createdPersona?.backgroundUrl).toBe(`${uploadData.url}?desktop=2`);
    expect(createdPersona?.mobileBackgroundUrl).toBe(`${uploadData.url}?mobile=2`);
    expect(listData.engines.some((item: PersonaEngine) => item.id === 'engine-acceptance' && item.name === '验收体系')).toBe(true);

    const deleteBuiltin = await app.request('/api/admin/personas/builtin-daoist', {
      method: 'DELETE',
      headers: { Authorization: authHeader() }
    });
    expect(deleteBuiltin.status).toBe(400);

    vi.resetModules();
    const [{ createApp }, { ensureRoleStore }] = await Promise.all([
      import('../server/src/app'),
      import('../server/src/storage/role-store')
    ]);
    await ensureRoleStore();
    const restartedApp = createApp();
    const afterRestart = await restartedApp.request('/api/personas');
    const afterRestartData = await afterRestart.json();
    expect(afterRestartData.personas.some((item: PersonaSkin) => item.id === created.persona.id)).toBe(true);
    expect(afterRestartData.engines.some((item: PersonaEngine) => item.id === 'engine-acceptance')).toBe(true);
  });

  it('兼容旧角色未设置手机端背景时回退电脑端背景', async () => {
    const { app } = await createTestApp();

    const create = await app.request('/api/admin/personas', {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '旧字段大师',
        engineId: 'daoist',
        avatarUrl: '/defaults/custom-avatar.svg',
        backgroundUrl: '/defaults/custom-bg.svg',
        opening: '测试旧背景字段兼容。',
        customPrompt: '',
        tone: { directness: 50, detail: 50 },
        categories: ['bazi']
      })
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    expect(created.persona.mobileBackgroundUrl).toBe('/defaults/custom-bg.svg');

    const list = await app.request('/api/personas');
    const listData = await list.json();
    const createdPersona = listData.personas.find((item: PersonaSkin) => item.id === created.persona.id);
    expect(createdPersona?.mobileBackgroundUrl).toBe(createdPersona?.backgroundUrl);
  });
});
