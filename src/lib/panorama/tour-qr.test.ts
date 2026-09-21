import { describe, it, expect, vi } from "vitest";
import QRCode from "qrcode";
import { DEMO_PENTHOUSE_TOKEN, DEMO_PENTHOUSE_TOUR, getDemoPenthouseTour } from "./demo-tour";
import { CreateHotspotSchema, CreateSceneSchema, CreateTourSchema } from "./types";
import { getTourByShareToken } from "./tour-service";

describe("VR Tour QR Code & Demo Tour Suite (Sprint 10 Phase 03)", () => {
  describe("Demo Penthouse Tour Definition", () => {
    it("has valid token and metadata", () => {
      const tour = getDemoPenthouseTour();
      expect(tour.shareToken).toBe(DEMO_PENTHOUSE_TOKEN);
      expect(tour.shareToken).toBe("demo-penthouse");
      expect(tour.isPublic).toBe(true);
      expect(tour.title).toContain("Penthouse Horizon");
      expect(tour.scenes).toBeDefined();
      expect(tour.scenes?.length).toBe(3);

      const validation = CreateTourSchema.safeParse({
        title: tour.title,
        description: tour.description,
        isPublic: tour.isPublic,
      });
      expect(validation.success).toBe(true);
    });

    it("verifies all 3 rooms satisfy architectural scene specs", () => {
      const tour = getDemoPenthouseTour();
      const scenes = tour.scenes || [];
      expect(scenes).toHaveLength(3);

      const roomNames = scenes.map((s) => s.name);
      expect(roomNames[0]).toContain("Phòng Khách");
      expect(roomNames[1]).toContain("Bếp");
      expect(roomNames[2]).toContain("Phòng Ngủ Master");

      for (const scene of scenes) {
        const sceneValidation = CreateSceneSchema.safeParse({
          name: scene.name,
          assetId: scene.assetId,
          initialYaw: scene.initialYaw,
          initialPitch: scene.initialPitch,
          initialHfov: scene.initialHfov,
        });
        expect(sceneValidation.success).toBe(true);

        // Every scene must have both portal and info hotspots
        expect(scene.hotspots).toBeDefined();
        expect(scene.hotspots!.length).toBeGreaterThanOrEqual(3);

        const portalHotspots = scene.hotspots!.filter((h) => h.type === "scene");
        const infoHotspots = scene.hotspots!.filter((h) => h.type === "info");
        expect(portalHotspots.length).toBeGreaterThanOrEqual(1);
        expect(infoHotspots.length).toBeGreaterThanOrEqual(1);

        // Validate hotspot coordinates
        for (const hs of scene.hotspots!) {
          const hsValidation = CreateHotspotSchema.safeParse({
            sceneId: hs.sceneId,
            targetSceneId: hs.targetSceneId ?? undefined,
            type: hs.type,
            pitch: hs.pitch,
            yaw: hs.yaw,
            title: hs.title,
            description: hs.description ?? undefined,
          });
          expect(hsValidation.success).toBe(true);
          expect(hs.pitch).toBeGreaterThanOrEqual(-90);
          expect(hs.pitch).toBeLessThanOrEqual(90);
          expect(hs.yaw).toBeGreaterThanOrEqual(-180);
          expect(hs.yaw).toBeLessThanOrEqual(180);
        }
      }
    });

    it("ensures getDemoPenthouseTour returns fresh immutable clones", () => {
      const tourA = getDemoPenthouseTour();
      const tourB = getDemoPenthouseTour();
      expect(tourA).toEqual(tourB);
      expect(tourA).not.toBe(tourB);
      expect(tourA.scenes).not.toBe(tourB.scenes);
    });
  });

  describe("QR Code Generation Engine", () => {
    const testUrl = "https://design.7app.online/tour/demo-penthouse";

    it("generates valid vector SVG for CAD blueprint printing", async () => {
      const svg = await QRCode.toString(testUrl, {
        type: "svg",
        margin: 2,
        width: 320,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });

      expect(typeof svg).toBe("string");
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain("viewBox");
      expect(svg).toContain('stroke="#000000"');
      expect(svg).toContain('fill="#ffffff"');
    });

    it("generates valid high-contrast Obsidian Gold SVG", async () => {
      const svgGold = await QRCode.toString(testUrl, {
        type: "svg",
        margin: 2,
        width: 320,
        color: {
          dark: "#d4af37",
          light: "#090d13",
        },
      });

      expect(svgGold).toContain("<svg");
      expect(svgGold).toContain('stroke="#d4af37"');
      expect(svgGold).toContain('fill="#090d13"');
    });

    it("generates valid Base64 PNG Data URL for high-res preview", async () => {
      const dataUrl = await QRCode.toDataURL(testUrl, {
        margin: 2,
        width: 600,
        errorCorrectionLevel: "H",
      });

      expect(typeof dataUrl).toBe("string");
      expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
      expect(dataUrl.length).toBeGreaterThan(1000);
    });
  });

  describe("Backend Tour Service integration with Demo Tour", () => {
    it("returns demo penthouse tour directly for demo-penthouse shareToken without DB lookup", async () => {
      const dummyDb = {
        prepare: vi.fn(),
      } as unknown as D1Database;

      const tour = await getTourByShareToken(dummyDb, DEMO_PENTHOUSE_TOKEN);
      expect(tour).not.toBeNull();
      expect(tour?.shareToken).toBe("demo-penthouse");
      expect(tour?.scenes).toHaveLength(3);
      // DB was never called because demo tour is resolved immediately
      expect(dummyDb.prepare).not.toHaveBeenCalled();
    });
  });
});
