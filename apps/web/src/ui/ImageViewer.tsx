'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface ViewableImage {
  id: string;
  /** Absolute URL on the API. Fetched with the bearer token, not linked to. */
  url: string;
  caption?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const STEP = 0.25;

/**
 * Looking at an attachment properly, on the web.
 *
 * A thumbnail is a reminder that a photo exists, not a way to read it. So a
 * click opens it over the page: the wheel zooms, a drag moves it once zoomed,
 * a double-click toggles, and the arrow keys move between pictures. It mirrors
 * the app's viewer so the two products behave the same way.
 *
 * The pictures are fetched rather than linked, because the API serves them
 * behind a bearer token and an `<img src>` cannot carry a header. Putting the
 * token in the URL instead would leak it into history and logs.
 */
export function ImageViewer({
  images,
  index,
  onClose,
  token,
}: {
  images: ViewableImage[];
  index: number | null;
  onClose: () => void;
  /** Bearer token for the API that serves the files. */
  token: string | null;
}) {
  const [current, setCurrent] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const open = index !== null;
  const image = images[current];

  useEffect(() => {
    if (index !== null) setCurrent(index);
  }, [index]);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(reset, [current, reset]);

  // Fetched with the token and released again, so a long session does not
  // accumulate blobs for every picture that was ever opened.
  useEffect(() => {
    if (!open || !image) return;
    let url: string | null = null;
    let cancelled = false;
    setObjectUrl(null);
    setFailed(false);

    fetch(image.url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, image, token]);

  const step = useCallback(
    (by: number) => setCurrent((c) => Math.min(Math.max(c + by, 0), images.length - 1)),
    [images.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, step, reset]);

  if (!open || !image) return null;

  /**
   * How far the picture may be moved before black would show beside it.
   *
   * A picture no larger than the screen has nowhere to go, so it stays
   * centred; a zoomed one may be moved by exactly the part hanging off each
   * edge. Without this a drag carries the picture away entirely and leaves
   * the viewer looking broken.
   */
  const panLimit = (at: number) => {
    const picture = imageRef.current;
    const stage = stageRef.current;
    if (!picture || !stage) return { x: 0, y: 0 };
    return {
      x: Math.max((picture.offsetWidth * at - stage.clientWidth) / 2, 0),
      y: Math.max((picture.offsetHeight * at - stage.clientHeight) / 2, 0),
    };
  };

  const clampOffset = (next: { x: number; y: number }, at: number) => {
    const limit = panLimit(at);
    return {
      x: Math.min(Math.max(next.x, -limit.x), limit.x),
      y: Math.min(Math.max(next.y, -limit.y), limit.y),
    };
  };

  const zoomTo = (next: number) => {
    const clamped = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    setScale(clamped);
    // Zooming out can leave the picture parked outside the smaller frame.
    setOffset((current) => (clamped === MIN_SCALE ? { x: 0, y: 0 } : clampOffset(current, clamped)));
  };

  return (
    <div
      className="viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={image.caption ?? 'Attachment'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
      <div className="viewer-bar">
        <span className="t-small">
          {images.length > 1 ? `${current + 1} of ${images.length}` : ''}
        </span>
        <div className="viewer-tools">
          <button type="button" onClick={() => zoomTo(scale - STEP * 2)} aria-label="Zoom out">
            <Icon name="close" size={0} />
            <span aria-hidden>−</span>
          </button>
          <span className="t-tiny" data-testid="viewer-scale">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" onClick={() => zoomTo(scale + STEP * 2)} aria-label="Zoom in">
            <span aria-hidden>+</span>
          </button>
          <button type="button" onClick={reset} aria-label="Reset zoom">
            <span aria-hidden>Reset</span>
          </button>
          <button type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            className="viewer-step viewer-prev"
            aria-label="Previous"
            disabled={current === 0}
            onClick={() => step(-1)}>
            ‹
          </button>
          <button
            type="button"
            className="viewer-step viewer-next"
            aria-label="Next"
            disabled={current === images.length - 1}
            onClick={() => step(1)}>
            ›
          </button>
        </>
      ) : null}

      <div
        ref={stageRef}
        className="viewer-stage"
        data-zoomed={scale > MIN_SCALE}
        onWheel={(event) => zoomTo(scale + (event.deltaY < 0 ? STEP : -STEP))}
        onDoubleClick={() => (scale > MIN_SCALE ? reset() : zoomTo(2.5))}
        onPointerDown={(event) => {
          if (scale <= MIN_SCALE) return;
          dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          setOffset(
            clampOffset(
              { x: event.clientX - dragging.current.x, y: event.clientY - dragging.current.y },
              scale,
            ),
          );
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerLeave={() => {
          dragging.current = null;
        }}>
        {failed ? (
          <p className="t-small faint">That picture could not be loaded.</p>
        ) : objectUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={objectUrl}
            alt={image.caption ?? ''}
            data-testid={`viewer-image-${image.id}`}
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          />
        ) : (
          <span className="spinner" />
        )}
      </div>

      {image.caption ? <div className="viewer-caption">{image.caption}</div> : null}
    </div>
  );
}

/**
 * One thumbnail, fetched with the token like the viewer does.
 *
 * Kept beside the viewer because it exists for the same reason: the API will
 * not serve a file to a plain `<img src>`.
 */
export function ThumbImage({ url, token }: { url: string; token: string | null }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => (response.ok ? response.blob() : Promise.reject(response.status)))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);

  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="thumb-image" /> : <span className="thumb-image" />;
}
