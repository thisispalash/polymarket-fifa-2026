import { logger } from "../logger";

export type WorkerDef = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

type HealthEntry = {
  lastRunOk: boolean;
  lastRunAt: string | null;
  lastError?: string;
};

const health: Record<string, HealthEntry> = {};
const timers: ReturnType<typeof setTimeout>[] = [];
let stopped = false;

function jitter(ms: number): number {
  return ms + Math.floor((Math.random() * 0.2 - 0.1) * ms);
}

function scheduleNext(worker: WorkerDef): void {
  if (stopped) return;
  const t = setTimeout(async () => {
    try {
      await worker.run();
      health[worker.name] = { lastRunOk: true, lastRunAt: new Date().toISOString() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      health[worker.name] = {
        lastRunOk: false,
        lastRunAt: new Date().toISOString(),
        lastError: msg,
      };
      logger.error({ worker: worker.name, err }, "worker error");
    }
    scheduleNext(worker);
  }, jitter(worker.intervalMs));
  timers.push(t);
}

export function startWorkers(workers: WorkerDef[]): void {
  stopped = false;
  for (const w of workers) {
    health[w.name] = { lastRunOk: true, lastRunAt: null };
    scheduleNext(w);
    logger.info({ worker: w.name, intervalMs: w.intervalMs }, `worker started: ${w.name} (${w.intervalMs / 1000}s)`);
  }
}

// Halt scheduling of further worker ticks. Any tick already in-flight will
// complete, but no new ones will fire. Used by the kill switch and by
// SIGTERM/SIGINT shutdown paths.
export function stopWorkers(): void {
  stopped = true;
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
  logger.info("workers stopped");
}

export function getWorkerHealth(): Record<string, HealthEntry> {
  return { ...health };
}
