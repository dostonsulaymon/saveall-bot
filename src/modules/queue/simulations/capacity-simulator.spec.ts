import { runCapacitySimulation } from './capacity-simulator';

describe('capacity simulation baseline', () => {
  it('simulates 1000+ daily users with burst and duplicate traffic', () => {
    const result = runCapacitySimulation({
      seed: 20260312,
      dailyUsers: 1200,
      totalRequests: 2600,
      duplicatePoolSize: 120,
      duplicateShare: 0.58,
      rateLimitMaxRequests: 3,
      rateLimitWindowSeconds: 30,
      workerConcurrency: 10,
    });

    expect(result.totalRequests).toBe(2600);
    expect(result.queuedJobs).toBeGreaterThan(0);
    expect(result.processedJobs + result.failedJobs).toBe(result.queuedJobs);
    expect(result.cleanupRuns).toBe(result.queuedJobs);
    expect(result.deduplicatedRequests).toBeGreaterThan(0);
    expect(result.rateLimitedRequests).toBeGreaterThan(0);

    // Keep a deterministic summary in test logs for review.
    // eslint-disable-next-line no-console
    console.log(
      '[capacity-simulation]',
      JSON.stringify(
        {
          scenario: result.scenario,
          totals: {
            totalRequests: result.totalRequests,
            allowedRequests: result.allowedRequests,
            queuedJobs: result.queuedJobs,
            deduplicatedRequests: result.deduplicatedRequests,
            rateLimitedRequests: result.rateLimitedRequests,
            processedJobs: result.processedJobs,
            failedJobs: result.failedJobs,
          },
          queue: {
            peakActiveWorkers: result.peakActiveWorkers,
            peakQueueDepth: result.peakQueueDepth,
            avgQueueWaitMs: result.avgQueueWaitMs,
            p95QueueWaitMs: result.p95QueueWaitMs,
          },
          cleanup: {
            cleanupRuns: result.cleanupRuns,
            cleanupGaps: result.cleanupGaps,
          },
        },
        null,
        2,
      ),
    );
  });
});

