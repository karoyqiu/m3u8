import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useLocalStorage } from '@mantine/hooks';
import { open } from '@tauri-apps/plugin-dialog';
import { EllipsisIcon, SaveIcon, SettingsIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod/v4-mini';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

const settingsSchema = z.object({
  dir: z.string(),
});
type ValuesType = z.infer<typeof settingsSchema>;

export default function SettingsDialog() {
  const [dir, setDir] = useLocalStorage({ key: 'dir' });
  const form = useForm<ValuesType>({
    resolver: standardSchemaResolver(settingsSchema),
    defaultValues: {
      dir,
    },
  });

  function onSubmit(values: ValuesType) {
    console.log(values);
    setDir(values.dir);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" type="button">
          <SettingsIcon />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Make changes to your settings here. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            autoComplete="off"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="dir"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Download directory</FormLabel>
                  <div className="flex">
                    <FormControl>
                      <Input className="rounded-e-none border-e-0" {...field} required />
                    </FormControl>
                    <Button
                      className="rounded-s-none"
                      size="icon"
                      type="button"
                      onClick={async () => {
                        const d = await open({
                          defaultPath: field.value,
                          directory: true,
                          recursive: true,
                        });

                        if (d) {
                          field.onChange(d);
                        }
                      }}
                    >
                      <EllipsisIcon />
                    </Button>
                  </div>
                  <FormDescription>
                    The directory to where save the downloaded files.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" onClick={() => form.reset({ dir })}>
                  Cancel
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button type="submit">
                  <SaveIcon />
                  Save
                </Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
