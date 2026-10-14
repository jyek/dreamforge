"use client";
import { useState } from "react";
import { ArrowUp, Sparkles, Gamepad2, PawPrint, Brain } from "lucide-react";
import { CreateProjectDialog } from "./create-project-dialog";
export function BuilderHomePrompt({ empty }: { empty: boolean }) {
  const [prompt, setPrompt] = useState("");
  return (
    <section
      className="df-home-prompt"
      aria-label="Start a project with an idea"
    >
      <div className="df-prompt-box">
        <label htmlFor="new-project-idea" className="sr-only">
          What would you like to build?
        </label>
        <textarea
          id="new-project-idea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={32000}
          placeholder="What if I made a game where… Tell us your idea!"
          rows={4}
        />
        <div className="df-prompt-actions">
          <span>
            <Sparkles size={16} aria-hidden="true" />
            Start with your imagination
          </span>
          <CreateProjectDialog
            initialPrompt={prompt}
            trigger={
              <button className="df-button" disabled={!prompt.trim()}>
                Start building <ArrowUp size={17} aria-hidden="true" />
              </button>
            }
          />
        </div>
      </div>
      <div className="df-idea-starters" aria-label="Ideas to try">
        <p>
          {empty ? "Try a little spark to get started" : "Need a little spark?"}
        </p>
        <div className="df-idea-starter-options">
          {[
            {
              title: "Make a game",
              idea: "A game where you catch falling stars",
              icon: Gamepad2,
            },
            {
              title: "My animal world",
              idea: "A website about my favourite animal",
              icon: PawPrint,
            },
            {
              title: "Challenge my friends",
              idea: "A quiz to challenge my friends",
              icon: Brain,
            },
          ].map(({ title, idea, icon: Icon }) => (
            <button
              key={title}
              type="button"
              onClick={() => {
                setPrompt(idea);
                document.getElementById("new-project-idea")?.focus();
              }}
            >
              <Icon size={18} aria-hidden="true" />
              {title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
