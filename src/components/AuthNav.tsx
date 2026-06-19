import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import LoginModal from '../pages/auth/LoginModal';
import SignupModal from '../pages/auth/SignupModal';

export default function AuthNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  return (
    <>
      {user ? (
        <div className="flex items-center gap-1">
          <Link
            to="/profile"
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-[#2D2D2D] hover:text-[#E8A598] transition-colors rounded-lg hover:bg-[#FDE8E4] min-w-0"
            title={user.user_metadata?.full_name || user.email || 'Account'}
          >
            <User size={16} className="shrink-0 text-[#E8A598]" />
            <span className="truncate max-w-[70px] hidden sm:inline">
              {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Me'}
            </span>
          </Link>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#2D2D2D] hover:text-[#E8A598] transition-colors rounded-lg hover:bg-[#FDE8E4]"
            title="Sign Out"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLogin(true)}
            className="px-3 py-1.5 text-xs font-medium text-[#E8A598] border border-[#F4C2A1] rounded-lg hover:bg-[#FDE8E4] transition-colors"
          >
            Log In
          </button>
          <button
            onClick={() => setShowSignup(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#E8A598] rounded-lg hover:brightness-105 transition-all"
          >
            Sign Up
          </button>
        </div>
      )}

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSwitchToSignup={() => { setShowLogin(false); setShowSignup(true); }}
      />
      <SignupModal
        isOpen={showSignup}
        onClose={() => setShowSignup(false)}
        onSwitchToLogin={() => { setShowSignup(false); setShowLogin(true); }}
      />
    </>
  );
}
