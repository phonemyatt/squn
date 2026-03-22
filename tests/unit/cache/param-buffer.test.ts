import { describe, expect, it } from "bun:test";
import { ParamBuffer } from "../../../src/cache/param-buffer.ts";

describe("cache/param-buffer — ParamBuffer", () => {
  describe("basic usage", () => {
    it("push() appends values and returns sequential indices", () => {
      const buf = new ParamBuffer();
      expect(buf.push("a")).toBe(0);
      expect(buf.push("b")).toBe(1);
      expect(buf.push("c")).toBe(2);
      expect(buf.length).toBe(3);
    });

    it("toArray() returns only the filled portion", () => {
      const buf = new ParamBuffer(16);
      buf.push(1);
      buf.push("two");
      buf.push(null);
      expect(buf.toArray()).toEqual([1, "two", null]);
    });

    it("handles various value types correctly", () => {
      const buf = new ParamBuffer();
      const date = new Date();
      buf.push(42);
      buf.push("hello");
      buf.push(true);
      buf.push(null);
      buf.push(date);
      expect(buf.toArray()).toEqual([42, "hello", true, null, date]);
    });
  });

  describe("buffer reuse across calls", () => {
    it("reset() clears values without re-allocating", () => {
      const buf = new ParamBuffer(8);
      buf.push("a");
      buf.push("b");
      const capBefore = buf.capacity;

      buf.reset();
      expect(buf.length).toBe(0);
      expect(buf.toArray()).toEqual([]);
      expect(buf.capacity).toBe(capBefore);
    });

    it("can be reused after reset with different values", () => {
      const buf = new ParamBuffer();
      buf.push("first-run-a");
      buf.push("first-run-b");
      expect(buf.toArray()).toEqual(["first-run-a", "first-run-b"]);

      buf.reset();
      buf.push("second-run-x");
      expect(buf.toArray()).toEqual(["second-run-x"]);
      expect(buf.length).toBe(1);
    });

    it("previous values are cleared after reset so GC can reclaim them", () => {
      const buf = new ParamBuffer(4);
      buf.push({ big: "object" });
      buf.reset();
      // After reset, toArray returns empty — old values are not accessible
      expect(buf.toArray()).toEqual([]);
    });
  });

  describe("automatic growth", () => {
    it("grows the buffer when push exceeds initial capacity", () => {
      const buf = new ParamBuffer(2);
      expect(buf.capacity).toBe(2);

      buf.push("a");
      buf.push("b");
      buf.push("c");

      expect(buf.length).toBe(3);
      expect(buf.capacity).toBeGreaterThanOrEqual(3);
      expect(buf.toArray()).toEqual(["a", "b", "c"]);
    });

    it("doubles capacity on growth", () => {
      const buf = new ParamBuffer(4);
      for (let i = 0; i < 5; i++) {
        buf.push(i);
      }
      expect(buf.capacity).toBe(8);
    });

    it("handles a param count much larger than initial capacity", () => {
      const buf = new ParamBuffer(2);
      const expected: number[] = [];
      for (let i = 0; i < 100; i++) {
        buf.push(i);
        expected.push(i);
      }
      expect(buf.length).toBe(100);
      expect(buf.toArray()).toEqual(expected);
    });
  });

  describe("concurrent safety", () => {
    it("two ParamBuffer instances do not interfere with each other", () => {
      const buf1 = new ParamBuffer();
      const buf2 = new ParamBuffer();

      buf1.push("buf1-a");
      buf2.push("buf2-a");
      buf1.push("buf1-b");
      buf2.push("buf2-b");

      expect(buf1.toArray()).toEqual(["buf1-a", "buf1-b"]);
      expect(buf2.toArray()).toEqual(["buf2-a", "buf2-b"]);
    });

    it("resetting one buffer does not affect another", () => {
      const buf1 = new ParamBuffer();
      const buf2 = new ParamBuffer();

      buf1.push("a");
      buf2.push("b");

      buf1.reset();
      expect(buf1.length).toBe(0);
      expect(buf2.length).toBe(1);
      expect(buf2.toArray()).toEqual(["b"]);
    });
  });
});
