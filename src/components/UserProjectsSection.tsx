import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Plus, Trash2, Loader2, ChevronRight, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAlbumSync } from '../lib/useAlbumSync';
import type { AlbumData } from '../lib/useAlbumSync';

/* ══════════════════════════════════════════════════════════════════════════
   UserProjectsSection — Shows logged-in user's albums on the home page
   ══════════════════════════════════════════════════════════════════════════ */

export function UserProjectsSection() {
  const { user } = useAuth();
  const { loadAll, deleteAlbum } = useAlbumSync();

  const [albums, setAlbums] = useState<AlbumData[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch albums on mount / when user changes
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAlbums() {
      setLoading(true);
      try {
        const userAlbums = await loadAll(user!.id);
        if (!cancelled) {
          // Sort by most recently updated
          const sorted = [...userAlbums].sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime;
          });
          setAlbums(sorted);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchAlbums();
    return () => { cancelled = true; };
  }, [user?.id, loadAll]);

  const handleDelete = useCallback(
    async (albumId: string) => {
      if (!confirm('Are you sure you want to delete this album?')) return;
      const result = await deleteAlbum(albumId);
      if (result.success) {
        setAlbums((prev) => prev.filter((a) => a.id !== albumId));
      }
    },
    [deleteAlbum]
  );

  // Not logged in — don't render
  if (!user) return null;

  return (
    <section className="bg-[#FFF8F0] py-16 border-b border-[rgba(45,45,45,0.06)]">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 lg:px-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h2 className="font-display text-[1.75rem] sm:text-[2rem] font-bold text-[#2D2D2D]">
              Your Projects
            </h2>
            <p className="text-[#6B6B6B] text-sm mt-1">
              {albums.length > 0
                ? `${albums.length} saved ${albums.length === 1 ? 'album' : 'albums'}`
                : 'Start creating your first album'}
            </p>
          </div>
          <Link
            to="/builder"
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-[#F4C2A1] text-white text-sm font-semibold rounded-xl hover:brightness-105 transition-all"
          >
            <Plus size={16} />
            New Album
          </Link>
        </motion.div>

        {/* Albums Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-[#E8A598]" />
          </div>
        ) : albums.length === 0 ? (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl border border-[#E8D5D0]/50 p-10 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#FDE8E4] flex items-center justify-center">
              <BookOpen size={28} className="text-[#E8A598]" />
            </div>
            <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-2">
              No projects yet
            </h3>
            <p className="text-[#6B6B6B] text-sm mb-6 max-w-sm mx-auto">
              Create your first photo album and it will appear here. All your projects are automatically saved to the cloud.
            </p>
            <Link
              to="/builder"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all"
            >
              <Sparkles size={16} />
              Create Your First Album
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {albums.map((album, index) => (
              <motion.div
                key={album.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="group bg-white rounded-2xl border border-[#E8D5D0]/50 overflow-hidden hover:shadow-lg hover:shadow-[#E8A598]/10 hover:border-[#E8A598]/30 transition-all"
              >
                {/* Thumbnail */}
                <Link to={`/builder?album=${album.id}`} className="block">
                  <div className="aspect-[4/3] bg-[#F5EDE8] relative overflow-hidden">
                    {album.coverPhoto ? (
                      <img
                        src={album.coverPhoto}
                        alt={album.title || 'Album cover'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen size={36} className="text-[#E8D5D0]" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <Link to={`/builder?album=${album.id}`} className="block">
                        <h4 className="font-semibold text-[#2D2D2D] text-sm truncate group-hover:text-[#E8A598] transition-colors">
                          {album.title || 'Untitled Album'}
                        </h4>
                      </Link>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-[#8B7E7A]">
                          {album.sizePreset}
                        </span>
                      </div>
                      {album.updatedAt && (
                        <div className="flex items-center gap-1 mt-1">
                          <Clock size={10} className="text-[#8B7E7A]/50" />
                          <span className="text-[0.7rem] text-[#8B7E7A]/60">
                            {formatRelativeTime(new Date(album.updatedAt))}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 ml-2">
                      <Link
                        to={`/builder?album=${album.id}`}
                        className="p-1.5 rounded-lg text-[#8B7E7A] hover:text-[#E8A598] hover:bg-[#FDE8E4] transition-all"
                        title="Open album"
                      >
                        <ChevronRight size={16} />
                      </Link>
                      <button
                        onClick={() => album.id && handleDelete(album.id)}
                        className="p-1.5 rounded-lg text-[#8B7E7A] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete album"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* "Create New" card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: albums.length * 0.08 }}
            >
              <Link
                to="/builder"
                className="flex flex-col items-center justify-center h-full min-h-[200px] rounded-2xl border-2 border-dashed border-[#E8D5D0] hover:border-[#F4C2A1] hover:bg-[#FDE8E4]/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-[#FDE8E4] flex items-center justify-center mb-3 group-hover:bg-[#F4C2A1] group-hover:text-white transition-all">
                  <Plus size={20} className="text-[#E8A598] group-hover:text-white" />
                </div>
                <span className="text-sm font-medium text-[#8B7E7A] group-hover:text-[#E8A598]">
                  Create New Album
                </span>
              </Link>
            </motion.div>
          </div>
        )}

        {/* Mobile-only New Album button (shown below grid) */}
        <div className="sm:hidden mt-6">
          <Link
            to="/builder"
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 transition-all"
          >
            <Plus size={18} />
            Create New Album
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Relative time formatter ── */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default UserProjectsSection;
