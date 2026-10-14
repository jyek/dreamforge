import Link from "next/link";
export function DreamForgeBrand() {
  return (
    <Link href="/dashboard" className="df-brand" aria-label="DreamForge home">
      <img src="/brand/dreamforge-mark.svg" width="48" height="48" alt="" />
      <span>
        dream<span className="df-purple">forge</span>
        <small>Little ideas. Big possibilities.</small>
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
      aria-label="Playful building blocks with a coding spark"
    >
      <path
        d="M40 281h336"
        stroke="#1A0F2E"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g transform="rotate(-9 115 210)">
        <rect x="44" y="151" width="143" height="120" rx="28" fill="#1A0F2E" />
        <rect
          x="37"
          y="144"
          width="143"
          height="120"
          rx="28"
          fill="#B6F062"
          stroke="#1A0F2E"
          strokeWidth="3"
        />
        <path
          d="m88 181-19 19 19 19m41-38 19 19-19 19"
          stroke="#1A0F2E"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g transform="rotate(10 275 154)">
        <rect x="210" y="94" width="139" height="163" rx="31" fill="#1A0F2E" />
        <rect
          x="203"
          y="87"
          width="139"
          height="163"
          rx="31"
          fill="#A77FFF"
          stroke="#1A0F2E"
          strokeWidth="3"
        />
        <ellipse cx="246" cy="150" rx="8" ry="11" fill="#1A0F2E" />
        <ellipse cx="299" cy="150" rx="8" ry="11" fill="#1A0F2E" />
        <path
          d="M250 187q22 27 44 0"
          stroke="#1A0F2E"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="231" cy="172" r="10" fill="#FF7AC1" />
        <circle cx="314" cy="172" r="10" fill="#FF7AC1" />
      </g>
      <path
        d="m173 25 11 31 32 11-32 11-11 32-11-32-32-11 32-11 11-31Z"
        fill="#FFD23F"
        stroke="#1A0F2E"
        strokeWidth="3"
      />
      <circle
        cx="363"
        cy="56"
        r="19"
        fill="#FF6B2B"
        stroke="#1A0F2E"
        strokeWidth="3"
      />
      <path
        d="M40 95h30m-15-15v30"
        stroke="#1A0F2E"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="m351 290 11 7-11 7"
        stroke="#6B3FF7"
        strokeWidth="4"
        fill="none"
      />
    </svg>
  );
}
