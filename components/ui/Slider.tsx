import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}

export function Slider({ label, value, onChange, min, max, step = 0.01, format }: SliderProps) {
  return (
    <div className="pp-item">
      <span className="pp-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="pp-slider"
      />
      <span className="pp-value">{format ? format(value) : value.toFixed(2)}</span>
    </div>
  );
}
