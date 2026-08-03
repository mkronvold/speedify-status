import {
  RING_SAMPLE_COUNT,
  type QueryWindow,
  type SampleEnvelope,
  WINDOW_SECONDS,
} from '@speedify-status/contracts';

export interface StoredSample extends SampleEnvelope {
  /** Wall clock when the API accepted the sample (ms). */
  receivedAt: number;
}

/**
 * Fixed-size in-memory ring of 1s samples (~1 hour).
 * No disk persistence in MVP.
 */
export class SampleStore {
  readonly size: number;
  private readonly ring: Array<StoredSample | null>;
  private writeIndex = 0;
  private count = 0;

  constructor(size: number = RING_SAMPLE_COUNT) {
    this.size = size;
    this.ring = Array.from({ length: size }, () => null);
  }

  ingest(sample: SampleEnvelope, receivedAt = Date.now()): StoredSample {
    const stored: StoredSample = { ...sample, receivedAt };
    this.ring[this.writeIndex] = stored;
    this.writeIndex = (this.writeIndex + 1) % this.size;
    if (this.count < this.size) {
      this.count += 1;
    }
    return stored;
  }

  get sampleCount(): number {
    return this.count;
  }

  /** Newest sample by agent ts, or null if empty. */
  latest(): StoredSample | null {
    if (this.count === 0) return null;
    let best: StoredSample | null = null;
    for (const s of this.ring) {
      if (!s) continue;
      if (!best || s.ts > best.ts) best = s;
    }
    return best;
  }

  /** Samples whose agent ts falls inside the query window ending at nowMs. */
  samplesForWindow(window: QueryWindow, nowMs = Date.now()): StoredSample[] {
    const seconds = WINDOW_SECONDS[window];
    const minTs = nowMs - seconds * 1000;
    const out: StoredSample[] = [];
    for (const s of this.ring) {
      if (!s) continue;
      if (s.ts > minTs && s.ts <= nowMs) {
        out.push(s);
      }
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }

  clear(): void {
    for (let i = 0; i < this.ring.length; i += 1) {
      this.ring[i] = null;
    }
    this.writeIndex = 0;
    this.count = 0;
  }
}
