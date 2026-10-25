"use client";
import { useEffect, useRef, useState } from "react";

const GREETINGS = [
  { before: "What will you ", focus: "create", end: "?" },
  { before: "Ready to ", focus: "build", end: "?" },
  { before: "Let’s try ", focus: "something new", end: "." },
  { before: "What’s your next ", focus: "idea", end: "?" },
  { before: "Let’s make ", focus: "something fun", end: "!" },
];

export function BuilderGreeting({ name }: { name: string }) {
  const [index, setIndex] = useState(0);
  const selected = useRef(false);
  useEffect(() => {
    if (selected.current) return;
    selected.current = true;
    try {
      const key = "dreamforge.home.greeting";
      const saved = sessionStorage.getItem(key);
      const previous = saved === null ? -1 : Number(saved);
      const next =
        Number.isInteger(previous) &&
        previous >= -1 &&
        previous < GREETINGS.length
          ? (previous + 1) % GREETINGS.length
          : 0;
      sessionStorage.setItem(key, String(next));
      setIndex(next);
    } catch {
      setIndex(Math.floor(Math.random() * GREETINGS.length));
    }
  }, []);
  const greeting = GREETINGS[index];
  return (
    <h1>
      {greeting.before}
      <span>{greeting.focus}</span>, {name}
      {greeting.end}
    </h1>
  );
}
