import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function FileDropZone({ className, label, disabled, onFiles, children }: {
  className: string;
  label: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  return <div className={`file-drop-zone ${className}${active && !disabled ? ' drag-active' : ''}`} role="group" aria-label={label} aria-disabled={disabled}
    onDragEnter={e => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault(); e.stopPropagation();
      depth.current++; setActive(true);
    }} onDragLeave={e => {
      e.stopPropagation();
      if (--depth.current <= 0) { depth.current = 0; setActive(false); }
    }} onDragOver={e => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    }} onDrop={e => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault(); e.stopPropagation(); depth.current = 0; setActive(false);
      if (!disabled) onFiles([...e.dataTransfer.files]);
    }}>{children}</div>;
}
