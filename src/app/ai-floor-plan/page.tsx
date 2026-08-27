import type { Metadata } from "next";
import { FloorPlanFlow } from "@/components/floor-plan/floor-plan-flow";

export const metadata: Metadata = {
  title: "AI Floor Plan — HomeDesign Clone",
  description:
    "Upload a floor plan, place room markers, and confirm Room Briefs before layout generation.",
};

export default function FloorPlanPage() {
  return <FloorPlanFlow />;
}
