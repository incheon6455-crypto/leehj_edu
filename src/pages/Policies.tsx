import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ChevronRight, X, ThumbsUp } from 'lucide-react';
import {
  getPolicies,
  getPolicyReactionCounts,
  incrementPolicyReactionCount,
  submitPolicyProposal,
  type PolicyCatalogItem,
} from '../lib/firebaseData';

const POLICY_VOTER_ID_KEY = 'policy_reaction_voter_id';
const POLICY_VOTED_IDS_KEY = 'policy_reaction_voted_ids';

function getOrCreatePolicyVoterId() {
  const existing = localStorage.getItem(POLICY_VOTER_ID_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `voter-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(POLICY_VOTER_ID_KEY, generated);
  return generated;
}

function getStoredVotedPolicyIds() {
  const raw = localStorage.getItem(POLICY_VOTED_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function maskProposerName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}*${trimmed[trimmed.length - 1]}`;
}

function maskProposerPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const lastTwo = digits.slice(-2).padStart(2, '*');
  return `***-****-${lastTwo}`;
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function Policies() {
  const [searchQuery, setSearchQuery] = useState('');
  const [policies, setPolicies] = useState<PolicyCatalogItem[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyCatalogItem | null>(null);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedPreview, setSubmittedPreview] = useState({ maskedName: '', maskedPhone: '' });
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [reactionInProgress, setReactionInProgress] = useState<string | null>(null);
  const [votedPolicyIds, setVotedPolicyIds] = useState<string[]>(() => getStoredVotedPolicyIds());
  const [proposalForm, setProposalForm] = useState({
    proposer: '',
    phone: '',
    title: '',
    content: '',
  });
  const filteredPolicies = policies.filter(
    (policy) =>
      policy.title.includes(searchQuery) ||
      policy.desc.includes(searchQuery) ||
      policy.category.includes(searchQuery)
  );

  useEffect(() => {
    let cancelled = false;
    const loadPolicies = async () => {
      const data = await getPolicies();
      if (!cancelled) {
        setPolicies(data);
      }
    };
    loadPolicies();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncReactionCounts = async () => {
      if (policies.length === 0) return;
      const counts = await getPolicyReactionCounts(policies.map((policy) => policy.id));
      if (!cancelled) {
        setReactionCounts(counts);
      }
    };
    syncReactionCounts();
    return () => {
      cancelled = true;
    };
  }, [policies]);

  const hasVoted = (policyId: string) => votedPolicyIds.includes(policyId);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPolicy(null);
        setIsProposalModalOpen(false);
        setIsSubmitted(false);
      }
    };

    if (selectedPolicy || isProposalModalOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [selectedPolicy, isProposalModalOpen]);

  return (
    <div className="pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">정책 공약</h1>
          <p className="text-slate-600">아이들의 미래를 위한 이현준의 약속입니다.</p>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => {
                setIsSubmitted(false);
                setSubmitError('');
                setSubmittedPreview({ maskedName: '', maskedPhone: '' });
                setIsProposalModalOpen(true);
              }}
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-burgundy text-white text-sm font-bold hover:bg-burgundy/90 transition-colors"
            >
              정책/공약 제안하기
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-12 space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="정책 키워드를 검색하세요..."
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-burgundy transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
        </div>

        {/* Policy List */}
        <div className="lg:max-h-[calc(13.5rem*3+0.75rem*2)] lg:overflow-y-auto lg:pr-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <AnimatePresence mode="popLayout">
              {filteredPolicies.map((policy) => (
                <motion.div
                  key={policy.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group h-[13.5rem] bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-burgundy/20 transition-all cursor-pointer flex flex-col"
                  onClick={() => setSelectedPolicy(policy)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="px-2.5 py-1 bg-burgundy/5 text-burgundy text-[11px] font-bold rounded-full border-0 truncate max-w-[80%]">
                      {policy.category}
                    </span>
                    <ChevronRight className="text-slate-300 group-hover:text-burgundy transition-colors shrink-0" size={16} />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2 group-hover:text-burgundy transition-colors line-clamp-2">
                    {policy.title}
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed line-clamp-2 flex-1">
                    {policy.desc}
                  </p>

                  <div className="mt-3 pt-2 border-t border-slate-50 flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-100 overflow-hidden">
                          <img src={`https://picsum.photos/seed/user${i}/100`} alt="user" />
                        </div>
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium truncate">
                      {(reactionCounts[policy.id] ?? 0).toLocaleString()}명 공감
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {filteredPolicies.length === 0 ? (
          <div className="text-center py-24 text-slate-400">
            검색 결과가 없습니다. 다른 키워드로 검색해 보세요.
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {selectedPolicy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
            onClick={() => setSelectedPolicy(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <span className="px-3 py-1 bg-burgundy/5 text-burgundy text-xs font-bold rounded-full border-0">
                  {selectedPolicy.category}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPolicy(null)}
                  className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="모달 닫기"
                >
                  <X size={20} />
                </button>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">{selectedPolicy.title}</h2>
              <p className="text-slate-600 leading-relaxed mb-4">{selectedPolicy.desc}</p>
              <p className="text-slate-700 leading-relaxed whitespace-pre-line">{selectedPolicy.content}</p>
              <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">
                  {(reactionCounts[selectedPolicy.id] ?? 0).toLocaleString()}명이 공감했습니다
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedPolicy || reactionInProgress) return;
                    if (hasVoted(selectedPolicy.id)) return;
                    setReactionInProgress(selectedPolicy.id);
                    const voterId = getOrCreatePolicyVoterId();
                    const result = await incrementPolicyReactionCount(selectedPolicy.id, voterId);
                    if (result.count > 0) {
                      setReactionCounts((prev) => ({ ...prev, [selectedPolicy.id]: result.count }));
                    }
                    if (result.incremented || result.count > 0) {
                      setVotedPolicyIds((prev) => {
                        if (prev.includes(selectedPolicy.id)) return prev;
                        const next = [...prev, selectedPolicy.id];
                        localStorage.setItem(POLICY_VOTED_IDS_KEY, JSON.stringify(next));
                        return next;
                      });
                    }
                    setReactionInProgress(null);
                  }}
                  disabled={reactionInProgress === selectedPolicy.id || hasVoted(selectedPolicy.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-burgundy text-white text-sm font-semibold hover:bg-burgundy/90 transition-colors disabled:opacity-60"
                >
                  <ThumbsUp size={16} />
                  {reactionInProgress === selectedPolicy.id
                    ? '반영 중...'
                    : hasVoted(selectedPolicy.id)
                      ? '공감 완료'
                      : '공감하기'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isProposalModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
            onClick={() => {
              setIsProposalModalOpen(false);
              setIsSubmitted(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-900">정책/공약 제안하기</h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsProposalModalOpen(false);
                    setIsSubmitted(false);
                  }}
                  className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label="제안 모달 닫기"
                >
                  <X size={20} />
                </button>
              </div>

              {!isSubmitted ? (
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setIsSubmitting(true);
                    setSubmitError('');
                    try {
                      await submitPolicyProposal({
                        proposer: proposalForm.proposer.trim(),
                        phone: proposalForm.phone.trim(),
                        title: proposalForm.title.trim(),
                        content: proposalForm.content.trim(),
                      });
                      setSubmittedPreview({
                        maskedName: maskProposerName(proposalForm.proposer),
                        maskedPhone: maskProposerPhone(proposalForm.phone),
                      });
                      setIsSubmitted(true);
                      setProposalForm({ proposer: '', phone: '', title: '', content: '' });
                    } catch (error) {
                      const message = error instanceof Error ? error.message : '';
                      if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
                        setSubmitError('Firebase 권한 설정으로 제출이 차단되었습니다. rules를 확인해 주세요.');
                      } else {
                        setSubmitError('제안 제출에 실패했습니다. 잠시 후 다시 시도해 주세요.');
                      }
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  <div>
                    <label htmlFor="proposal-proposer" className="block text-sm font-semibold text-slate-700 mb-2">
                      제안자
                    </label>
                    <input
                      id="proposal-proposer"
                      type="text"
                      required
                      value={proposalForm.proposer}
                      onChange={(e) => setProposalForm((prev) => ({ ...prev, proposer: e.target.value }))}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-burgundy"
                      placeholder="이름을 입력하세요"
                    />
                  </div>

                  <div>
                    <label htmlFor="proposal-title" className="block text-sm font-semibold text-slate-700 mb-2">
                      공약 제목
                    </label>
                    <input
                      id="proposal-title"
                      type="text"
                      required
                      value={proposalForm.title}
                      onChange={(e) => setProposalForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-burgundy"
                      placeholder="제안하고 싶은 공약 제목을 입력하세요"
                    />
                  </div>

                  <div>
                    <label htmlFor="proposal-phone" className="block text-sm font-semibold text-slate-700 mb-2">
                      연락처
                    </label>
                    <input
                      id="proposal-phone"
                      type="tel"
                      required
                      value={proposalForm.phone}
                      onChange={(e) => setProposalForm((prev) => ({ ...prev, phone: formatPhoneInput(e.target.value) }))}
                      inputMode="numeric"
                      maxLength={13}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-burgundy"
                      placeholder="전화번호를 입력하세요"
                    />
                  </div>

                  <div>
                    <label htmlFor="proposal-content" className="block text-sm font-semibold text-slate-700 mb-2">
                      상세 내용
                    </label>
                    <textarea
                      id="proposal-content"
                      required
                      rows={5}
                      value={proposalForm.content}
                      onChange={(e) => setProposalForm((prev) => ({ ...prev, content: e.target.value }))}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-burgundy resize-none"
                      placeholder="구체적인 제안 내용을 작성해 주세요"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsProposalModalOpen(false)}
                      disabled={isSubmitting}
                      className="px-5 py-2.5 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2.5 rounded-full bg-burgundy text-white text-sm font-semibold hover:bg-burgundy/90 transition-colors disabled:opacity-60"
                    >
                      {isSubmitting ? '제출 중...' : '제안 제출'}
                    </button>
                  </div>
                  {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
                </form>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-slate-900 font-bold text-lg mb-2">제안이 접수되었습니다.</p>
                  <p className="text-slate-600 mb-6">소중한 의견 감사합니다. 검토 후 반영하겠습니다.</p>
                  <p className="text-sm text-slate-500 mb-1">제안자: {submittedPreview.maskedName || '-'}</p>
                  <p className="text-sm text-slate-500 mb-6">연락처: {submittedPreview.maskedPhone || '-'}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsProposalModalOpen(false);
                      setIsSubmitted(false);
                    }}
                    className="px-5 py-2.5 rounded-full bg-burgundy text-white text-sm font-semibold hover:bg-burgundy/90 transition-colors"
                  >
                    확인
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
