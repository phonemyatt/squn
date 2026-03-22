import { describe, expect, it } from "bun:test";
import { PoolStats } from "../../../src/pool/stats.ts";

describe("pool/stats — PoolStats", () => {
  describe("rolling averages", () => {
    it("first sample becomes the average", () => {
      const stats = new PoolStats();
      stats.recordAcquire(10);
      const snap = stats.snapshot(0, 0, 0, 1, 10);
      expect(snap.avgAcquireMs).toBe(10);
    });

    it("average moves toward new samples over time", () => {
      const stats = new PoolStats(0.5);
      stats.recordAcquire(10);
      stats.recordAcquire(20);
      const snap = stats.snapshot(0, 0, 0, 1, 10);
      // EMA: 10 * 0.5 + 20 * 0.5 = 15
      expect(snap.avgAcquireMs).toBe(15);
    });

    it("tracks idle duration average", () => {
      const stats = new PoolStats();
      stats.recordIdle(100);
      const snap = stats.snapshot(0, 0, 0, 1, 10);
      expect(snap.avgIdleMs).toBe(100);
    });

    it("tracks use duration average", () => {
      const stats = new PoolStats();
      stats.recordUse(50);
      const snap = stats.snapshot(0, 0, 0, 1, 10);
      expect(snap.avgUseMs).toBe(50);
    });
  });

  describe("counters", () => {
    it("tracks totalCreated", () => {
      const stats = new PoolStats();
      stats.recordCreated();
      stats.recordCreated();
      const snap = stats.snapshot(0, 0, 0, 1, 10);
      expect(snap.totalCreated).toBe(2);
    });

    it("tracks totalDestroyed", () => {
      const stats = new PoolStats();
      stats.recordDestroyed();
      const snap = stats.snapshot(0, 0, 0, 1, 10);
      expect(snap.totalDestroyed).toBe(1);
    });

    it("tracks totalAcquired", () => {
      const stats = new PoolStats();
      stats.recordAcquire(5);
      stats.recordAcquire(10);
      stats.recordAcquire(15);
      const snap = stats.snapshot(0, 0, 0, 1, 10);
      expect(snap.totalAcquired).toBe(3);
    });
  });

  describe("snapshot accuracy", () => {
    it("reports correct total as idle + acquired", () => {
      const stats = new PoolStats();
      const snap = stats.snapshot(3, 2, 1, 1, 10);
      expect(snap.total).toBe(5);
      expect(snap.idle).toBe(3);
      expect(snap.acquired).toBe(2);
      expect(snap.waiting).toBe(1);
    });

    it("includes min and max from config", () => {
      const stats = new PoolStats();
      const snap = stats.snapshot(0, 0, 0, 2, 20);
      expect(snap.min).toBe(2);
      expect(snap.max).toBe(20);
    });

    it("averages start at 0 before any samples", () => {
      const stats = new PoolStats();
      const snap = stats.snapshot(0, 0, 0, 1, 10);
      expect(snap.avgAcquireMs).toBe(0);
      expect(snap.avgIdleMs).toBe(0);
      expect(snap.avgUseMs).toBe(0);
    });
  });
});
