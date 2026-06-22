import { useState } from "react";
import { Watch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TierModel } from "./tierConfig";

/**
 * Presentational watch card. Reused by:
 *  - the live Demand Tiers board (variant="full" — rich card with premium/price/sample)
 *  - the custom drag-drop board (variant="compact" — small draggable chip)
 *
 * It holds no data-fetching or DnD logic. The custom page can spread native HTML5
 * drag handlers (draggable, onDragStart, etc.) onto it via ...rest, which land on
 * the root element.
 */
export interface WatchCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** The model to render. Only `ref`, `name`, `imageUrl` are required for compact use. */
  model: Pick<
    TierModel,
    "ref" | "name" | "imageUrl"
  > &
    Partial<TierModel>;
  /** "full" = rich live card (default). "compact" = small draggable card. */
  variant?: "full" | "compact";
  className?: string;
}

function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatPremium(pct: number | null | undefined): string | null {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function WatchCard({
  model,
  variant = "full",
  className,
  ...rest
}: WatchCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const compact = variant === "compact";
  const premiumText = formatPremium(model.premiumPct);
  const premiumPositive = (model.premiumPct ?? 0) > 0;

  // Graceful image fallback: a neutral tile with a lucide Watch icon. Fills the
  // same square thumbnail container so cards stay uniform whether or not an image loads.
  const fallback = (
    <div
      className="flex h-full w-full items-center justify-center text-slate-400"
      aria-hidden="true"
    >
      <Watch
        className={compact ? "h-9 w-9" : "h-14 w-14"}
        strokeWidth={1.5}
      />
    </div>
  );

  return (
    <div
      {...rest}
      className={cn(
        "group flex flex-col items-center rounded-2xl border bg-card text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        compact ? "w-36 gap-1.5 p-2" : "w-48 gap-2 p-3",
        className
      )}
      title={`${model.name} — ${model.ref}`}
    >
      {/* Thumbnail — fixed SQUARE container, object-contain on near-white bg so
          landscape/portrait sources always show fully upright, never cropped or
          stretched. ~120-140px tall for the full variant. */}
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-slate-50 ring-1 ring-black/5">
        {imgFailed || !model.imageUrl ? (
          fallback
        ) : (
          <img
            src={model.imageUrl}
            alt={model.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-contain"
          />
        )}
      </div>

      {/* Name + ref — name wraps to at most 2 lines (no single-line truncation). */}
      <div className="w-full text-center">
        <p
          className={cn(
            "line-clamp-2 font-semibold leading-tight",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {model.name}
        </p>
        <p
          className={cn(
            "truncate font-mono text-muted-foreground",
            compact ? "text-[10px]" : "text-xs"
          )}
        >
          {model.ref}
        </p>
      </div>

      {/* Rich live-card details */}
      {!compact && (
        <div className="flex w-full flex-col items-center gap-0.5">
          {premiumText && (
            <span
              className={cn(
                "text-base font-bold tabular-nums",
                premiumPositive ? "text-emerald-600" : "text-red-600"
              )}
            >
              {premiumText}
            </span>
          )}
          {(model.marketPrice ?? null) !== null && (
            <span className="text-sm font-medium tabular-nums">
              {formatUsd(model.marketPrice)}
            </span>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {(model.mrp ?? null) !== null && (
              <span className="tabular-nums">MRP {formatUsd(model.mrp)}</span>
            )}
            {model.sampleSize !== undefined && model.sampleSize !== null && (
              <span className="tabular-nums">n={model.sampleSize}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WatchCard;
