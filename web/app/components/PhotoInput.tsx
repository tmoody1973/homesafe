"use client";

import { Button } from "@heroui/react";
import { useRef, useState } from "react";

// The browser re-encodes the photo before it ever leaves the phone: drawn to
// a canvas, exported as fresh JPEG. That drops all EXIF metadata — including
// the GPS position embedded in every phone photo. For someone documenting
// their landlord, the stripped location is the point, so it happens client
// side where the original never needs to be sent anywhere.

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

async function stripAndResize(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
}

export function PhotoInput() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function onPick(picked: File): Promise<void> {
    setProcessing(true);
    const clean = await stripAndResize(picked);
    setProcessing(false);
    if (!clean) {
      fileRef.current!.value = "";
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(new File([clean], "photo.jpg", { type: "image/jpeg" }));
    fileRef.current!.files = transfer.files;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(clean);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <input
        accept="image/*"
        className="hidden"
        name="photo"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) void onPick(picked);
        }}
        ref={fileRef}
        type="file"
      />
      <Button
        isDisabled={processing}
        onPress={() => fileRef.current?.click()}
        size="sm"
        type="button"
        variant="secondary"
      >
        {processing ? "Preparing…" : preview ? "Change photo" : "Add a photo"}
      </Button>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="Photo you attached" className="h-12 w-12 rounded-lg object-cover" src={preview} />
      )}
      <p className="text-xs text-muted">
        Location data is removed from the photo before it leaves your device.
      </p>
    </div>
  );
}
