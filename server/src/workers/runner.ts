import type { WorkerHealth } from "@fifa/shared";
import { logger } from "../logger";

export type WorkerDef = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

type HealthEntry = Omit<WorkerHealth, "name">;

const health: Record<string, HealthEntry> = {};
const timers: ReturnType<typeof setTimeout>[] = [];
let stopped = false;
let registeredWorkers: WorkerDef[] = [];

function jitter(ms: number): number {
  return ms + Math.floor((Math.random() * 0.2 - 0.1) * ms);
}

function scheduleNext(worker: WorkerDef): void {
  if (stopped) return;
  const t = setTimeout(async () => {
    try {
      await worker.run();
      health[worker.name] = { lastRunOk: true, lastRunAt: new Date().toISOString(), lastError: null };
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
  registeredWorkers = workers;
  stopped = false;
  for (const w of workers) {
    health[w.name] = { lastRunOk: true, lastRunAt: null, lastError: null };
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

// Re-schedule the previously-registered workers after a stopWorkers call.
// Used by the kill switch deactivate path. No-op if workers were never
// started or if they're currently running.
export function restartWorkers(): void {
  if (registeredWorkers.length === 0) {
    logger.warn("restartWorkers: no workers were ever registered, no-op");
    return;
  }
  if (!stopped) {
    logger.warn("restartWorkers: workers are already running, no-op");
    return;
  }
  stopped = false;
  for (const w of registeredWorkers) {
    scheduleNext(w);
    logger.info({ worker: w.name }, "worker restarted");
  }
}

export function getWorkerHealth(): WorkerHealth[] {
  return Object.entries(health).map(([name, entry]) => ({ name, ...entry }));
}
