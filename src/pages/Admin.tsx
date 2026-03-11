import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  CalendarDays,
  Download,
  FileText,
  FileUp,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { formatDate, stripHtmlTags } from '../lib/utils';
import {
  createAdminMember,
  deleteEvent,
  deletePost,
  deleteHeroBackgroundImage,
  deleteMemberAndRelatedContent,
  getAdminDashboardData,
  getHeroBackgroundImages,
  saveHeroBackgroundImage,
  updateMemberBySource,
  type AdminDashboardData,
  type HeroBackgroundImageItem,
  type MemberManagementItem,
} from '../lib/firebaseData';

const ADMIN_PASSWORD = 'admin1234';
const ADMIN_SESSION_KEY = 'admin_dashboard_auth';
const HERO_IMAGE_SLOT_COUNT = 4;
const HERO_IMAGE_MAX_BYTES = 850 * 1024;

function maskName(name: string) {
  if (name.length < 2) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}*${name[name.length - 1]}`;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***-****-****';
  return `***-****-${digits.slice(-4)}`;
}

function getEmptyDashboard(): AdminDashboardData {
  return {
    totals: {
      posts: 0,
      events: 0,
      supportMessages: 0,
      visitorsToday: 0,
    },
    visitorTrend: Array.from({ length: 24 }, (_, index) => ({
      hourLabel: `${String((6 + index) % 24).padStart(2, '0')}:00`,
      count: 0,
    })),
    dailyVisitorTrend: Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        dateLabel: `${date.getMonth() + 1}/${date.getDate()}`,
        count: 0,
      };
    }),
    members: [],
    recentPosts: [],
    upcomingEvents: [],
    recentSupportMessages: [],
    updatedAt: new Date().toISOString(),
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('파일을 읽지 못했습니다.'));
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem(ADMIN_SESSION_KEY) === '1');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [dashboard, setDashboard] = useState<AdminDashboardData>(getEmptyDashboard);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberManagementItem | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [memberActionError, setMemberActionError] = useState('');
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [heroImages, setHeroImages] = useState<Array<HeroBackgroundImageItem | null>>(
    Array.from({ length: HERO_IMAGE_SLOT_COUNT }, () => null)
  );
  const [heroPendingFiles, setHeroPendingFiles] = useState<
    Array<{ dataUrl: string; sizeBytes: number; fileName: string } | null>
  >(Array.from({ length: HERO_IMAGE_SLOT_COUNT }, () => null));
  const [savingHeroSlot, setSavingHeroSlot] = useState<number | null>(null);
  const [deletingHeroSlot, setDeletingHeroSlot] = useState<number | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [isPostsModalOpen, setIsPostsModalOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [isSupportMessagesModalOpen, setIsSupportMessagesModalOpen] = useState(false);
  const [isVisitorLogModalOpen, setIsVisitorLogModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [memberForm, setMemberForm] = useState({
    name: '',
    phone: '',
    address: '',
    type: '응원메시지' as '응원메시지' | '정책제안' | '일반',
  });

  const heroFileInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const loadHeroImages = async () => {
    try {
      const docs = await getHeroBackgroundImages();
      const next: Array<HeroBackgroundImageItem | null> = Array.from({ length: HERO_IMAGE_SLOT_COUNT }, () => null);
      docs.forEach((item) => {
        if (item.slot >= 1 && item.slot <= HERO_IMAGE_SLOT_COUNT) {
          next[item.slot - 1] = item;
        }
      });
      setHeroImages(next);
    } catch {
      setError('배경화면 정보를 불러오지 못했습니다.');
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminDashboardData();
      setDashboard(data);
    } catch {
      setError('대시보드 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    loadDashboard();
    loadHeroImages();
  }, [isLoggedIn]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== ADMIN_PASSWORD) {
      setLoginError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoginError('');
    setPassword('');
    localStorage.setItem(ADMIN_SESSION_KEY, '1');
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    setIsLoggedIn(false);
    setDashboard(getEmptyDashboard());
    setSelectedMemberIds([]);
    setIsPostsModalOpen(false);
    setIsEventsModalOpen(false);
    setIsSupportMessagesModalOpen(false);
    setIsVisitorLogModalOpen(false);
    setPassword('');
    setError('');
  };

  useEffect(() => {
    setSelectedMemberIds((prev) => prev.filter((id) => dashboard.members.some((member) => member.id === id)));
  }, [dashboard.members]);

  const metrics = useMemo(
    () => [
      { label: '오늘 방문 로그(6시 기준)', value: dashboard.totals.visitorsToday, icon: Users, color: 'text-burgundy' },
      { label: '전체 게시물', value: dashboard.totals.posts, icon: FileText, color: 'text-blue-600' },
      { label: '전체 행사', value: dashboard.totals.events, icon: CalendarDays, color: 'text-emerald-600' },
      { label: '응원 메시지', value: dashboard.totals.supportMessages, icon: MessageSquareText, color: 'text-amber-600' },
    ],
    [dashboard.totals]
  );

  const dailyVisitorChart = useMemo(() => {
    const width = 760;
    const height = 250;
    const padding = 24;
    const series = dashboard.dailyVisitorTrend;
    const maxValue = Math.max(1, ...series.map((point) => point.count));
    const usableWidth = width - padding * 2;
    const usableHeight = height - padding * 2;

    const points = series.map((point, index) => {
      const x = padding + (usableWidth * index) / Math.max(1, series.length - 1);
      const y = padding + usableHeight - (point.count / maxValue) * usableHeight;
      return { ...point, x, y };
    });

    return { width, height, points };
  }, [dashboard.dailyVisitorTrend]);

  const allMembersSelected = dashboard.members.length > 0 && selectedMemberIds.length === dashboard.members.length;

  const handleDeleteSelectedMembers = () => {
    if (selectedMemberIds.length === 0) return;
    const selectedMembers = dashboard.members.filter((member) => selectedMemberIds.includes(member.id));
    Promise.all(selectedMembers.map((member) => deleteMemberAndRelatedContent(member)))
      .then(() => {
        setSelectedMemberIds([]);
        loadDashboard();
      })
      .catch(() => {
        setError('선택 회원 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      });
  };

  const handleEditSelectedMember = () => {
    if (selectedMemberIds.length !== 1) return;
    const target = dashboard.members.find((member) => member.id === selectedMemberIds[0]);
    if (!target) return;
    setEditingMember(target);
    setMemberForm({
      name: target.name,
      phone: target.phone === '-' ? '' : target.phone,
      address: target.address === '-' ? '' : target.address,
      type: target.type,
    });
    setMemberActionError('');
    setIsMemberModalOpen(true);
  };

  const handleDeleteMember = (memberId: string) => {
    const target = dashboard.members.find((member) => member.id === memberId);
    if (!target) return;
    deleteMemberAndRelatedContent(target)
      .then(() => {
        setSelectedMemberIds((prev) => prev.filter((id) => id !== memberId));
        loadDashboard();
      })
      .catch(() => {
        setError('회원 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      });
  };

  const handleEditMember = (memberId: string) => {
    const target = dashboard.members.find((member) => member.id === memberId);
    if (!target) return;
    setSelectedMemberIds([memberId]);
    setEditingMember(target);
    setMemberForm({
      name: target.name,
      phone: target.phone === '-' ? '' : target.phone,
      address: target.address === '-' ? '' : target.address,
      type: target.type,
    });
    setMemberActionError('');
    setIsMemberModalOpen(true);
  };

  const openCreateMemberModal = () => {
    setEditingMember(null);
    setMemberForm({ name: '', phone: '', address: '', type: '응원메시지' });
    setMemberActionError('');
    setIsMemberModalOpen(true);
  };

  const handleSubmitMember = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: memberForm.name.trim(),
      phone: memberForm.phone.trim(),
      address: memberForm.address.trim() || '-',
      type: memberForm.type,
    };

    if (!payload.name) {
      setMemberActionError('이름을 입력해 주세요.');
      return;
    }
    if (!payload.phone) {
      setMemberActionError('전화번호를 입력해 주세요.');
      return;
    }

    setSavingMember(true);
    setMemberActionError('');
    try {
      if (editingMember) {
        await updateMemberBySource(editingMember.sourceCollection, editingMember.sourceId, payload);
      } else {
        await createAdminMember(payload);
      }
      setIsMemberModalOpen(false);
      setEditingMember(null);
      await loadDashboard();
    } catch {
      setMemberActionError('회원 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSavingMember(false);
    }
  };

  const parseCsv = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map((item) => item.trim().toLowerCase());
    const nameIndex = header.findIndex((item) => item === 'name');
    const phoneIndex = header.findIndex((item) => item === 'phone');
    const addressIndex = header.findIndex((item) => item === 'address');
    const typeIndex = header.findIndex((item) => item === 'type');

    if (nameIndex === -1 || phoneIndex === -1 || addressIndex === -1 || typeIndex === -1) {
      throw new Error('CSV 헤더 형식이 올바르지 않습니다. (name,phone,address,type)');
    }

    return lines.slice(1).map((line) => {
      const cols = line.split(',').map((item) => item.trim());
      const rawType = cols[typeIndex] || '응원메시지';
      const type: '응원메시지' | '정책제안' | '일반' =
        rawType === '정책제안' ? '정책제안' : rawType === '일반' ? '일반' : '응원메시지';
      return {
        name: cols[nameIndex] || '',
        phone: cols[phoneIndex] || '-',
        address: cols[addressIndex] || '-',
        type,
      };
    }).filter((item) => item.name);
  };

  const handleCsvUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadingCsv(true);
    setError('');
    try {
      const text = await file.text();
      const members = parseCsv(text);
      if (members.length === 0) {
        throw new Error('등록할 회원 데이터가 없습니다.');
      }
      await Promise.all(members.map((member) => createAdminMember(member)));
      await loadDashboard();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'CSV 업로드에 실패했습니다.';
      setError(message);
    } finally {
      setUploadingCsv(false);
    }
  };

  const downloadCsvSample = () => {
    const sample = [
      'name,phone,address,type',
      '홍길동,010-1234-5678,인천광역시 남동구,응원메시지',
      '김민지,010-9876-5432,인천광역시 연수구,정책제안',
    ].join('\n');

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'member_sample.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleHeroFilePick = (slot: number) => {
    const index = slot - 1;
    heroFileInputRefs.current[index]?.click();
  };

  const handleHeroFileChange = async (slot: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const index = slot - 1;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > HERO_IMAGE_MAX_BYTES) {
      setError(`파일 용량이 너무 큽니다. 1장당 최대 ${formatBytes(HERO_IMAGE_MAX_BYTES)} 이하로 업로드해 주세요.`);
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setHeroPendingFiles((prev) => {
        const next = [...prev];
        next[index] = { dataUrl, sizeBytes: file.size, fileName: file.name };
        return next;
      });
      setError('');
    } catch {
      setError('이미지 파일을 읽는 중 오류가 발생했습니다.');
    }
  };

  const handleHeroUpload = async (slot: number) => {
    const index = slot - 1;
    const pending = heroPendingFiles[index];
    if (!pending) return;

    setSavingHeroSlot(slot);
    setError('');
    try {
      await saveHeroBackgroundImage(slot, { dataUrl: pending.dataUrl, sizeBytes: pending.sizeBytes });
      setHeroPendingFiles((prev) => {
        const next = [...prev];
        next[index] = null;
        return next;
      });
      await loadHeroImages();
    } catch {
      setError('배경화면 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSavingHeroSlot(null);
    }
  };

  const handleHeroDelete = async (slot: number) => {
    const index = slot - 1;
    setDeletingHeroSlot(slot);
    setError('');
    try {
      await deleteHeroBackgroundImage(slot);
      setHeroPendingFiles((prev) => {
        const next = [...prev];
        next[index] = null;
        return next;
      });
      await loadHeroImages();
    } catch {
      setError('배경화면 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletingHeroSlot(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    setDeletingPostId(postId);
    setError('');
    try {
      await deletePost(postId);
      await loadDashboard();
    } catch {
      setError('게시물 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setDeletingEventId(eventId);
    setError('');
    try {
      await deleteEvent(eventId);
      await loadDashboard();
    } catch {
      setError('행사 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletingEventId(null);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 [&_button:enabled]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-burgundy/5 text-burgundy rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LayoutDashboard size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">관리자 로그인</h1>
            <p className="text-slate-500 text-sm">캠프 운영 대시보드에 접속합니다.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="admin-password" className="text-sm font-bold text-slate-700">
                비밀번호
              </label>
              <input
                id="admin-password"
                type="password"
                className="w-full px-4 py-4 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-burgundy transition-all"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="관리자 비밀번호 입력"
              />
            </div>
            {loginError ? <p className="text-sm text-red-600">{loginError}</p> : null}
            <button className="w-full bg-burgundy text-white py-4 rounded-xl font-bold hover:bg-burgundy-dark transition-all">
              로그인
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-32 pb-24 [&_button:enabled]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">관리자 대시보드</h1>
            <p className="text-sm text-slate-500 mt-1">
              마지막 업데이트: {formatDate(dashboard.updatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 새로고침
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-burgundy text-white hover:bg-burgundy-dark transition-colors"
            >
              <LogOut size={16} /> 로그아웃
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {metrics.map((metric, index) =>
            index === 0 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsVisitorLogModalOpen(true)}
                className="text-left bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-burgundy/30 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={18} />
                </div>
                <p className="text-3xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-burgundy">클릭해서 일간 방문 로그 보기</p>
              </button>
            ) : index === 1 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsPostsModalOpen(true)}
                className="text-left bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-blue-200 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={18} />
                </div>
                <p className="text-3xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-blue-600">클릭해서 게시물 보기</p>
              </button>
            ) : index === 2 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsEventsModalOpen(true)}
                className="text-left bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-emerald-200 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={18} />
                </div>
                <p className="text-3xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-emerald-600">클릭해서 행사 보기</p>
              </button>
            ) : index === 3 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsSupportMessagesModalOpen(true)}
                className="text-left bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-amber-200 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={18} />
                </div>
                <p className="text-3xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-amber-600">클릭해서 응원 메시지 보기</p>
              </button>
            ) : (
              <div key={metric.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={18} />
                </div>
                <p className="text-3xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
              </div>
            )
          )}
        </div>

        <div className="grid grid-cols-1 gap-6">
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-bold text-slate-900">메인 좌측 배경화면 관리</h2>
              <p className="text-sm text-slate-500">
                슬롯 4장까지 등록 가능합니다. 권장 사이즈: 1200x1600px 이상, 파일당 최대 {formatBytes(HERO_IMAGE_MAX_BYTES)}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: HERO_IMAGE_SLOT_COUNT }, (_, idx) => {
                const slot = idx + 1;
                const saved = heroImages[idx];
                const pending = heroPendingFiles[idx];
                const preview = pending?.dataUrl || saved?.dataUrl || '';
                const sizeBytes = pending?.sizeBytes ?? saved?.sizeBytes ?? 0;
                return (
                  <div key={slot} className="rounded-xl border border-slate-200 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-800">슬롯 {slot}</p>
                      <p className="text-xs text-slate-500">현재 크기: {formatBytes(sizeBytes)}</p>
                    </div>
                    <div className="h-40 rounded-lg border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center">
                      {preview ? (
                        <img src={preview} alt={`배경 슬롯 ${slot}`} className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-xs text-slate-400">등록된 이미지 없음</span>
                      )}
                    </div>
                    {pending ? <p className="text-xs text-slate-500 truncate">선택됨: {pending.fileName}</p> : null}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleHeroFilePick(slot)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                      >
                        사진 선택
                      </button>
                      <button
                        type="button"
                        onClick={() => handleHeroUpload(slot)}
                        disabled={!pending || savingHeroSlot === slot}
                        className="flex-1 rounded-lg bg-burgundy px-3 py-2 text-xs font-bold text-white hover:bg-burgundy-dark transition disabled:opacity-60"
                      >
                        {savingHeroSlot === slot ? '업로드 중...' : '업로드'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleHeroDelete(slot)}
                        disabled={(!saved && !pending) || deletingHeroSlot === slot}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition disabled:opacity-60"
                      >
                        {deletingHeroSlot === slot ? '삭제 중' : '삭제'}
                      </button>
                      <input
                        ref={(el) => {
                          heroFileInputRefs.current[idx] = el;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => handleHeroFileChange(slot, event)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="mb-4 space-y-3">
              <h2 className="text-lg font-bold text-slate-900">회원 관리</h2>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteSelectedMembers}
                    disabled={selectedMemberIds.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleEditSelectedMember}
                    disabled={selectedMemberIds.length !== 1}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadCsvSample}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Download size={16} /> 샘플 다운로드
                  </button>
                  <button
                    type="button"
                    onClick={handleCsvUploadClick}
                    disabled={uploadingCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
                  >
                    <FileUp size={16} /> CSV 업로드
                  </button>
                  <button
                    type="button"
                    onClick={openCreateMemberModal}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-burgundy px-3 py-2 text-sm font-bold text-white hover:bg-burgundy-dark transition-colors"
                  >
                    <UserPlus size={16} /> 회원 등록
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleCsvFileChange}
                />
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-5 bg-slate-50 text-sm font-bold text-slate-700">
                <div className="px-4 py-3 border-r border-slate-200 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allMembersSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedMemberIds(dashboard.members.map((member) => member.id));
                      } else {
                        setSelectedMemberIds([]);
                      }
                    }}
                    className="h-4 w-4 accent-burgundy cursor-pointer"
                    aria-label="전체 회원 선택"
                  />
                </div>
                <div className="px-4 py-3 border-r border-slate-200">이름</div>
                <div className="px-4 py-3 border-r border-slate-200">전화번호</div>
                <div className="px-4 py-3 border-r border-slate-200">주소</div>
                <div className="px-4 py-3">유형</div>
              </div>
              {dashboard.members.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-400">등록된 회원 정보가 없습니다.</div>
              ) : (
                dashboard.members.map((member) => {
                  const isSelected = selectedMemberIds.includes(member.id);
                  return (
                  <div
                    key={member.id}
                    className={`grid grid-cols-5 border-t text-sm transition-colors ${
                      isSelected ? 'border-slate-300 text-slate-900' : 'border-slate-100'
                    }`}
                  >
                    <div
                      className={`px-3 py-3 border-r flex items-center gap-2 ${
                        isSelected ? 'border-slate-300 bg-slate-200' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleDeleteMember(member.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-50 border border-red-100 text-red-700 hover:bg-red-100 transition-colors"
                        aria-label={`${member.name} 삭제`}
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditMember(member.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-colors"
                        aria-label={`${member.name} 수정`}
                      >
                        <Pencil size={14} />
                      </button>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedMemberIds((prev) => [...prev, member.id]);
                          } else {
                            setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
                          }
                        }}
                        className="ml-[10px] h-4 w-4 accent-burgundy cursor-pointer"
                        aria-label={`${member.name} 선택`}
                      />
                    </div>
                    <div
                      className={`px-4 py-3 border-r ${
                        isSelected ? 'border-slate-300 bg-slate-200 text-slate-900' : 'border-slate-100 bg-white text-slate-800'
                      }`}
                    >
                      {member.name}
                    </div>
                    <div
                      className={`px-4 py-3 border-r ${
                        isSelected ? 'border-slate-300 bg-slate-200 text-slate-800' : 'border-slate-100 bg-white text-slate-700'
                      }`}
                    >
                      {member.phone}
                    </div>
                    <div
                      className={`px-4 py-3 border-r ${
                        isSelected ? 'border-slate-300 bg-slate-200 text-slate-700' : 'border-slate-100 bg-white text-slate-500'
                      }`}
                    >
                      {member.address || '-'}
                    </div>
                    <div className={isSelected ? 'px-4 py-3 bg-slate-200 text-slate-800' : 'px-4 py-3 bg-white text-slate-700'}>
                      {member.type}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {isPostsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => setIsPostsModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white border border-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">전체 게시물</h3>
                <p className="text-xs text-slate-500 mt-0.5">총 {dashboard.totals.posts.toLocaleString()}개</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPostsModalOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="게시물 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {dashboard.recentPosts.length === 0 ? (
                <p className="text-sm text-slate-400">게시물이 없습니다.</p>
              ) : (
                dashboard.recentPosts.map((post) => (
                  <div key={post.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-slate-900">{post.title}</p>
                      <button
                        type="button"
                        onClick={() => handleDeletePost(post.id)}
                        disabled={deletingPostId === post.id}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        <Trash2 size={12} />
                        {deletingPostId === post.id ? '삭제 중' : '삭제'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(post.date)}</p>
                    <p className="mt-2 text-sm text-slate-700">{stripHtmlTags(post.content).slice(0, 140) || '-'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isVisitorLogModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => setIsVisitorLogModalOpen(false)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl bg-white border border-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">오늘 방문 로그 상세</h3>
                <p className="text-xs text-slate-500 mt-0.5">최근 7일(6시 기준) 일간 접속자 수</p>
              </div>
              <button
                type="button"
                onClick={() => setIsVisitorLogModalOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="방문 로그 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">오늘 누적 접속자</p>
                <p className="text-2xl font-bold text-slate-900">{dashboard.totals.visitorsToday.toLocaleString()}명</p>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${dailyVisitorChart.width} ${dailyVisitorChart.height}`}
                  className="w-full min-w-[640px]"
                  role="img"
                  aria-label="최근 7일 일간 접속자 선형 그래프"
                >
                  <line
                    x1={24}
                    y1={dailyVisitorChart.height - 24}
                    x2={dailyVisitorChart.width - 24}
                    y2={dailyVisitorChart.height - 24}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                  />
                  <line x1={24} y1={24} x2={24} y2={dailyVisitorChart.height - 24} stroke="#cbd5e1" strokeWidth="1" />
                  <polyline
                    fill="none"
                    stroke="#7a0f2c"
                    strokeWidth="3"
                    points={dailyVisitorChart.points.map((point) => `${point.x},${point.y}`).join(' ')}
                  />
                  {dailyVisitorChart.points.map((point, index) => (
                    <circle key={`${point.dateLabel}-${index}`} cx={point.x} cy={point.y} r="4" fill="#7a0f2c" />
                  ))}
                </svg>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {dashboard.dailyVisitorTrend.map((point) => (
                  <div key={point.dateLabel} className="rounded-lg border border-slate-100 px-3 py-2 text-center bg-white">
                    <p className="text-xs text-slate-500">{point.dateLabel}</p>
                    <p className="text-sm font-bold text-slate-800">{point.count.toLocaleString()}명</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isEventsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => setIsEventsModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white border border-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">전체 행사</h3>
                <p className="text-xs text-slate-500 mt-0.5">총 {dashboard.totals.events.toLocaleString()}개</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEventsModalOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="행사 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {dashboard.upcomingEvents.length === 0 ? (
                <p className="text-sm text-slate-400">행사가 없습니다.</p>
              ) : (
                dashboard.upcomingEvents.map((eventItem) => (
                  <div key={eventItem.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-slate-900">{eventItem.title}</p>
                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(eventItem.id)}
                        disabled={deletingEventId === eventItem.id}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        <Trash2 size={12} />
                        {deletingEventId === eventItem.id ? '삭제 중' : '삭제'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(eventItem.date)} · {eventItem.location}</p>
                    <p className="mt-2 text-sm text-slate-700">{stripHtmlTags(eventItem.description).slice(0, 140) || '-'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isSupportMessagesModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => setIsSupportMessagesModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white border border-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">응원 메시지</h3>
                <p className="text-xs text-slate-500 mt-0.5">총 {dashboard.totals.supportMessages.toLocaleString()}개</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSupportMessagesModalOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="응원 메시지 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {dashboard.recentSupportMessages.length === 0 ? (
                <p className="text-sm text-slate-400">응원 메시지가 없습니다.</p>
              ) : (
                dashboard.recentSupportMessages.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-slate-900">{maskName(item.name)}</p>
                      <p className="text-xs text-slate-500">{formatDate(item.createdAt)}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{maskPhone(item.phone)}</p>
                    <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{item.content || '-'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isMemberModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => {
            if (savingMember) return;
            setIsMemberModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{editingMember ? '회원 수정' : '회원 등록'}</h3>
              <button
                type="button"
                onClick={() => setIsMemberModalOpen(false)}
                disabled={savingMember}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmitMember} className="p-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">이름</label>
                <input
                  type="text"
                  required
                  value={memberForm.name}
                  onChange={(e) => setMemberForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">전화번호</label>
                <input
                  type="text"
                  required
                  value={memberForm.phone}
                  onChange={(e) => setMemberForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">주소</label>
                <input
                  type="text"
                  value={memberForm.address}
                  onChange={(e) => setMemberForm((prev) => ({ ...prev, address: e.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">유형</label>
                <select
                  value={memberForm.type}
                  onChange={(e) =>
                    setMemberForm((prev) => ({ ...prev, type: e.target.value as '응원메시지' | '정책제안' | '일반' }))
                  }
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                >
                  <option value="응원메시지">응원메시지</option>
                  <option value="정책제안">정책제안</option>
                  <option value="일반">일반</option>
                </select>
              </div>
              {memberActionError ? <p className="text-sm text-red-600">{memberActionError}</p> : null}
              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  disabled={savingMember}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="px-4 py-2 rounded-lg bg-burgundy text-white font-bold hover:bg-burgundy-dark disabled:opacity-60"
                >
                  {savingMember ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
