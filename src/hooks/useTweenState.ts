import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

// t: current time, b: beginning value, _c: final value, d: total duration
export const linear = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return (c * t) / d + b;
};

export const easeInQuad = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return c * (t /= d) * t + b;
};

export const easeOutQuad = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return -c * (t /= d) * (t - 2) + b;
};

export const easeInOutQuad = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;

  if ((t /= d / 2) < 1) {
    return (c / 2) * t * t + b;
  }

  return (-c / 2) * (--t * (t - 2) - 1) + b;
};

export const easeInCubic = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return c * (t /= d) * t * t + b;
};

export const easeOutCubic = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return c * ((t = t / d - 1) * t * t + 1) + b;
};

export const easeInOutCubic = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;

  if ((t /= d / 2) < 1) {
    return (c / 2) * t * t * t + b;
  }

  return (c / 2) * ((t -= 2) * t * t + 2) + b;
};

export const easeInQuart = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return c * (t /= d) * t * t * t + b;
};

export const easeOutQuart = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return -c * ((t = t / d - 1) * t * t * t - 1) + b;
};

export const easeInOutQuart = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;

  if ((t /= d / 2) < 1) {
    return (c / 2) * t * t * t * t + b;
  }

  return (-c / 2) * ((t -= 2) * t * t * t - 2) + b;
};

export const easeInQuint = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return c * (t /= d) * t * t * t * t + b;
};

export const easeOutQuint = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
};

export const easeInOutQuint = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;

  if ((t /= d / 2) < 1) {
    return (c / 2) * t * t * t * t * t + b;
  }

  return (c / 2) * ((t -= 2) * t * t * t * t + 2) + b;
};

export const easeInSine = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return -c * Math.cos((t / d) * (Math.PI / 2)) + c + b;
};

export const easeOutSine = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return c * Math.sin((t / d) * (Math.PI / 2)) + b;
};

export const easeInOutSine = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return (-c / 2) * (Math.cos((Math.PI * t) / d) - 1) + b;
};

export const easeInExpo = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return t == 0 ? b : c * 2 ** (10 * (t / d - 1)) + b;
};

export const easeOutExpo = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return t == d ? b + c : c * (-(2 ** ((-10 * t) / d)) + 1) + b;
};

export const easeInOutExpo = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;

  if (t === 0) {
    return b;
  }

  if (t === d) {
    return b + c;
  }

  if ((t /= d / 2) < 1) {
    return (c / 2) * 2 ** (10 * (t - 1)) + b;
  }

  return (c / 2) * (-(2 ** (-10 * --t)) + 2) + b;
  0;
};

export const easeInCirc = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
};

export const easeOutCirc = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
};

export const easeInOutCirc = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;

  if ((t /= d / 2) < 1) {
    return (-c / 2) * (Math.sqrt(1 - t * t) - 1) + b;
  }

  return (c / 2) * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
};

export const easeInElastic = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  let a = c,
    p = 0,
    s = 1.70158;

  if (t === 0) {
    return b;
  } else if ((t /= d) === 1) {
    return b + c;
  }

  if (!p) {
    p = d * 0.3;
  }

  if (a < Math.abs(c)) {
    a = c;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(c / a);
  }

  return -(a * 2 ** (10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * Math.PI)) / p)) + b;
};

export const easeOutElastic = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  let a = c,
    p = 0,
    s = 1.70158;

  if (t === 0) {
    return b;
  } else if ((t /= d) === 1) {
    return b + c;
  }

  if (!p) {
    p = d * 0.3;
  }

  if (a < Math.abs(c)) {
    a = c;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(c / a);
  }

  return a * 2 ** (-10 * t) * Math.sin(((t * d - s) * (2 * Math.PI)) / p) + c + b;
};

export const easeInOutElastic = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  let a = c,
    p = 0,
    s = 1.70158;

  if (t === 0) {
    return b;
  } else if ((t /= d / 2) === 2) {
    return b + c;
  }

  if (!p) {
    p = d * (0.3 * 1.5);
  }

  if (a < Math.abs(c)) {
    a = c;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(c / a);
  }

  if (t < 1) {
    return -0.5 * (a * 2 ** (10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * Math.PI)) / p)) + b;
  }

  return a * 2 ** (10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * Math.PI)) / p) * 0.5 + c + b;
};

export const easeInBack = (t: number, b: number, _c: number, d: number, s = 1.70158) => {
  const c = _c - b;
  return c * (t /= d) * t * ((s + 1) * t - s) + b;
};

export const easeOutBack = (t: number, b: number, _c: number, d: number, s = 1.70158) => {
  const c = _c - b;
  return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
};

export const easeInOutBack = (t: number, b: number, _c: number, d: number, s = 1.70158) => {
  const c = _c - b;

  if ((t /= d / 2) < 1) {
    return (c / 2) * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
  }

  return (c / 2) * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
};

export const easeInBounce = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;
  const v = easeOutBounce(d - t, 0, c, d);
  return c - v + b;
};

export const easeOutBounce = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;

  if ((t /= d) < 1 / 2.75) {
    return c * (7.5625 * t * t) + b;
  } else if (t < 2 / 2.75) {
    return c * (7.5625 * (t -= 1.5 / 2.75) * t + 0.75) + b;
  } else if (t < 2.5 / 2.75) {
    return c * (7.5625 * (t -= 2.25 / 2.75) * t + 0.9375) + b;
  }

  return c * (7.5625 * (t -= 2.625 / 2.75) * t + 0.984375) + b;
};

export const easeInOutBounce = (t: number, b: number, _c: number, d: number) => {
  const c = _c - b;

  if (t < d / 2) {
    const v = easeInBounce(t * 2, 0, c, d);
    return v * 0.5 + b;
  }

  const v = easeOutBounce(t * 2 - d, 0, c, d);
  return v * 0.5 + c * 0.5 + b;
};

type UseTweenStateOptions = {
  // t: current time, b: beginning value, _c: final value, d: total duration
  easingFunction?: (t: number, b: number, _c: number, d: number) => number;
  duration?: number;
};

export const useTweenState = (
  initialValue: number,
  options?: UseTweenStateOptions,
): [number, Dispatch<SetStateAction<number>>] => {
  const [begin, setBegin] = useState(initialValue);
  const [value, setValue] = useState(initialValue);
  const [final, setFinalValue] = useState(initialValue);
  const easingFunction = options?.easingFunction ?? easeInOutCubic;
  const duration = options?.duration ?? 500;

  useEffect(() => {
    let id = 0,
      start = -1,
      prev = -1;

    const tick = (timestamp: number) => {
      if (start < 0) {
        start = timestamp;
      }

      const elapsed = Math.min(timestamp - start, duration);

      if (prev !== timestamp) {
        const v = easingFunction(elapsed, begin, final, duration);
        console.debug('V =', v);
        setValue(v);
      }

      prev = timestamp;

      if (elapsed === duration) {
        // Done
        setBegin(final);
      } else {
        id = requestAnimationFrame(tick);
      }
    };

    id = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(id);
  }, [begin, final, easingFunction, duration]);

  return [value, setFinalValue];
};
