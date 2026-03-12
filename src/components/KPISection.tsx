import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { Users, FileText, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  ADMIN_SESSION_STORAGE_KEY,
  getAdminSessionProfile,
  getStats,
  incrementVisitCount,
} from '../lib/firebaseData';

const ADMIN_PROFILE_STORAGE_KEY = 'admin_profile_cache';
const VISITOR_COUNTED_SESSION_KEY = 'visitor_counted_in_session';

function get6amCycleKey(now: Date = new Date()) {
  const cycleStart = new Date(now);
  cycleStart.setHours(6, 0, 0, 0);
  if (now < cycleStart) {
    cycleStart.setDate(cycleStart.getDate() - 1);
  }
  return cycleStart.toISOString();
}

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
  const [stats, setStats] = useState({ visitors: 0, posts: 0, events: 0 });

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

    const syncStats = async () => {
      const cycleKey = get6amCycleKey();
      const adminLoggedIn = await isAdminLoggedIn();
      const isMobileViewport = window.matchMedia('(max-width: 1023px)').matches;
      const isMobileReload = isMobileViewport && isReloadNavigation();
      const alreadyCountedInSession = sessionStorage.getItem(VISITOR_COUNTED_SESSION_KEY) === '1';
      if (!adminLoggedIn && !alreadyCountedInSession && !isMobileReload) {
        // Lock first to avoid duplicate increments during rapid remounts.
        sessionStorage.setItem(VISITOR_COUNTED_SESSION_KEY, '1');
        const counted = await incrementVisitCount(cycleKey);
        if (!counted) {
          sessionStorage.removeItem(VISITOR_COUNTED_SESSION_KEY);
        }
      }

      const data = await getStats();
      if (cancelled) return;
      setStats({
        visitors: Number(data?.visitorsTotal) || 0,
        posts: Number(data?.posts) || 0,
        events: Number(data?.events) || 0,
      });
    };

    syncStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { label: '총 누적 방문자', value: stats.visitors, icon: Users, color: 'text-burgundy' },
    { label: '게시물', value: stats.posts, icon: FileText, color: 'text-blue-600' },
    { label: '예정된 행사', value: stats.events, icon: Calendar, color: 'text-emerald-600' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
      className="bg-white/90 backdrop-blur-md p-5 md:p-6 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.05)] border border-burgundy/20"
    >
      <div className="grid grid-cols-3 md:grid-cols-3 md:divide-x-0 divide-y-0">
        {cards.map((card, i) => (
          <div
            key={card.label}
            className={cn(
              "flex items-center justify-center gap-4 py-4 md:py-1 md:px-6 max-md:flex-col max-md:gap-1 max-md:py-2",
              i === 0 && "pt-0 md:pl-0",
              i === cards.length - 1 && "pb-0 md:pr-0"
            )}
          >
            <div className={cn("p-3 bg-slate-500/5 max-md:p-2", card.color)}>
              <card.icon size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-0.5 max-md:text-[11px] max-md:text-center">{card.label}</p>
              <p className="text-2xl font-bold text-slate-900 max-md:text-lg max-md:text-center">
                <CountUp value={card.value} />
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
