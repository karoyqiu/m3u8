import '@/App.css';
import DownloadForm from '@/components/download-form';
import SettingsDialog from '@/components/settings-dialog';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useDownload } from '@/hooks/useDownload';
import { DownloadIcon, SquareIcon } from 'lucide-react';
import { useId } from 'react';

function App() {
  const { downloading, download, abort } = useDownload();
  const dfId = useId();

  return (
    <main className="flex h-dvh w-dvw flex-col gap-4 p-4">
      <DownloadForm {...{ downloading, download, id: dfId }} />
      <div className="flex gap-2">
        {downloading ? (
          <Button key={`${dfId}abort`} variant="destructive" type="button" onClick={abort}>
            <SquareIcon />
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
      <Toaster richColors />
    </main>
  );
}

export default App;
