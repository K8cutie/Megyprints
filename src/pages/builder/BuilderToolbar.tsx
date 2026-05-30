import { ChevronLeft, ChevronRight, BookOpen, ShoppingBag, Eye } from 'lucide-react';

interface BuilderToolbarProps {
  currentIndex: number;
  totalPages: number;
  onGoToPage: (index: number) => void;
  onBack: () => void;
  backLabel?: string;
  onOrder: () => void;
  spreadView: boolean;
  onToggleSpreadView: () => void;
}

export default function BuilderToolbar({
  currentIndex,
  totalPages,
  onGoToPage,
  onBack,
  backLabel = 'Back',
  onOrder,
  spreadView,
  onToggleSpreadView,
}: BuilderToolbarProps) {
  return (
    <div className="h-12 bg-white border-b border-[#E8E8E8] flex items-center px-4 gap-2 shrink-0">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#6B6B6B] hover:bg-[#F0F0F0] transition-colors"
      >
        <ChevronLeft size={14} /> {backLabel}
      </button>

      <div className="w-px h-5 bg-[#E8E8E8]" />

      {/* Page navigation */}
      <button
        onClick={() => onGoToPage(currentIndex - 1)}
        disabled={currentIndex <= 0}
        className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B] disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>

      <span className="text-xs text-[#2D2D2D] font-medium tabular-nums min-w-[60px] text-center">
        {currentIndex + 1} / {totalPages}
      </span>

      <button
        onClick={() => onGoToPage(currentIndex + 1)}
        disabled={currentIndex >= totalPages - 1}
        className="p-1.5 rounded-md hover:bg-[#F0F0F0] text-[#6B6B6B] disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={16} />
      </button>

      <div className="w-px h-5 bg-[#E8E8E8]" />

      {/* Spread view toggle */}
      <button
        onClick={onToggleSpreadView}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          spreadView
            ? 'bg-[#FDE8E4] text-[#E8A598]'
            : 'text-[#6B6B6B] hover:bg-[#F0F0F0]'
        }`}
      >
        <BookOpen size={14} /> Spread
      </button>

      <div className="flex-1" />

      {/* Preview eye */}
      <button className="p-1.5 rounded-md text-[#9B9B9B] hover:bg-[#F0F0F0] transition-colors">
        <Eye size={14} />
      </button>

      <div className="w-px h-5 bg-[#E8E8E8]" />

      {/* Order */}
      <button
        onClick={onOrder}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-[#F4C2A1] text-white text-xs font-semibold rounded-lg hover:brightness-105 transition-all"
      >
        <ShoppingBag size={14} /> Order
      </button>
    </div>
  );
}
