import { useEffect, useRef, type ReactNode } from 'react';
import { pixelsToCanvas } from '../browser/media';

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card">
      <header className="card-h">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Num({ label, value, onChange, step = 1, min, max, unit, title }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; title?: string }) {
  return (
    <label className="fld" title={title}>
      <span>{label}</span>
      <span className="row">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value.replace(',', '.'));
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        {unit && <small>{unit}</small>}
      </span>
    </label>
  );
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="fld slider">
      <span>
        {label} <b>{value.toFixed(2)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="fld">
      <span>{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="chk">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function PixelCanvas({ pixels, width, height, className }: { pixels: Uint8Array; width: number; height: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) pixelsToCanvas(ref.current, pixels, width, height);
  }, [pixels, width, height]);
  return <canvas ref={ref} className={'pix ' + (className ?? '')} />;
}

export function RgbaCanvas({ rgba, width, height, className, label }: { rgba: Uint8ClampedArray; width: number; height: number; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = width;
    c.height = height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }, [rgba, width, height]);
  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.round(value * 100)}%` }} />
      <span>{label ?? `${Math.round(value * 100)}%`}</span>
    </div>
  );
}

export function Note({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' | 'ok' }) {
  return <p className={`note ${kind}`}>{children}</p>;
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};
export const fmtBytes = (b: number) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(0) + ' kB');
