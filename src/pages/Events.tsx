import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Building2, Calendar, ExternalLink, Newspaper, Plus, X } from 'lucide-react';
import { formatDate } from '../lib/utils';
import {
  ADMIN_SESSION_STORAGE_KEY,
  createPressReport,
  getAdminSessionProfile,
  getPressReports,
  type PressReportItem,
} from '../lib/firebaseData';

const ADMIN_PROFILE_STORAGE_KEY = 'admin_profile_cache';

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getFallbackImage(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/450`;
}

export default function Events() {
  const [reports, setReports] = useState<PressReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [visibleCount, setVisibleCount] = useState(9);
  const [selectedReport, setSelectedReport] = useState<PressReportItem | null>(null);
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [form, setForm] = useState({
    title: '',
    source: '',
    summary: '',
    articleUrl: '',
    imageUrl: '',
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const loadReports = async () => {
    const next = await getPressReports();
    setReports(next);
    setLoading(false);
  };

  useEffect(() => {
    void loadReports();
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
        if (!isAdmin) setIsWriteModalOpen(false);
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

  useEffect(() => {
    if (visibleCount >= reports.length) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 9, reports.length));
        }
      },
      { rootMargin: '220px 0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [reports.length, visibleCount]);

  useEffect(() => {
    if (!selectedReport && !isWriteModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedReport(null);
        setIsWriteModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedReport, isWriteModalOpen]);

  const visibleReports = reports.slice(0, visibleCount);

  const openWriteModal = () => {
    setSubmitError('');
    setSubmitSuccess('');
    setForm({
      title: '',
      source: '',
      summary: '',
      articleUrl: '',
      imageUrl: '',
    });
    setIsWriteModalOpen(true);
  };

  const handleCreatePressReport = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    const payload = {
      title: form.title.trim(),
      source: form.source.trim(),
      summary: form.summary.trim(),
      articleUrl: form.articleUrl.trim(),
      imageUrl: form.imageUrl.trim(),
    };

    if (!payload.title || !payload.source || !payload.summary || !payload.articleUrl) {
      setSubmitError('제목, 언론사, 요약, 원문 링크를 모두 입력해 주세요.');
      return;
    }

    if (!isValidHttpUrl(payload.articleUrl)) {
      setSubmitError('원문 링크는 http 또는 https 형식이어야 합니다.');
      return;
    }

    if (payload.imageUrl && !isValidHttpUrl(payload.imageUrl)) {
      setSubmitError('대표 이미지 URL은 http 또는 https 형식이어야 합니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = await createPressReport({
        title: payload.title,
        source: payload.source,
        summary: payload.summary,
        article_url: payload.articleUrl,
        image_url: payload.imageUrl,
      });

      if (saved) {
        setReports((prev) => [saved, ...prev]);
      } else {
        await loadReports();
      }
      setSubmitSuccess('언론보도 항목이 등록되었습니다.');
      setIsWriteModalOpen(false);
    } catch {
      setSubmitError('등록에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-4">언론보도</h1>
            <p className="text-slate-600">언론에 소개된 주요 기사와 보도 내용을 모았습니다.</p>
          </div>
          {isAdminUser && (
            <button
              type="button"
              onClick={openWriteModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-burgundy text-white hover:bg-burgundy-dark transition-all"
            >
              <Plus size={16} />
              언론보도 등록
            </button>
          )}
        </div>

        {submitSuccess ? (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {submitSuccess}
          </div>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="animate-pulse bg-white rounded-3xl h-80 border border-slate-100" />
            ))}
          </div>
        ) : visibleReports.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {visibleReports.map((report, index) => (
              <motion.button
                key={report.id}
                type="button"
                onClick={() => setSelectedReport(report)}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group text-left w-full bg-white overflow-hidden rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-all flex flex-col"
              >
                <div className="aspect-[2/1] overflow-hidden bg-slate-100">
                  <img
                    src={report.image_url || getFallbackImage(`press-${report.id}`)}
                    alt={report.title}
                    onError={(event) => {
                      const target = event.currentTarget;
                      target.onerror = null;
                      target.src = getFallbackImage(`press-fallback-${report.id}`);
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={13} /> {formatDate(report.date)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={13} /> {report.source}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-burgundy transition-colors">
                    {report.title}
                  </h2>
                  <p className="text-sm text-slate-600 line-clamp-3 flex-1">{report.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-burgundy">
                    상세 보기 <ExternalLink size={14} />
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
            등록된 언론보도 자료가 없습니다.
          </div>
        )}

        {!loading && reports.length > 0 ? (
          <div ref={loadMoreRef} className="h-12" aria-hidden="true" />
        ) : null}
      </div>

      {selectedReport ? (
        <div
          className="fixed inset-0 z-50 bg-black/60 px-4 py-6 flex items-center justify-center"
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">언론보도 상세</h2>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="aspect-[2/1] overflow-hidden rounded-xl bg-slate-100">
                <img
                  src={selectedReport.image_url || getFallbackImage(`press-detail-${selectedReport.id}`)}
                  alt={selectedReport.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={13} /> {formatDate(selectedReport.date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Building2 size={13} /> {selectedReport.source}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900">{selectedReport.title}</h3>
              <p className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">{selectedReport.summary}</p>
              <a
                href={selectedReport.article_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-burgundy px-4 py-2 text-sm font-bold text-white hover:bg-burgundy-dark transition-all"
              >
                <Newspaper size={15} />
                기사 원문 보기
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {isWriteModalOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/60 px-4 py-6 flex items-center justify-center"
          onClick={() => {
            if (isSubmitting) return;
            setIsWriteModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">언론보도 등록</h2>
              <button
                type="button"
                onClick={() => setIsWriteModalOpen(false)}
                disabled={isSubmitting}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="등록 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreatePressReport} className="p-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">제목</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700">언론사</label>
                  <input
                    type="text"
                    value={form.source}
                    onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                    className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">대표 이미지 URL (선택)</label>
                  <input
                    type="url"
                    value={form.imageUrl}
                    onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                    className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">원문 링크</label>
                <input
                  type="url"
                  value={form.articleUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, articleUrl: event.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                  placeholder="https://..."
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">요약</label>
                <textarea
                  value={form.summary}
                  onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
                  className="mt-1 min-h-36 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                  required
                />
              </div>
              {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWriteModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-burgundy text-white font-bold hover:bg-burgundy-dark disabled:opacity-60"
                >
                  {isSubmitting ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
