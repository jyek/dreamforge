import { InlineSpinner } from "@/components/dream-loading";
import { ModelUsed } from "./model-settings";
import { ModelSelector } from "./model-selector";
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import {
  AppendToFileToolCard,
  BashToolCard,
  CheckAppToolCard,
  CommitToolCard,
  DevServerLogsToolCard,
  DeletePathToolCard,
  ListFilesToolCard,
  MakeDirectoryToolCard,
  MovePathToolCard,
  ReadFileToolCard,
  ReplaceInFileToolCard,
  SearchFilesToolCard,
  WriteFileToolCard,
} from "@/components/assistant-ui/tool-cards";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import {
  groupConsecutiveToolCalls,
  ToolCallGroup,
} from "@/components/assistant-ui/tool-group";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AssistantIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FC,
  type ReactNode,
} from "react";

const ReadOnlyContext = createContext(false);

export const Thread: FC<{
  welcome?: ReactNode;
  progress?: string;
  readOnly?: boolean;
}> = ({ welcome, readOnly = false, progress }) => {
  return (
    <ReadOnlyContext.Provider value={readOnly}>
      <ThreadPrimitive.Root
        className="aui-root aui-thread-root @container flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
        style={{
          ["--thread-max-width" as string]: "44rem",
        }}
      >
        <ThreadPrimitive.Viewport className="aui-thread-viewport relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll px-4 pt-4">
          {welcome && (
            <AssistantIf condition={({ thread }) => thread.isEmpty}>
              {welcome}
            </AssistantIf>
          )}

          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />

          <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) shrink-0 flex-col gap-4 overflow-visible rounded-t-3xl bg-background pb-4 md:pb-6">
            <AssistantIf condition={({ thread }) => thread.isRunning}>
              <div
                role="status"
                className="flex items-center gap-2 px-3 text-xs text-slate-400"
              >
                <InlineSpinner className="size-3.5" />
                {progress || "Thinking about your request…"}
              </div>
            </AssistantIf>
            <ThreadScrollToBottom />
            {readOnly ? (
              <p className="text-center text-sm text-muted-foreground">
                Viewing project history · This workspace is read-only.
              </p>
            ) : (
              <Composer />
            )}
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </ReadOnlyContext.Provider>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};
const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone className="aui-composer-attachment-dropzone flex w-full flex-col rounded-2xl border border-input bg-background px-1 pt-2 transition-shadow outline-none has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20 data-[dragging=true]:border-dashed data-[dragging=true]:border-ring data-[dragging=true]:bg-accent/50">
        <ComposerAttachments />
        <BuilderComposerInput />
        <ComposerAction />
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const BUILDER_PROMPTS = [
  "What would you like to build?",
  "Tell me your next big idea…",
  "Let’s make a game, app, or something fun!",
  "What should we add to your creation?",
];
const BuilderComposerInput: FC = () => {
  const [prompt, setPrompt] = useState(0);
  const [focused, setFocused] = useState(false);
  const paused = useAuiState((s) => s.thread.isRunning || !!s.composer.text);
  useEffect(() => {
    if (
      paused ||
      focused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = window.setInterval(() => {
      if (!document.hidden)
        setPrompt((current) => (current + 1) % BUILDER_PROMPTS.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [paused, focused]);
  return (
    <ComposerPrimitive.Input
      placeholder={BUILDER_PROMPTS[prompt]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="aui-composer-input mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
      rows={1}
      aria-label="Message input"
    />
  );
};

const ComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative mx-2 mb-2 flex items-center justify-between">
      <ComposerAddAttachment />
      <ModelSelector />

      <AssistantIf condition={({ thread }) => !thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send message"
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 rounded-full"
            aria-label="Send message"
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AssistantIf>

      <AssistantIf condition={({ thread }) => thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full"
            aria-label="Stop generating"
          >
            <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AssistantIf>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message-root relative mx-auto w-full max-w-(--thread-max-width) animate-in py-3 duration-150 fade-in slide-in-from-bottom-1"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content px-2 leading-relaxed wrap-break-word text-foreground">
        <MessagePrimitive.Unstable_PartsGrouped
          groupingFunction={groupConsecutiveToolCalls}
          components={{
            Text: MarkdownText,
            Reasoning,
            Group: ToolCallGroup,
            tools: {
              by_name: {
                bashTool: BashToolCard,
                readFileTool: ReadFileToolCard,
                writeFileTool: WriteFileToolCard,
                listFilesTool: ListFilesToolCard,
                searchFilesTool: SearchFilesToolCard,
                replaceInFileTool: ReplaceInFileToolCard,
                appendToFileTool: AppendToFileToolCard,
                makeDirectoryTool: MakeDirectoryToolCard,
                movePathTool: MovePathToolCard,
                deletePathTool: DeletePathToolCard,
                commitTool: CommitToolCard,
                checkAppTool: CheckAppToolCard,
                devServerLogsTool: DevServerLogsToolCard,
              },
              Fallback: ToolFallback,
            },
          }}
        />
        <MessageError />
      </div>

      <div className="aui-assistant-message-footer mt-1 ml-2 flex">
        <BranchPicker />
        <AssistantActionBar />
        <ModelUsed />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const readOnly = useContext(ReadOnlyContext);
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AssistantIf condition={({ message }) => message.isCopied}>
            <CheckIcon />
          </AssistantIf>
          <AssistantIf condition={({ message }) => !message.isCopied}>
            <CopyIcon />
          </AssistantIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      {!readOnly && (
        <ActionBarPrimitive.Reload asChild>
          <TooltipIconButton tooltip="Refresh">
            <RefreshCwIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.Reload>
      )}
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  const blocked = useAuiState(
    ({ message }) =>
      (message.metadata?.custom as { blocked?: boolean } | undefined)
        ?.blocked === true,
  );
  return (
    <MessagePrimitive.Root
      className="aui-user-message-root mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 fade-in slide-in-from-bottom-1 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div
          className={
            blocked
              ? "aui-user-message-content rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 wrap-break-word text-red-950"
              : "aui-user-message-content rounded-2xl bg-muted px-4 py-2.5 wrap-break-word text-foreground"
          }
        >
          {blocked && (
            <span className="mb-1 block text-xs font-semibold tracking-wide text-red-700 uppercase">
              Blocked · not sent to the AI
            </span>
          )}
          <MessagePrimitive.Parts />
        </div>
        <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy" className="aui-user-action-copy p-4">
          <AssistantIf condition={({ message }) => message.isCopied}>
            <CheckIcon />
          </AssistantIf>
          <AssistantIf condition={({ message }) => !message.isCopied}>
            <CopyIcon />
          </AssistantIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-xs text-muted-foreground",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
