import { CatalogCard } from "@/components/landing/catalog-card";
import {
  EXTERIOR_IDEAS,
  EXTERIOR_POPULAR_STYLES,
  IDEAS,
  POPULAR_STYLES,
} from "@/lib/catalog";

/** Popular Styles + Ideas galleries on design-flow pages (DESIGN.md §5). */
export function DesignCatalogGalleries({
  scene,
}: {
  scene: "interior" | "exterior";
}) {
  const styles = scene === "interior" ? POPULAR_STYLES : EXTERIOR_POPULAR_STYLES;
  const ideas = scene === "interior" ? IDEAS : EXTERIOR_IDEAS;
  const ideasHeading =
    scene === "interior" ? "Ideas for Every Room" : "Ideas for Every Area";

  return (
    <div className="mt-16 space-y-16 border-t border-ink/10 pt-16">
      <section id="popular-styles">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          Popular Styles
        </h2>
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {styles.map((item) => (
            <CatalogCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section id="ideas">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          {ideasHeading}
        </h2>
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {ideas.map((item) => (
            <CatalogCard key={item.title} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
