import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { Users, FileText, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { getStats, incrementVisitCount } from '../lib/firebaseData';

const LAST_VISIT_CYCLE_KEY = 'last_visit_cycle_6am';

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

export function KPISection() {
  const [stats, setStats] = useState({ visitors: 0, posts: 0, events: 0 });

  useEffect(() => {
    let cancelled = false;

    const syncStats = async () => {
      const cycleKey = get6amCycleKey();
      const lastVisitCycle = localStorage.getItem(LAST_VISIT_CYCLE_KEY);
      if (lastVisitCycle !== cycleKey) {
        await incrementVisitCount(cycleKey);
        localStorage.setItem(LAST_VISIT_CYCLE_KEY, cycleKey);
      }

      const data = await getStats();
      if (cancelled) return;
      setStats({
        visitors: Number(data?.visitorsToday) || 0,
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
    { label: '오늘 하루 방문자', value: stats.visitors, icon: Users, color: 'text-burgundy' },
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
