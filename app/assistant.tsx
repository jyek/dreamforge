"use client";

import { HELD_PROMPT_MESSAGE } from "@/lib/prompt-hold";
import { AssistantRuntimeProvider, useAuiState } from "@assistant-ui/react";
import {
  useAISDKRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import { useModelSettings } from "@/components/assistant-ui/model-settings";
import { ProjectRevisionSync } from "@/components/project-revision-sync";
import { Thread } from "@/components/assistant-ui/thread";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type ThreadState = {
  isEmpty: boolean;
  isRunning: boolean;
};

type CreateFromGithubDetail = {
  githubRepoName: string;
};

const EMPTY_MESSAGES: UIMessage[] = [];

const extractUserPrompt = (messages: UIMessage[]): string | null => {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return null;

  const textPart = firstUserMessage.parts?.find((part) => part.type === "text");
  if (!textPart || !("text" in textPart)) return null;

  const clean = textPart.text.trim().replace(/\s+/g, " ");
  return clean || null;
};

export const Assistant = ({
  initialMessages,
  selectedProjectId = null,
  selectedConversationId = null,
  onThreadStateChange,
  onActiveConversationChange,
  welcome,
  readOnly = false,
}: {
  initialMessages?: UIMessage[];
  selectedProjectId?: string | null;
  selectedConversationId?: string | null;
  onThreadStateChange?: (next: ThreadState) => void;
  onActiveConversationChange?: (
    projectId: string,
    conversationId: string,
  ) => void;
  welcome?: ReactNode;
  readOnly?: boolean;
}) => {
  const revisionRef = useRef<{ project: string; revision: number } | null>(
    null,
  );
  const rememberRevision = useCallback((project: string, revision: number) => {
    revisionRef.current = { project, revision };
  }, []);
  const [progress, setProgress] = useState("");
  const { choice: modelChoice, ready: modelReady } = useModelSettings();
  const modelChoiceRef = useRef(modelChoice);
  modelChoiceRef.current = modelChoice;
  const resolvedInitialMessages = initialMessages ?? EMPTY_MESSAGES;

  const [seedMessages, setSeedMessages] = useState<UIMessage[]>(
    resolvedInitialMessages,
  );
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [localProjectId, setLocalProjectId] = useState<string | null>(
    selectedProjectId,
  );
  const [localConversationId, setLocalConversationId] = useState<string | null>(
    selectedConversationId,
  );
  const activeProjectIdRef = useRef<string | null>(selectedProjectId);
  const activeConversationIdRef = useRef<string | null>(selectedConversationId);
  const onActiveConversationChangeRef = useRef(onActiveConversationChange);
  const chatSessionIdRef = useRef(
    selectedConversationId
      ? `conversation:${selectedConversationId}`
      : selectedProjectId
        ? `project:${selectedProjectId}:draft`
        : "home:draft",
  );

  useEffect(() => {
    setSeedMessages(resolvedInitialMessages);
  }, [resolvedInitialMessages]);

  useEffect(() => {
    setLocalProjectId((previous) => selectedProjectId ?? previous);
    setLocalConversationId((previous) => selectedConversationId ?? previous);
  }, [selectedConversationId, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      activeProjectIdRef.current = selectedProjectId;
    }
    if (selectedConversationId) {
      activeConversationIdRef.current = selectedConversationId;
    }
  }, [selectedConversationId, selectedProjectId]);

  useEffect(() => {
    onActiveConversationChangeRef.current = onActiveConversationChange;
  }, [onActiveConversationChange]);

  useEffect(() => {
    const handleGoHome = () => {
      setSeedMessages(EMPTY_MESSAGES);
      setLocalProjectId(null);
      setLocalConversationId(null);
      activeProjectIdRef.current = null;
      activeConversationIdRef.current = null;
      chatSessionIdRef.current = `home:draft:${Date.now()}`;
      setRuntimeVersion((version) => version + 1);
    };

    window.addEventListener("dreamforge:go-home", handleGoHome);
    return () => {
      window.removeEventListener("dreamforge:go-home", handleGoHome);
    };
  }, []);

  useEffect(() => {
    const handleGoToRepo = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId: string }>;
      const detail = customEvent.detail;
      if (!detail?.projectId) return;

      setSeedMessages(EMPTY_MESSAGES);
      setLocalProjectId(detail.projectId);
      setLocalConversationId(null);
      activeProjectIdRef.current = detail.projectId;
      activeConversationIdRef.current = null;
      chatSessionIdRef.current = `project:${detail.projectId}:draft:${Date.now()}`;
      setRuntimeVersion((version) => version + 1);
    };

    window.addEventListener(
      "dreamforge:go-to-project",
      handleGoToRepo as EventListener,
    );
    return () => {
      window.removeEventListener(
        "dreamforge:go-to-project",
        handleGoToRepo as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    const handleCreateFromGithub = async (event: Event) => {
      const customEvent = event as CustomEvent<CreateFromGithubDetail>;
      const githubRepoName = customEvent.detail?.githubRepoName?.trim();
      if (!githubRepoName) return;

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ githubRepoName }),
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const projectId = data.id as string | undefined;
      const conversationId = data.conversationId as string | undefined;

      if (!projectId || !conversationId) {
        return;
      }

      const nextPath = `/${projectId}/${conversationId}`;
      window.history.replaceState(window.history.state, "", nextPath);
      setSeedMessages(EMPTY_MESSAGES);
      setLocalProjectId(projectId);
      setLocalConversationId(conversationId);
      activeProjectIdRef.current = projectId;
      activeConversationIdRef.current = conversationId;
      chatSessionIdRef.current = `conversation:${conversationId}`;
      setRuntimeVersion((version) => version + 1);
      onActiveConversationChangeRef.current?.(projectId, conversationId);
      window.dispatchEvent(
        new CustomEvent("dreamforge:active-conversation", {
          detail: { projectId, conversationId },
        }),
      );
      window.dispatchEvent(new Event("dreamforge:projects-updated"));
    };

    window.addEventListener(
      "dreamforge:create-from-github",
      handleCreateFromGithub as EventListener,
    );
    return () => {
      window.removeEventListener(
        "dreamforge:create-from-github",
        handleCreateFromGithub as EventListener,
      );
    };
  }, []);

  const ensureActiveConversation = useCallback(
    async (
      requestedProjectName?: string,
      requestedConversationTitle?: string,
    ) => {
      const activeProjectId = activeProjectIdRef.current;
      const activeConversationId = activeConversationIdRef.current;

      if (activeProjectId && activeConversationId) {
        return {
          projectId: activeProjectId,
          conversationId: activeConversationId,
        };
      }

      if (activeProjectId) {
        const response = await fetch(
          `/api/projects/${activeProjectId}/conversations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              requestedConversationTitle
                ? { title: requestedConversationTitle }
                : {},
            ),
          },
        );

        if (!response.ok) {
          throw new Error(
            "Failed to create a conversation for the selected project.",
          );
        }

        const data = await response.json();
        const conversationId = data.conversationId as string | undefined;

        if (!conversationId) {
          throw new Error("Conversation creation did not return an id.");
        }

        const nextPath = `/${activeProjectId}/${conversationId}`;
        window.history.replaceState(window.history.state, "", nextPath);
        setLocalConversationId(conversationId);
        activeConversationIdRef.current = conversationId;
        onActiveConversationChangeRef.current?.(
          activeProjectId,
          conversationId,
        );
        window.dispatchEvent(
          new CustomEvent("dreamforge:active-conversation", {
            detail: { projectId: activeProjectId, conversationId },
          }),
        );

        return {
          projectId: activeProjectId,
          conversationId,
        };
      }

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          requestedProjectName || requestedConversationTitle
            ? {
                ...(requestedProjectName ? { name: requestedProjectName } : {}),
                ...(requestedConversationTitle
                  ? { conversationTitle: requestedConversationTitle }
                  : {}),
              }
            : {},
        ),
      });
      if (!response.ok) {
        throw new Error("Failed to create a project for this chat.");
      }

      const data = await response.json();
      const projectId = data.id as string | undefined;
      const conversationId = data.conversationId as string | undefined;

      if (!projectId || !conversationId) {
        throw new Error("Project creation did not return ids.");
      }

      const nextPath = `/${projectId}/${conversationId}`;
      window.history.replaceState(window.history.state, "", nextPath);
      setLocalProjectId(projectId);
      setLocalConversationId(conversationId);
      activeProjectIdRef.current = projectId;
      activeConversationIdRef.current = conversationId;
      onActiveConversationChangeRef.current?.(projectId, conversationId);
      window.dispatchEvent(
        new CustomEvent("dreamforge:active-conversation", {
          detail: { projectId, conversationId },
        }),
      );

      return {
        projectId,
        conversationId,
      };
    },
    [],
  );

  const runtimeKey = `${chatSessionIdRef.current}:${runtimeVersion}`;

  const handleThreadStateChange = useCallback(
    (next: ThreadState) => {
      onThreadStateChange?.(next);
      window.dispatchEvent(
        new CustomEvent("dreamforge:thread-state", {
          detail: {
            projectId: activeProjectIdRef.current,
            isRunning: next.isRunning,
          },
        }),
      );
    },
    [onThreadStateChange],
  );

  const dispatchProjectsUpdated = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    window.dispatchEvent(
      new CustomEvent("dreamforge:projects-updated", {
        detail: { projectId },
      }),
    );
  }, []);

  const handleChatFinish = useCallback(() => {
    setProgress("");
    dispatchProjectsUpdated();
  }, [dispatchProjectsUpdated]);

  const chat = useChat<UIMessage>({
    id: runtimeKey,
    onData: (part) => {
      if (part.type === "data-progress")
        setProgress((part.data as { message: string }).message);
    },
    onError: () => setProgress(""),
    transport: new AssistantChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: async (options) => {
        const prompt = extractUserPrompt(options.messages);
        const projectName = prompt ? prompt.slice(0, 50) : undefined;
        const conversationTitle = prompt ? prompt.slice(0, 60) : undefined;
        const active = await ensureActiveConversation(
          projectName,
          conversationTitle,
        );

        if (prompt) {
          window.dispatchEvent(
            new CustomEvent("dreamforge:metadata-optimistic", {
              detail: {
                projectId: active.projectId,
                conversationId: active.conversationId,
                projectName: projectName,
                conversationTitle,
              },
            }),
          );
        }

        if (revisionRef.current?.project !== active.projectId) {
          const status = await fetch(
            `/api/projects/${active.projectId}/execution`,
            { cache: "no-store" },
          );
          if (!status.ok)
            throw Error("Run status is unavailable. Reload before editing.");
          const data = await status.json();
          rememberRevision(active.projectId, data.revision);
        }
        return {
          body: {
            revision: revisionRef.current!.revision,
            ...options.body,
            modelChoice: modelChoiceRef.current,
            // The server loads authoritative history. Resending old image
            // bytes can exceed Vercel's request size limit.
            messages: options.messages.slice(-1),
            metadata: options.requestMetadata,
            id: undefined,
            trigger: "submit-message",
            messageId: undefined,
            projectId: active.projectId,
            conversationId: active.conversationId,
          },
        };
      },
    }),
    messages: seedMessages,
    onFinish: handleChatFinish,
  });

  // A questionable prompt waits for the teacher. While the chat is open, pick up
  // their decision: approved prompts continue on their own.
  const lastMessage = chat.messages.at(-1);
  const waitingForTeacher =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) => part.type === "text" && part.text === HELD_PROMPT_MESSAGE,
    );
  useEffect(() => {
    if (
      readOnly ||
      !selectedConversationId ||
      !waitingForTeacher ||
      chat.status === "submitted" ||
      chat.status === "streaming"
    )
      return;
    let stopped = false;
    const check = async () => {
      const r = await fetch(
        `/api/platform/held-prompts?conversationId=${selectedConversationId}`,
        { cache: "no-store" },
      ).catch(() => null);
      if (!r?.ok || stopped) return;
      const { holds } = (await r.json()) as {
        holds: { id: string; status: string; content: string }[];
      };
      const approved = holds.find((hold) => hold.status === "approved");
      const denied = holds.find((hold) => hold.status === "denied");
      if (approved && !stopped) {
        stopped = true;
        void chat.sendMessage({ text: approved.content });
      } else if (denied && !stopped) {
        stopped = true;
        await fetch("/api/platform/held-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: denied.id }),
        }).catch(() => {});
        chat.setMessages([
          ...chat.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [
              {
                type: "text",
                text: "Your teacher didn’t approve that request. Try a different game, app, or coding idea.",
              },
            ],
          },
        ]);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [
    readOnly,
    selectedConversationId,
    waitingForTeacher,
    chat.status,
    chat.sendMessage,
    chat.setMessages,
    chat.messages,
  ]);

  const startedInitialPrompt = useRef(false);
  useEffect(() => {
    if (
      !modelReady ||
      readOnly ||
      !selectedProjectId ||
      !selectedConversationId ||
      resolvedInitialMessages.length ||
      startedInitialPrompt.current
    )
      return;
    const key = `dreamforge:initial-prompt:${selectedProjectId}:${selectedConversationId}`;
    const prompt = sessionStorage.getItem(key);
    if (!prompt) return;
    startedInitialPrompt.current = true;
    sessionStorage.removeItem(key);
    void chat.sendMessage({ text: prompt });
  }, [
    modelReady,
    readOnly,
    selectedProjectId,
    selectedConversationId,
    resolvedInitialMessages,
    chat.sendMessage,
  ]);
  const runtime = useAISDKRuntime(chat);

  return (
    <AssistantRuntimeProvider key={runtimeKey} runtime={runtime}>
      <ThreadStateBridge onThreadStateChange={handleThreadStateChange} />
      <ProjectRevisionSync
        projectId={localProjectId}
        onRevision={rememberRevision}
      />
      <Thread welcome={welcome} progress={progress} readOnly={readOnly} />
    </AssistantRuntimeProvider>
  );
};

function ThreadStateBridge({
  onThreadStateChange,
}: {
  onThreadStateChange?: (next: ThreadState) => void;
}) {
  const isEmpty = useAuiState(({ thread }) => thread.isEmpty);
  const isRunning = useAuiState(({ thread }) => thread.isRunning);

  useEffect(() => {
    onThreadStateChange?.({ isEmpty, isRunning });
  }, [isEmpty, isRunning, onThreadStateChange]);

  return null;
}
