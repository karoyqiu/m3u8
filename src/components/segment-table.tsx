import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table';
import { Progress } from '@/components/ui/progress';
import type { DownloadProgress } from '@/hooks/useDownload';

export type Segment = Omit<DownloadProgress, 'index'> & {
  _id: string;
  segment: string;
};

type SegmentTableProps = {
  data: Segment[];
};

const columns: ColumnDef<Segment>[] = [
  {
    accessorKey: 'segment',
    header: 'Segment',
    meta: {
      className: 'w-0',
    },
  },
  {
    header: 'Progress',
    cell: ({ row }) => <Progress value={row.original.downloaded} max={row.original.total} />,
  },
];

export default function SegmentTable(props: SegmentTableProps) {
  const { data } = props;

  return <DataTable {...{ columns, data }} />;
}
