import { SearchQueryCache } from '../../services/search-query-cache';

describe('SearchQueryCache', () => {
  afterEach(() => jest.useRealTimers());

  it('shares requests in flight and expires successful values', async () => {
    jest.useFakeTimers();
    const cache = new SearchQueryCache<string>(2, 1000);
    const load = jest.fn().mockResolvedValue('intent');
    const first = cache.getOrCreate('query', load);
    expect(cache.getOrCreate('query', load)).toBe(first);
    await first;
    jest.advanceTimersByTime(999);
    await cache.getOrCreate('query', load);
    expect(load).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await cache.getOrCreate('query', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used key at capacity', async () => {
    const cache = new SearchQueryCache<string>(2);
    const load = jest.fn().mockResolvedValue('intent');
    await cache.getOrCreate('a', load);
    await cache.getOrCreate('b', load);
    await cache.getOrCreate('a', load);
    await cache.getOrCreate('c', load);
    await cache.getOrCreate('a', load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.getOrCreate('b', load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('removes failures so a later request can recover', async () => {
    const cache = new SearchQueryCache<string>();
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('recovered');
    await expect(cache.getOrCreate('query', load)).rejects.toThrow('timeout');
    await expect(cache.getOrCreate('query', load)).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
