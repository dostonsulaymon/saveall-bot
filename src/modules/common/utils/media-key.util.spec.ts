import { buildMediaIdentityKey, normalizeMediaUrl } from './media-key.util';

describe('media-key util', () => {
  it('normalizes YouTube short URL and removes tracking params', () => {
    const normalized = normalizeMediaUrl(
      'https://youtu.be/abc123?feature=share&utm_source=telegram',
    );

    expect(normalized).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('builds deterministic key with normalized quality', () => {
    const key = buildMediaIdentityKey(
      'https://www.youtube.com/watch?v=abc123&feature=share',
      ' 720P ',
      { normalizeQuality: true },
    );

    expect(key).toBe('https://www.youtube.com/watch?v=abc123:720p');
  });

  it('keeps different media URLs as different keys', () => {
    const first = buildMediaIdentityKey('https://www.youtube.com/watch?v=aaa111');
    const second = buildMediaIdentityKey('https://www.youtube.com/watch?v=bbb222');

    expect(first).not.toBe(second);
  });
});

