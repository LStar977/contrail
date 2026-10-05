import { PlaneGlyph } from '@/components/ui/Icon';

/** The "contrail" progress bar: a vapour trail that fades out behind the aircraft, dotted ahead of it. */
export default function Progress({ frac, label }: { frac: number; label: string }) {
  const pct = Math.max(0, Math.min(100, frac * 100));
  return (
    <div className="progress" role="img" aria-label={label}>
      <div className="progress__track" />
      <div className="progress__fill" style={{ width: `${pct}%` }} />
      <span className="progress__o" />
      <span className="progress__d" />
      <PlaneGlyph className="progress__plane" style={{ left: `${pct}%` }} />
    </div>
  );
}
