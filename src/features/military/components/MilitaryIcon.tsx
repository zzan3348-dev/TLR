export type MilitaryIconName = "army" | "navy" | "air" | "production" | "doctrine" | "offensive" | "defensive" | "objective" | "delete";

/** Generated raster artwork; never substitute a CSS mask or a drawn SVG glyph. */
export function MilitaryIcon({ name }: { name: MilitaryIconName }) {
  return <img className="hq-art-icon" src={`/assets/ui/military-art/${name}.png`} alt="" draggable={false} />;
}
