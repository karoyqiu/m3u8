import { useElementSize } from '@mantine/hooks';
import { ProgressBarStatus, getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { DownloadIcon, FolderSyncIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import '@/App.css';
import DownloadForm from '@/components/download-form';
import SegmentProgress from '@/components/segment-progress';
import SettingsDialog from '@/components/settings-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { useDownload } from '@/hooks/useDownload';
import { useNormalize } from '@/hooks/useNormalize';

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

  const onStart = useCallback(() => {
    setProgress(0);
    setTotal(0);
    updateProgress(-1);
  }, []);

  const onDownload = useCallback((value: number, t: number) => {
    setProgress(value);
    setTotal(t);
    updateProgress(Math.round((value * 100) / t));
  }, []);

  const onEnd = useCallback(() => {
    window.localStorage.removeItem('url');
    appWindow.setProgressBar({ status: ProgressBarStatus.None });
  }, []);

  const { downloading, download, abort } = useDownload({
    onStart,
    onDownload,
    onEnd,
  });

  const { normalizing, normalize, abortNormalize } = useNormalize();

  const handleNormalize = useCallback(async () => {
    const dir = await open({ directory: true, recursive: true });
    if (!dir) return;
    toast.promise(normalize(dir), {
      loading: 'Normalizing audio volume...',
      success: (msg) => msg,
      error: (e) => (e instanceof Error ? e.message : String(e)),
    });
  }, [normalize]);

  const dfId = useId();
  const { ref, width } = useElementSize();

  useEffect(() => {
    appWindow.show();
  }, []);

  const busy = downloading || normalizing;

  return (
    <>
      <main className="flex h-screen w-screen flex-col gap-4 p-4">
        <DownloadForm {...{ downloading, download, id: dfId }} />
        <div className="flex gap-2">
          {downloading ? (
            <Button key={`${dfId}abort`} variant="destructive" type="button" onClick={abort}>
              <SquareIcon fill="white" />
              Abort
            </Button>
          ) : (
            <Button key={`${dfId}submit`} form={dfId} type="submit" disabled={busy}>
              <DownloadIcon />
              Download
            </Button>
          )}
          {normalizing ? (
            <Button variant="destructive" type="button" onClick={abortNormalize}>
              <SquareIcon fill="white" />
              Abort Normalize
            </Button>
          ) : (
            <Button variant="secondary" type="button" onClick={handleNormalize} disabled={busy}>
              <FolderSyncIcon />
              Normalize
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
      </main>
      <Toaster richColors />
    </>
  );
}

export default App;
