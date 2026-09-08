'use client';

import { useRef, useState } from 'react';
import { ImagePurpose, formatBytes } from '@decor/shared';
import { optimizeImage } from '@/lib/optimize-image';

export interface PendingPhoto {
  file: File;
  previewUrl: string;
  originalSize: number;
}

/**
 * One of the two photo fields. Files are optimised the moment they are chosen,
 * so what the user sees queued is what will actually be sent — and the saving
 * is shown, because on a site visit over mobile data it is the difference
 * between an upload that completes and one that does not.
 */
export function PhotoField({
  label,
  hint,
  purpose,
  photos,
  onChange,
  multiple = true,
}: {
  label: string;
  hint?: string;
  purpose: ImagePurpose;
  photos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const optimized: PendingPhoto[] = [];
      for (const file of Array.from(files)) {
        const out = await optimizeImage(file, purpose);
        optimized.push({
          file: out,
          previewUrl: URL.createObjectURL(out),
          originalSize: file.size,
        });
      }
      onChange(multiple ? [...photos, ...optimized] : optimized.slice(0, 1));
    } finally {
      setBusy(false);
    }
  };

  const remove = (index: number) => {
    URL.revokeObjectURL(photos[index].previewUrl);
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="field">
      <label>{label}</label>
      {hint ? (
        <p className="t-tiny faint" style={{ margin: '0 0 var(--s-sm)', lineHeight: 1.45 }}>
          {hint}
        </p>
      ) : null}

      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files);
        }}>
        {busy ? 'Optimising…' : 'Click or drop images here'}
        {busy ? null : (
          <span className="t-tiny faint">JPG, PNG or PDF — resized before upload</span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple={multiple}
        hidden
        onChange={(e) => void accept(e.target.files)}
      />

      {photos.length ? (
        <div className="thumb-grid">
          {photos.map((photo, index) => (
            <div className="thumb" key={photo.previewUrl}>
              <button type="button" className="remove" onClick={() => remove(index)}>×</button>
              {/* Local object URL preview; next/image cannot optimise a blob. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="" />
              <div className="meta">
                {formatBytes(photo.originalSize)} → {formatBytes(photo.file.size)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
