import type { DownloadSegment } from '@/hooks/useDownload';
import { useCallback } from 'react';
import { Layer, Rect, Stage } from 'react-konva';

// 块大小
const blockSize = 12;
// 间隙
const gap = 2;
// 包含间隙的块大小
const fullBlockSize = blockSize + gap;

const blockColor = (seg: DownloadSegment) => {
  switch (seg.downloaded / seg.total) {
    case 0:
      //return 'bg-secondary';
      //return 'var(--secondary)';
      return 'gray';
    case 1:
      //return 'bg-green-500 dark:bg-green-700';
      //return 'var(--color-green-500)';
      return 'green';
    default:
      //return 'bg-yellow-500';
      //return 'var(--color-yellow-500)';
      return 'yellow';
  }
};

type SegmentProgressProps = {
  width: number;
  segments: DownloadSegment[];
};

export default function SegmentProgress(props: SegmentProgressProps) {
  const { width, segments } = props;

  // 一行最多的列数
  const cols = Math.max(Math.floor((width + gap) / fullBlockSize), 1);
  // 需要的行数
  const rows = Math.ceil(segments.length / cols);
  // 需要的高度，去掉多余的间隙
  const height = Math.max(rows * fullBlockSize - gap, 0);

  const calcPos = useCallback((index: number) => {
    const x = (index % cols) * fullBlockSize;
    const y = Math.floor(index / cols) * fullBlockSize;
    return { x, y };
  }, [cols])

  return (
    <Stage width={width} height={height}>
      <Layer>
        {segments.map((seg, index) => (
          <Rect
            key={seg._id}
            cornerRadius={2}
            fill={blockColor(seg)}
            width={blockSize}
            height={blockSize}
            strokeEnabled={false}
            strokeHitEnabled={false}
            shadowEnabled={false}
            shadowForStrokeEnabled={false}
            dashEnabled={false}
            {...calcPos(index)}
          />
        ))}
      </Layer>
    </Stage>
  );
}
