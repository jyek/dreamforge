import type { CSSProperties } from "react";
const colors = [
  "#a98aff",
  "#b8ed78",
  "#ffca72",
  "#ff9caa",
  "#86d9e5",
  "#a7b9ff",
  "#e6a2e8",
  "#ffd961",
];
const shapes = [
  "M13 38C8 27 17 15 29 18C35 8 49 14 49 24C61 24 61 40 51 43C45 56 22 57 13 38Z",
  "M15 44V25Q15 17 23 17H43Q51 17 51 25V44Q51 51 43 51H23Q15 51 15 44Z",
  "M14 43L16 16L27 23Q33 20 39 23L50 16L52 43Q49 53 33 53Q18 53 14 43Z",
  "M33 13L39 24L52 26L43 36L45 50L33 44L21 50L23 36L14 26L27 24Z",
  "M15 37Q15 22 24 22V13Q25 7 29 14L32 23H35L40 12Q44 7 45 14L42 25Q52 28 51 40Q49 53 33 53Q16 52 15 37Z",
  "M14 39Q9 32 17 26Q16 17 26 18Q32 9 39 18Q51 15 51 27Q62 32 54 40Q51 52 34 52Q18 52 14 39Z",
  "M16 44Q14 26 25 23Q25 14 33 12Q41 15 41 23Q51 25 51 40Q52 53 33 53Q20 53 16 44Z",
  "M13 39Q14 25 27 25L39 17Q41 25 47 28Q54 32 51 44Q44 56 28 51Q17 51 13 39Z",
];
function hash(value: string) {
  let h = 2166136261;
  for (const c of value) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}
/** Identity-derived artwork stays consistent across classrooms and page loads. */
export function ClassroomAvatar({
  identity,
  role = "student",
}: {
  identity: string;
  role?: "student" | "teacher";
}) {
  const seed = hash(identity),
    body = colors[seed % colors.length],
    accent = colors[(seed >>> 8) % colors.length],
    shape = (seed >>> 4) % shapes.length;
  const style = {
    "--df-avatar-delay": `${-(seed % 6000)}ms`,
    "--df-avatar-duration": `${5 + (seed % 4)}s`,
  } as CSSProperties;
  return (
    <svg
      className="df-classroom-avatar"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <circle cx="32" cy="32" r="30" fill="#f7f3ff" />
      <ellipse cx="33" cy="55" rx="14" ry="2" fill="#25183e" opacity=".08" />
      <g
        className="df-avatar-body"
        stroke="#25183e"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {shape === 1 && <path d="M33 17V12" />}
        {shape === 1 && <circle cx="33" cy="10" r="3" fill={accent} />}
        <path d={shapes[shape]} fill={body} />
        {shape === 6 && (
          <path d="M32 22Q20 22 22 14Q31 13 32 22Z" fill={accent} />
        )}
        {shape === 7 && (
          <path d="M18 38Q16 46 26 45" stroke="#fff" opacity=".6" />
        )}
        <ellipse
          cx="24"
          cy="39"
          rx="3.5"
          ry="2"
          fill="#fff"
          stroke="none"
          opacity=".5"
        />
        <ellipse
          cx="43"
          cy="39"
          rx="3.5"
          ry="2"
          fill="#fff"
          stroke="none"
          opacity=".5"
        />
        <g className="df-avatar-eyes" fill="#25183e" stroke="none">
          <ellipse cx="26" cy="32" rx="2" ry="2.8" />
          <ellipse cx="40" cy="32" rx="2" ry="2.8" />
        </g>
        {seed % 3 === 0 ? (
          <path d="M29 40Q33 44 37 40" />
        ) : seed % 3 === 1 ? (
          <path d="M30 40Q33 43 36 40" />
        ) : (
          <path d="M29 39Q33 46 37 39Z" fill="#fff" />
        )}
        {seed % 2 === 0 && (
          <path d="M18 29L21 28" stroke={accent} strokeWidth="3" />
        )}
      </g>
      {role === "teacher" && (
        <g className="df-avatar-teacher-badge">
          <circle
            cx="51"
            cy="13"
            r="9"
            fill="#6b3ff7"
            stroke="#fff"
            strokeWidth="2"
          />
          <path
            d="M51 7L52.5 11.5L57 13L52.5 14.5L51 19L49.5 14.5L45 13L49.5 11.5Z"
            fill="#ffdd62"
          />
        </g>
      )}
    </svg>
  );
}
