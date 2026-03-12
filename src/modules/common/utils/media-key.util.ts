export function normalizeMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';

    const trackingKeys = new Set([
      'feature',
      'si',
      'fbclid',
      'gclid',
      'dclid',
      'igshid',
      'mc_cid',
      'mc_eid',
      'ref',
      'ref_src',
      'source',
    ]);

    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith('utm_') || trackingKeys.has(key)) {
        parsed.searchParams.delete(key);
      }
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname === 'youtu.be') {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    if (
      hostname === 'youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'music.youtube.com'
    ) {
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/i);
      if (shortsMatch?.[1]) {
        return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
      }

      if (parsed.pathname === '/watch') {
        const videoId = parsed.searchParams.get('v');
        if (videoId) {
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      }
    }

    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function buildMediaIdentityKey(
  url: string,
  quality?: string,
  options?: { normalizeQuality?: boolean },
): string {
  const normalizedUrl = normalizeMediaUrl(url);
  const normalizeQuality = options?.normalizeQuality ?? false;
  const preparedQuality = normalizeQuality
    ? quality?.trim().toLowerCase()
    : quality;

  return preparedQuality ? `${normalizedUrl}:${preparedQuality}` : normalizedUrl;
}

