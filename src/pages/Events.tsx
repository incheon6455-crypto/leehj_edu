import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, MapPin, Clock, Plus } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { createEvent, getEvents, type EventItem } from '../lib/firebaseData';

export default function Events() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    date: '',
    location: '',
  });

  const loadEvents = async () => {
    const next = await getEvents();
    setEvents(next);
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const filteredEvents = events.filter(e => {
    const isPast = new Date(e.date) < new Date();
    return activeTab === 'past' ? isPast : !isPast;
  });

  const handleCreateEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!eventForm.title.trim() || !eventForm.description.trim() || !eventForm.date || !eventForm.location.trim()) {
      setSubmitError('행사명, 설명, 날짜, 장소를 모두 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createEvent({
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        date: eventForm.date,
        location: eventForm.location.trim(),
      });
      await loadEvents();
      setSubmitSuccess('행사가 등록되었습니다.');
      setEventForm({ title: '', description: '', date: '', location: '' });
      setIsFormOpen(false);
    } catch {
      setSubmitError('행사 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.');
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
          <div className="mt-6">
            <button
              onClick={() => {
                setSubmitError('');
                setSubmitSuccess('');
                setIsFormOpen((prev) => !prev);
              }}
              className="inline-flex items-center gap-2 px-5 py-3 bg-burgundy text-white rounded-xl font-bold hover:opacity-90 transition-all"
            >
              <Plus size={18} />
              행사 등록
            </button>
          </div>
        </div>

        {isFormOpen && (
          <motion.form
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleCreateEvent}
            className="mb-10 bg-white border border-slate-100 rounded-3xl p-6 md:p-8 shadow-sm"
          >
            <h2 className="text-xl font-bold text-slate-900 mb-6">새 행사 등록</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">행사명</span>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                  placeholder="행사명을 입력하세요"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">날짜</span>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, date: event.target.value }))}
                  className="rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                />
              </label>
              <label className="md:col-span-2 flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">장소</span>
                <input
                  type="text"
                  value={eventForm.location}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, location: event.target.value }))}
                  className="rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                  placeholder="장소를 입력하세요"
                />
              </label>
              <label className="md:col-span-2 flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">설명</span>
                <textarea
                  value={eventForm.description}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="rounded-xl border border-slate-200 px-4 py-3 min-h-28 focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                  placeholder="행사 설명을 입력하세요"
                />
              </label>
            </div>

            {submitError && <p className="mt-4 text-sm text-red-600">{submitError}</p>}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {isSubmitting ? '등록 중...' : '등록하기'}
              </button>
            </div>
          </motion.form>
        )}

        {submitSuccess && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {submitSuccess}
          </div>
        )}

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
              className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-5 items-center hover:shadow-md transition-all"
            >
              <div className="w-full md:w-28 h-24 md:h-28 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100 shrink-0">
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
