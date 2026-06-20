import { WorkerEnvelope, WorkerLiveMatch } from '../../types';

const WORKER_API_BASE_URL = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_WORKER_API_BASE_URL || '') : '';

export async function fetchWorkerJson<T>(path: string): Promise<T | null> {
  if (!WORKER_API_BASE_URL) return null;

  try {
    const response = await fetch(`${WORKER_API_BASE_URL}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Worker returned HTTP ${response.status}`);
    const envelope = (await response.json()) as WorkerEnvelope<T> | T;
    return envelope && typeof envelope === 'object' && 'data' in envelope ? (envelope as WorkerEnvelope<T>).data : (envelope as T);
  } catch (error) {
    console.warn(`Worker fetch failed for ${path}:`, error);
    return null;
  }
}

export async function fetchLiveMatchesFromWorker(force = false): Promise<WorkerLiveMatch[]> {
  if (typeof window === 'undefined' || (typeof process !== 'undefined' && process.env.NEXT_PHASE === 'phase-production-build')) {
    return [];
  }
  const path = force ? '/live?force=true' : '/live';
  return (await fetchWorkerJson<WorkerLiveMatch[]>(path)) || [];
}
