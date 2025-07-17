import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useReadLocalStorage } from 'usehooks-ts';
import { z } from 'zod/v4-mini';

export const downloadParamsSchema = z.object({
  /// 要下载的 URL
  url: z.url(),
  /// 要保存的文件名
  filename: z.optional(z.string()),
});
export type DownloadParams = z.infer<typeof downloadParamsSchema>;

export const useDownload = () => {
  const [downloading, setDownloading] = useState(false);
  const dir = useReadLocalStorage<string>('dir');
  const signal = useRef(new AbortController());

  const download = useCallback(
    async (params: DownloadParams) => {
      if (!dir) {
        toast.error('The download directory is not set.');
        return;
      }

      setDownloading(true);
    },
    [dir],
  );

  const abort = useCallback(() => {
    signal.current.abort();
    setDownloading(false);
  }, []);

  return { downloading, download, abort };
};
