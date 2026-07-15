import type { StickerImageSource } from "./stickerCanvas";

export type StickerVideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

export type StickerVideoFrame = {
  source: StickerImageSource;
  time: number;
};

export type StickerVideoExtractOptions = {
  frameCount: number;
  startTime?: number;
  endTime?: number;
  maxDuration?: number;
};

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];

export function isVideoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type.startsWith("video/") || VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function getVideoMetadata(file: File): Promise<StickerVideoMetadata> {
  const { video, revoke } = await loadVideo(file);
  try {
    return {
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    revoke();
  }
}

export async function extractVideoFrames(
  file: File,
  options: StickerVideoExtractOptions,
): Promise<StickerVideoFrame[]> {
  const { video, revoke } = await loadVideo(file);
  try {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || !video.videoWidth || !video.videoHeight) {
      throw new Error("无法读取视频时长或尺寸，请换一个浏览器可解码的视频文件。");
    }

    const frameCount = Math.max(2, Math.floor(options.frameCount));
    const start = clamp(options.startTime ?? 0, 0, duration);
    const maxEnd = options.maxDuration ? Math.min(duration, start + options.maxDuration) : duration;
    const end = clamp(options.endTime && options.endTime > start ? options.endTime : maxEnd, start, duration);
    const span = Math.max(0.01, end - start);
    const times = Array.from({ length: frameCount }, (_, index) => {
      if (frameCount === 1) return start;
      return Math.min(end - 0.001, start + (span * index) / (frameCount - 1));
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas。 ");

    const frames: StickerVideoFrame[] = [];
    for (const time of times) {
      await seekVideo(video, time);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToPngBlob(canvas);
      const src = URL.createObjectURL(blob);
      const labelTime = time.toFixed(2);
      frames.push({
        time,
        source: {
          src,
          name: `${file.name} @ ${labelTime}s`,
          revoke: () => URL.revokeObjectURL(src),
        },
      });
    }
    return frames;
  } finally {
    revoke();
  }
}

function loadVideo(file: File): Promise<{ video: HTMLVideoElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanupListeners = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const revoke = () => {
      cleanupListeners();
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(src);
    };
    const onLoaded = () => {
      cleanupListeners();
      resolve({ video, revoke });
    };
    const onError = () => {
      cleanupListeners();
      URL.revokeObjectURL(src);
      reject(new Error("无法加载视频，请确认文件格式可被当前浏览器解码。"));
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.src = src;
    video.load();
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("视频抽帧失败，请尝试缩短截取范围或更换视频。"));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = time;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("视频帧导出失败。"));
      else resolve(blob);
    }, "image/png");
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
