import { CircleSlashIcon, LoaderIcon, RotateCcwIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type QueueItem } from '@/hooks/useDownloadQueue';

type QueuePanelProps = {
  queue: QueueItem[];
  onCancel: (id: string) => void;
  onAbort: () => void;
  onRetry: (id: string) => void;
};

export default function QueuePanel({ queue, onCancel, onAbort, onRetry }: QueuePanelProps) {
  const pendingCount = queue.filter((item) => item.status === 'pending').length;
  return (
    <div className="flex w-[240px] shrink-0 flex-col border-l">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold">Queue</span>
        {pendingCount > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {pendingCount}
          </span>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pb-2">
          {queue.map((item) => (
            <QueueRow key={item.id} item={item} onCancel={onCancel} onAbort={onAbort} onRetry={onRetry} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function QueueRow({
  item,
  onCancel,
  onAbort,
  onRetry,
}: {
  item: QueueItem;
  onCancel: (id: string) => void;
  onAbort: () => void;
  onRetry: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${
        item.status === 'downloading'
          ? 'border-primary bg-primary/5'
          : item.status === 'failed'
            ? 'border-destructive/40 bg-destructive/5'
            : 'border-border bg-card'
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {item.status === 'downloading' && <LoaderIcon className="size-3 animate-spin shrink-0" />}
        {item.status === 'failed' && <CircleSlashIcon className="size-3 shrink-0 text-destructive" />}
        <span
          className={`truncate ${item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
          title={item.error ?? item.filename}
        >
          {item.filename}
        </span>
      </div>
      {item.status === 'downloading' && (
        <Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={onAbort} title="Abort">
          <XIcon className="size-3" />
        </Button>
      )}
      {item.status === 'pending' && (
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          onClick={() => onCancel(item.id)}
          title="Cancel"
        >
          <XIcon className="size-3" />
        </Button>
      )}
      {item.status === 'failed' && (
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0 text-primary"
          onClick={() => onRetry(item.id)}
          title="Retry"
        >
          <RotateCcwIcon className="size-3" />
        </Button>
      )}
    </div>
  );
}
