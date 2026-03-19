import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  CalendarDays,
  Download,
  FileText,
  FileUp,
  LayoutDashboard,
  MessageSquareText,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { formatDate, stripHtmlTags } from '../lib/utils';
import {
  ADMIN_SESSION_STORAGE_KEY,
  createAdminSession,
  createAdminMember,
  createSmsRequest,
  deleteAdminSession,
  deleteContact,
  deleteEvent,
  deletePolicyProposal,
  deletePost,
  deleteSupportMessage,
  deleteHeroBackgroundImage,
  deleteMemberAndRelatedContent,
  getAdminDashboardData,
  getHeroBackgroundImages,
  reflectPolicyProposalToCatalog,
  saveHeroBackgroundImage,
  updatePolicyProposal,
  updateMemberBySource,
  verifyAdminSession,
  type AdminDashboardData,
  type ContactInquiryItem,
  type HeroBackgroundImageItem,
  type MemberManagementItem,
} from '../lib/firebaseData';

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: {
          roadAddress: string;
          jibunAddress: string;
          zonecode: string;
          bname: string;
          buildingName: string;
          apartment: 'Y' | 'N';
        }) => void;
      }) => {
        open: () => void;
      };
    };
  }
}

const ADMIN_PASSWORD = 'admin1234';
const ADMIN_SESSION_KEY = 'admin_dashboard_auth';
const ADMIN_PROFILE_STORAGE_KEY = 'admin_profile_cache';
const HERO_IMAGE_SLOT_COUNT = 4;
const HERO_IMAGE_MAX_BYTES = 850 * 1024;
const SMS_MAX_RECIPIENTS_PER_REQUEST = 20;
const SMS_MAX_MESSAGE_BYTES = 90;
const MEMBERS_PER_PAGE = 20;

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

function formatPhoneForDisplay(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    if (digits.startsWith('02')) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits || '-';
}

function formatPhoneInputValue(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function trimToUtf8Bytes(value: string, maxBytes: number) {
  let result = value;
  while (result && getUtf8ByteLength(result) > maxBytes) {
    result = result.slice(0, -1);
  }
  return result;
}

function getEmptyDashboard(): AdminDashboardData {
  return {
    totals: {
      posts: 0,
      events: 0,
      policyProposals: 0,
      supportMessages: 0,
      contacts: 0,
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
    recentPolicies: [],
    recentSupportMessages: [],
    recentContacts: [],
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [dashboard, setDashboard] = useState<AdminDashboardData>(getEmptyDashboard);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [currentMemberPage, setCurrentMemberPage] = useState(1);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberManagementItem | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [memberActionError, setMemberActionError] = useState('');
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSenderNumber, setSmsSenderNumber] = useState('');
  const [smsRecipientPhones, setSmsRecipientPhones] = useState<string[]>(
    Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, () => '')
  );
  const [smsRecipientNames, setSmsRecipientNames] = useState<string[]>(
    Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, () => '')
  );
  const [smsError, setSmsError] = useState('');
  const [smsSuccess, setSmsSuccess] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsUseLms, setSmsUseLms] = useState(false);
  const [smsRecipientStatuses, setSmsRecipientStatuses] = useState<
    Record<number, '대기' | '요청 완료' | '요청 실패'>
  >({});
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
  const [deletingPolicyId, setDeletingPolicyId] = useState<string | null>(null);
  const [savingPolicyProposalId, setSavingPolicyProposalId] = useState<string | null>(null);
  const [reflectingPolicyProposalId, setReflectingPolicyProposalId] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [deletingSupportMessageId, setDeletingSupportMessageId] = useState<string | null>(null);
  const [editingPolicyProposalId, setEditingPolicyProposalId] = useState<string | null>(null);
  const [policyProposalDrafts, setPolicyProposalDrafts] = useState<
    Record<string, { category: string; title: string; desc: string; content: string; order: string }>
  >({});
  const [isPolicyProposalsModalOpen, setIsPolicyProposalsModalOpen] = useState(false);
  const [isSupportMessagesModalOpen, setIsSupportMessagesModalOpen] = useState(false);
  const [isContactBoardModalOpen, setIsContactBoardModalOpen] = useState(false);
  const [selectedContactInquiry, setSelectedContactInquiry] = useState<ContactInquiryItem | null>(null);
  const [isContactInquiryModalOpen, setIsContactInquiryModalOpen] = useState(false);
  const [isVisitorLogModalOpen, setIsVisitorLogModalOpen] = useState(false);
  const [loadingAddressSearch, setLoadingAddressSearch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [memberForm, setMemberForm] = useState({
    name: '',
    phone: '',
    address: '',
    addressDetail: '',
    type: '응원메시지' as '응원메시지' | '정책제안' | '일반',
  });

  const heroFileInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const ensureDaumPostcodeScript = () =>
    new Promise<void>((resolve, reject) => {
      if (window.daum?.Postcode) {
        resolve();
        return;
      }

      const existingScript = document.querySelector('script[data-daum-postcode="true"]') as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('주소 검색 스크립트를 불러오지 못했습니다.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.async = true;
      script.dataset.daumPostcode = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('주소 검색 스크립트를 불러오지 못했습니다.'));
      document.head.appendChild(script);
    });

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
    let cancelled = false;
    const restoreSession = async () => {
      const sessionToken = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || '';
      if (!sessionToken) {
        if (!cancelled) setIsLoggedIn(sessionStorage.getItem(ADMIN_SESSION_KEY) === '1');
        return;
      }
      const isActive = await verifyAdminSession(sessionToken);
      if (cancelled) return;
      if (isActive) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
        setIsLoggedIn(true);
        return;
      }
      sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      setIsLoggedIn(false);
    };
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    loadDashboard();
    loadHeroImages();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const timer = window.setInterval(() => {
      loadDashboard();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [isLoggedIn]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== ADMIN_PASSWORD) {
      setLoginError('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      const sessionToken = await createAdminSession({ username: 'admin', name: '관리자', role: 'admin' });
      sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, sessionToken);
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      sessionStorage.setItem(ADMIN_PROFILE_STORAGE_KEY, JSON.stringify({ username: 'admin', name: '관리자', role: 'admin' }));
      setLoginError('');
      setPassword('');
      setIsLoggedIn(true);
    } catch {
      setLoginError('로그인 세션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  useEffect(() => {
    setSelectedMemberIds((prev) => prev.filter((id) => dashboard.members.some((member) => member.id === id)));
  }, [dashboard.members]);

  const totalMemberPages = Math.max(1, Math.ceil(dashboard.members.length / MEMBERS_PER_PAGE));

  useEffect(() => {
    setCurrentMemberPage((prev) => Math.min(prev, totalMemberPages));
  }, [totalMemberPages]);

  const metrics = useMemo(
    () => [
      { label: '오늘 방문 로그(00시 기준)', value: dashboard.totals.visitorsToday, icon: Users, color: 'text-burgundy' },
      { label: '전체 게시물', value: dashboard.totals.posts, icon: FileText, color: 'text-blue-600' },
      { label: '보도자료', value: dashboard.totals.events, icon: CalendarDays, color: 'text-emerald-600' },
      { label: '정책제안', value: dashboard.totals.policyProposals, icon: Pencil, color: 'text-violet-600' },
      { label: '응원 메시지', value: dashboard.totals.supportMessages, icon: MessageSquareText, color: 'text-amber-600' },
      { label: '문의 게시판', value: dashboard.totals.contacts, icon: MessageSquareText, color: 'text-cyan-600' },
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

  const currentMemberPageStartIndex = (currentMemberPage - 1) * MEMBERS_PER_PAGE;
  const paginatedMembers = dashboard.members.slice(currentMemberPageStartIndex, currentMemberPageStartIndex + MEMBERS_PER_PAGE);
  const allMembersSelected =
    paginatedMembers.length > 0 && paginatedMembers.every((member) => selectedMemberIds.includes(member.id));
  const selectedMembers = dashboard.members.filter((member) => selectedMemberIds.includes(member.id));
  const selectedSmsTargets = selectedMembers
    .map((member, index) => ({
      id: member.id,
      name: member.name || '',
      order: index + 1,
      phoneDigits: member.phone.replace(/\D/g, ''),
      displayPhone: formatPhoneForDisplay(member.phone),
    }))
    .filter((target) => target.phoneDigits.length >= 10);
  const smsRecipientRows = useMemo(
    () =>
      Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, (_, index) => ({
        rowNo: index + 1,
        name: smsRecipientNames[index] || '',
        phone: smsRecipientPhones[index] || '',
      })),
    [smsRecipientNames, smsRecipientPhones]
  );
  const smsValidRecipientRows = useMemo(
    () =>
      smsRecipientRows
        .map((row) => ({
          rowNo: row.rowNo,
          phoneDigits: row.phone.replace(/\D/g, ''),
        }))
        .filter((row) => row.phoneDigits.length >= 10),
    [smsRecipientRows]
  );
  const smsMessageBytes = getUtf8ByteLength(smsMessage);
  useEffect(() => {
    if (!isSmsModalOpen) return;
    setSmsRecipientStatuses((prev) => {
      const next: Record<number, '대기' | '요청 완료' | '요청 실패'> = {};
      for (let rowNo = 1; rowNo <= SMS_MAX_RECIPIENTS_PER_REQUEST; rowNo += 1) {
        next[rowNo] = prev[rowNo] ?? '대기';
      }
      return next;
    });
  }, [isSmsModalOpen, smsRecipientPhones]);

  const handleDeleteSelectedMembers = () => {
    if (selectedMemberIds.length === 0) return;
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
      addressDetail: '',
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
      addressDetail: '',
      type: target.type,
    });
    setMemberActionError('');
    setIsMemberModalOpen(true);
  };

  const openCreateMemberModal = () => {
    setEditingMember(null);
    setMemberForm({ name: '', phone: '', address: '', addressDetail: '', type: '응원메시지' });
    setMemberActionError('');
    setIsMemberModalOpen(true);
  };

  const handleSubmitMember = async (event: React.FormEvent) => {
    event.preventDefault();
    const combinedAddress = [memberForm.address.trim(), memberForm.addressDetail.trim()].filter(Boolean).join(' ');
    const payload = {
      name: memberForm.name.trim(),
      phone: memberForm.phone.trim(),
      address: combinedAddress || '-',
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

  const handleMemberAddressLookup = async () => {
    try {
      setLoadingAddressSearch(true);
      setMemberActionError('');
      await ensureDaumPostcodeScript();
      if (!window.daum?.Postcode) throw new Error('주소 검색 기능을 사용할 수 없습니다.');

      new window.daum.Postcode({
        oncomplete: (data) => {
          const baseAddress = data.roadAddress || data.jibunAddress || '';
          const extraAddress =
            data.roadAddress && (data.bname || data.buildingName)
              ? [data.bname, data.apartment === 'Y' ? data.buildingName : ''].filter(Boolean).join(', ')
              : '';
          const fullAddress = [baseAddress, extraAddress ? `(${extraAddress})` : '', data.zonecode ? `[${data.zonecode}]` : '']
            .filter(Boolean)
            .join(' ');
          setMemberForm((prev) => ({ ...prev, address: fullAddress }));
          setLoadingAddressSearch(false);
        },
      }).open();
    } catch {
      setLoadingAddressSearch(false);
      setMemberActionError('주소 검색을 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
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

  const handleDeletePolicyProposal = async (proposalId: string) => {
    setDeletingPolicyId(proposalId);
    setError('');
    try {
      await deletePolicyProposal(proposalId);
      await loadDashboard();
    } catch {
      setError('정책제안 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletingPolicyId(null);
    }
  };

  const ensurePolicyProposalDraft = (item: AdminDashboardData['recentPolicies'][number]) => {
    setPolicyProposalDrafts((prev) => {
      if (prev[item.id]) return prev;
      const fallbackDesc = (item.content || '').replace(/\s+/g, ' ').trim().slice(0, 90);
      return {
        ...prev,
        [item.id]: {
          category: item.category || '정책제안',
          title: item.title || '',
          desc: item.desc || fallbackDesc,
          content: item.content || '',
          order: item.order && item.order > 0 ? String(item.order) : '',
        },
      };
    });
  };

  const handleStartEditPolicyProposal = (item: AdminDashboardData['recentPolicies'][number]) => {
    ensurePolicyProposalDraft(item);
    setEditingPolicyProposalId(item.id);
  };

  const handleChangePolicyProposalDraft = (
    proposalId: string,
    field: 'category' | 'title' | 'desc' | 'content' | 'order',
    value: string
  ) => {
    setPolicyProposalDrafts((prev) => ({
      ...prev,
      [proposalId]: {
        category: prev[proposalId]?.category ?? '',
        title: prev[proposalId]?.title ?? '',
        desc: prev[proposalId]?.desc ?? '',
        content: prev[proposalId]?.content ?? '',
        order: prev[proposalId]?.order ?? '',
        [field]: value,
      },
    }));
  };

  const handleSavePolicyProposalEdit = async (proposalId: string) => {
    const draft = policyProposalDrafts[proposalId];
    if (!draft) return;
    if (!draft.title.trim() || !draft.content.trim()) {
      setError('정책제안 제목과 내용을 입력해 주세요.');
      return;
    }

    setSavingPolicyProposalId(proposalId);
    setError('');
    try {
      const parsedOrder = Number(draft.order || 0);
      await updatePolicyProposal(proposalId, {
        category: draft.category.trim(),
        title: draft.title.trim(),
        desc: draft.desc.trim(),
        content: draft.content.trim(),
        order: Number.isFinite(parsedOrder) && parsedOrder > 0 ? parsedOrder : undefined,
      });
      setEditingPolicyProposalId(null);
      await loadDashboard();
    } catch {
      setError('정책제안 수정에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSavingPolicyProposalId(null);
    }
  };

  const handleReflectPolicyProposal = async (item: AdminDashboardData['recentPolicies'][number]) => {
    ensurePolicyProposalDraft(item);
    const draft = policyProposalDrafts[item.id] ?? {
      category: item.category || '정책제안',
      title: item.title || '',
      desc: item.desc || (item.content || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      content: item.content || '',
      order: item.order && item.order > 0 ? String(item.order) : '',
    };
    if (!draft.category.trim() || !draft.title.trim() || !draft.desc.trim() || !draft.content.trim()) {
      setError('정책반영 전 분류/제목/요약/내용을 모두 입력해 주세요.');
      return;
    }

    setReflectingPolicyProposalId(item.id);
    setError('');
    try {
      const parsedOrder = Number(draft.order || 0);
      await reflectPolicyProposalToCatalog(item.id, {
        category: draft.category.trim(),
        title: draft.title.trim(),
        desc: draft.desc.trim(),
        content: draft.content.trim(),
        order: Number.isFinite(parsedOrder) && parsedOrder > 0 ? parsedOrder : undefined,
      });
      setEditingPolicyProposalId(null);
      await loadDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
        setError('정책 페이지 반영 권한이 없습니다. Firestore rules 배포를 확인해 주세요.');
      } else {
        setError('정책 페이지 반영에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setReflectingPolicyProposalId(null);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    setDeletingContactId(contactId);
    setError('');
    try {
      await deleteContact(contactId);
      if (selectedContactInquiry?.id === contactId) {
        setSelectedContactInquiry(null);
        setIsContactInquiryModalOpen(false);
      }
      await loadDashboard();
    } catch {
      setError('문의 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletingContactId(null);
    }
  };

  const handleDeleteSupportMessage = async (messageId: string) => {
    setDeletingSupportMessageId(messageId);
    setError('');
    try {
      await deleteSupportMessage(messageId);
      await loadDashboard();
    } catch {
      setError('응원 메시지 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletingSupportMessageId(null);
    }
  };

  const handleOpenSmsModal = () => {
    const nextNames = Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, () => '');
    const nextPhones = Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, () => '');
    selectedSmsTargets.slice(0, SMS_MAX_RECIPIENTS_PER_REQUEST).forEach((target, index) => {
      nextNames[index] = target.name;
      nextPhones[index] = target.displayPhone;
    });
    setSmsRecipientNames(nextNames);
    setSmsRecipientPhones(nextPhones);

    if (selectedSmsTargets.length > SMS_MAX_RECIPIENTS_PER_REQUEST) {
      setSmsError(`한 번에 최대 ${SMS_MAX_RECIPIENTS_PER_REQUEST}건까지 발송할 수 있습니다.`);
    } else {
      setSmsError('');
    }
    setSmsSuccess('');
    setSmsRecipientStatuses(
      Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, (_, index) => index + 1).reduce<
        Record<number, '대기' | '요청 완료' | '요청 실패'>
      >((acc, rowNo) => {
        acc[rowNo] = '대기';
        return acc;
      }, {})
    );
    setIsSmsModalOpen(true);
  };

  const handleOpenContactInquiry = (item: ContactInquiryItem) => {
    setIsContactBoardModalOpen(false);
    setSelectedContactInquiry(item);
    setIsContactInquiryModalOpen(true);
  };

  const handleSendSms = async () => {
    setSmsError('');
    setSmsSuccess('');

    if (selectedSmsTargets.length > SMS_MAX_RECIPIENTS_PER_REQUEST) {
      setSmsError(`한 번에 최대 ${SMS_MAX_RECIPIENTS_PER_REQUEST}건까지 발송할 수 있습니다.`);
      return;
    }
    if (smsValidRecipientRows.length === 0) {
      setSmsError('전화번호가 유효한 발송 대상이 없습니다.');
      return;
    }
    if (smsValidRecipientRows.length > SMS_MAX_RECIPIENTS_PER_REQUEST) {
      setSmsError(`한 번에 최대 ${SMS_MAX_RECIPIENTS_PER_REQUEST}건까지 발송할 수 있습니다.`);
      return;
    }
    if (!smsMessage.trim()) {
      setSmsError('문자 메시지 내용을 입력해 주세요.');
      return;
    }

    setSendingSms(true);
    try {
      setSmsRecipientStatuses(
        Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, (_, index) => index + 1).reduce<
          Record<number, '대기' | '요청 완료' | '요청 실패'>
        >((acc, rowNo) => {
          acc[rowNo] = smsValidRecipientRows.some((row) => row.rowNo === rowNo) ? '대기' : '요청 실패';
          return acc;
        }, {})
      );
      await createSmsRequest({
        recipients: smsValidRecipientRows.map((row) => row.phoneDigits),
        message: smsMessage.trim(),
        requestedBy: 'admin_dashboard',
      });
      setSmsRecipientStatuses(
        Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, (_, index) => index + 1).reduce<
          Record<number, '대기' | '요청 완료' | '요청 실패'>
        >((acc, rowNo) => {
          acc[rowNo] = smsValidRecipientRows.some((row) => row.rowNo === rowNo) ? '요청 완료' : '대기';
          return acc;
        }, {})
      );
      setSmsSuccess(`문자 발송 요청이 접수되었습니다. (${smsValidRecipientRows.length}건)`);
      setSmsMessage('');
    } catch (error) {
      setSmsRecipientStatuses(
        Array.from({ length: SMS_MAX_RECIPIENTS_PER_REQUEST }, (_, index) => index + 1).reduce<
          Record<number, '대기' | '요청 완료' | '요청 실패'>
        >((acc, rowNo) => {
          acc[rowNo] = smsValidRecipientRows.some((row) => row.rowNo === rowNo) ? '요청 실패' : '대기';
          return acc;
        }, {})
      );
      const message = error instanceof Error ? error.message : '';
      if (message.includes('sms-max-20')) {
        setSmsError(`한 번에 최대 ${SMS_MAX_RECIPIENTS_PER_REQUEST}건까지 발송할 수 있습니다.`);
      } else {
        setSmsError('문자 발송 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setSendingSms(false);
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
          <div />
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {metrics.map((metric, index) =>
            index === 0 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsVisitorLogModalOpen(true)}
                className="text-left bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:border-burgundy/30 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={16} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-burgundy">클릭해서 일간 방문 로그 보기</p>
              </button>
            ) : index === 1 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsPostsModalOpen(true)}
                className="text-left bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:border-blue-200 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={16} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-blue-600">클릭해서 게시물 보기</p>
              </button>
            ) : index === 2 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsEventsModalOpen(true)}
                className="text-left bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:border-emerald-200 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={16} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-emerald-600">클릭해서 행사 보기</p>
              </button>
            ) : index === 3 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsPolicyProposalsModalOpen(true)}
                className="text-left bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:border-violet-200 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={16} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-violet-600">클릭해서 정책제안 보기</p>
              </button>
            ) : index === 4 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsSupportMessagesModalOpen(true)}
                className="text-left bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:border-amber-200 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={16} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-amber-600">클릭해서 응원 메시지 보기</p>
              </button>
            ) : index === 5 ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => setIsContactBoardModalOpen(true)}
                className="text-left bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:border-cyan-200 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] text-slate-500">{metric.label}</p>
                  <metric.icon className={metric.color} size={16} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{metric.value.toLocaleString()}</p>
                <p className="mt-2 text-xs text-cyan-600">클릭해서 문의 게시판 보기</p>
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
                  <button
                    type="button"
                    onClick={handleOpenSmsModal}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="문자메시지 발송"
                    title="문자메시지 발송"
                  >
                    <MessageSquareText size={16} />
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
                <div className="px-4 py-2 border-r border-slate-200 flex items-center justify-center">
	                  <input
	                    type="checkbox"
	                    checked={allMembersSelected}
	                    onChange={(event) => {
	                      if (event.target.checked) {
	                        setSelectedMemberIds((prev) => Array.from(new Set([...prev, ...paginatedMembers.map((member) => member.id)])));
	                      } else {
	                        setSelectedMemberIds((prev) => prev.filter((id) => !paginatedMembers.some((member) => member.id === id)));
	                      }
	                    }}
	                    className="h-4 w-4 accent-burgundy cursor-pointer"
	                    aria-label="전체 회원 선택"
	                  />
                </div>
                <div className="px-4 py-2 border-r border-slate-200">이름</div>
                <div className="px-4 py-2 border-r border-slate-200">전화번호</div>
                <div className="px-4 py-2 border-r border-slate-200">주소</div>
                <div className="px-4 py-2">유형</div>
              </div>
	              {dashboard.members.length === 0 ? (
	                <div className="px-4 py-6 text-sm text-slate-400">등록된 회원 정보가 없습니다.</div>
	              ) : (
	                paginatedMembers.map((member, index) => {
	                  const isSelected = selectedMemberIds.includes(member.id);
	                  return (
	                  <div
                    key={member.id}
                    className={`grid grid-cols-5 border-t text-sm transition-colors ${
                      isSelected ? 'border-slate-300 text-slate-900' : 'border-slate-100'
                    }`}
                  >
                    <div
                      className={`px-3 py-2 border-r flex items-center gap-2 ${
                        isSelected ? 'border-slate-300 bg-slate-200' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-2 text-xs font-bold ${
                          isSelected ? 'border-slate-400 bg-slate-300 text-slate-800' : 'border-slate-200 bg-slate-100 text-slate-600'
                        }`}
                        aria-label={`${member.name} 순번`}
	                      >
	                        {currentMemberPageStartIndex + index + 1}
	                      </span>
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
                      className={`px-4 py-2 border-r ${
                        isSelected ? 'border-slate-300 bg-slate-200 text-slate-900' : 'border-slate-100 bg-white text-slate-800'
                      }`}
                    >
                      {member.name}
                    </div>
                    <div
                      className={`px-4 py-2 border-r ${
                        isSelected ? 'border-slate-300 bg-slate-200 text-slate-800' : 'border-slate-100 bg-white text-slate-700'
                      }`}
                    >
                      {member.phone}
                    </div>
                    <div
                      className={`px-4 py-2 border-r ${
                        isSelected ? 'border-slate-300 bg-slate-200 text-slate-700' : 'border-slate-100 bg-white text-slate-500'
                      }`}
                    >
                      {member.address || '-'}
                    </div>
                    <div className={isSelected ? 'px-4 py-2 bg-slate-200 text-slate-800' : 'px-4 py-2 bg-white text-slate-700'}>
                      {member.type}
                    </div>
	                  </div>
	                  );
	                })
	              )}
	            </div>
	            {dashboard.members.length > MEMBERS_PER_PAGE && (
	              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
	                {Array.from({ length: totalMemberPages }, (_, index) => {
	                  const page = index + 1;
	                  const isActive = page === currentMemberPage;
	                  return (
	                    <button
	                      key={page}
	                      type="button"
	                      onClick={() => setCurrentMemberPage(page)}
	                      className={`min-w-9 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
	                        isActive
	                          ? 'border-burgundy bg-burgundy text-white'
	                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
	                      }`}
	                      aria-label={`${page}페이지`}
	                    >
	                      {page}
	                    </button>
	                  );
	                })}
	              </div>
	            )}
	            </section>
        </div>
      </div>

      {isContactBoardModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => setIsContactBoardModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white border border-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">문의 게시판</h3>
                <p className="text-xs text-slate-500 mt-0.5">총 {dashboard.totals.contacts.toLocaleString()}개</p>
              </div>
              <button
                type="button"
                onClick={() => setIsContactBoardModalOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="문의 게시판 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {dashboard.recentContacts.length === 0 ? (
                <p className="text-sm text-slate-400">접수된 문의가 없습니다.</p>
              ) : (
                dashboard.recentContacts.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-100 p-4 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.name || '-'}</p>
                        <p className="text-xs text-slate-500 mt-1">{item.phone || '-'}</p>
                      </div>
                      <p className="text-xs text-slate-500 shrink-0">{formatDate(item.createdAt)}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words">{item.message || '-'}</p>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenContactInquiry(item)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        상세보기
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteContact(item.id)}
                        disabled={deletingContactId === item.id}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        <Trash2 size={12} />
                        {deletingContactId === item.id ? '삭제 중' : '삭제'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isContactInquiryModalOpen && selectedContactInquiry ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => setIsContactInquiryModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">문의 상세</h3>
                <p className="text-xs text-slate-500 mt-0.5">{formatDate(selectedContactInquiry.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsContactInquiryModalOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="문의 상세 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">이름</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{selectedContactInquiry.name || '-'}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">연락처</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{selectedContactInquiry.phone || '-'}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">문의 내용</p>
                <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{selectedContactInquiry.message || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                <p className="text-xs text-slate-500 mt-0.5">최근 7일(00시 기준) 일간 접속자 수</p>
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
                <h3 className="text-lg font-bold text-slate-900">보도자료</h3>
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
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-500">{formatDate(item.createdAt)}</p>
                        <button
                          type="button"
                          onClick={() => handleDeleteSupportMessage(item.id)}
                          disabled={deletingSupportMessageId === item.id}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          <Trash2 size={12} />
                          {deletingSupportMessageId === item.id ? '삭제 중' : '삭제'}
                        </button>
                      </div>
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

      {isPolicyProposalsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => setIsPolicyProposalsModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white border border-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">정책제안</h3>
                <p className="text-xs text-slate-500 mt-0.5">총 {dashboard.totals.policyProposals.toLocaleString()}개</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPolicyProposalsModalOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="정책제안 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {dashboard.recentPolicies.length === 0 ? (
                <p className="text-sm text-slate-400">정책제안이 없습니다.</p>
              ) : (
                dashboard.recentPolicies.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-slate-900">{item.title || '-'}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-500">{formatDate(item.createdAt)}</p>
                        <button
                          type="button"
                          onClick={() => handleStartEditPolicyProposal(item)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReflectPolicyProposal(item)}
                          disabled={reflectingPolicyProposalId === item.id}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {reflectingPolicyProposalId === item.id ? '반영 중' : '정책반영'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePolicyProposal(item.id)}
                          disabled={deletingPolicyId === item.id}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          <Trash2 size={12} />
                          {deletingPolicyId === item.id ? '삭제 중' : '삭제'}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{maskName(item.proposer)} · {maskPhone(item.phone)}</p>
                    {item.reflectedAt ? (
                      <p className="mt-1 text-xs text-emerald-700">정책반영 완료: {formatDate(item.reflectedAt)}</p>
                    ) : null}
                    {editingPolicyProposalId === item.id ? (
                      <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={policyProposalDrafts[item.id]?.category ?? ''}
                            onChange={(e) => handleChangePolicyProposalDraft(item.id, 'category', e.target.value)}
                            placeholder="분류 (예: 기초학력)"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                          />
                          <input
                            type="number"
                            min={1}
                            value={policyProposalDrafts[item.id]?.order ?? ''}
                            onChange={(e) => handleChangePolicyProposalDraft(item.id, 'order', e.target.value)}
                            placeholder="노출 순서 (숫자)"
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                          />
                        </div>
                        <input
                          type="text"
                          value={policyProposalDrafts[item.id]?.title ?? ''}
                          onChange={(e) => handleChangePolicyProposalDraft(item.id, 'title', e.target.value)}
                          placeholder="정책 제목"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          value={policyProposalDrafts[item.id]?.desc ?? ''}
                          onChange={(e) => handleChangePolicyProposalDraft(item.id, 'desc', e.target.value)}
                          placeholder="정책 요약"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        />
                        <textarea
                          rows={4}
                          value={policyProposalDrafts[item.id]?.content ?? ''}
                          onChange={(e) => handleChangePolicyProposalDraft(item.id, 'content', e.target.value)}
                          placeholder="정책 상세 내용"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm resize-none"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingPolicyProposalId(null)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSavePolicyProposalEdit(item.id)}
                            disabled={savingPolicyProposalId === item.id}
                            className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                          >
                            {savingPolicyProposalId === item.id ? '수정 저장 중' : '수정 저장'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{item.content || '-'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isSmsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => {
            if (sendingSms) return;
            setIsSmsModalOpen(false);
          }}
        >
          <div
            className="w-[400px] h-[860px] max-h-[92vh] rounded-3xl bg-[#f2f3f5] border border-slate-300 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-3 pb-2 flex justify-center">
              <div className="h-3 w-28 rounded-full bg-slate-500/70" />
            </div>

            <div className="px-4 pb-4 flex-1 min-h-0 flex flex-col">
              <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="rounded-3xl bg-[#d9dce0] border border-slate-300 p-4">
                  <div className="mb-2 rounded-xl border-2 border-[#2e4fd7] bg-white overflow-hidden flex items-stretch">
                    <div className="bg-[#254ad0] text-white text-xs font-bold flex items-center justify-center px-4 py-1.5 shrink-0">
                      발신자
                    </div>
                    <input
                      type="text"
                      value={smsSenderNumber}
                      onChange={(e) => setSmsSenderNumber(formatPhoneInputValue(e.target.value.replace(/\D/g, '').slice(0, 11)))}
                      placeholder="발신번호 입력"
                      className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none"
                    />
                  </div>

                  <textarea
                    id="sms-message"
                    rows={5}
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(trimToUtf8Bytes(e.target.value, SMS_MAX_MESSAGE_BYTES))}
                    placeholder="내용입력"
                    className="w-full rounded-2xl border border-slate-300 bg-[#f7f7f8] px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 resize-none min-h-[270px]"
                  />

                  <div className="mt-2 flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={smsUseLms}
                        onChange={(e) => setSmsUseLms(e.target.checked)}
                        className="h-4 w-4 accent-[#2e4fd7]"
                      />
                      LMS
                    </label>
                    <p className="text-xs font-semibold text-slate-800">{smsMessageBytes}/{SMS_MAX_MESSAGE_BYTES}Byte</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-300 p-2">
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[42px_82px_minmax(0,1fr)_52px] bg-slate-100 text-xs font-bold text-slate-800 border-b border-slate-300">
                      <div className="px-2 py-2">No.</div>
                      <div className="px-2 py-2 border-l border-slate-300">수신자</div>
                      <div className="px-2 py-2 border-l border-slate-300">수신번호</div>
                      <div className="px-1 py-2 border-l border-slate-300 text-center">상태</div>
                    </div>
                    <div className="max-h-[430px] overflow-y-auto">
                      {smsRecipientRows.map((target, rowIndex) => {
                        const no = rowIndex + 1;
                        return (
                          <div key={`sms-row-${no}`} className="grid grid-cols-[42px_82px_minmax(0,1fr)_52px] border-b border-slate-200 last:border-b-0 bg-white">
                            <div className="px-2 py-2 text-sm font-semibold text-slate-900">{no}</div>
                            <div className="px-2 py-1 border-l border-slate-200">
                              <input
                                value={target.name || ''}
                                readOnly
                                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-700"
                              />
                            </div>
                            <div className="px-2 py-1 border-l border-slate-200">
                              <input
                                value={target.phone || ''}
                                onChange={(e) =>
                                  setSmsRecipientPhones((prev) => {
                                    const next = [...prev];
                                    next[rowIndex] = formatPhoneInputValue(e.target.value.replace(/\D/g, '').slice(0, 11));
                                    return next;
                                  })
                                }
                                placeholder="전화번호 입력"
                                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-700"
                              />
                            </div>
                            <div className="px-1 py-1 border-l border-slate-200 flex items-center justify-center">
                              <span
                                className={`text-[11px] font-bold ${
                                  smsRecipientStatuses[no] === '요청 완료'
                                    ? 'text-emerald-600'
                                    : smsRecipientStatuses[no] === '요청 실패'
                                      ? 'text-red-600'
                                      : 'text-slate-400'
                                }`}
                              >
                                {smsRecipientStatuses[no] ?? '대기'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {smsError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{smsError}</div>
                ) : null}
                {smsSuccess ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{smsSuccess}</div>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSmsModalOpen(false)}
                  disabled={sendingSms}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleSendSms}
                  disabled={sendingSms || smsValidRecipientRows.length === 0 || selectedSmsTargets.length > SMS_MAX_RECIPIENTS_PER_REQUEST}
                  className="rounded-lg bg-[#2e4fd7] px-4 py-2 text-sm font-bold text-white hover:bg-[#2645c1] disabled:opacity-60"
                >
                  {sendingSms ? '발송 요청 중...' : '문자 발송'}
                </button>
              </div>
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
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={memberForm.address}
                    onChange={(e) => setMemberForm((prev) => ({ ...prev, address: e.target.value }))}
                    onClick={handleMemberAddressLookup}
                    placeholder="클릭해서 도로명 주소 검색"
                    className="w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={handleMemberAddressLookup}
                    disabled={loadingAddressSearch}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {loadingAddressSearch ? '검색 준비중...' : '주소 검색'}
                  </button>
                </div>
                <input
                  type="text"
                  value={memberForm.addressDetail}
                  onChange={(e) => setMemberForm((prev) => ({ ...prev, addressDetail: e.target.value }))}
                  placeholder="상세 주소를 입력해 주세요."
                  className="mt-2 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
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
