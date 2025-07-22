import { useEffect, useRef } from 'react';

import type { DownloadSegment } from '@/hooks/useDownload';
import memoizeOne from 'memoize-one';

// 块大小
const blockSize = 12;
// 间隙
const gap = 2;
// 包含间隙的块大小
const fullBlockSize = blockSize + gap;

const getColors = memoizeOne((elem: Element) => {
  // 要使用的颜色
  const style = getComputedStyle(elem);
  const primary = style.getPropertyValue('--primary');
  const gray = style.getPropertyValue('--secondary');
  const green = style.getPropertyValue('--color-green-700');
  const yellow = style.getPropertyValue('--color-yellow-500');

  return { primary, gray, green, yellow };
}, () => true);

type SegmentProgressProps = {
  width: number;
  segments: DownloadSegment[];
  // 合并进度，0~1
  merging: number;
};

export default function SegmentProgress(props: SegmentProgressProps) {
  const { width, segments, merging } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  // 一行最多的列数
  const cols = Math.max(Math.floor((width + gap) / fullBlockSize), 1);
  // 需要的行数
  const rows = Math.ceil(segments.length / cols);
  // 需要的高度，去掉多余的间隙
  const height = Math.max(rows * fullBlockSize - gap, 0);

  useEffect(() => {
    // 计算块的左上角位置
    const calcPos = (index: number) => {
      const x = (index % cols) * fullBlockSize;
      const y = Math.floor(index / cols) * fullBlockSize;
      return { x, y };
    };

    // 绘制
    const draw = () => {
      const ctx = ref.current?.getContext('2d', { alpha: false });

      if (ctx) {
        // 要绘制的路径
        const grays = new Path2D();
        const yellows = new Path2D();
        const greens = new Path2D();
        const primaries = new Path2D();

        // 要使用的颜色
        const { primary, gray, green, yellow } = getColors(ctx.canvas);

        // 计算已合并的块数，如果有，则绘制合并进度
        const segs = Math.floor(segments.length * merging);

        if (segs > 0) {
          // 计算已完成合并的整行
          const fullRows = Math.floor(segs / cols);
          const fullWidth = fullBlockSize * cols - gap;

          for (let i = 0; i < fullRows; i++) {
            const y = fullBlockSize * i;
            primaries.roundRect(0, y, fullWidth, blockSize, 2);
          }

          // 计算最后剩余的块数
          const remains = segs % cols;

          if (remains > 0) {
            const y = fullBlockSize * fullRows;
            const w = fullBlockSize * remains - gap;
            primaries.roundRect(0, y, w, blockSize, 2);
          }

          // 所有其余块都已完成
          for (let i = segs; i < segments.length; i++) {
            const { x, y } = calcPos(i);
            greens.roundRect(x, y, blockSize, blockSize, 2);
          }
        } else {
          // 无合并进度，按下载进度绘制各块
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
        }

        ctx.save();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.fillStyle = green;
        ctx.fill(greens);

        if (segs > 0) {
          // 有合并进度，则所有块都已完成
          // 绘制合并进度
          ctx.fillStyle = primary;
          ctx.fill(primaries);
        } else {
          // 无合并进度，按下载进度绘制各块
          ctx.fillStyle = gray;
          ctx.fill(grays);

          ctx.fillStyle = yellow;
          ctx.fill(yellows);
        }

        ctx.restore();
      }
    };

    const handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, [segments, merging, cols]);

  return (
    <canvas ref={ref} width={width} height={height}>
      No canvas.
    </canvas>
  );
}
