"use client";
import { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
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
          placeholder="Describe a game, app or website you’d love to build…"
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
      {empty && (
        <div className="df-idea-starters" aria-label="Ideas to try">
          {[
            "A game where you catch falling stars",
            "A website about my favourite animal",
            "A quiz to challenge my friends",
          ].map((idea) => (
            <button key={idea} onClick={() => setPrompt(idea)}>
              {idea}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
