import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
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
  useEffect(() => {
    const isMobileViewport = () => window.matchMedia('(max-width: 1023px)').matches;

    let tracking = false;
    let startY = 0;
    let pullDistance = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (!isMobileViewport()) return;
      if (window.scrollY > 0) return;
      if (event.touches.length !== 1) return;
      tracking = true;
      startY = event.touches[0].clientY;
      pullDistance = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      const delta = event.touches[0].clientY - startY;
      if (delta <= 0) {
        tracking = false;
        pullDistance = 0;
        return;
      }
      pullDistance = delta;
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (pullDistance >= 90) {
        window.location.reload();
      }
      pullDistance = 0;
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

  return null;
}

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <MobilePullToRefresh />
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
