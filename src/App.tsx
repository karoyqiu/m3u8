import { useElementSize } from '@mantine/hooks';
import { ProgressBarStatus, getCurrentWindow } from '@tauri-apps/api/window';
import { relaunch } from '@tauri-apps/plugin-process';
import { DownloadIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';

import '@/App.css';
import DownloadForm from '@/components/download-form';
import QueuePanel from '@/components/queue-panel';
import SegmentProgress from '@/components/segment-progress';
import SettingsDialog from '@/components/settings-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { useDownloadQueue } from '@/hooks/useDownloadQueue';

const appWindow = getCurrentWindow();

const updateProgress = (value: number) => {
  appWindow.setProgressBar({
    status: value < 0 ? ProgressBarStatus.Indeterminate : ProgressBarStatus.Normal,
    progress: value < 0 ? undefined : Math.max(value, 1),
  });
};

function App() {
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState(0);

  const onProgress = useCallback((value: number, t: number) => {
    setProgress(value);
    setTotal(t);
    updateProgress(Math.round((value * 100) / t));
  }, []);

  const { queue, activeItem, pendingCount, enqueue, cancel, abort, retry, downloading } =
    useDownloadQueue({ onProgress });

  // Sync taskbar progress with download state
  useEffect(() => {
    if (downloading) {
      updateProgress(-1); // indeterminate until first progress event
    } else {
      appWindow.setProgressBar({ status: ProgressBarStatus.None });
    }
  }, [downloading]);

  // Reset progress when active item changes
  useEffect(() => {
    if (activeItem) {
      setProgress(0);
      setTotal(0);
    }
  }, [activeItem?.id]);

  const dfId = useId();
  const { ref, width } = useElementSize();

  useEffect(() => {
    appWindow.show();
  }, []);

  return (
    <>
      <main className="flex h-screen w-screen gap-4 p-4">
        <div className={`flex flex-1 flex-col gap-4 ${queue.length > 0 ? 'max-w-[calc(100%-260px)]' : ''}`}>
          <DownloadForm id={dfId} enqueue={enqueue} />
          <div className="flex gap-2">
            <Button form={dfId} type="submit">
              <DownloadIcon />
              {downloading ? 'Add to Queue' : 'Download'}
            </Button>
            {downloading && (
              <Button variant="destructive" type="button" onClick={abort}>
                <SquareIcon fill="white" />
                Abort
              </Button>
            )}
            <SettingsDialog className="ms-auto" />
            <Button variant="secondary" onClick={relaunch}>
              <RotateCcwIcon />
              Restart
            </Button>
          </div>
          <ScrollArea className="min-h-0" ref={ref} nonce="huahC9gksP5zq3dBQmX97mb9m5FEyGCt">
            <SegmentProgress {...{ width, total, progress }} />
          </ScrollArea>
        </div>
        {queue.length > 0 && (
          <QueuePanel queue={queue} pendingCount={pendingCount} onCancel={cancel} onAbort={abort} onRetry={retry} />
        )}
      </main>
      <Toaster richColors />
    </>
  );
}

export default App;
