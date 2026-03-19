import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { Users, FileText, Newspaper } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import {
  ADMIN_SESSION_STORAGE_KEY,
  getAdminSessionProfile,
  getVisitorCycleKey,
  getStats,
  incrementVisitCount,
} from '../lib/firebaseData';

const ADMIN_PROFILE_STORAGE_KEY = 'admin_profile_cache';
const VISITOR_COUNTED_SESSION_KEY = 'visitor_counted_in_session';
const KPI_STATS_CACHE_KEY = 'kpi_stats_cache_v1';

function CountUp({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 50, damping: 20 });
  const display = useTransform(spring, (current) => Math.floor(current).toLocaleString());

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
}

function isReloadNavigation() {
  if (typeof window === 'undefined') return false;
  const entries = performance.getEntriesByType('navigation');
  const navEntry = entries[0] as PerformanceNavigationTiming | undefined;
  if (navEntry?.type === 'reload') return true;
  const legacyNavigation = (performance as Performance & { navigation?: { type?: number } }).navigation;
  return legacyNavigation?.type === 1;
}

export function KPISection() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(() => {
    try {
      const cached = sessionStorage.getItem(KPI_STATS_CACHE_KEY) || '';
      if (cached) {
        const parsed = JSON.parse(cached) as {
          visitorsTotal?: number;
          visitorsToday?: number;
          posts?: number;
          events?: number;
        };
        return {
          visitorsTotal: Number(parsed.visitorsTotal) || 0,
          visitorsToday: Number(parsed.visitorsToday) || 0,
          posts: Number(parsed.posts) || 0,
          events: Number(parsed.events) || 0,
        };
      }
    } catch {
      // ignore broken cache
    }
    return { visitorsTotal: 0, visitorsToday: 0, posts: 0, events: 0 };
  });

  useEffect(() => {
    let cancelled = false;

    const isAdminLoggedIn = async () => {
      let isAdmin = false;

      try {
        const sessionToken = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || '';
        if (sessionToken) {
          const profile = await getAdminSessionProfile(sessionToken);
          isAdmin = String(profile?.role || '').toLowerCase() === 'admin';
        }

        if (!isAdmin) {
          const cachedProfileRaw = sessionStorage.getItem(ADMIN_PROFILE_STORAGE_KEY) || '';
          if (cachedProfileRaw) {
            const cachedProfile = JSON.parse(cachedProfileRaw) as { role?: string };
            isAdmin = String(cachedProfile?.role || '').toLowerCase() === 'admin';
          }
        }
      } catch {
        isAdmin = false;
      }

      return isAdmin;
    };

    const applyStats = (data: { visitorsTotal?: number; visitorsToday?: number; posts?: number; events?: number }) => {
      const next = {
        visitorsTotal: Number(data?.visitorsTotal) || 0,
        visitorsToday: Number(data?.visitorsToday) || 0,
        posts: Number(data?.posts) || 0,
        events: Number(data?.events) || 0,
      };
      if (cancelled) return;
      setStats(next);
      sessionStorage.setItem(KPI_STATS_CACHE_KEY, JSON.stringify(next));
    };

    const syncStats = async () => {
      const cycleKey = getVisitorCycleKey();
      const adminLoggedIn = await isAdminLoggedIn();
      const isMobileViewport = window.matchMedia('(max-width: 1023px)').matches;
      const isMobileReload = isMobileViewport && isReloadNavigation();
      const alreadyCountedInSession = sessionStorage.getItem(VISITOR_COUNTED_SESSION_KEY) === '1';

      // Fetch stats first for faster first paint.
      const data = await getStats();
      applyStats(data);

      // Visitor increment runs in background, then stats refreshes once.
      if (!adminLoggedIn && !alreadyCountedInSession && !isMobileReload) {
        sessionStorage.setItem(VISITOR_COUNTED_SESSION_KEY, '1');
        const counted = await incrementVisitCount(cycleKey);
        if (!counted) {
          sessionStorage.removeItem(VISITOR_COUNTED_SESSION_KEY);
          return;
        }
        const refreshed = await getStats();
        applyStats(refreshed);
      }
    };

    syncStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { label: '총 누적 방문자', value: stats.visitorsTotal, icon: Users, color: 'text-burgundy' },
    { label: '오늘 방문자', value: stats.visitorsToday, icon: Users, color: 'text-rose-600' },
    { label: '게시물', value: stats.posts, icon: FileText, color: 'text-blue-600', path: '/posts' },
    { label: '언론보도', value: stats.events, icon: Newspaper, color: 'text-emerald-600', path: '/events' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
      className="bg-white/90 backdrop-blur-md p-5 md:p-6 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.05)] border border-burgundy/20"
    >
      <div className="grid grid-cols-4 md:grid-cols-4 md:divide-x-0 divide-y-0">
        {cards.map((card, i) => {
          const cardClassName = cn(
            "flex items-center justify-center gap-4 py-4 md:py-1 md:px-6 max-md:flex-col max-md:gap-0.5 max-md:py-1 max-md:px-1",
            i === 0 && "pt-0 md:pl-0",
            i === cards.length - 1 && "pb-0 md:pr-0",
            card.path && "cursor-pointer hover:bg-slate-50 transition-colors rounded-lg"
          );

          const cardContent = (
            <>
              <div className={cn("p-3 bg-slate-500/5 max-md:p-1.5", card.color)}>
                <card.icon size={16} className="md:w-[22px] md:h-[22px]" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-0.5 max-md:text-[9px] max-md:leading-tight max-md:text-center">{card.label}</p>
                <p className="text-2xl font-bold text-slate-900 max-md:text-base max-md:leading-none max-md:text-center">
                  <CountUp value={card.value} />
                </p>
              </div>
            </>
          );

          if (card.path) {
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => navigate(card.path as string)}
                className={cardClassName}
              >
                {cardContent}
              </button>
            );
          }

          return (
            <div key={card.label} className={cardClassName}>
              {cardContent}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
