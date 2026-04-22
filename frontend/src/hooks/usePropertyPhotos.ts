import { useState, useEffect } from "react";
import { photoService, type Photo } from "@/services/photo";
import toast from "react-hot-toast";

export interface PropertyPhotos {
  photosByJob: Record<string, Photo[]>;
  uploadPhoto(jobId: string, file: File, propertyId: string): Promise<void>;
  uploadRoomPhoto(roomId: string, file: File, propertyId: string): Promise<void>;
}

export function usePropertyPhotos(propertyId: string | undefined): PropertyPhotos {
  const [photosByJob, setPhotosByJob] = useState<Record<string, Photo[]>>({});

  useEffect(() => {
    if (!propertyId) return;
    photoService.getByProperty(propertyId)
      .then((photos) => {
        const map: Record<string, Photo[]> = {};
        for (const p of photos) (map[p.jobId] ??= []).push(p);
        setPhotosByJob(map);
      })
      .catch((e) => console.error("[usePropertyPhotos] load failed:", e));
  }, [propertyId]);

  async function uploadPhoto(jobId: string, file: File, propId: string) {
    try {
      const photo = await photoService.upload(file, jobId, propId, "PostConstruction", "Job photo");
      setPhotosByJob((prev) => ({ ...prev, [jobId]: [...(prev[jobId] ?? []), photo] }));
    } catch (err: any) {
      toast.error(err.message ?? "Photo upload failed");
    }
  }

  async function uploadRoomPhoto(roomId: string, file: File, propId: string) {
    try {
      const photo = await photoService.uploadRoomPhoto(file, roomId, propId, "PostConstruction", "Room photo");
      const key = `ROOM_${roomId}`;
      setPhotosByJob((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), photo] }));
    } catch (err: any) {
      toast.error(err.message ?? "Photo upload failed");
    }
  }

  return { photosByJob, uploadPhoto, uploadRoomPhoto };
}
