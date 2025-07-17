import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { z } from 'zod/v4-mini';

import { Button } from '@/components/ui/button';
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
import { DownloadIcon, SettingsIcon } from 'lucide-react';

const formSchema = z.object({
  /// 要下载的 URL
  url: z.url(),
  /// 要保存的文件名
  filename: z.optional(z.string()),
});

type ValuesType = z.infer<typeof formSchema>;

export default function DownloadForm() {
  const form = useForm<ValuesType>({
    resolver: standardSchemaResolver(formSchema),
  });

  function onSubmit(values: ValuesType) {
    // Do something with the form values.
    // ✅ This will be type-safe and validated.
    console.log(values);
  }

  return (
    <Form {...form}>
      <form className="flex flex-col gap-6" autoComplete="off" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL</FormLabel>
              <FormControl>
                <Input {...field} type="url" autoFocus required />
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
                <Input {...field} placeholder='Optional' />
              </FormControl>
              <FormDescription>The optional filename of the downloaded file.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
        <Button type="submit">
          <DownloadIcon/>
          Download
        </Button>
        <Button className='ms-auto' variant="secondary" type="button">
          <SettingsIcon/>
          Settings
        </Button>
        </div>
      </form>
    </Form>
  );
}
