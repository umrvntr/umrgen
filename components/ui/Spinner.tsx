import React from 'react';

interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 14 }: SpinnerProps) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}
