import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Heart } from 'lucide-react';
import { CONFIG } from '../config';
import { cn } from '../lib/utils';
import { ADMIN_SESSION_STORAGE_KEY, getAdminSessionProfile, type AdminIdentityProfile } from '../lib/firebaseData';

const navItems = [
  { name: '홈', path: '/' },
  { name: '후보 소개', path: '/about' },
  { name: '정책', path: '/policies' },
  { name: '소식', path: '/posts' },
  { name: '행사', path: '/events' },
  { name: '후원/문의', path: '/contact' },
];
const ADMIN_SESSION_KEY = 'admin_dashboard_auth';

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminIdentityProfile | null>(null);
  const location = useLocation();
  const adminRoleLabel = adminProfile?.role === 'admin' ? '관리자' : adminProfile?.role || '';

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncAdminMode = async () => {
      const sessionToken = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || '';
      if (!sessionToken) {
        if (!cancelled) {
          setIsAdminMode(false);
          setAdminProfile(null);
        }
        return;
      }

      const profile = await getAdminSessionProfile(sessionToken);
      if (cancelled) return;
      if (profile) {
        localStorage.setItem(ADMIN_SESSION_KEY, '1');
        setIsAdminMode(true);
        setAdminProfile(profile);
        return;
      }
      localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      setIsAdminMode(false);
      setAdminProfile(null);
    };

    syncAdminMode();
    window.addEventListener('storage', syncAdminMode);
    window.addEventListener('focus', syncAdminMode);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', syncAdminMode);
      window.removeEventListener('focus', syncAdminMode);
    };
  }, [location.pathname]);

  return (
    <header className={cn(
      "fixed top-0 w-full z-50 transition-all duration-300",
      isScrolled ? "bg-white/90 backdrop-blur-md shadow-md py-2" : "bg-transparent py-4"
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex justify-between items-center">
          <Link to="/" className="flex items-center space-x-2 md:-ml-[25px] max-md:absolute max-md:left-1/2 max-md:-translate-x-1/2 max-md:space-x-1">
            <span className={cn(
              "text-2xl font-bold tracking-tighter max-md:text-xl max-md:whitespace-nowrap",
              isScrolled ? "text-burgundy" : "text-burgundy"
            )}>
              보수 교육감
            </span>
            <span className="hidden md:inline text-[10px] leading-[1.1] font-medium bg-burgundy text-white px-1.5 py-1 rounded text-center">예비<br />후보</span>
            <span className="md:hidden text-[10px] leading-none font-medium bg-burgundy text-white px-1.5 py-1 rounded text-center whitespace-nowrap">예비 후보</span>
            <span className={cn(
              "text-2xl font-bold tracking-tighter max-md:text-xl max-md:whitespace-nowrap",
              isScrolled ? "text-burgundy" : "text-burgundy"
            )}>
              {CONFIG.candidateName}
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center justify-center space-x-8">
            {navItems.map((item) => (
              <React.Fragment key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-burgundy",
                    location.pathname === item.path ? "text-burgundy border-b-2 border-burgundy" : "text-slate-600"
                  )}
                >
                  {item.name}
                </Link>
                {item.path === '/contact' && isAdminMode ? (
                  <Link
                    to="/login"
                    className="inline-flex items-center px-3 py-1.5 rounded-full bg-burgundy/10 text-burgundy text-xs font-bold hover:bg-burgundy/20 transition-colors"
                  >
                    관리자 모드
                  </Link>
                ) : null}
              </React.Fragment>
            ))}
            {isAdminMode && adminProfile ? (
              <Link
                to="/admin"
                className="bg-burgundy text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-burgundy-dark transition-all flex items-center gap-2 shadow-lg shadow-burgundy/20"
              >
                <Heart size={16} />
                {`${adminProfile.name} · ${adminRoleLabel} · ${adminProfile.username}`}
              </Link>
            ) : (
              <Link
                to="/login"
                className="bg-burgundy text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-burgundy-dark transition-all flex items-center gap-2 shadow-lg shadow-burgundy/20"
              >
                <Heart size={16} />
                로그인
              </Link>
            )}
          </nav>

          {/* Mobile Toggle */}
          <button className="md:hidden text-slate-900" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 animate-in slide-in-from-top duration-300">
          <div className="px-4 pt-2 pb-6 space-y-1">
            {navItems.map((item) => (
              <React.Fragment key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    "block px-3 py-4 text-base font-medium rounded-md",
                    location.pathname === item.path ? "text-burgundy bg-burgundy/5" : "text-slate-600"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  {item.name}
                </Link>
                {item.path === '/contact' && isAdminMode ? (
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center mt-1 ml-3 px-3 py-1.5 rounded-full bg-burgundy/10 text-burgundy text-xs font-bold"
                    onClick={() => setIsOpen(false)}
                  >
                    관리자 모드
                  </Link>
                ) : null}
              </React.Fragment>
            ))}
            {isAdminMode && adminProfile ? (
              <Link
                to="/admin"
                className="block w-full text-center bg-burgundy text-white px-3 py-4 rounded-md text-base font-bold mt-4"
                onClick={() => setIsOpen(false)}
              >
                {`${adminProfile.name} · ${adminRoleLabel} · ${adminProfile.username}`}
              </Link>
            ) : (
              <Link
                to="/login"
                className="block w-full text-center bg-burgundy text-white px-3 py-4 rounded-md text-base font-bold mt-4"
                onClick={() => setIsOpen(false)}
              >
                로그인
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
