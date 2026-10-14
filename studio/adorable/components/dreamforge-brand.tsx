import Link from "next/link";
export function DreamForgeBrand() {
  return (
    <Link href="/dashboard" className="df-brand" aria-label="DreamForge home">
      <img src="/brand/dreamforge-mark.svg" width="48" height="48" alt="" />
      <span>
        dream<span className="df-purple">forge</span>
      </span>
    </Link>
  );
}
export function DreamForgeArt() {
  return (
    <svg
      className="df-art"
      viewBox="0 0 420 330"
      role="img"
      aria-label="A coding window turning an idea into a new creation"
    >
      <path
        d="M34 270c-35-125 65-242 197-223s220 142 131 217"
        fill="none"
        stroke="#1A0F2E"
        strokeWidth="2"
        strokeDasharray="6 8"
      />
      <g transform="rotate(-5 215 177)">
        <rect x="69" y="73" width="287" height="214" rx="18" fill="#1A0F2E" />
        <rect
          x="61"
          y="65"
          width="287"
          height="214"
          rx="18"
          fill="#FFF6E6"
          stroke="#1A0F2E"
          strokeWidth="3"
        />
        <path d="M61 109h287" stroke="#1A0F2E" strokeWidth="3" />
        <circle cx="82" cy="87" r="5" fill="#FF6B2B" />
        <circle cx="99" cy="87" r="5" fill="#FFD23F" />
        <circle cx="116" cy="87" r="5" fill="#B6F062" />
        <rect x="234" y="79" width="92" height="16" rx="8" fill="#6B3FF7" />
        <rect
          x="83"
          y="130"
          width="146"
          height="123"
          rx="10"
          fill="#6B3FF7"
          stroke="#1A0F2E"
          strokeWidth="2"
        />
        <path
          d="m123 169-22 22 22 22m63-44 22 22-22 22m-22-51-14 58"
          stroke="#FFF6E6"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M250 145h73m-73 19h55m-55 19h65"
          stroke="#1A0F2E"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <rect
          x="247"
          y="206"
          width="77"
          height="33"
          rx="9"
          fill="#B6F062"
          stroke="#1A0F2E"
          strokeWidth="2"
        />
        <path
          d="M268 222h34m-9-7 9 7-9 7"
          stroke="#1A0F2E"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g transform="rotate(9 324 56)">
        <path
          d="m282 49 101-30-42 92-19-41-40-21Z"
          fill="#FFD23F"
          stroke="#1A0F2E"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="m322 70 61-51" stroke="#1A0F2E" strokeWidth="3" />
      </g>
      <path
        d="m51 199 8 20 21 8-21 8-8 20-8-20-21-8 21-8 8-20Z"
        fill="#FF6B2B"
        stroke="#1A0F2E"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="m178 23 5 12 13 5-13 5-5 12-5-12-13-5 13-5 5-12Z"
        fill="#B6F062"
        stroke="#1A0F2E"
        strokeWidth="2"
      />
      <path
        d="m369 222 12 5m-8-25 10-4M96 40l-8-11"
        stroke="#1A0F2E"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function DreamForgeProjectArt({ variant = 0 }: { variant?: number }) {
  const fills = ["#B6F062", "#FFD23F", "#FF6B2B"];
  return (
    <div className="df-project-art" aria-hidden="true">
      <svg viewBox="0 0 280 128" fill="none">
        <circle
          cx="210"
          cy="58"
          r="42"
          stroke="#1A0F2E"
          strokeWidth="1.5"
          strokeDasharray="4 6"
        />
        <path d="M32 99h214" stroke="#1A0F2E" strokeWidth="2" />
        <g transform={`rotate(${variant % 2 ? 5 : -5} 139 64)`}>
          <rect x="80" y="22" width="127" height="85" rx="9" fill="#1A0F2E" />
          <rect
            x="75"
            y="17"
            width="127"
            height="85"
            rx="9"
            fill="#FFF6E6"
            stroke="#1A0F2E"
            strokeWidth="2"
          />
          <path d="M75 36h127" stroke="#1A0F2E" strokeWidth="2" />
          <path
            d="M87 26h16"
            stroke="#6B3FF7"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <rect
            x="88"
            y="47"
            width="47"
            height="42"
            rx="6"
            fill={fills[variant % 3]}
            stroke="#1A0F2E"
            strokeWidth="2"
          />
          <path
            d="m106 59-8 8 8 8m10-16 8 8-8 8"
            stroke="#1A0F2E"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M148 55h38m-38 13h29m-29 13h34"
            stroke="#6B3FF7"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
        <path
          d="m54 31 5 13 13 5-13 5-5 13-5-13-13-5 13-5 5-13Z"
          fill={fills[variant % 3]}
          stroke="#1A0F2E"
          strokeWidth="2"
        />
        <path
          d="m222 82 5 5-5 5"
          stroke="#1A0F2E"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
