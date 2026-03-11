import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, MapPin, Clock, ExternalLink } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { getEvents, type EventItem } from '../lib/firebaseData';

export default function Events() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    getEvents().then(setEvents);
  }, []);

  const filteredEvents = events.filter(e => {
    const isPast = new Date(e.date) < new Date();
    return activeTab === 'past' ? isPast : !isPast;
  });

  return (
    <div className="pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">행사 일정</h1>
          <p className="text-slate-600">현장에서 시민 여러분과 함께하겠습니다.</p>
        </div>

        <div className="flex justify-center mb-12">
          <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 flex gap-1">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'upcoming' ? 'bg-burgundy text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              다가오는 행사
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'past' ? 'bg-burgundy text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              지난 행사
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {filteredEvents.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-8 items-center hover:shadow-md transition-all"
            >
              <div className="w-full md:w-32 h-32 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100 shrink-0">
                <span className="text-burgundy font-bold text-2xl">
                  {new Date(event.date).getDate()}
                </span>
                <span className="text-slate-400 text-xs font-bold uppercase">
                  {new Date(event.date).toLocaleDateString('ko-KR', { month: 'short' })}
                </span>
              </div>
              
              <div className="flex-1 space-y-4 text-center md:text-left">
                <div className="flex flex-wrap justify-center md:justify-start gap-4 text-slate-500 text-sm">
                  <span className="flex items-center gap-1.5"><Calendar size={16} className="text-burgundy" /> {formatDate(event.date)}</span>
                  <span className="flex items-center gap-1.5"><Clock size={16} className="text-burgundy" /> 14:00</span>
                  <span className="flex items-center gap-1.5"><MapPin size={16} className="text-burgundy" /> {event.location}</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900">{event.title}</h3>
                <p className="text-slate-600">{event.description}</p>
              </div>
              
              <div className="shrink-0 w-full md:w-auto">
                <button className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  참가 신청 <ExternalLink size={18} />
                </button>
              </div>
            </motion.div>
          ))}
          
          {filteredEvents.length === 0 && (
            <div className="text-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
              표시할 행사가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
