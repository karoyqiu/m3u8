import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useLocalStorage } from '@mantine/hooks';
import { useForm } from 'react-hook-form';

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
import { type DownloadParams, downloadParamsSchema, type useDownload } from '@/hooks/useDownload';

type DownloadFormProps = Pick<ReturnType<typeof useDownload>, 'downloading' | 'download'> & {
  id: string;
};

export default function DownloadForm(props: DownloadFormProps) {
  const [values, setValues] = useLocalStorage<DownloadParams>({
    key: 'url',
    getInitialValueInEffect: false,
  });
  const { id, downloading, download } = props;
  const form = useForm<DownloadParams>({
    resolver: standardSchemaResolver(downloadParamsSchema),
    defaultValues: values,
  });

  return (
    <Form {...form}>
      <form
        id={id}
        className="flex flex-col gap-6"
        autoComplete="off"
        onSubmit={form.handleSubmit(async (values) => {
          setValues(values);
          await download(values);
        })}
      >
        <FormField
          control={form.control}
          name="url"
          disabled={downloading}
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
          disabled={downloading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Filename</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Optional" />
              </FormControl>
              <FormDescription>The optional filename of the downloaded file.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="referer"
          disabled={downloading}
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
