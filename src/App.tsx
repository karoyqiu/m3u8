import { DownloadIcon, SquareIcon } from 'lucide-react';
import { useCallback, useId, useState } from 'react';

import '@/App.css';
import DownloadForm from '@/components/download-form';
import SegmentTable, { type Segment } from '@/components/segment-table';
import SettingsDialog from '@/components/settings-dialog';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { type DownloadProgress, useDownload } from '@/hooks/useDownload';

function App() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const onStart = useCallback(
    (segs: string[]) =>
      setSegments(
        segs.map((seg) => ({ _id: seg, segment: seg, downloaded: 0, total: 100, speed: 0 })),
      ),
    [],
  );
  const onProgress = useCallback((progress: DownloadProgress) => {
    const { index, ...rest } = progress;
    setSegments((old) =>
      old.toSpliced(index, 1, {
        ...old[index],
        ...rest,
      }),
    );
  }, []);
  const { downloading, download, abort } = useDownload({ onStart, onProgress });
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
        <SegmentTable data={segments} />
      </main>
      <Toaster richColors />
    </>
  );
}

export default App;
