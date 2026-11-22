import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export function RecordingPlayer({
  sessionId,
  fps,
  frame,
  end,
  playing,
  imageRef,
  onFrame,
  onPlaying,
  onLoaded,
  onError,
}: {
  sessionId: string;
  fps: number;
  frame: number;
  end: number;
  playing: boolean;
  imageRef: RefObject<HTMLImageElement | null>;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
  onLoaded: (frame: number) => void;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [native, setNative] = useState(true);
  const [readyFrame, setReadyFrame] = useState(-1);
  const pausedFrame = useRef(frame);
  if (!playing) pausedFrame.current = frame;
  const imageFrame = playing && native ? pausedFrame.current : frame;

  useEffect(() => {
    const player = video.current;
    if (!player || !native) return;
    if (!playing) {
      player.pause();
      return;
    }
    let active = true;
    let callback = 0;
    let animation = 0;
    player.currentTime = frame / fps;
    player.play().catch((error: DOMException) => {
      if (!active || error.name === 'AbortError') return;
      if (error.name === 'NotSupportedError') setNative(false);
      else {
        onPlaying(false);
        onError('Playback could not start. Try pressing play again.');
      }
    });
    const update = (time: number) => {
      if (!active) return;
      const next = Math.min(end, Math.max(0, Math.floor(time * fps + 0.001)));
      onFrame(next);
      if (next >= end) {
        player.pause();
        onPlaying(false);
      }
    };
    if (typeof player.requestVideoFrameCallback === 'function') {
      const tick: VideoFrameRequestCallback = (_now, metadata) => {
        update(metadata.mediaTime);
        if (active && !player.paused) callback = player.requestVideoFrameCallback(tick);
      };
      callback = player.requestVideoFrameCallback(tick);
    } else {
      const tick = () => {
        update(player.currentTime);
        if (active) animation = requestAnimationFrame(tick);
      };
      animation = requestAnimationFrame(tick);
    }
    return () => {
      active = false;
      player.pause();
      if (callback) player.cancelVideoFrameCallback(callback);
      cancelAnimationFrame(animation);
    };
    // Frame updates come from the player clock; they must not restart playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, native, sessionId, end, fps, onFrame, onPlaying, onError]);

  useEffect(() => {
    if (native || !playing || readyFrame !== frame) return;
    if (frame >= end) {
      onPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => onFrame(Math.min(end, frame + Math.max(1, Math.round(fps / 12)))),
      1000 / 12,
    );
    return () => clearTimeout(timer);
  }, [native, playing, readyFrame, frame, end, fps, onFrame, onPlaying]);

  return (
    <>
      <video
        ref={video}
        src={`/api/sessions/${sessionId}/media`}
        preload="metadata"
        muted
        playsInline
        aria-label="Recording playback"
        className={playing && native ? 'recording-video' : 'recording-video hidden-media'}
        onError={() => setNative(false)}
        onEnded={() => {
          onFrame(end);
          onPlaying(false);
        }}
      />
      <img
        ref={imageRef}
        src={`/api/sessions/${sessionId}/frame/${imageFrame}`}
        alt={`Recording frame ${imageFrame}`}
        className={playing && native ? 'hidden-media' : undefined}
        draggable={false}
        onLoad={() => {
          setReadyFrame(imageFrame);
          onLoaded(imageFrame);
        }}
        onError={() => {
          onPlaying(false);
          onError('Could not load this frame. Try a different frame or recording.');
        }}
      />
      {!native && (
        <span
          className="preview-codec-note"
          title="This file uses a format your browser cannot play directly. For full-frame playback, use H.264 MP4."
        >
          Sampled preview
        </span>
      )}
    </>
  );
}
