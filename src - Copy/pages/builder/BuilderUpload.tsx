import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Trash2, Replace } from 'lucide-react';
import type { UploadedPhoto } from './types';

interface BuilderUploadProps {
  photos: UploadedPhoto[];
  onAddPhotos: (files: FileList | File[]) => void;
  onRemovePhoto: (id: string) => void;
  onReplacePhoto: (id: string, file: File) => void;
  onNext: () => void;
}

export default function BuilderUpload({ photos, onAddPhotos, onRemovePhoto, onReplacePhoto, onNext }: BuilderUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) onAddPhotos(e.dataTransfer.files);
  }, [onAddPhotos]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  return (
    <div className="flex flex-col h-full bg-[#FFF8F0]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#F0F0F0] flex items-center justify-between bg-white">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#2D2D2D]">Step 1: Upload Photos</h2>
          <p className="text-xs text-[#9B9B9B] mt-0.5">{photos.length} photos uploaded</p>
        </div>
        <button
          onClick={onNext}
          disabled={photos.length === 0}
          className="px-6 py-2 bg-[#F4C2A1] text-white font-body text-sm font-semibold rounded-lg hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue →
        </button>
      </div>

      {/* Drop Zone + Grid */}
      <div className="flex-1 overflow-auto p-6">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className="mb-6 border-2 border-dashed rounded-xl p-8 text-center transition-colors"
          style={{
            borderColor: isDragging ? '#F4C2A1' : '#E8E8E8',
            backgroundColor: isDragging ? '#FFF8F0' : 'transparent',
          }}
        >
          <Upload size={32} className="mx-auto text-[#C4C4C4] mb-2" />
          <p className="text-sm text-[#6B6B6B] font-medium">
            Drag & drop photos here or <label className="text-[#F4C2A1] cursor-pointer hover:underline"><input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && onAddPhotos(e.target.files)} />browse</label>
          </p>
          <p className="text-xs text-[#9B9B9B] mt-1">JPG, PNG up to 100 photos</p>
        </div>

        {/* Photo grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {photos.map((photo) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative aspect-square rounded-lg overflow-hidden border border-[#E8E8E8] bg-white"
              >
                <img src={photo.previewUrl} alt={photo.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <label className="p-1.5 bg-white rounded-full cursor-pointer hover:scale-110 transition-transform">
                    <Replace size={12} className="text-[#2D2D2D]" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onReplacePhoto(photo.id, e.target.files[0])} />
                  </label>
                  <button onClick={() => onRemovePhoto(photo.id)} className="p-1.5 bg-white rounded-full hover:scale-110 transition-transform">
                    <Trash2 size={12} className="text-[#E8A598]" />
                  </button>
                </div>
                <p className="absolute bottom-0 left-0 right-0 text-[9px] text-white bg-black/50 px-1 py-0.5 truncate">{photo.name}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
