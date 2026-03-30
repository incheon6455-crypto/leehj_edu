import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, MapPin, Clock, ExternalLink, Plus, X } from 'lucide-react';
import { formatDate } from '../lib/utils';
import {
  ADMIN_SESSION_STORAGE_KEY,
  createEvent,
  getAdminSessionProfile,
  getEvents,
  type EventItem,
} from '../lib/firebaseData';

const ADMIN_PROFILE_STORAGE_KEY = 'admin_profile_cache';

export default function Events() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
  });

  const loadEvents = async () => {
    const next = await getEvents();
    setEvents(next);
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  useEffect(() => {
    let disposed = false;

    const syncAdminSession = async () => {
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

      if (!disposed) {
        setIsAdminUser(isAdmin);
        if (!isAdmin) {
          setIsWriteModalOpen(false);
        }
      }
    };

    const onStorageEvent = () => {
      void syncAdminSession();
    };

    void syncAdminSession();
    window.addEventListener('storage', onStorageEvent);
    window.addEventListener('focus', onStorageEvent);
    window.addEventListener('admin-session-changed', onStorageEvent);
    return () => {
      disposed = true;
      window.removeEventListener('storage', onStorageEvent);
      window.removeEventListener('focus', onStorageEvent);
      window.removeEventListener('admin-session-changed', onStorageEvent);
    };
  }, []);

  const filteredEvents = events.filter((e) => {
    const isPast = new Date(e.date) < new Date();
    return activeTab === 'past' ? isPast : !isPast;
  });

  const openWriteModal = () => {
    setSubmitError('');
    setForm({
      title: '',
      description: '',
      date: '',
      time: '',
      location: '',
    });
    setIsWriteModalOpen(true);
  };

  const closeWriteModal = () => {
    setIsWriteModalOpen(false);
    setSubmitError('');
  };

  const handleCreateEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    const date = form.date.trim();
    const time = form.time.trim();
    const location = form.location.trim();

    if (!title || !description || !date || !time || !location) {
      setSubmitError('모든 항목을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      await createEvent({ title, description, date: `${date}T${time}`, location });
      await loadEvents();
      setActiveTab('upcoming');
      closeWriteModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : '일정 등록에 실패했습니다.';
      setSubmitError(message || '일정 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">행사 일정</h1>
          <p className="text-slate-600">현장에서 시민 여러분과 함께하겠습니다.</p>
        </div>

        <div className="mb-12 flex items-center gap-3">
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
          {isAdminUser ? (
            <button
              type="button"
              onClick={openWriteModal}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-burgundy px-5 py-3 text-sm font-bold text-white hover:bg-burgundy-dark transition-colors"
            >
              <Plus size={16} />
              일정 등록
            </button>
          ) : null}
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
                  <span className="flex items-center gap-1.5"><Clock size={16} className="text-burgundy" /> {new Date(event.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                  <span className="flex items-center gap-1.5"><MapPin size={16} className="text-burgundy" /> {event.location}</span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900">{event.title}</h3>
                <p className="text-slate-600">{event.description}</p>
              </div>
              
              {activeTab === 'upcoming' ? (
                <div className="shrink-0 w-full md:w-auto">
                  <button className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                    참가 신청 <ExternalLink size={18} />
                  </button>
                </div>
              ) : null}
            </motion.div>
          ))}
          
          {filteredEvents.length === 0 && (
            <div className="text-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
              표시할 행사가 없습니다.
            </div>
          )}
        </div>
      </div>

      {isWriteModalOpen ? (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 px-4 py-8 overflow-y-auto">
          <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">행사 일정 등록</h2>
              <button
                type="button"
                onClick={closeWriteModal}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleCreateEvent}>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700" htmlFor="event-title">
                  행사명
                </label>
                <input
                  id="event-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/20"
                  placeholder="행사명을 입력하세요"
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700" htmlFor="event-description">
                  행사 설명
                </label>
                <textarea
                  id="event-description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="min-h-[120px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/20"
                  placeholder="행사 설명을 입력하세요"
                  maxLength={1000}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="event-date">
                    행사 날짜
                  </label>
                  <input
                    id="event-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="event-time">
                    행사 시간
                  </label>
                  <input
                    id="event-time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="event-location">
                    장소
                  </label>
                  <input
                    id="event-location"
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy/20"
                    placeholder="예: 광화문 광장"
                    maxLength={160}
                  />
                </div>
              </div>

              {submitError ? (
                <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                  {submitError}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeWriteModal}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-burgundy px-4 py-2.5 text-sm font-bold text-white hover:bg-burgundy-dark disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? '등록 중...' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
