import { cn } from "@/lib/utils";
/** Shared, decorative dream mark. The surrounding status supplies its label. */
export function DreamLoader({
  className,
  size = 52,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      className={cn("df-dream-glyph shrink-0", className)}
      fill="none"
    >
      <g className="df-dream-moon">
        <path d="M49 12a19 19 0 1 0 18 26A20 20 0 0 1 49 12Z" fill="#c4b5fd" />
        <path
          d="M49 12a19 19 0 1 0 18 26A20 20 0 0 1 49 12Z"
          stroke="#8b5cf6"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </g>
      <g className="df-dream-cloud">
        <path
          d="M21 62a10 10 0 0 1-1-20 15 15 0 0 1 29-4 12 12 0 0 1 12 24H21Z"
          fill="#f5f0ff"
          stroke="#a78bfa"
          strokeWidth="2.2"
        />
        <path
          d="M30 51h3m9 0h3"
          stroke="#8b5cf6"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M35 56q3 3 6 0"
          stroke="#8b5cf6"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>
      <path
        className="df-dream-star df-dream-star-one"
        d="m17 13 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"
        fill="#a78bfa"
      />
      <path
        className="df-dream-star df-dream-star-two"
        d="m65 9 1.6 4.4L71 15l-4.4 1.6L65 21l-1.6-4.4L59 15l4.4-1.6L65 9Z"
        fill="#f6c96b"
      />
      <circle
        className="df-dream-star df-dream-star-three"
        cx="70"
        cy="49"
        r="2.4"
        fill="#c4b5fd"
      />
    </svg>
  );
}
export function DreamLoading({
  label = "Dreaming up something…",
  inline = false,
  className,
}: {
  label?: string;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "df-dream-loading",
        inline ? "df-dream-loading-inline" : "df-dream-loading-panel",
        className,
      )}
    >
      <DreamLoader size={inline ? 24 : 64} />
      <span>{label}</span>
    </div>
  );
}
