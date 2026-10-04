import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, LogOut, LayoutDashboard, QrCode, Package } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { resolveRole } from '../lib/roles';
import { useAuthModal } from './AuthModalProvider';

/* 'bar' = the desktop header. 'menu' = the phone menu, which had NO way to
   log in, sign up or sign out (1-star testers, 2026-10-04): big labelled
   buttons, and `onAction` closes the menu after a tap. */
export default function AuthNav({ variant = 'bar', onAction }: { variant?: 'bar' | 'menu'; onAction?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { openLogin, openSignup } = useAuthModal();

  // Show the Admin entry for ANY operator (owner or fulfillment), not just owners.
  const [isOperator, setIsOperator] = useState(false);
  useEffect(() => {
    let active = true;
    if (!user) { setIsOperator(false); return; }
    void resolveRole(user.email).then((r) => { if (active) setIsOperator(r !== null); });
    return () => { active = false; };
  }, [user?.email]);

  if (variant === 'menu') {
    // Quiet buttons: "Get Started" under them stays the one filled way on.
    const big = 'w-64 flex items-center justify-center gap-2 py-3 rounded-xl font-body text-base font-semibold transition-colors';
    const done = (fn: () => void) => () => { onAction?.(); fn(); };
    return user ? (
      <div className="flex flex-col items-center gap-3" data-testid="menu-account">
        {isOperator && (
          <Link to="/admin" onClick={onAction} className={`${big} bg-blush-pink text-white`}><LayoutDashboard size={18} /> Admin</Link>
        )}
        <Link to="/profile" onClick={onAction} className={`${big} border border-peach text-dark`}>
          <User size={18} className="text-blush-pink" /> <span className="truncate max-w-[10rem]">{user.user_metadata?.full_name || user.email?.split('@')[0] || 'My account'}</span>
        </Link>
        <Link to="/orders" onClick={onAction} className={`${big} border border-peach text-dark`} data-testid="menu-orders"><Package size={18} className="text-blush-pink" /> Your orders</Link>
        <Link to="/memories" onClick={onAction} className={`${big} border border-peach text-dark`}><QrCode size={18} className="text-blush-pink" /> Memories</Link>
        <button onClick={done(() => { logout(); navigate('/'); })} className={`${big} text-blush-pink`} data-testid="menu-sign-out">
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-3" data-testid="menu-account">
        <button onClick={done(openLogin)} className={`${big} border border-peach text-blush-pink`} data-testid="menu-log-in">Log In</button>
        <button onClick={done(openSignup)} className={`${big} bg-blush text-blush-pink`} data-testid="menu-sign-up">Sign Up</button>
      </div>
    );
  }

  return (
    <>
      {user ? (
        <div className="flex items-center gap-1">
          {isOperator && (
            <Link
              to="/admin"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blush-pink rounded-lg hover:brightness-105 transition-all"
              title="Operator console"
            >
              <LayoutDashboard size={15} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          <Link
            to="/orders"
            className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-dark hover:text-blush-pink transition-colors rounded-lg hover:bg-blush"
            title="Your orders"
            data-testid="nav-orders"
          >
            <Package size={16} className="shrink-0 text-blush-pink" />
            <span className="hidden md:inline">Orders</span>
          </Link>
          <Link
            to="/memories"
            className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-dark hover:text-blush-pink transition-colors rounded-lg hover:bg-blush"
            title="My QR Memories"
          >
            <QrCode size={16} className="shrink-0 text-blush-pink" />
            <span className="hidden md:inline">Memories</span>
          </Link>
          <Link
            to="/profile"
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-dark hover:text-blush-pink transition-colors rounded-lg hover:bg-blush min-w-0"
            title={user.user_metadata?.full_name || user.email || 'Account'}
          >
            <User size={16} className="shrink-0 text-blush-pink" />
            <span className="truncate max-w-[70px] hidden sm:inline">
              {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Me'}
            </span>
          </Link>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-dark hover:text-blush-pink transition-colors rounded-lg hover:bg-blush"
            title="Sign Out"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={openLogin}
            className="px-3 py-1.5 text-xs font-medium text-blush-pink border border-peach rounded-lg hover:bg-blush transition-colors"
          >
            Log In
          </button>
          <button
            onClick={openSignup}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blush-pink rounded-lg hover:brightness-105 transition-all"
          >
            Sign Up
          </button>
        </div>
      )}
    </>
  );
}
