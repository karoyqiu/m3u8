import { useCallback, useEffect, useRef } from 'react';

import type { DownloadSegment } from '@/hooks/useDownload';

// 块大小
const blockSize = 12;
// 间隙
const gap = 2;
// 包含间隙的块大小
const fullBlockSize = blockSize + gap;

type SegmentProgressProps = {
  width: number;
  segments: DownloadSegment[];
};

export default function SegmentProgress(props: SegmentProgressProps) {
  const { width, segments } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  // 一行最多的列数
  const cols = Math.max(Math.floor((width + gap) / fullBlockSize), 1);
  // 需要的行数
  const rows = Math.ceil(segments.length / cols);
  // 需要的高度，去掉多余的间隙
  const height = Math.max(rows * fullBlockSize - gap, 0);

  const calcPos = useCallback(
    (index: number) => {
      const x = (index % cols) * fullBlockSize;
      const y = Math.floor(index / cols) * fullBlockSize;
      return { x, y };
    },
    [cols],
  );

  useEffect(() => {
    const ctx = ref.current?.getContext('2d', { alpha: false });

    if (ctx) {
      const grays = new Path2D();
      const yellows = new Path2D();
      const greens = new Path2D();
      const style = getComputedStyle(ctx.canvas);
      const gray = style.getPropertyValue('--secondary');
      const green = style.getPropertyValue('--color-green-700');
      const yellow = style.getPropertyValue('--color-yellow-500');

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const { x, y } = calcPos(i);

        switch (seg.downloaded / seg.total) {
          case 0:
            grays.roundRect(x, y, blockSize, blockSize, 2);
            break;
          case 1:
            greens.roundRect(x, y, blockSize, blockSize, 2);
            break;
          default:
            yellows.roundRect(x, y, blockSize, blockSize, 2);
            break;
        }
      }

      ctx.save();
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      ctx.fillStyle = gray;
      ctx.fill(grays);

      ctx.fillStyle = yellow;
      ctx.fill(yellows);

      ctx.fillStyle = green;
      ctx.fill(greens);

      ctx.restore();
    }
  }, [segments, calcPos]);

  return (
    <canvas ref={ref} width={width} height={height}>
      No canvas.
    </canvas>
  );
}
