import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type DownloadParams, useDownload } from '@/hooks/useDownload';

export type { DownloadParams } from '@/hooks/useDownload';

export type QueueItem = {
  id: string;
  url: string;
  filename: string;
  referer?: string;
  status: 'pending' | 'downloading' | 'failed';
  error?: string;
  addedAt: number;
};

const STORAGE_KEY = 'download-queue';

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export const useDownloadQueue = (opts: {
  onProgress: (progress: number, total: number) => void;
}) => {
  const [queue, setQueue] = useState<QueueItem[]>(loadQueue);
  const processingRef = useRef(false);
  const isFirstRender = useRef(true);

  const onSuccess = useCallback(() => {
    setQueue((prev) => {
      const next = prev.filter((item) => item.status !== 'downloading');
      saveQueue(next);
      return next;
    });
    processingRef.current = false;
  }, []);

  const onError = useCallback((error: string) => {
    toast.error(error, { closeButton: true });
    setQueue((prev) => {
      const next = prev.map((item) =>
        item.status === 'downloading' ? { ...item, status: 'failed' as const, error } : item,
      );
      saveQueue(next);
      return next;
    });
    processingRef.current = false;
  }, []);

  const { downloading, download, abort: abortDownload } = useDownload({
    onProgress: opts.onProgress,
    onSuccess,
    onError,
  });

  const processNext = useCallback(
    (currentQueue: QueueItem[]) => {
      if (processingRef.current) return;

      const next = currentQueue.find((item) => item.status === 'pending');
      if (!next) return;

      processingRef.current = true;

      const updated = currentQueue.map((item) =>
        item.id === next.id ? { ...item, status: 'downloading' as const } : item,
      );
      setQueue(updated);
      saveQueue(updated);

      const params: DownloadParams = {
        url: next.url,
        filename: next.filename,
        ...(next.referer ? { referer: next.referer } : {}),
      };
      download(params);
    },
    [download],
  );

  // Auto-advance + mount recovery
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      const hasActive = queue.some((item) => item.status === 'downloading');
      if (hasActive) {
        // Reset crashed active download back to pending
        setQueue((prev) => {
          const next = prev.map((item) =>
            item.status === 'downloading' ? { ...item, status: 'pending' as const } : item,
          );
          saveQueue(next);
          return next;
        });
        return; // state update will re-trigger this effect
      }
    }

    if (!downloading && queue.length > 0) {
      const hasActive = queue.some((item) => item.status === 'downloading');
      const hasPending = queue.some((item) => item.status === 'pending');

      if (!hasActive && hasPending) {
        processNext(queue);
      } else if (!hasActive && !hasPending) {
        // Only failed items remain — no processing needed
        processingRef.current = false;
      }
    }
  }, [downloading, queue, processNext]);

  const enqueue = useCallback(
    (params: DownloadParams) => {
      const item: QueueItem = {
        id: crypto.randomUUID(),
        url: params.url,
        filename: params.filename,
        referer: params.referer,
        status: 'pending',
        addedAt: Date.now(),
      };

      setQueue((prev) => {
        const next = [...prev, item];
        saveQueue(next);
        return next;
      });
    },
    [],
  );

  const cancel = useCallback((id: string) => {
    setQueue((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveQueue(next);
      return next;
    });
  }, []);

  const abort = useCallback(() => {
    abortDownload();
    // Remove active item after abort
    setQueue((prev) => {
      const next = prev.filter((item) => item.status !== 'downloading');
      saveQueue(next);
      return next;
    });
    processingRef.current = false;
  }, [abortDownload]);

  const retry = useCallback(
    (id: string) => {
      setQueue((prev) => {
        const next = prev.map((item) =>
          item.id === id ? { ...item, status: 'pending' as const, error: undefined } : item,
        );
        saveQueue(next);
        return next;
      });
    },
    [],
  );

  const activeItem = queue.find((item) => item.status === 'downloading') ?? null;

  return { queue, activeItem, enqueue, cancel, abort, retry, downloading };
};
