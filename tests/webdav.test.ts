import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeWebdavRateLimit,
  MAX_WEBDAV_PROXY_BODY_BYTES,
  readWebdavJsonRequest,
  validateWebdavProxyRequest
} from '../server/src/shared/webdav-access';
import {
  buildWebdavUrl,
  MAX_WEBDAV_SNAPSHOT_BYTES,
  readWebdavFile,
  testWebdavConnection,
  validateWebdavPayload
} from '../server/src/shared/webdav';
import { parseSnapshot } from '../src/services/webdav';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WebDAV 服务端安全校验', () => {
  it('拒绝直接和双重编码的 .. 路径段', () => {
    expect(validateWebdavPayload({ url: 'https://dav.example.com', path: 'soothsay/%2e%2e/backup.json' }))
      .toContain('不能包含 . 或 ..');
    expect(validateWebdavPayload({ url: 'https://dav.example.com', path: 'soothsay/%252e%252e/backup.json' }))
      .toContain('不能包含 . 或 ..');
  });

  it('拒绝编码后的路径分隔符', () => {
    expect(validateWebdavPayload({ url: 'https://dav.example.com', path: 'soothsay/%2fetc/backup.json' }))
      .toContain('编码后的斜杠');
  });

  it('安全路径仍能规范化中文文件名', () => {
    expect(buildWebdavUrl('https://dav.example.com/root/', 'soothsay/命盘 备份.json'))
      .toBe('https://dav.example.com/root/soothsay/%E5%91%BD%E7%9B%98%20%E5%A4%87%E4%BB%BD.json');
  });

  it('在发起 fetch 前拒绝环回地址', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await testWebdavConnection({
      url: 'http://127.0.0.1:8080',
      path: 'soothsay/backup.json'
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('不能指向本机');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('拒绝把 WebDAV 请求重定向到其他主机', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' }
      })
    );

    const result = await testWebdavConnection({
      url: 'https://8.8.8.8',
      path: 'soothsay/backup.json'
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('不能跳转到其他主机');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('WebDAV 代理访问保护', () => {
  const validMeta = {
    origin: 'https://app.example.com',
    host: 'app.example.com',
    secFetchSite: 'same-origin',
    clientHeader: '1'
  };

  it('接受本站同源且带客户端标识的请求', () => {
    expect(validateWebdavProxyRequest(validMeta)).toBeNull();
  });

  it('拒绝缺少客户端标识和跨站 Origin', () => {
    expect(validateWebdavProxyRequest({ ...validMeta, clientHeader: undefined })).toContain('客户端标识');
    expect(validateWebdavProxyRequest({ ...validMeta, origin: 'https://evil.example.com' })).toContain('同源请求');
  });

  it('每个客户端每分钟最多允许 20 次 WebDAV 操作', () => {
    const key = `vitest-${Date.now()}-${Math.random()}`;
    for (let index = 0; index < 20; index += 1) {
      expect(consumeWebdavRateLimit(key, 1_000).allowed).toBe(true);
    }
    const blocked = consumeWebdavRateLimit(key, 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('在解析 JSON 前拒绝超过 4MB 的请求体', async () => {
    const request = new Request('https://app.example.com/api/webdav/upload', {
      method: 'POST',
      body: 'x'.repeat(MAX_WEBDAV_PROXY_BODY_BYTES + 1)
    });
    await expect(readWebdavJsonRequest(request)).rejects.toThrow('超过 4MB');
  });
});

describe('WebDAV 备份体积保护', () => {
  it('上传载荷超过 2MB 时直接拒绝', () => {
    const error = validateWebdavPayload({
      url: 'https://8.8.8.8',
      path: 'soothsay/backup.json',
      content: 'x'.repeat(MAX_WEBDAV_SNAPSHOT_BYTES + 1)
    }, true);
    expect(error).toContain('2MB');
  });

  it('下载超过 2MB 时在代理层停止读取', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('x'.repeat(MAX_WEBDAV_SNAPSHOT_BYTES + 1), { status: 200 })
    );
    const result = await readWebdavFile({
      url: 'https://8.8.8.8',
      path: 'soothsay/backup.json'
    });
    expect(result.status).toBe(413);
    expect(result.body.error).toContain('2MB');
  });
});

describe('WebDAV 快照结构校验', () => {
  const validSnapshot = {
    app: 'soothsay',
    version: 1,
    exportedAt: '2026-08-10T00:00:00.000Z',
    sharedProfile: null,
    birthProfiles: [],
    roleHistories: [],
    preferences: {}
  };

  it('接受完整的最小快照', () => {
    expect(parseSnapshot(JSON.stringify(validSnapshot))).toEqual(validSnapshot);
  });

  it('拒绝缺少数组字段的部分快照，避免还原时清空本地数据', () => {
    const { birthProfiles: _birthProfiles, ...partialSnapshot } = validSnapshot;
    expect(() => parseSnapshot(JSON.stringify(partialSnapshot))).toThrow('缺少必要字段');
  });

  it('拒绝结构损坏的生辰档案', () => {
    const invalidSnapshot = {
      ...validSnapshot,
      birthProfiles: [{ id: 'profile-1', name: '测试' }]
    };
    expect(() => parseSnapshot(JSON.stringify(invalidSnapshot))).toThrow('生辰档案结构不正确');
  });

  it('拒绝重复的档案 ID', () => {
    const profile = {
      id: 'profile-1',
      name: '测试',
      input: {},
      chart: {},
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z'
    };
    const invalidSnapshot = {
      ...validSnapshot,
      birthProfiles: [profile, { ...profile }]
    };
    expect(() => parseSnapshot(JSON.stringify(invalidSnapshot))).toThrow('重复的生辰档案 ID');
  });
});
