import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, nextCursor, type ListCursor } from "@/lib/library/cursor";
describe("cursor helpers", () => {
  it("encodes and decodes a cursor", () => {
    const cursor = { value: 123, id: "abc", sort: "updated-desc", dir: "desc" as const };
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("decodes an invalid cursor as null", () => {
    expect(decodeCursor("not-base64!!!")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("rejects cursor with wrong field types", () => {
    const bad = encodeCursor({ value: 1, id: 123 as unknown as string, sort: "x", dir: "desc" } as ListCursor<number>);
    expect(decodeCursor<number>(bad)).toBeNull();
  });
  it("produces a stable next cursor from a row", () => {
    const cursor = nextCursor({ value: "name", id: "p1" }, "name-asc", "asc");
    const decoded = decodeCursor<{ value: string; id: string }>(cursor);
    expect(decoded).toEqual({ value: "name", id: "p1", sort: "name-asc", dir: "asc" });
  });
});
