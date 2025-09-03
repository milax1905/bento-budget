import React, { useState, useMemo } from "react";

export function Slider({ defaultValue=[0], min=0, max=100, step=1, onValueChange=()=>{} }) {
  const [val, setVal] = useState(defaultValue[0] ?? 0);
  const pct = useMemo(() => ((val - min) * 100) / Math.max(1, max - min), [val, min, max]);

  return (
    <input
      type="range"
      min={min} max={max} step={step} value={val}
      onChange={(e) => {
        const v = Number(e.target.value);
        setVal(v); onValueChange([v]);
      }}
      className="bb-slider"
      style={{
        background: `linear-gradient(to right, #6366f1 ${pct}%, #334155 ${pct}%)`,
      }}
    />
  );
}