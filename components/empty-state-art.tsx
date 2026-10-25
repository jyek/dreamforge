export type EmptyStateIllustration =
  | "projects"
  | "classrooms"
  | "search"
  | "prompts"
  | "students"
  | "usage";

/** Small, decorative illustrations shared by empty screens. */
export function EmptyStateArt({
  variant,
}: {
  variant: EmptyStateIllustration;
}) {
  return (
    <svg
      className="df-empty-art"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 144 112"
      width="144"
      height="112"
      fill="none"
    >
      <circle cx="72" cy="56" r="43" fill="#F5F0FF" />
      <g
        stroke="#9B78EB"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {variant === "projects" && (
          <>
            <path
              d="M33 42a5 5 0 0 1 5-5h23l9 10h37a5 5 0 0 1 5 5v36H33Z"
              fill="#E5D9FF"
            />
            <path d="M40 53h75l-9 35H31Z" fill="#F0E8FF" />
            <path d="m62 68 9-5m-9 5 9 5m17-10 9 5-9 5m-9-12-5 15" />
            <path d="M88 35v-9m-4 4h8" />
          </>
        )}
        {variant === "classrooms" && (
          <>
            <path d="M37 45h70v44H37Z" fill="#E5D9FF" />
            <path d="m29 45 43-25 43 25Z" fill="#F0E8FF" />
            <path d="M63 89V65h18v24" fill="white" />
            <path d="M47 55h8v10h-8Zm42 0h8v10h-8Z" fill="white" />
            <circle cx="72" cy="38" r="6" fill="white" />
            <path d="M72 34v4l3 2M30 89h84" />
          </>
        )}
        {variant === "search" && (
          <>
            <circle cx="67" cy="49" r="24" fill="#E5D9FF" />
            <circle cx="67" cy="49" r="17" fill="white" />
            <path d="m84 67 20 20a5 5 0 0 0 7-7L91 60" fill="#CBB5FA" />
            <path d="M58 48h.1m17 0h.1m-12 7q4 3 8 0" />
            <path d="M35 78h12m-6-6v12" />
          </>
        )}
        {variant === "prompts" && (
          <>
            <path
              d="M32 32h64a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H63L46 94V82H32a8 8 0 0 1-8-8V40a8 8 0 0 1 8-8Z"
              fill="#E5D9FF"
            />
            <path d="M43 48h40M43 59h28" />
            <path d="m94 22 12 12-29 29-15 3 3-15Z" fill="#F8E6AC" />
            <path d="m65 51 12 12m12-36 12 12" />
          </>
        )}
        {variant === "students" && (
          <>
            <path
              d="M27 82V72a13 13 0 0 1 26 0v10m38 0V72a13 13 0 0 1 26 0v10"
              fill="#E5D9FF"
            />
            <circle cx="40" cy="48" r="12" fill="#F0E8FF" />
            <circle cx="104" cy="48" r="12" fill="#F0E8FF" />
            <path d="M49 89V75a23 23 0 0 1 46 0v14Z" fill="#CBB5FA" />
            <circle cx="72" cy="41" r="16" fill="#F0E8FF" />
            <path d="M66 40h.1m12 0h.1m-10 7q4 3 8 0" />
          </>
        )}
        {variant === "usage" && (
          <>
            <path
              d="M37 86V63h16v23m11 0V47h16v39m11 0V30h16v56"
              fill="#E5D9FF"
            />
            <path d="M30 88h84M39 46l23-14 14 5 25-18" />
            <path d="m91 19 10 0-1 10" />
          </>
        )}
      </g>
      <path
        d="m25 24 2.5 6.5L34 33l-6.5 2.5L25 42l-2.5-6.5L16 33l6.5-2.5Z"
        fill="#CBB5FA"
      />
      <path
        d="m119 62 2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2Z"
        fill="#F0CF78"
      />
      <circle cx="111" cy="23" r="2.5" fill="#CBB5FA" />
    </svg>
  );
}
