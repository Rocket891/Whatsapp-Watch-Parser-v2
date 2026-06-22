import { cn } from "@/lib/utils";
import { TIER_COLORS, tierLabel, tierTextColor } from "./tierConfig";

/**
 * One horizontal tier row: a big colored label box on the left + a flex-wrap area
 * of cards on the right.
 *
 * Presentational only — no drag-drop logic lives here. The custom drag-drop board
 * attaches native HTML5 DnD via `containerProps` (spread onto the cards container),
 * e.g. { onDrop, onDragOver, "data-tier": tier }. The cards themselves get their
 * own draggable handlers from the parent.
 */
export interface TierRowProps {
  /** Tier letter (e.g. "S+", "A", "?"). Drives the label color. */
  tier: string;
  /** Cards (usually <WatchCard />) to render in the row body. */
  children?: React.ReactNode;
  /** Optional count shown under the tier letter (defaults to counting children). */
  count?: number;
  /** Extra classes for the outer row wrapper. */
  className?: string;
  /**
   * Props spread onto the flex-wrap cards container — the drop target.
   * Use for native DnD handlers (onDrop, onDragOver, onDragEnter, data-*).
   */
  containerProps?: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>;
}

export function TierRow({
  tier,
  children,
  count,
  className,
  containerProps,
}: TierRowProps) {
  const bg = TIER_COLORS[tier] ?? TIER_COLORS["?"];
  const fg = tierTextColor(tier);

  const { className: containerClassName, ...restContainer } =
    containerProps ?? {};

  return (
    <div
      className={cn(
        "flex items-stretch gap-3 overflow-hidden rounded-2xl border bg-card shadow-sm",
        className
      )}
    >
      {/* Colored label box */}
      <div
        className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 px-2 py-4 sm:w-24"
        style={{ backgroundColor: bg, color: fg }}
      >
        <span className="text-3xl font-extrabold leading-none tracking-tight drop-shadow-sm">
          {tierLabel(tier)}
        </span>
        {count !== undefined && (
          <span className="text-xs font-semibold opacity-90 tabular-nums">
            {count}
          </span>
        )}
      </div>

      {/* Cards container (drop target) */}
      <div
        {...restContainer}
        className={cn(
          "flex min-h-[120px] flex-1 flex-wrap content-start items-start gap-3 p-3",
          containerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default TierRow;
