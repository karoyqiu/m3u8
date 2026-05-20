import memoizeOne from 'memoize-one';
import { useEffect, useRef } from 'react';

// 块大小
const blockSize = 12;
// 间隙
const gap = 2;
// 包含间隙的块大小
const fullBlockSize = blockSize + gap;

const getColors = memoizeOne(
  (elem: Element) => {
    // 要使用的颜色
    const style = getComputedStyle(elem);
    const primary = style.getPropertyValue('--primary');
    const gray = style.getPropertyValue('--secondary');
    const green = style.getPropertyValue('--color-green-700');
    const yellow = style.getPropertyValue('--color-yellow-500');

    return { primary, gray, green, yellow };
  },
  () => true,
);

type SegmentProgressProps = {
  width: number;
  total: number;
  progress: number;
};

export default function SegmentProgress(props: SegmentProgressProps) {
  const { width, total, progress } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  const segments = total;
  const value = progress;

  // 一行最多的列数
  const cols = Math.max(Math.floor((width + gap) / fullBlockSize), 1);
  // 需要的行数
  const rows = Math.ceil(segments / cols);
  // 需要的高度，去掉多余的间隙
  const height = Math.max(rows * fullBlockSize - gap, 0);

  useEffect(() => {
    const calcPos = (index: number) => {
      const x = (index % cols) * fullBlockSize;
      const y = Math.floor(index / cols) * fullBlockSize;
      return { x, y };
    };

    const ctx = ref.current?.getContext('2d', { alpha: false });

    if (ctx) {
      const grays = new Path2D();
      const greens = new Path2D();

      const { gray, green } = getColors(ctx.canvas);

      for (let i = 0; i < segments; i++) {
        const { x, y } = calcPos(i);

        if (i < value) {
          greens.roundRect(x, y, blockSize, blockSize, 2);
        } else {
          grays.roundRect(x, y, blockSize, blockSize, 2);
        }
      }

      ctx.save();
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      ctx.fillStyle = green;
      ctx.fill(greens);

      ctx.fillStyle = gray;
      ctx.fill(grays);

      ctx.restore();
    }
  }, [segments, value, cols]);

  return (
    <canvas ref={ref} width={width} height={height}>
      No canvas.
    </canvas>
  );
}
