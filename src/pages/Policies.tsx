import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ChevronRight, X, ThumbsUp } from 'lucide-react';
import {
  getPolicyReactionCounts,
  incrementPolicyReactionCount,
  submitPolicyProposal,
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

const policies = [
  {
    id: 'policy-basic-literacy',
    category: '기초학력',
    title: '초등 기초학력 책임 전담제 도입',
    desc: '모든 아이가 읽기, 쓰기, 셈하기를 완벽히 마스터할 수 있도록 전담 교사를 배치하겠습니다.',
    content:
      '기초학력 전담교사를 학교 단위로 배치하고, 학년 초 진단-중간 점검-학년 말 성취 확인으로 이어지는 3단계 지원 체계를 구축합니다. 읽기·쓰기·셈하기 맞춤형 보충 프로그램을 방과후 및 학습클리닉과 연계해 운영하겠습니다.',
  },
  {
    id: 'policy-digital-ai',
    category: '디지털전환',
    title: '1인 1스마트 기기 및 AI 튜터 지원',
    desc: '디지털 격차 없는 학습 환경을 위해 모든 학생에게 기기를 지원하고 맞춤형 AI 학습 도구를 제공합니다.',
    content:
      '학생 개별 학습 데이터를 기반으로 AI 튜터를 도입해 과목별 취약 단원을 자동 추천하고, 교사는 대시보드로 학습 진도를 관리할 수 있도록 하겠습니다. 가정 형편에 따른 디지털 격차가 없도록 기기와 네트워크 접근성을 함께 지원합니다.',
  },
  {
    id: 'policy-safety-counsel',
    category: '인성/안전',
    title: '학교 폭력 제로, 마음 건강 센터 확대',
    desc: '전문 상담 인력을 대폭 확충하여 아이들의 마음을 돌보고 안전한 학교 환경을 조성하겠습니다.',
    content:
      '학교별 상담 인력 확충과 외부 전문기관 연계를 통해 위기 학생을 조기에 발견하고 개입하겠습니다. 학교폭력 예방교육, 회복적 생활교육, 보호자 상담 프로그램을 통합 운영해 안전하고 존중받는 학교 문화를 만들겠습니다.',
  },
  {
    id: 'policy-teacher-rights',
    category: '교원복지',
    title: '교권 보호 및 행정 업무 경감',
    desc: '선생님이 가르치는 일에만 집중할 수 있도록 행정 지원 시스템을 혁신하고 법적 보호를 강화합니다.',
    content:
      '교사가 수업과 생활교육에 집중할 수 있도록 공문·행정 절차를 간소화하고, 반복 업무는 통합 플랫폼으로 자동화하겠습니다. 교권침해 발생 시 즉시 대응 가능한 법률지원 체계를 마련하겠습니다.',
  },
  {
    id: 'policy-special-education',
    category: '특수교육',
    title: '특수학교 신설 및 통합 교육 지원 강화',
    desc: '장애 학생들의 학습권을 보장하기 위해 특수 교육 인프라를 확충하고 맞춤형 지원을 확대합니다.',
    content:
      '지역 수요를 반영해 특수학교와 특수학급을 단계적으로 확대하고, 통합학급에는 보조인력과 전문교재를 지원하겠습니다. 학생의 장애 특성과 발달 단계에 맞춘 개별화교육계획(IEP) 실행력을 높이겠습니다.',
  },
];

export default function Policies() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<(typeof policies)[number] | null>(null);
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
    (p) => p.title.includes(searchQuery) || p.desc.includes(searchQuery)
  );

  useEffect(() => {
    let cancelled = false;
    const syncReactionCounts = async () => {
      const counts = await getPolicyReactionCounts(policies.map((policy) => policy.id));
      if (!cancelled) {
        setReactionCounts(counts);
      }
    };
    syncReactionCounts();
    return () => {
      cancelled = true;
    };
  }, []);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {filteredPolicies.map((policy) => (
              <motion.div
                key={policy.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-burgundy/20 transition-all cursor-pointer"
                onClick={() => setSelectedPolicy(policy)}
              >
                <div className="flex justify-between items-start mb-6">
                  <span className="px-3 py-1 bg-burgundy/5 text-burgundy text-xs font-bold rounded-full">
                    {policy.category}
                  </span>
                  <ChevronRight className="text-slate-300 group-hover:text-burgundy transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-4 group-hover:text-burgundy transition-colors">
                  {policy.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {policy.desc}
                </p>
                
                <div className="mt-8 pt-6 border-t border-slate-50 flex items-center gap-4">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 overflow-hidden">
                        <img src={`https://picsum.photos/seed/user${i}/100`} alt="user" />
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    {(reactionCounts[policy.id] ?? 0).toLocaleString()}명의 시민이 공감합니다
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        
        {filteredPolicies.length === 0 && (
          <div className="text-center py-24 text-slate-400">
            검색 결과가 없습니다. 다른 키워드로 검색해 보세요.
          </div>
        )}
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
                <span className="px-3 py-1 bg-burgundy/5 text-burgundy text-xs font-bold rounded-full">
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
                      } else if (message.includes('duplicate-member')) {
                        setSubmitError('이미 등록된 회원 정보(이름 또는 연락처)입니다. 중복 저장할 수 없습니다.');
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
                      onChange={(e) => setProposalForm((prev) => ({ ...prev, phone: e.target.value }))}
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
