import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { ChevronLeft, Home as HomeIcon, RefreshCw } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import Home from './pages/Home';
import About from './pages/About';
import Policies from './pages/Policies';
import Posts from './pages/Posts';
import Events from './pages/Events';
import Gallery from './pages/Gallery';
import Contact from './pages/Contact';
import Admin from './pages/Admin';
import Login from './pages/Login';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function MobilePullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  useEffect(() => {
    const isMobileViewport = () => window.matchMedia('(max-width: 1023px)').matches;

    let tracking = false;
    let startY = 0;
    let currentPullDistance = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (!isMobileViewport()) return;
      if (window.scrollY > 0) return;
      if (event.touches.length !== 1) return;
      tracking = true;
      startY = event.touches[0].clientY;
      currentPullDistance = 0;
      setPullDistance(0);
      setIsPulling(true);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      const delta = event.touches[0].clientY - startY;
      if (delta <= 0) {
        tracking = false;
        currentPullDistance = 0;
        setPullDistance(0);
        setIsPulling(false);
        return;
      }
      currentPullDistance = Math.min(delta, 140);
      setPullDistance(currentPullDistance);
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (currentPullDistance >= 90) {
        window.location.reload();
      }
      currentPullDistance = 0;
      setPullDistance(0);
      setIsPulling(false);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const progress = Math.min(pullDistance / 90, 1);
  const iconVisible = isPulling && pullDistance > 0;

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-3 z-[70] -translate-x-1/2 md:hidden transition-all duration-200"
      style={{
        opacity: iconVisible ? 1 : 0,
        transform: `translateX(-50%) translateY(${iconVisible ? 0 : -10}px)`,
      }}
      aria-hidden="true"
    >
      <div className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-burgundy shadow-md border border-burgundy/20">
        <RefreshCw
          size={16}
          style={{
            transform: `rotate(${Math.floor(progress * 360)}deg)`,
            opacity: 0.85 + progress * 0.15,
          }}
        />
        <span className="text-xs font-semibold">{progress >= 1 ? '새로고침' : '당겨서 새로고침'}</span>
      </div>
    </div>
  );
}

function MobileBackControls() {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === '/') return null;

  return (
    <div className="fixed bottom-5 right-4 z-[70] flex items-center gap-2 md:hidden">
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            window.history.back();
            return;
          }
          navigate('/');
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md"
        aria-label="뒤로가기"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-burgundy/20 bg-white/95 text-burgundy shadow-md"
        aria-label="홈으로 이동"
      >
        <HomeIcon size={18} />
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <MobilePullToRefresh />
      <MobileBackControls />
      <div className="min-h-screen flex flex-col font-sans">
        <Header />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/policies" element={<Policies />} />
            <Route path="/posts" element={<Posts />} />
            <Route path="/events" element={<Events />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/support" element={<Navigate to="/contact" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}
