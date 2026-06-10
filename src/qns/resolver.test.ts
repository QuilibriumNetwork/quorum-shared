import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveName, QNS_BASE_URL } from './resolver';

afterEach(() => vi.restoreAllMocks());

describe('resolveName', () => {
  it('GETs /resolve/:name and returns the record', async () => {
    const record = {
      address: 'QmABC',
      resolveKey: 'deadbeef',
      metadata: null,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => record,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveName('alice');
    expect(fetchMock).toHaveBeenCalledWith(
      `${QNS_BASE_URL}/resolve/alice`,
      expect.any(Object)
    );
    expect(result?.address).toBe('QmABC');
    expect(result?.resolveKey).toBe('deadbeef');
  });

  it('url-encodes the name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ address: 'Q' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await resolveName('a b');
    expect(fetchMock).toHaveBeenCalledWith(
      `${QNS_BASE_URL}/resolve/a%20b`,
      expect.any(Object)
    );
  });

  it('returns null on 404 (name not registered)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );
    expect(await resolveName('nope')).toBeNull();
  });

  it('throws on non-404 errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );
    await expect(resolveName('x')).rejects.toThrow();
  });
});
