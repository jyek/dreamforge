import { Button } from "@/components/ui/button";
import { DreamLoading } from "@/components/dream-loading";
import {
  AssistantIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";
import { ArchiveIcon, MoreHorizontalIcon } from "lucide-react";
import type { FC } from "react";

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-0.5">
      <AssistantIf condition={({ threads }) => threads.isLoading}>
        <ThreadListSkeleton />
      </AssistantIf>
      <AssistantIf condition={({ threads }) => !threads.isLoading}>
        <ThreadListPrimitive.Items components={{ ThreadListItem }} />
      </AssistantIf>
    </ThreadListPrimitive.Root>
  );
};

const ThreadListSkeleton: FC = () => (
  <DreamLoading
    inline
    label="Loading conversations…"
    className="px-2 py-4 text-xs"
  />
);

const ThreadListItem: FC = () => {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item group/item relative flex h-8 items-center rounded-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-active:bg-muted">
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 items-center overflow-hidden px-2.5 text-start text-[13px]">
        <span className="truncate">
          <ThreadListItemPrimitive.Title fallback="New Chat" />
        </span>
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemMore />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemMore: FC = () => {
  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="aui-thread-list-item-more absolute right-1 size-6 p-0 opacity-0 transition-opacity group-hover/item:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon className="size-3.5" />
          <span className="sr-only">More options</span>
        </Button>
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="bottom"
        align="start"
        className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ThreadListItemPrimitive.Archive asChild>
          <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
            <ArchiveIcon className="size-4" />
            Archive
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Archive>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
