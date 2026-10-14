"use client";
import { DreamLoader, DreamLoading } from "@/components/dream-loading";

import Link from "next/link";
import { StudioSidebar } from "@/components/studio-sidebar";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import {
  BUILDER_SECTIONS,
  TEACHER_SECTIONS,
} from "@/components/platform-dashboard-layout";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ProjectItem } from "@/lib/project-types";
import { ProjectRename } from "@/components/assistant-ui/project-rename";
import { VmTerminal } from "@/components/assistant-ui/vm-terminal";
import { ProjectConversationsProvider } from "@/lib/project-conversations-context";
import { ProjectsProvider } from "@/lib/projects-context";
import { ShareDialog } from "@/components/assistant-ui/share-dialog";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FolderIcon,
  SearchIcon,
  CodeIcon,
  MonitorIcon,
  PlusIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { useProjectActivity } from "@/components/assistant-ui/use-project-activity";
import { ProjectCode } from "@/components/assistant-ui/project-code";
import {
  GlobeIcon,
  TerminalIcon,
  Maximize2Icon,
  Minimize2Icon,
  MessageSquareIcon,
  ExternalLinkIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type TerminalTab = {
  id: string;
  label: string;
  /** The named PTY session on the VM this tab is attached to. */
  session: string;
  closable: boolean;
};

/** The session the project's app server runs in. Matches APP_SESSION in lib/vars.ts. */
const APP_SESSION = "dev";

type OptimisticMetadataDetail = {
  projectId: string;
  conversationId: string;
  projectName: string;
  conversationTitle: string;
};

type ThreadStateDetail = {
  projectId: string | null;
  isRunning: boolean;
};

export function ProjectWorkspaceShell({
  projectId,
  children,
  selectedConversationIdOverride,
}: {
  projectId: string | null;
  children: React.ReactNode;
  selectedConversationIdOverride?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedConversationId =
    selectedConversationIdOverride ??
    pathname.split("/").filter(Boolean)[1] ??
    null;

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [threadIsRunning, setThreadIsRunning] = useState(false);
  const hasPublishingProject = projects.some((project) =>
    project.releases.some((release) => release.state === "publishing"),
  );

  const loadProjects = useCallback(async () => {
    const response = await fetch(
      `/api/projects${projectId ? `?projectId=${projectId}` : ""}`,
      { cache: "no-store" },
    );
    if (response.ok) {
      const data = (await response.json()) as { projects?: ProjectItem[] };
      setProjects(data.projects ?? []);
    }
    setProjectsLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!projectId) return;
    loadProjects();
  }, [loadProjects, projectId]);

  useEffect(() => {
    if (!threadIsRunning && !hasPublishingProject) return;
    const interval = window.setInterval(() => {
      void loadProjects();
    }, 10000);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadProjects, threadIsRunning, hasPublishingProject]);

  useEffect(() => {
    const handleProjectsUpdated = () => {
      void loadProjects();
    };

    window.addEventListener("adorable:projects-updated", handleProjectsUpdated);
    return () => {
      window.removeEventListener(
        "adorable:projects-updated",
        handleProjectsUpdated,
      );
    };
  }, [loadProjects]);

  useEffect(() => {
    const handleThreadState = (event: Event) => {
      const customEvent = event as CustomEvent<ThreadStateDetail>;
      const detail = customEvent.detail;
      if (!detail) return;
      if (projectId && detail.projectId && detail.projectId !== projectId)
        return;
      setThreadIsRunning(Boolean(detail.isRunning));
    };

    window.addEventListener(
      "adorable:thread-state",
      handleThreadState as EventListener,
    );
    return () => {
      window.removeEventListener(
        "adorable:thread-state",
        handleThreadState as EventListener,
      );
    };
  }, [projectId]);

  useEffect(() => {
    const handleOptimisticMetadata = (event: Event) => {
      const customEvent = event as CustomEvent<OptimisticMetadataDetail>;
      const detail = customEvent.detail;
      if (!detail?.projectId || !detail?.conversationId) return;

      const now = new Date().toISOString();

      setProjects((previous) =>
        previous.map((project) => {
          if (project.id !== detail.projectId) return project;

          const hasConversation = project.conversations.some(
            (conversation) => conversation.id === detail.conversationId,
          );

          const nextConversations = hasConversation
            ? project.conversations.map((conversation) =>
                conversation.id === detail.conversationId
                  ? {
                      ...conversation,
                      title: detail.conversationTitle,
                      updatedAt: now,
                    }
                  : conversation,
              )
            : [
                {
                  id: detail.conversationId,
                  title: detail.conversationTitle,
                  createdAt: now,
                  updatedAt: now,
                },
                ...project.conversations,
              ];

          return {
            ...project,
            name:
              project.name === "Untitled Project"
                ? detail.projectName
                : project.name,
            conversations: nextConversations,
          };
        }),
      );
    };

    window.addEventListener(
      "adorable:metadata-optimistic",
      handleOptimisticMetadata as EventListener,
    );
    return () => {
      window.removeEventListener(
        "adorable:metadata-optimistic",
        handleOptimisticMetadata as EventListener,
      );
    };
  }, []);

  const handleSelectProject = useCallback(
    (nextProjectId: string) => {
      router.push(`/${nextProjectId}`);
    },
    [router],
  );

  const selectedProject = projectId
    ? (projects.find((project) => project.id === projectId) ?? null)
    : null;
  const showWorkspacePanel = Boolean(projectId);
  const isMobile = useIsMobile();
  const [chatHidden, setChatHidden] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profile, setProfile] = useState<{
    display_name: string;
    role: "teacher" | "child";
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/platform/auth", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setProfile(d.user || null))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [projectSearch, setProjectSearch] = useState("");
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const onProjectRenamed = useCallback((id: string, name: string) => {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === id ? { ...project, name } : project,
      ),
    );
    window.dispatchEvent(new Event("adorable:projects-updated"));
  }, []);
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);
  const [chatPercent, setChatPercent] = useState(29);
  const [resizing, setResizing] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("adorable:chat-width"));
      if (saved >= 20 && saved <= 65) setChatPercent(saved);
    } catch {}
  }, []);
  const resizeChat = useCallback((width: number) => {
    const available = gridRef.current?.clientWidth;
    if (!available) return;
    const clamped = Math.max(240, Math.min(width, available - 240));
    const percent = (clamped / available) * 100;
    setChatPercent(percent);
    try {
      localStorage.setItem("adorable:chat-width", String(percent));
    } catch {}
  }, []);

  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");

  // Reset to chat view when navigating away
  useEffect(() => {
    if (!projectId) setMobileView("chat");
  }, [projectId]);

  // On mobile, compute which panel to show
  const gridColumns = (() => {
    if (!showWorkspacePanel) return "1fr 0fr";
    if (isMobile) return mobileView === "chat" ? "1fr 0fr" : "0fr 1fr";
    return chatHidden
      ? "0px minmax(0, 1fr)"
      : `minmax(240px, ${chatPercent}%) minmax(0, 1fr)`;
  })();

  const conversationsContextValue = useMemo(
    () => ({
      projectId,
      conversations: selectedProject?.conversations ?? [],
      onSelectConversation: (conversationId: string) => {
        if (projectId) {
          router.push(`/${projectId}/${conversationId}`);
        }
      },
    }),
    [projectId, selectedProject?.conversations, router],
  );

  const projectsContextValue = useMemo(
    () => ({
      projects,
      isLoading: projectsLoading,
      onSelectProject: handleSelectProject,
    }),
    [projects, projectsLoading, handleSelectProject],
  );

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const workspaceSidebar = (
    <StudioSidebar
      hideCollapseControl
      label="Project sidebar"
      name={profile?.display_name}
      role={profile?.role}
      className="df-workspace-sidebar"
      navigation={
        <nav className="df-studio-nav" aria-label="Workspace navigation">
          {(profile?.role === "teacher"
            ? TEACHER_SECTIONS
            : BUILDER_SECTIONS
          ).map((section) => (
            <Link
              key={section.id}
              href={`/${section.id}`}
              aria-label={section.label}
              title={section.label}
              aria-current={
                section.id ===
                (profile?.role === "teacher" ? "projects" : "home")
                  ? "page"
                  : undefined
              }
              onClick={() => setSidebarOpen(false)}
            >
              <section.icon size={20} aria-hidden="true" />
              <span>{section.label}</span>
            </Link>
          ))}
        </nav>
      }
    >
      <div className="df-workspace-projects">
        {profile?.role === "child" && <CreateProjectDialog />}
        <h2 className="df-sidebar-caption">YOUR PROJECTS</h2>
        <label className="df-project-search">
          <SearchIcon size={16} aria-hidden="true" />
          <input
            aria-label="Search projects"
            placeholder="Find a project…"
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
          />
        </label>
        <nav
          className="df-studio-nav df-recent-projects"
          aria-label="Recent projects"
        >
          {projects
            .filter((project) =>
              project.name.toLowerCase().includes(projectSearch.toLowerCase()),
            )
            .map((project) => (
              <button
                key={project.id}
                aria-current={project.id === projectId ? "page" : undefined}
                title={project.name}
                onClick={() => {
                  if (isMobile) setSidebarOpen(false);
                  handleSelectProject(project.id);
                }}
              >
                <FolderIcon size={17} aria-hidden="true" />
                <span>{project.name}</span>
              </button>
            ))}
          {projectsLoading && <DreamLoading inline label="Loading projects…" />}
          {!projectsLoading &&
            !projects.filter((p) =>
              p.name.toLowerCase().includes(projectSearch.toLowerCase()),
            ).length && <p className="df-muted">No matching projects.</p>}
        </nav>
      </div>
    </StudioSidebar>
  );

  return (
    <ProjectsProvider value={projectsContextValue}>
      <ProjectConversationsProvider value={conversationsContextValue}>
        <div className="df-workspace-frame">
          {projectId &&
            !isMobile &&
            sidebarOpen &&
            !chatHidden &&
            workspaceSidebar}
          <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {projectId && (
              <header
                aria-label="Project toolbar"
                className="df-workspace-toolbar flex h-12 shrink-0 flex-nowrap items-center gap-2 px-2"
              >
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="df-sidebar-collapse df-project-sidebar-toggle"
                    data-collapsed={!sidebarOpen || chatHidden}
                    aria-label={
                      sidebarOpen && !chatHidden
                        ? "Collapse sidebar"
                        : "Expand sidebar"
                    }
                    title={
                      sidebarOpen && !chatHidden
                        ? "Collapse sidebar"
                        : "Expand sidebar"
                    }
                    aria-expanded={sidebarOpen && !chatHidden}
                    onClick={() => {
                      if (chatHidden) {
                        setChatHidden(false);
                        setSidebarOpen(true);
                      } else setSidebarOpen((open) => !open);
                    }}
                  >
                    <img
                      className="df-sidebar-mark-default"
                      src="/brand/dreamforge-mark.svg"
                      width="30"
                      height="30"
                      alt=""
                      aria-hidden="true"
                    />
                    <img
                      className="df-sidebar-mark-action"
                      src="/brand/dreamforge-mark-inverse.svg"
                      width="30"
                      height="30"
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                  {selectedProject &&
                    (selectedProject.readOnly ? (
                      <span className="hidden max-w-40 truncate text-sm font-semibold lg:block">
                        {selectedProject.name}
                      </span>
                    ) : (
                      <ProjectRename
                        projectId={selectedProject.id}
                        name={selectedProject.name}
                        onRenamed={onProjectRenamed}
                        className="group hidden max-w-40 items-center gap-1 rounded-lg px-1 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200 lg:flex"
                      >
                        <span className="truncate">{selectedProject.name}</span>
                      </ProjectRename>
                    ))}
                  {!isMobile && (
                    <button
                      aria-label={
                        chatHidden ? "Exit full preview" : "Full preview"
                      }
                      title={chatHidden ? "Exit full preview" : "Full preview"}
                      aria-pressed={chatHidden}
                      onClick={() => {
                        setChatHidden((value) => !value);
                      }}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
                    >
                      {chatHidden ? (
                        <Minimize2Icon className="size-4" />
                      ) : (
                        <Maximize2Icon className="size-4" />
                      )}
                    </button>
                  )}
                  {isMobile && (
                    <button
                      aria-label={
                        mobileView === "chat" ? "Show preview" : "Show chat"
                      }
                      title={
                        mobileView === "chat" ? "Show preview" : "Show chat"
                      }
                      onClick={() =>
                        setMobileView((value) =>
                          value === "chat" ? "preview" : "chat",
                        )
                      }
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
                    >
                      {mobileView === "chat" ? (
                        <MonitorIcon className="size-4" />
                      ) : (
                        <MessageSquareIcon className="size-4" />
                      )}
                    </button>
                  )}
                </div>
                <div
                  ref={setToolbarHost}
                  className="flex min-w-0 flex-1 items-center gap-2"
                />
              </header>
            )}
            <div className="relative flex min-h-0 flex-1">
              {projectId && isMobile && (
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                  <SheetContent
                    side="left"
                    className="df-workspace-sheet w-72 gap-0 sm:max-w-72"
                  >
                    <SheetHeader className="sr-only">
                      <SheetTitle>DreamForge navigation</SheetTitle>
                      <SheetDescription>
                        Your studio and projects
                      </SheetDescription>
                    </SheetHeader>
                    {workspaceSidebar}
                  </SheetContent>
                </Sheet>
              )}

              {/* Main content grid */}
              <div
                ref={gridRef}
                className={cn(
                  "relative grid min-h-0 min-w-0 flex-1 bg-[#f7f7f8]",
                  !isMobile &&
                    !resizing &&
                    "transition-[grid-template-columns] duration-500 ease-in-out",
                )}
                style={
                  isMobile ? undefined : { gridTemplateColumns: gridColumns }
                }
              >
                <div
                  className={cn(
                    "studio-chat relative min-w-0 overflow-hidden bg-[#f7f7f8]",

                    !isMobile && chatHidden && "invisible",
                    isMobile && mobileView === "preview" && "hidden",
                  )}
                >
                  {children}
                </div>

                {showWorkspacePanel && !isMobile && !chatHidden && (
                  <div
                    role="separator"
                    aria-label="Resize chat panel"
                    aria-orientation="vertical"
                    aria-valuemin={20}
                    aria-valuemax={65}
                    aria-valuenow={Math.round(chatPercent)}
                    tabIndex={0}
                    className="absolute inset-y-0 z-30 w-2 -translate-x-1 cursor-col-resize touch-none outline-none hover:bg-blue-400/30 focus-visible:bg-blue-400/30"
                    style={{ left: `${chatPercent}%` }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      resizeStart.current = {
                        x: event.clientX,
                        width:
                          ((gridRef.current?.clientWidth || 0) * chatPercent) /
                          100,
                      };
                      setResizing(true);
                    }}
                    onPointerMove={(event) => {
                      const start = resizeStart.current;
                      if (start)
                        resizeChat(start.width + event.clientX - start.x);
                    }}
                    onPointerUp={(event) => {
                      resizeStart.current = null;
                      setResizing(false);
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }}
                    onLostPointerCapture={() => {
                      resizeStart.current = null;
                      setResizing(false);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "ArrowLeft" &&
                        event.key !== "ArrowRight"
                      )
                        return;
                      event.preventDefault();
                      resizeChat(
                        ((gridRef.current?.clientWidth || 0) * chatPercent) /
                          100 +
                          (event.key === "ArrowRight" ? 20 : -20),
                      );
                    }}
                  />
                )}
                <div
                  className={cn(
                    "df-workspace-panel min-h-0 min-w-0 overflow-hidden",

                    !isMobile && "transition-opacity duration-500",
                    showWorkspacePanel &&
                      (!isMobile || mobileView === "preview")
                      ? "opacity-100"
                      : !isMobile && "pointer-events-none opacity-0",
                    isMobile && mobileView === "chat" && "hidden",
                  )}
                >
                  {showWorkspacePanel &&
                    (selectedProject?.previewUrl ? (
                      <AppPreview
                        toolbarHost={toolbarHost}
                        key={selectedProject.id}
                        project={selectedProject}
                        iframeRef={iframeRef}
                        running={threadIsRunning}
                      />
                    ) : (
                      <PreviewPlaceholder />
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ProjectConversationsProvider>
    </ProjectsProvider>
  );
}

function PreviewPlaceholder() {
  return (
    <DreamLoading label="Opening your workspace…" className="h-full bg-white" />
  );
}

function AppPreview({
  toolbarHost,
  project,
  iframeRef,
  running,
}: {
  toolbarHost: HTMLDivElement | null;
  running: boolean;
  project: ProjectItem;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const [view, setView] = useState<"preview" | "code" | "terminal">("preview");
  useEffect(() => {
    const handleView = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; view: string }>)
        .detail;
      if (
        detail?.projectId === project.id &&
        (detail.view === "code" ||
          detail.view === "terminal" ||
          detail.view === "preview")
      )
        setView(detail.view);
    };
    window.addEventListener("adorable:workspace-view", handleView);
    return () =>
      window.removeEventListener("adorable:workspace-view", handleView);
  }, [project.id]);

  const activity = useProjectActivity(
    project.id,
    project.previewUrl,
    iframeRef,
    running,
  );
  useEffect(() => {
    if (!activity.ready) {
      setIframeLoaded(false);
      setView("preview");
    }
  }, [activity.ready, activity.generation]);
  const [extraTerminals, setExtraTerminals] = useState<TerminalTab[]>([]);
  const [activeTab, setActiveTab] = useState("dev-server");
  const [counter, setCounter] = useState(1);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    setIframeLoaded(false);
  }, [project.previewUrl]);

  /**
   * Terminal sessions are named on the VM, so a tab's name is all the state a
   * new terminal needs: the guest creates the shell on first connect and keeps
   * it alive afterwards.
   */
  const addTerminal = useCallback(() => {
    const id = `terminal-${counter}`;
    setExtraTerminals((previous) => [
      ...previous,
      {
        id,
        label: `Terminal ${counter}`,
        session: `shell-${counter}`,
        closable: true,
      },
    ]);
    setActiveTab(id);
    setCounter((current) => current + 1);
  }, [counter]);

  const closeTerminal = useCallback(
    (id: string) => {
      setExtraTerminals((previous) => previous.filter((tab) => tab.id !== id));
      if (activeTab === id) setActiveTab("dev-server");
    },
    [activeTab],
  );

  const allTabs: TerminalTab[] = [
    {
      id: "dev-server",
      label: "Dev Server",
      session: APP_SESSION,
      closable: false,
    },
    ...extraTerminals,
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {toolbarHost &&
        createPortal(
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Workspace view"
              className="flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-100/80 p-0.5"
            >
              {(
                [
                  { id: "preview", label: "Preview", Icon: GlobeIcon },
                  { id: "code", label: "Code", Icon: CodeIcon },
                  { id: "terminal", label: "Terminal", Icon: TerminalIcon },
                ] as const
              )
                .filter(({ id }) => !project.readOnly || id !== "terminal")
                .map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    disabled={!activity.ready && id !== "preview"}
                    role="tab"
                    aria-selected={view === id}
                    aria-controls={`workspace-${id}`}
                    title={label}
                    onClick={() => setView(id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
                      view === id
                        ? "bg-white text-blue-600 shadow-sm ring-1 ring-blue-200"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sr-only sm:hidden">{label}</span>
                  </button>
                ))}
            </div>
            {view === "preview" ? (
              <BrowserControls
                previewUrl={project.previewUrl}
                iframeRef={iframeRef}
                project={project}
              />
            ) : (
              <>
                <span className="flex-1" />
                {!project.readOnly && <ShareDialog project={project} />}
              </>
            )}
          </div>,
          toolbarHost,
        )}
      <div
        id="workspace-preview"
        role="tabpanel"
        aria-label="Preview"
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white",
          view !== "preview" && "hidden",
        )}
      >
        <div className="relative min-h-0 flex-1 bg-muted/30">
          {(activity.starting || (activity.ready && !iframeLoaded)) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col items-center gap-3 px-6 text-center"
              >
                <DreamLoader size={64} />
                <p className="text-sm font-medium text-slate-600">
                  {activity.starting
                    ? "Waking up your project…"
                    : "Loading preview…"}
                </p>
                {activity.starting && (
                  <p className="text-xs text-slate-400">
                    Your preview will open automatically when it is ready.
                  </p>
                )}
              </div>
            </div>
          )}
          {activity.idle ? (
            <div className="flex h-full items-center justify-center bg-white">
              <div className="text-center">
                <p className="mb-3 text-sm text-slate-500">
                  Project resting after 5 minutes without activity.
                </p>
                <button
                  onClick={() => void activity.resume()}
                  className="rounded-full bg-blue-600 px-5 py-2 text-sm text-white"
                >
                  Resume project
                </button>
                {activity.error && (
                  <p role="alert" className="mt-3 text-sm text-red-700">
                    {activity.error}
                  </p>
                )}
              </div>
            </div>
          ) : activity.error ? (
            <div
              role="alert"
              className="flex h-full items-center justify-center bg-white px-6"
            >
              <div className="max-w-sm text-center">
                <p className="mb-2 text-sm font-medium text-slate-700">
                  VM could not start
                </p>
                <p className="mb-4 text-sm text-slate-500">{activity.error}</p>
                <button
                  onClick={() => void activity.resume()}
                  className="rounded-full bg-blue-600 px-5 py-2 text-sm text-white"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : activity.ready ? (
            <iframe
              key={activity.generation}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              ref={iframeRef}
              src={project.previewUrl}
              className={cn(
                "h-full w-full transition-opacity duration-300",
                iframeLoaded ? "opacity-100" : "opacity-0",
              )}
              onLoad={() => setIframeLoaded(true)}
            />
          ) : null}
        </div>
      </div>

      {view === "code" && (
        <div
          id="workspace-code"
          role="tabpanel"
          aria-label="Code"
          className="min-h-0 flex-1 overflow-hidden bg-white"
        >
          <ProjectCode projectId={project.id} />
        </div>
      )}
      {view === "terminal" && !activity.idle && (
        <div
          id="workspace-terminal"
          role="tabpanel"
          aria-label="Terminal"
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
        >
          <div className="flex shrink-0 items-center gap-0 border-y bg-slate-100 px-1">
            {allTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group flex items-center gap-1 px-2 py-1.5 text-xs transition-colors ${
                  activeTab === tab.id
                    ? "border-b-2 border-foreground bg-slate-100 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{tab.label}</span>
                {tab.closable && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTerminal(tab.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        closeTerminal(tab.id);
                      }
                    }}
                    className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  >
                    <XIcon className="size-3" />
                  </span>
                )}
              </button>
            ))}

            <button
              type="button"
              onClick={addTerminal}
              className="ml-1 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="New terminal"
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1 bg-white">
            {allTabs.map((tab) => (
              <VmTerminal
                key={tab.id}
                projectId={project.id}
                session={tab.session}
                className="absolute inset-0 h-full w-full p-1"
                // Kept mounted so a background terminal keeps receiving output.
                style={{ display: activeTab === tab.id ? "block" : "none" }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BrowserControls({
  previewUrl,
  iframeRef,
  project,
}: {
  previewUrl: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  project: ProjectItem;
}) {
  const [urlValue, setUrlValue] = useState(() => {
    try {
      return new URL(previewUrl).pathname;
    } catch {
      return "/";
    }
  });

  useEffect(() => {
    try {
      setUrlValue(new URL(previewUrl).pathname);
    } catch {
      setUrlValue("/");
    }
  }, [previewUrl]);

  const previewPathUrl = (path: string) => {
    const url = new URL(previewUrl);
    const requested = new URL(
      path.startsWith("/") ? path : `/${path}`,
      url.origin,
    );
    url.pathname = requested.pathname;
    for (const [key, value] of requested.searchParams)
      url.searchParams.set(key, value);
    return url.toString();
  };

  const navigate = (path: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    setUrlValue(normalizedPath);
    iframe.src = previewPathUrl(normalizedPath);
  };

  const handleReload = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.src = iframe.src;
  };

  const handleBack = () => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {}
  };

  const handleForward = () => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {}
  };

  return (
    <>
      <button
        type="button"
        onClick={handleBack}
        className="hidden size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        title="Back"
      >
        <ArrowLeftIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={handleForward}
        className="hidden size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        title="Forward"
      >
        <ArrowRightIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={handleReload}
        className="hidden size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        title="Reload"
      >
        <RotateCwIcon className="size-3.5" />
      </button>
      <form
        className="ml-1 min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(urlValue);
        }}
      >
        <input
          type="text"
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          className="h-8 w-full rounded-full border border-slate-200 bg-white px-3 text-left text-xs text-slate-600 outline-none focus:ring-1 focus:ring-blue-200"
          aria-label="URL path"
        />
      </form>
      <a
        href={previewPathUrl(urlValue)}
        target="_blank"
        rel="noreferrer"
        title="Open preview in new tab"
        className="hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-200 sm:block"
      >
        <ExternalLinkIcon className="size-4" />
      </a>
      <div className="ml-1.5 shrink-0">
        {!project.readOnly && <ShareDialog project={project} />}
      </div>
    </>
  );
}
