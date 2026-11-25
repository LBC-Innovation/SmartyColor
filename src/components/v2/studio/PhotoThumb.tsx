"use client";

import { useEffect, useRef } from "react";
import { ImageIcon } from "lucide-react";
import { isHeicFile } from "@/lib/photo/heicFile";

/** Square preview. The object URL is made and revoked with the tile; HEIC keeps the generic tile. */
export function PhotoThumb({ file }: { file: File }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const heic = isHeicFile(file);
  useEffect(() => {
    const img = imgRef.current;
    if (heic || !img) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, heic]);
  return (
    <>
      <span className="absolute inset-0 flex items-center justify-center bg-v2-primary-light text-v2-primary" aria-hidden>
        <ImageIcon className="h-6 w-6" />
      </span>
      {heic ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </>
  );
}
