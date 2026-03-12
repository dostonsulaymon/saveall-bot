import { buildMediaIdentityKey, normalizeMediaUrl } from '../../common/utils/media-key.util';

export interface CapacitySimulationOptions {
  seed?: number;
  dailyUsers: number;
  totalRequests: number;
  duplicatePoolSize: number;
  duplicateShare: number;
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  workerConcurrency: number;
}

export interface CapacitySimulationResult {
  totalRequests: number;
  allowedRequests: number;
  rateLimitedRequests: number;
  queuedJobs: number;
  deduplicatedRequests: number;
  processedJobs: number;
  failedJobs: number;
  cleanupRuns: number;
  cleanupGaps: number;
  peakActiveWorkers: number;
  peakQueueDepth: number;
  avgQueueWaitMs: number;
  p95QueueWaitMs: number;
  scenario: {
    dailyUsers: number;
    totalRequests: number;
    duplicateShare: number;
    workerConcurrency: number;
    rateLimit: string;
  };
}

interface SimJob {
  jobId: string;
  enqueuedAt: number;
  startedAt?: number;
  waitMs?: number;
  completionAt?: number;
}

interface ActiveJob {
  job: SimJob;
  completionAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function runCapacitySimulation(
  options: CapacitySimulationOptions,
): CapacitySimulationResult {
  const rng = createMulberry32(options.seed ?? 20260312);
  const requests = generateRequestEvents(options, rng);

  const userWindowCounts = new Map<string, number>();
  const openJobs = new Map<string, SimJob>();
  const waitingQueue: SimJob[] = [];
  const activeJobs: ActiveJob[] = [];
  const queueWaits: number[] = [];

  let now = 0;
  let peakQueueDepth = 0;
  let peakActiveWorkers = 0;
  let allowedRequests = 0;
  let rateLimitedRequests = 0;
  let queuedJobs = 0;
  let deduplicatedRequests = 0;
  let processedJobs = 0;
  let failedJobs = 0;
  let cleanupRuns = 0;

  for (const request of requests) {
    now = request.timestamp;
    completeFinishedJobs(now, activeJobs, openJobs, {
      onCompleted: () => {
        processedJobs += 1;
        cleanupRuns += 1;
      },
      onFailed: () => {
        failedJobs += 1;
        cleanupRuns += 1;
      },
    });

    drainQueue(
      now,
      waitingQueue,
      activeJobs,
      options.workerConcurrency,
      queueWaits,
      rng,
    );
    if (activeJobs.length > peakActiveWorkers) peakActiveWorkers = activeJobs.length;

    const windowKey = `${request.userId}:${Math.floor(
      request.timestamp / (options.rateLimitWindowSeconds * 1000),
    )}`;
    const windowCount = (userWindowCounts.get(windowKey) ?? 0) + 1;
    userWindowCounts.set(windowKey, windowCount);

    if (windowCount > options.rateLimitMaxRequests) {
      rateLimitedRequests += 1;
      continue;
    }

    allowedRequests += 1;
    const normalizedUrl = normalizeMediaUrl(request.url);
    const identity = buildMediaIdentityKey(normalizedUrl, request.quality, {
      normalizeQuality: true,
    });
    const jobId = `download:${identity}`;

    const existing = openJobs.get(jobId);
    if (existing) {
      deduplicatedRequests += 1;
      continue;
    }

    const job: SimJob = { jobId, enqueuedAt: now };
    openJobs.set(jobId, job);
    waitingQueue.push(job);
    queuedJobs += 1;
    if (waitingQueue.length > peakQueueDepth) peakQueueDepth = waitingQueue.length;
  }

  // Finish any remaining queue after last request
  while (waitingQueue.length > 0 || activeJobs.length > 0) {
    if (activeJobs.length === 0) {
      now += 1;
      drainQueue(
        now,
        waitingQueue,
        activeJobs,
        options.workerConcurrency,
        queueWaits,
        rng,
      );
      if (activeJobs.length > peakActiveWorkers) peakActiveWorkers = activeJobs.length;
      continue;
    }

    const nextCompletionAt = Math.min(...activeJobs.map((item) => item.completionAt));
    now = nextCompletionAt;
    completeFinishedJobs(now, activeJobs, openJobs, {
      onCompleted: () => {
        processedJobs += 1;
        cleanupRuns += 1;
      },
      onFailed: () => {
        failedJobs += 1;
        cleanupRuns += 1;
      },
    });
    drainQueue(
      now,
      waitingQueue,
      activeJobs,
      options.workerConcurrency,
      queueWaits,
      rng,
    );
    if (activeJobs.length > peakActiveWorkers) peakActiveWorkers = activeJobs.length;
  }

  queueWaits.sort((a, b) => a - b);
  const avgQueueWaitMs =
    queueWaits.length === 0
      ? 0
      : Math.round(queueWaits.reduce((acc, wait) => acc + wait, 0) / queueWaits.length);
  const p95QueueWaitMs =
    queueWaits.length === 0
      ? 0
      : queueWaits[Math.floor(queueWaits.length * 0.95)];

  return {
    totalRequests: options.totalRequests,
    allowedRequests,
    rateLimitedRequests,
    queuedJobs,
    deduplicatedRequests,
    processedJobs,
    failedJobs,
    cleanupRuns,
    cleanupGaps: Math.max(queuedJobs - cleanupRuns, 0),
    peakActiveWorkers: Math.min(options.workerConcurrency, peakActiveWorkers),
    peakQueueDepth,
    avgQueueWaitMs,
    p95QueueWaitMs,
    scenario: {
      dailyUsers: options.dailyUsers,
      totalRequests: options.totalRequests,
      duplicateShare: options.duplicateShare,
      workerConcurrency: options.workerConcurrency,
      rateLimit: `${options.rateLimitMaxRequests}/${options.rateLimitWindowSeconds}s`,
    },
  };
}

interface RequestEvent {
  timestamp: number;
  userId: number;
  url: string;
  quality?: string;
}

function generateRequestEvents(
  options: CapacitySimulationOptions,
  rng: () => number,
): RequestEvent[] {
  const events: RequestEvent[] = [];
  const heavyUserIds = Array.from({ length: Math.min(30, options.dailyUsers) }, (_, i) => 900000 + i);
  const hotUrls = Array.from({ length: options.duplicatePoolSize }, (_, i) =>
    `https://www.youtube.com/watch?v=hot${i.toString().padStart(4, '0')}`,
  );
  const qualities = [undefined, '360', '480', '720', 'best'];

  for (let i = 0; i < options.totalRequests; i++) {
    const inBurst = rng() < 0.35;
    const useHeavyUser = inBurst && rng() < 0.55;
    const userId = useHeavyUser
      ? heavyUserIds[Math.floor(rng() * heavyUserIds.length)]
      : 100000 + Math.floor(rng() * options.dailyUsers);
    const timestamp = inBurst
      ? burstTimestamp(rng)
      : Math.floor(rng() * DAY_MS);

    const useDuplicate = rng() < options.duplicateShare;
    let url: string;
    if (useDuplicate) {
      const base = hotUrls[Math.floor(rng() * hotUrls.length)];
      const variant = Math.floor(rng() * 3);
      if (variant === 0) {
        url = `${base}&feature=share&utm_source=telegram`;
      } else if (variant === 1) {
        const id = base.split('v=')[1];
        url = `https://youtu.be/${id}?si=test123`;
      } else {
        url = base;
      }
    } else {
      const unique = `u${userId}-${i}`;
      url = `https://www.youtube.com/watch?v=${unique}`;
    }

    const quality = qualities[Math.floor(rng() * qualities.length)];
    events.push({ timestamp, userId, url, quality });
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

function burstTimestamp(rng: () => number): number {
  // 3 high-traffic windows with 30-second micro-burst slots.
  const windows = [
    8 * 60 * 60 * 1000,
    13 * 60 * 60 * 1000,
    19 * 60 * 60 * 1000,
  ];
  const windowStart = windows[Math.floor(rng() * windows.length)];
  const slotIndex = Math.floor(rng() * 8); // 8 micro-bursts per window
  const slotStart = windowStart + slotIndex * 30 * 1000;
  return slotStart + Math.floor(rng() * 30 * 1000);
}

function drainQueue(
  now: number,
  waitingQueue: SimJob[],
  activeJobs: ActiveJob[],
  concurrency: number,
  queueWaits: number[],
  rng: () => number,
): void {
  while (activeJobs.length < concurrency && waitingQueue.length > 0) {
    const job = waitingQueue.shift()!;
    job.startedAt = now;
    job.waitMs = now - job.enqueuedAt;
    queueWaits.push(job.waitMs);

    const processingMs = sampleProcessingTimeMs(rng);
    const completionAt = now + processingMs;
    job.completionAt = completionAt;
    activeJobs.push({ job, completionAt });
  }
}

function completeFinishedJobs(
  now: number,
  activeJobs: ActiveJob[],
  openJobs: Map<string, SimJob>,
  handlers: { onCompleted: () => void; onFailed: () => void },
): void {
  for (let i = activeJobs.length - 1; i >= 0; i--) {
    const active = activeJobs[i];
    if (active.completionAt > now) continue;

    activeJobs.splice(i, 1);
    openJobs.delete(active.job.jobId);

    // Deterministic synthetic failure ratio: 2% by hash of jobId.
    const failed = simpleHash(active.job.jobId) % 50 === 0;
    if (failed) {
      handlers.onFailed();
    } else {
      handlers.onCompleted();
    }
  }
}

function sampleProcessingTimeMs(rng: () => number): number {
  // Synthetic processing time model:
  // 70% between 7-15s, 30% between 16-32s
  if (rng() < 0.7) {
    return 7000 + Math.floor(rng() * 8000);
  }
  return 16000 + Math.floor(rng() * 16000);
}

function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function createMulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let z = Math.imul(t ^ (t >>> 15), 1 | t);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
