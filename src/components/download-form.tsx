import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { type DownloadParams, downloadParamsSchema } from '@/hooks/useDownload';
import { checkDownloaded } from '@/lib/downloads-db';

type DownloadFormProps = {
  id: string;
  enqueue: (params: { url: string; filename: string; referer?: string }) => void;
};

export default function DownloadForm(props: DownloadFormProps) {
  const { id, enqueue } = props;
  const form = useForm<DownloadParams>({
    resolver: standardSchemaResolver(downloadParamsSchema),
    defaultValues: { url: '', filename: '', referer: '' },
  });

  return (
    <Form {...form}>
      <form
        id={id}
        className="flex flex-col gap-6"
        autoComplete="off"
        onSubmit={form.handleSubmit((values) => {
          enqueue(values);
          form.reset({ url: '', filename: '', referer: values.referer });
        })}
      >
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL</FormLabel>
              <FormControl>
                <Input {...field} type="url" required />
              </FormControl>
              <FormDescription>The URL of the m3u8 file.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="filename"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Filename</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  required
                  onBlur={async (e) => {
                    field.onBlur();
                    const basename = e.target.value.trim();
                    if (basename) {
                      const already = await checkDownloaded(basename);
                      if (already) toast.warning(`"${basename}" has already been downloaded.`);
                    }
                  }}
                />
              </FormControl>
              <FormDescription>The output filename without extension. Saved as &lt;filename&gt;.mp4.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="referer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Referer</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Optional" />
              </FormControl>
              <FormDescription>The Referer header to send when downloading.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
