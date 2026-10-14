"use client";

import { DreamLoading } from "@/components/dream-loading";
import { cn } from "@/lib/utils";
import { useProjects } from "@/lib/projects-context";
import { type FC } from "react";

export const HomeWelcome: FC = () => {
  const { projects, isLoading, onSelectProject } = useProjects();
  const hasProjects = projects.length > 0;
  const showProjects = isLoading || hasProjects;

  return (
    <div className="aui-thread-welcome-root mx-auto flex w-full max-w-(--thread-max-width) grow flex-col items-center justify-center">
      <div className="flex w-full flex-col gap-8 px-2">
        {/* Hero */}
        <div className="flex animate-in flex-col items-center gap-2 pt-8 text-center duration-500 fill-mode-both fade-in">
          <svg
            viewBox="0 0 347 280"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-2 h-10 w-auto"
          >
            <path
              d="M70 267V235.793C37.4932 229.296 13 200.594 13 166.177C13 134.93 33.1885 108.399 61.2324 98.9148C61.9277 51.3467 100.705 13 148.438 13C183.979 13 214.554 34.2582 228.143 64.7527C234.182 63.4301 240.454 62.733 246.89 62.733C295.058 62.733 334.105 101.781 334.105 149.949C334.105 182.845 315.893 211.488 289 226.343V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
            <path
              d="M146 237V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
            <path
              d="M215 237V267"
              className="stroke-foreground/15"
              strokeWidth="25"
              strokeLinecap="round"
            />
          </svg>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            What do you want to build?
          </h1>
          <p className="text-sm text-muted-foreground/60">
            Describe an app or pick up where you left off
          </p>
        </div>

        {/* Project cards with previews */}
        <div
          className={cn(
            "flex w-full flex-col gap-3 transition-opacity duration-500",
            showProjects ? "opacity-100" : "opacity-0",
          )}
        >
          {isLoading ? (
            <DreamLoading label="Loading your projects…" />
          ) : hasProjects ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {projects.map((project, index) => {
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => onSelectProject(project.id)}
                      className="group animate-in overflow-hidden rounded-xl border border-border/50 bg-card/50 text-left transition-all duration-200 fill-mode-both fade-in hover:border-border hover:ring-1 hover:ring-ring/20"
                      style={
                        {
                          "--tw-animation-delay": `${index * 75}ms`,
                          "--tw-animation-duration": "400ms",
                        } as React.CSSProperties
                      }
                    >
                      {/* Preview thumbnail */}
                      <div className="relative aspect-16/10 w-full overflow-hidden bg-muted/30">
                        <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 to-violet-50">
                          <span className="text-3xl">✦</span>
                          <span className="text-xs text-slate-500">
                            Open project to preview
                          </span>
                        </div>
                        {/* Status dot */}
                        <div className="absolute top-2 right-2">
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full ring-2 ring-card/80",
                              project.liveReleaseId
                                ? "bg-emerald-500"
                                : project.releases.some(
                                      (release) =>
                                        release.state === "publishing",
                                    )
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground/30",
                            )}
                          />
                        </div>
                      </div>
                      {/* Info */}
                      <div className="px-3 py-2.5">
                        <p className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
                          {project.name}
                        </p>
                        {project.releases.length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground/50">
                            {project.releases.length} release
                            {project.releases.length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
