import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  LogOut,
  Camera,
  Save,
  BookOpen,
  Trash2,
  ChevronLeft,
  Loader2,
  LayoutGrid,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import { isAdminEmail } from '../lib/templateSettings';
import { useAlbumSync } from '../lib/useAlbumSync';
import { supabase } from '../lib/supabase';
import type { AlbumData } from '../lib/useAlbumSync';

// =============================================================================
// Types
// =============================================================================

export interface ProfilePageProps {
  onBack?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function Profile({ onBack }: ProfilePageProps) {
  const { user, logout, loading: authLoading } = useAuth();
  const { loadAll, deleteAlbum, loading: albumsLoading } = useAlbumSync();

  const [albums, setAlbums] = useState<AlbumData[]>([]);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load user data
  useEffect(() => {
    if (user) {
      const name = (user.user_metadata?.full_name as string) || '';
      setFullName(name);
      setAvatarUrl(
        (user.user_metadata?.avatar_url as string) ||
          (user.user_metadata?.picture as string) ||
          null
      );
    }
  }, [user]);

  // Load user's albums
  useEffect(() => {
    if (!user?.id) return;

    async function fetchAlbums() {
      if (!user?.id) return;
      const userAlbums = await loadAll(user.id);
      setAlbums(userAlbums);
    }

    void fetchAlbums();
  }, [user?.id, loadAll, user]);

  const handleAvatarSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type and size
      if (!file.type.startsWith('image/')) {
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        return; // 5MB limit
      }

      setSelectedAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const handleAvatarClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!user) return;

    setSaveStatus('saving');
    try {
      const updates: { data: Record<string, unknown> } = {
        data: {
          full_name: fullName.trim(),
        },
      };

      // If a new avatar was selected, store as data URL for now
      // In production, upload to Supabase Storage and use the public URL
      if (avatarPreview) {
        updates.data.avatar_url = avatarPreview;
      }

      const { error } = await supabase.auth.updateUser(updates);

      if (error) throw error;

      setAvatarUrl(avatarPreview || avatarUrl);
      setSelectedAvatarFile(null);
      setIsEditing(false);
      setSaveStatus('saved');

      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [user, fullName, avatarPreview, avatarUrl]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setSelectedAvatarFile(null);
    setAvatarPreview(null);
    setFullName((user?.user_metadata?.full_name as string) || '');
    setSaveStatus('idle');
  }, [user]);

  const handleDeleteAlbum = useCallback(
    async (albumId: string) => {
      if (!confirm('Are you sure you want to delete this album?')) return;

      const result = await deleteAlbum(albumId);
      if (result.success) {
        setAlbums((prev) => prev.filter((a) => a.id !== albumId));
      }
    },
    [deleteAlbum]
  );

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF7] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-[#E8A598] mx-auto mb-3" />
          <p className="text-[#8B7E7A]">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-[#FFFBF7] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <User size={48} className="text-[#E8D5D0] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#4A423F] mb-2">Not Signed In</h2>
          <p className="text-[#8B7E7A] text-sm mb-6">
            Please sign in to view and manage your profile, albums, and photos.
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center justify-center gap-2 mx-auto rounded-xl bg-[#E8A598] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#D8958D] transition-colors"
            >
              <ChevronLeft size={16} />
              Back to Home
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  const displayName =
    fullName.trim() || (user.user_metadata?.full_name as string) || 'Photo Enthusiast';
  const currentAvatar = avatarPreview || avatarUrl;
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-[#FFFBF7]">
      {/* Header */}
      <header className="bg-white border-b border-[#E8D5D0]/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 rounded-xl text-[#8B7E7A] hover:text-[#4A423F] hover:bg-[#F5EDE8] transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <h1 className="text-xl font-bold text-[#4A423F]">My Profile</h1>
          </div>

          <div className="flex items-center gap-2">
            {isAdminEmail(user?.email) && (
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-xl border-2 border-[#E8D5D0] px-4 py-2 text-sm font-medium text-[#4A423F] hover:bg-[#F5EDE8] transition-all"
              >
                <LayoutGrid size={16} />
                <span className="hidden sm:inline">Templates</span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl border-2 border-[#E8D5D0] px-4 py-2 text-sm font-medium text-[#4A423F] hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-all"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Profile Card */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-[#E8D5D0]/50 p-6 sm:p-8"
        >
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0 self-center sm:self-start">
              <button
                onClick={isEditing ? handleAvatarClick : undefined}
                className={`relative h-24 w-24 rounded-full overflow-hidden border-4 border-[#FFFBF7] shadow-lg ${
                  isEditing
                    ? 'cursor-pointer ring-2 ring-[#E8A598] ring-offset-2'
                    : 'cursor-default'
                }`}
              >
                {currentAvatar ? (
                  <img
                    src={currentAvatar}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[#E8A598] to-[#D8958D] flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{initials}</span>
                  </div>
                )}
                {isEditing && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <Camera size={20} className="text-white" />
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>

            {/* Info */}
            <div className="flex-1 w-full">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-[#4A423F]">{displayName}</h2>
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs font-medium text-[#E8A598] hover:text-[#D8958D] transition-colors"
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-[#8B7E7A] mb-4">
                <Mail size={14} />
                <span>{user.email}</span>
              </div>

              {isEditing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 overflow-hidden"
                >
                  {/* Name Field */}
                  <div>
                    <label className="block text-sm font-medium text-[#4A423F] mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-xl border-2 border-[#E8D5D0] bg-white py-2 px-4 text-sm text-[#4A423F] placeholder-[#8B7E7A]/50 focus:border-[#E8A598] focus:outline-none focus:ring-2 focus:ring-[#E8A598]/20 transition-all"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={handleSaveProfile}
                      disabled={saveStatus === 'saving'}
                      className="flex items-center gap-1.5 rounded-xl bg-[#E8A598] px-4 py-2 text-sm font-medium text-white hover:bg-[#D8958D] transition-all disabled:opacity-60"
                    >
                      {saveStatus === 'saving' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                      {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="rounded-xl border-2 border-[#E8D5D0] px-4 py-2 text-sm font-medium text-[#8B7E7A] hover:bg-[#F5EDE8] transition-all"
                    >
                      Cancel
                    </button>

                    {saveStatus === 'saved' && (
                      <span className="text-xs text-emerald-600 font-medium">Saved!</span>
                    )}
                    {saveStatus === 'error' && (
                      <span className="text-xs text-red-500 font-medium">Error saving</span>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.section>

        {/* Albums Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#4A423F] flex items-center gap-2">
              <BookOpen size={20} className="text-[#E8A598]" />
              My Albums
            </h3>
            <span className="text-sm text-[#8B7E7A]">
              {albums.length} {albums.length === 1 ? 'album' : 'albums'}
            </span>
          </div>

          {albumsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[#E8A598]" />
            </div>
          ) : albums.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8D5D0]/50 p-8 text-center">
              <BookOpen size={40} className="text-[#E8D5D0] mx-auto mb-3" />
              <p className="text-[#8B7E7A] text-sm mb-1">No albums yet</p>
              <p className="text-[#8B7E7A]/70 text-xs">
                Start creating beautiful photo albums from the home page.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {albums.map((album, index) => (
                <motion.div
                  key={album.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="group bg-white rounded-2xl border border-[#E8D5D0]/50 overflow-hidden hover:shadow-lg hover:shadow-[#E8A598]/10 hover:border-[#E8A598]/30 transition-all"
                >
                  {/* Thumbnail */}
                  <div className="aspect-[4/3] bg-[#F5EDE8] relative overflow-hidden">
                    {album.coverPhoto ? (
                      <img
                        src={album.coverPhoto}
                        alt={album.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen size={32} className="text-[#E8D5D0]" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-[#4A423F] text-sm truncate">
                          {album.title || 'Untitled Album'}
                        </h4>
                        <p className="text-xs text-[#8B7E7A] mt-0.5">
                          {album.sizePreset} &middot; {album.pages?.length ?? 0} pages
                        </p>
                        {album.updatedAt && (
                          <p className="text-xs text-[#8B7E7A]/60 mt-0.5">
                            Updated {new Date(album.updatedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => album.id && handleDeleteAlbum(album.id)}
                        className="p-1.5 rounded-lg text-[#8B7E7A] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete album"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Account Info */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl border border-[#E8D5D0]/50 p-6"
        >
          <h3 className="text-lg font-bold text-[#4A423F] mb-4">Account Information</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-[#F5EDE8]">
              <span className="text-[#8B7E7A]">Account ID</span>
              <span className="text-[#4A423F] font-mono text-xs">{user.id}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#F5EDE8]">
              <span className="text-[#8B7E7A]">Email</span>
              <span className="text-[#4A423F]">{user.email}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#F5EDE8]">
              <span className="text-[#8B7E7A]">Provider</span>
              <span className="text-[#4A423F] capitalize">
                {(user.app_metadata?.provider as string) || 'Email'}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[#8B7E7A]">Last Sign In</span>
              <span className="text-[#4A423F]">
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString()
                  : 'N/A'}
              </span>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}

export default Profile;
