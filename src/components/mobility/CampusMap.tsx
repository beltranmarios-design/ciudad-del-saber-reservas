import { useI18n } from "@/lib/i18n";
import type { StationStats } from "@/lib/mobility/rules";
import type { Config } from "@/lib/mobility/types";
import { occupancyLevel, type Level } from "./ui";
import { cn } from "@/lib/utils";

const markerFill: Record<Level, string> = {
  low: "fill-info",
  mid: "fill-primary-strong",
  high: "fill-warning",
  full: "fill-destructive",
};

export function CampusMap({
  stats,
  cfg,
  selectedId,
  onSelect,
  filter,
}: {
  stats: StationStats[];
  cfg: Config;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: "all" | "bike" | "scooter";
}) {
  const { t } = useI18n();
  return (
    <figure className="overflow-hidden rounded-2xl border bg-map-ground shadow-card">
      <svg viewBox="0 0 400 300" className="block h-auto w-full" role="group" aria-label={t("map.title")}>
        {/* Illustrative green areas, water and paths — not geographic */}
        <path d="M0 0 H130 C110 40 70 50 30 45 L0 50Z" className="fill-map-green" />
        <path d="M400 0 V40 C360 35 340 20 345 0Z" className="fill-map-green" />
        <path d="M230 300 C240 260 300 250 400 270 V300Z" className="fill-map-green" />
        <ellipse cx="250" cy="150" rx="28" ry="16" className="fill-map-water" />
        <path d="M0 260 C90 250 120 200 150 160 S220 100 300 75 S380 60 400 50" fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-map-path" />
        <path d="M60 235 L150 160 L95 70 M150 160 L205 110 L300 75 M205 110 L255 205 L335 255 M255 205 L345 165 L300 75" fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray="1 10" className="stroke-primary/40" />
        {stats.map((s) => {
          const level = occupancyLevel(s, cfg);
          const count = filter === "bike" ? s.availableBikes : filter === "scooter" ? s.eligibleScooters : s.availableBikes + s.eligibleScooters;
          const selected = selectedId === s.station.id;
          return (
            <g
              key={s.station.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${s.station.name}: ${s.availableBikes} ${t("station.availableBikes").toLowerCase()}, ${s.eligibleScooters} ${t("station.eligibleScooters").toLowerCase()}, ${s.free} ${t("station.free").toLowerCase()}${s.full ? `, ${t("status.full")}` : ""}`}
              onClick={() => onSelect(s.station.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.station.id);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-ring"
              transform={`translate(${s.station.x} ${s.station.y})`}
            >
              <circle r={selected ? 22 : 18} className={cn("fill-card transition-all", selected ? "stroke-info" : "stroke-card")} strokeWidth="4" />
              <circle r={selected ? 17 : 14} className={markerFill[level]} />
              {level === "full" && <circle r={selected ? 21 : 17.5} fill="none" strokeWidth="2" strokeDasharray="3 3" className="stroke-destructive" />}
              <text textAnchor="middle" dy="4.5" className="fill-primary-foreground font-display text-[13px] font-extrabold">
                {count}
              </text>
              <text textAnchor="middle" y={selected ? 36 : 32} className="fill-foreground text-[9px] font-semibold" style={{ paintOrder: "stroke" }} stroke="white" strokeWidth="3">
                {s.station.name.length > 22 ? s.station.name.slice(0, 20) + "…" : s.station.name}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="border-t bg-card px-3 py-2 text-xs text-muted-foreground">
        <strong className="text-foreground">{t("map.title")}.</strong> {t("map.disclaimer")}
      </figcaption>
    </figure>
  );
}

export function MapLegend() {
  const { t } = useI18n();
  const items: Array<[Level, string]> = [
    ["low", t("map.legend.low")],
    ["mid", t("map.legend.mid")],
    ["high", t("map.legend.high")],
    ["full", t("map.legend.full")],
  ];
  return (
    <div aria-label={t("map.legend")} className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map(([lvl, label]) => (
        <span key={lvl} className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <circle cx="8" cy="8" r="6" className={markerFill[lvl]} />
            {lvl === "full" && <circle cx="8" cy="8" r="7.3" fill="none" strokeWidth="1.2" strokeDasharray="2 2" className="stroke-destructive" />}
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}
