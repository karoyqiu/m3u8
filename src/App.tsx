import { DownloadIcon, SquareIcon } from 'lucide-react';
import { useCallback, useId, useState } from 'react';

import '@/App.css';
import DownloadForm from '@/components/download-form';
import SettingsDialog from '@/components/settings-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { type DownloadProgress, type DownloadSegment, useDownload } from '@/hooks/useDownload';
import { cn } from '@/lib/utils';

const blockColor = (seg: DownloadSegment) => {
  switch (seg.downloaded / seg.total) {
    case 0:
      return 'bg-secondary';
    case 1:
      return 'bg-green-500 dark:bg-green-700';
    default:
      return 'bg-yellow-500';
  }
};

function App() {
  const [progress, setProgress] = useState(0);
  const [segments, setSegments] = useState<DownloadSegment[]>([]);
  const onStart = useCallback(
    (segs: string[]) =>
      setSegments(
        segs.map((seg) => ({ _id: seg, segment: seg, downloaded: 0, total: 100, speed: 0 })),
      ),
    [],
  );
  const onDownload = useCallback((progress: DownloadProgress) => {
    const { index, ...rest } = progress;
    setSegments((old) => {
      const segs = old.toSpliced(index, 1, {
        ...old[index],
        ...rest,
      });

      const finished = segs.reduce(
        (prev, seg) => (seg.downloaded === seg.total ? prev + 1 : prev),
        0,
      );
      setProgress(Math.round((finished * 100) / segs.length));

      return segs;
    });
  }, []);
  const { downloading, download, abort } = useDownload({
    onStart,
    onDownload,
    onMerge: setProgress,
  });
  const dfId = useId();

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
            <Button key={`${dfId}submit`} form={dfId} type="submit">
              <DownloadIcon />
              Download
            </Button>
          )}
          <SettingsDialog />
        </div>
        <Progress className="shrink-0" value={progress} />
        <ScrollArea className="min-h-0">
          <div className="flex flex-wrap gap-[2px]">
            {segments.map((seg) => (
              <div
                key={seg._id}
                className={cn(
                  'size-[12px] rounded-xs transition-colors duration-500',
                  blockColor(seg),
                )}
              />
            ))}
          </div>
        </ScrollArea>
      </main>
      <Toaster richColors />
    </>
  );
}

export default App;
