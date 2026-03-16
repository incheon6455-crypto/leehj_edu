import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, firebaseConfig, isFirebaseConfigured } from './firebase';

export interface Post {
  id: string;
  title: string;
  content: string;
  date: string;
  tags: string;
  image_url: string;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  is_past?: number;
}

export interface SupportMessageItem {
  id: string;
  name: string;
  phone: string;
  content: string;
  createdAt: string;
}

export interface PolicyProposalItem {
  id: string;
  proposer: string;
  phone: string;
  title: string;
  content: string;
  createdAt: string;
  category?: string;
  desc?: string;
  order?: number;
  reflectedPolicyId?: string;
  reflectedAt?: string;
}

export interface ContactInquiryItem {
  id: string;
  name: string;
  phone: string;
  message: string;
  createdAt: string;
}

export interface PolicyCatalogItem {
  id: string;
  category: string;
  title: string;
  desc: string;
  content: string;
  order: number;
}

export interface PolicyReactionCountMap {
  [policyId: string]: number;
}

export interface PolicyReactionIncrementResult {
  count: number;
  incremented: boolean;
}

export interface HeroBackgroundImageItem {
  slot: number;
  dataUrl: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface MemberManagementItem {
  id: string;
  name: string;
  phone: string;
  address: string;
  type: '응원메시지' | '정책제안' | '일반';
  createdAt: string;
  sourceCollection: 'support_messages' | 'policy_proposals' | 'admin_members';
  sourceId: string;
}

export interface AdminDashboardData {
  totals: {
    posts: number;
    events: number;
    policyProposals: number;
    supportMessages: number;
    contacts: number;
    visitorsToday: number;
  };
  visitorTrend: Array<{
    hourLabel: string;
    count: number;
  }>;
  dailyVisitorTrend: Array<{
    dateLabel: string;
    count: number;
  }>;
  members: MemberManagementItem[];
  recentPosts: Post[];
  upcomingEvents: EventItem[];
  recentPolicies: PolicyProposalItem[];
  recentSupportMessages: SupportMessageItem[];
  recentContacts: ContactInquiryItem[];
  updatedAt: string;
}

const DEFAULT_POLICY_CATALOG: PolicyCatalogItem[] = [
  {
    id: 'policy-basic-literacy',
    category: '기초학력',
    title: '초등 기초학력 책임 전담제 도입',
    desc: '모든 아이가 읽기, 쓰기, 셈하기를 완벽히 마스터할 수 있도록 전담 교사를 배치하겠습니다.',
    content:
      '기초학력 전담교사를 학교 단위로 배치하고, 학년 초 진단-중간 점검-학년 말 성취 확인으로 이어지는 3단계 지원 체계를 구축합니다. 읽기·쓰기·셈하기 맞춤형 보충 프로그램을 방과후 및 학습클리닉과 연계해 운영하겠습니다.',
    order: 1,
  },
  {
    id: 'policy-digital-ai',
    category: '디지털전환',
    title: '1인 1스마트 기기 및 AI 튜터 지원',
    desc: '디지털 격차 없는 학습 환경을 위해 모든 학생에게 기기를 지원하고 맞춤형 AI 학습 도구를 제공합니다.',
    content:
      '학생 개별 학습 데이터를 기반으로 AI 튜터를 도입해 과목별 취약 단원을 자동 추천하고, 교사는 대시보드로 학습 진도를 관리할 수 있도록 하겠습니다. 가정 형편에 따른 디지털 격차가 없도록 기기와 네트워크 접근성을 함께 지원합니다.',
    order: 2,
  },
  {
    id: 'policy-safety-counsel',
    category: '인성/안전',
    title: '학교 폭력 제로, 마음 건강 센터 확대',
    desc: '전문 상담 인력을 대폭 확충하여 아이들의 마음을 돌보고 안전한 학교 환경을 조성하겠습니다.',
    content:
      '학교별 상담 인력 확충과 외부 전문기관 연계를 통해 위기 학생을 조기에 발견하고 개입하겠습니다. 학교폭력 예방교육, 회복적 생활교육, 보호자 상담 프로그램을 통합 운영해 안전하고 존중받는 학교 문화를 만들겠습니다.',
    order: 3,
  },
  {
    id: 'policy-teacher-rights',
    category: '교원복지',
    title: '교권 보호 및 행정 업무 경감',
    desc: '선생님이 가르치는 일에만 집중할 수 있도록 행정 지원 시스템을 혁신하고 법적 보호를 강화합니다.',
    content:
      '교사가 수업과 생활교육에 집중할 수 있도록 공문·행정 절차를 간소화하고, 반복 업무는 통합 플랫폼으로 자동화하겠습니다. 교권침해 발생 시 즉시 대응 가능한 법률지원 체계를 마련하겠습니다.',
    order: 4,
  },
  {
    id: 'policy-special-education',
    category: '특수교육',
    title: '특수학교 신설 및 통합 교육 지원 강화',
    desc: '장애 학생들의 학습권을 보장하기 위해 특수 교육 인프라를 확충하고 맞춤형 지원을 확대합니다.',
    content:
      '지역 수요를 반영해 특수학교와 특수학급을 단계적으로 확대하고, 통합학급에는 보조인력과 전문교재를 지원하겠습니다. 학생의 장애 특성과 발달 단계에 맞춘 개별화교육계획(IEP) 실행력을 높이겠습니다.',
    order: 5,
  },
];

const FALLBACK_POSTS: Post[] = [
  {
    id: 'post-1',
    title: '교육 혁신을 위한 첫걸음',
    content: '오늘 교육감 예비후보 이현준은 교육의 미래를 위한 정책 발표회를 가졌습니다.',
    date: new Date().toISOString(),
    tags: '정책,발표',
    image_url: 'https://picsum.photos/seed/post1/800/400',
  },
  {
    id: 'post-2',
    title: '학부모 간담회, 현장 의견 청취',
    content: '학부모들과 함께 기초학력과 돌봄 정책에 대해 깊이 있는 대화를 나눴습니다.',
    date: new Date(Date.now() - 86400000).toISOString(),
    tags: '간담회,학부모',
    image_url: 'https://picsum.photos/seed/post2/800/400',
  },
  {
    id: 'post-3',
    title: '디지털 교육 전환 로드맵 발표',
    content: 'AI 기반 학습 환경 조성을 위한 단계별 실행 계획을 공개했습니다.',
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    tags: '디지털,정책',
    image_url: 'https://picsum.photos/seed/post3/800/400',
  },
  {
    id: 'post-4',
    title: '교사 정책 간담회 개최',
    content: '교권 보호와 수업 혁신을 위한 실질적 지원책을 중심으로 논의했습니다.',
    date: new Date(Date.now() - 86400000 * 3).toISOString(),
    tags: '교사,현장',
    image_url: 'https://picsum.photos/seed/post4/800/400',
  },
];

const FALLBACK_EVENTS: EventItem[] = [
  {
    id: 'event-1',
    title: '시민과의 대화',
    description: '교육 현장의 목소리를 직접 듣습니다.',
    date: new Date(Date.now() + 86400000 * 2).toISOString(),
    location: '광화문 광장',
    is_past: 0,
  },
];

function safeDate(value: unknown) {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

function sortByDateDesc<T extends { date: string; id: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aTime = Number.isNaN(Date.parse(a.date)) ? 0 : Date.parse(a.date);
    const bTime = Number.isNaN(Date.parse(b.date)) ? 0 : Date.parse(b.date);
    if (bTime !== aTime) return bTime - aTime;
    return b.id.localeCompare(a.id);
  });
}

function sortByDateAsc<T extends { date: string; id: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aTime = Number.isNaN(Date.parse(a.date)) ? 0 : Date.parse(a.date);
    const bTime = Number.isNaN(Date.parse(b.date)) ? 0 : Date.parse(b.date);
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });
}

function normalizeFirestoreError(error: unknown) {
  if (error && typeof error === 'object') {
    const withCode = error as { code?: string; message?: string };
    return new Error(withCode.message || withCode.code || 'Firebase request failed');
  }
  return new Error('Firebase request failed');
}

export function getVisitorCycleKey(now: Date = new Date()) {
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);

  // KST(UTC+9) midnight as UTC timestamp.
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0)).toISOString();
}

function getVisitorHourBuckets(cycleStart: Date) {
  return Array.from({ length: 24 }, (_, index) => {
    const hourDate = new Date(cycleStart);
    hourDate.setHours(cycleStart.getHours() + index);
    return {
      hourLabel: `${String(hourDate.getHours()).padStart(2, '0')}:00`,
      count: 0,
    };
  });
}

function getRecentVisitorDayBuckets(cycleStart: Date, days: number) {
  return Array.from({ length: days }, (_, index) => {
    const dayStart = new Date(cycleStart);
    dayStart.setDate(cycleStart.getDate() - (days - 1 - index));
    return {
      cycleKey: dayStart.toISOString(),
      dateLabel: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      count: 0,
    };
  });
}

const POLICY_REACTION_MIN = 1000;
const POLICY_REACTION_MAX = 2000;
const ADMIN_SESSION_COLLECTION = 'admin_sessions';
const VISITOR_LIFETIME_BASELINE = 219;
const VISITOR_LIFETIME_DOC_ID = 'lifetime_total';
export const ADMIN_SESSION_STORAGE_KEY = 'admin_dashboard_session_token';

export interface AdminIdentityProfile {
  username: string;
  name: string;
  role: string;
}

function createAdminSessionToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getRandomPolicyReactionBase() {
  return (
    Math.floor(Math.random() * (POLICY_REACTION_MAX - POLICY_REACTION_MIN + 1)) + POLICY_REACTION_MIN
  );
}

function parseNonNegativeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isPastEventByPageRule(eventItem: Pick<EventItem, 'date' | 'is_past'>, now: Date = new Date()) {
  if (Number(eventItem.is_past) === 1) return true;
  return new Date(eventItem.date) < now;
}

async function getVisitorCounterTotal(cycleKey: string, initializeIfMissing = false) {
  if (!db || !isFirebaseConfigured) return 0;

  const counterRef = doc(db, 'visitor_counters', cycleKey);

  if (initializeIfMissing) {
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      if (!snap.exists()) {
        tx.set(counterRef, {
          cycleKey,
          count: 0,
          total: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return 0;
      }
      const data = snap.data() as Record<string, unknown>;
      const count = parseNonNegativeNumber(data.count, 0);
      return count;
    });
  }

  const snap = await getDoc(counterRef);
  if (!snap.exists()) return 0;
  const data = snap.data() as Record<string, unknown>;
  const count = parseNonNegativeNumber(data.count, 0);
  return count;
}

async function getVisitorLifetimeTotal() {
  if (!db || !isFirebaseConfigured) return VISITOR_LIFETIME_BASELINE;

  const lifetimeRef = doc(db, 'visitor_counters', VISITOR_LIFETIME_DOC_ID);
  const [lifetimeSnap, visitorsCountSnap] = await Promise.all([
    getDoc(lifetimeRef),
    getCountFromServer(collection(db, 'visitors')),
  ]);

  const visitorsTotalFromLogs = Math.max(
    parseNonNegativeNumber(visitorsCountSnap.data().count, 0),
    VISITOR_LIFETIME_BASELINE
  );

  if (lifetimeSnap.exists()) {
    const data = lifetimeSnap.data() as Record<string, unknown>;
    const lifetimeTotal = parseNonNegativeNumber(data.total, 0);
    const normalizedLifetimeTotal = Math.max(
      lifetimeTotal,
      visitorsTotalFromLogs,
      VISITOR_LIFETIME_BASELINE
    );

    if (normalizedLifetimeTotal !== lifetimeTotal) {
      await setDoc(
        lifetimeRef,
        {
          total: normalizedLifetimeTotal,
          updatedAt: serverTimestamp(),
          createdAt: data.createdAt ?? serverTimestamp(),
        },
        { merge: true }
      );
    }

    return normalizedLifetimeTotal;
  }

  await setDoc(
    lifetimeRef,
    {
      total: visitorsTotalFromLogs,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return visitorsTotalFromLogs;
}

function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeNameForIdentity(name: string) {
  return name.trim().toLowerCase();
}

function normalizePhoneForIdentity(phone: string) {
  return phone.replace(/\D/g, '');
}

function dedupeMembersByIdentity(items: MemberManagementItem[]) {
  const seenNames = new Set<string>();
  const seenPhones = new Set<string>();

  return items.filter((item) => {
    const nameKey = normalizeNameForIdentity(item.name || '');
    const phoneKey = normalizePhoneForIdentity(item.phone || '');
    const hasNameDuplicate = nameKey ? seenNames.has(nameKey) : false;
    const hasPhoneDuplicate = phoneKey ? seenPhones.has(phoneKey) : false;

    if (hasNameDuplicate || hasPhoneDuplicate) {
      return false;
    }

    if (nameKey) seenNames.add(nameKey);
    if (phoneKey) seenPhones.add(phoneKey);
    return true;
  });
}

async function submitSupportMessageViaRest(payload: { name: string; phone: string; content: string }) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/support_messages?key=${firebaseConfig.apiKey}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        fields: {
          name: { stringValue: payload.name },
          phone: { stringValue: payload.phone },
          content: { stringValue: payload.content },
          type: { stringValue: '응원메시지' },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `REST write failed (${response.status})`);
    }

    const json = (await response.json()) as { name?: string };
    const id = (json.name?.split('/').pop() || `rest-${Date.now()}`).trim();
    return {
      id,
      name: payload.name,
      phone: payload.phone,
      content: payload.content,
      createdAt: new Date().toISOString(),
    } satisfies SupportMessageItem;
  } finally {
    window.clearTimeout(timer);
  }
}

async function submitContactViaRest(payload: { name: string; phone: string; message: string }) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/contacts?key=${firebaseConfig.apiKey}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        fields: {
          name: { stringValue: payload.name },
          phone: { stringValue: payload.phone },
          message: { stringValue: payload.message },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `REST write failed (${response.status})`);
    }
  } finally {
    window.clearTimeout(timer);
  }
}

async function createPostViaRest(payload: {
  title: string;
  content: string;
  tags: string;
  image_url: string;
}) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/posts?key=${firebaseConfig.apiKey}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        fields: {
          title: { stringValue: payload.title },
          content: { stringValue: payload.content },
          tags: { stringValue: payload.tags },
          image_url: { stringValue: payload.image_url },
          date: { timestampValue: new Date().toISOString() },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `REST write failed (${response.status})`);
    }

    const json = (await response.json()) as { name?: string };
    const id = (json.name?.split('/').pop() || `post-rest-${Date.now()}`).trim();
    return {
      id,
      title: payload.title,
      content: payload.content,
      tags: payload.tags,
      image_url: payload.image_url,
      date: new Date().toISOString(),
    } satisfies Post;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getPosts(): Promise<Post[]> {
  if (!db || !isFirebaseConfigured) return FALLBACK_POSTS;
  try {
    const snap = await getDocs(query(collection(db, 'posts'), orderBy('date', 'desc')));
    if (snap.empty) return FALLBACK_POSTS;
    const items = snap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        title: String(data.title ?? ''),
        content: String(data.content ?? ''),
        date: safeDate(data.date),
        tags: String(data.tags ?? ''),
        image_url: String(data.image_url ?? ''),
      } satisfies Post;
    });
    return sortByDateDesc(items);
  } catch {
    return FALLBACK_POSTS;
  }
}

export async function createPost(payload: {
  title: string;
  content: string;
  tags: string;
  image_url: string;
}) {
  if (!db || !isFirebaseConfigured) return null;
  try {
    const ref = await withPromiseTimeout(
      addDoc(collection(db, 'posts'), {
        title: payload.title,
        content: payload.content,
        tags: payload.tags,
        image_url: payload.image_url,
        date: serverTimestamp(),
      }),
      7000,
      'sdk-timeout'
    );

    return {
      id: ref.id,
      title: payload.title,
      content: payload.content,
      tags: payload.tags,
      image_url: payload.image_url,
      date: new Date().toISOString(),
    } satisfies Post;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const canFallback =
      message.includes('sdk-timeout') ||
      message.includes('unavailable') ||
      message.includes('network') ||
      message.includes('Failed to fetch');

    if (canFallback) {
      try {
        return await createPostViaRest(payload);
      } catch (restError) {
        throw normalizeFirestoreError(restError);
      }
    }

    throw normalizeFirestoreError(error);
  }
}

export async function deletePost(postId: string) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'posts', postId));
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function createSmsRequest(payload: {
  recipients: string[];
  message: string;
  requestedBy?: string;
}) {
  if (!db || !isFirebaseConfigured) return null;

  const recipients = payload.recipients
    .map((item) => String(item || '').replace(/\D/g, ''))
    .filter((item) => item.length >= 10);
  const message = String(payload.message || '').trim();

  if (recipients.length === 0) {
    throw new Error('sms-recipients-required');
  }
  if (recipients.length > 20) {
    throw new Error('sms-max-20');
  }
  if (!message) {
    throw new Error('sms-message-required');
  }

  try {
    const ref = await addDoc(collection(db, 'sms_requests'), {
      recipients,
      recipientCount: recipients.length,
      message,
      status: 'pending',
      requestedBy: String(payload.requestedBy || 'admin'),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return ref.id;
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function deletePolicy(policyId: string) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'policies', policyId));
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function deletePolicyProposal(proposalId: string) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'policy_proposals', proposalId));
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function getEvents(): Promise<EventItem[]> {
  if (!db || !isFirebaseConfigured) return FALLBACK_EVENTS;
  try {
    const snap = await getDocs(query(collection(db, 'events'), orderBy('date', 'asc')));
    if (snap.empty) return FALLBACK_EVENTS;
    const items = snap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        title: String(data.title ?? ''),
        description: String(data.description ?? ''),
        date: safeDate(data.date),
        location: String(data.location ?? ''),
        is_past: Number(data.is_past ?? 0),
      } satisfies EventItem;
    });
    return sortByDateAsc(items);
  } catch {
    return FALLBACK_EVENTS;
  }
}

export async function createEvent(payload: {
  title: string;
  description: string;
  date: string;
  location: string;
}) {
  if (!db || !isFirebaseConfigured) return null;
  try {
    const normalizedDateInput = payload.date.includes('T') ? payload.date : `${payload.date}T00:00`;
    const eventDate = new Date(normalizedDateInput);
    if (Number.isNaN(eventDate.getTime())) {
      throw new Error('invalid-event-date');
    }
    const isPast = eventDate < new Date() ? 1 : 0;

    const ref = await addDoc(collection(db, 'events'), {
      title: payload.title,
      description: payload.description,
      date: eventDate,
      location: payload.location,
      is_past: isPast,
      createdAt: serverTimestamp(),
    });

    return {
      id: ref.id,
      title: payload.title,
      description: payload.description,
      date: eventDate.toISOString(),
      location: payload.location,
      is_past: isPast,
    } satisfies EventItem;
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function deleteEvent(eventId: string) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'events', eventId));
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function markEventAsPast(eventId: string) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await updateDoc(doc(db, 'events', eventId), {
      is_past: 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function getStats() {
  if (!db || !isFirebaseConfigured) {
    const [posts, events] = await Promise.all([getPosts(), getEvents()]);
    const upcomingEvents = events.filter((item) => !isPastEventByPageRule(item));
    return { posts: posts.length, events: upcomingEvents.length, supportMessages: 0, visitorsToday: 0, visitorsTotal: 0 };
  }

  try {
    const cycleKey = getVisitorCycleKey();
    const postsRef = collection(db, 'posts');
    const eventsRef = collection(db, 'events');
    const supportRef = collection(db, 'support_messages');
    const visitorsTodayRef = query(collection(db, 'visitors'), where('cycleKey', '==', cycleKey));

    const [postsCountResult, eventsCountResult, supportCountResult, visitorsTodayResult, visitorsTotalResult] = await Promise.allSettled([
      getCountFromServer(postsRef),
      getDocs(eventsRef),
      getCountFromServer(supportRef),
      getCountFromServer(visitorsTodayRef),
      getVisitorLifetimeTotal(),
    ]);

    const postsCount = postsCountResult.status === 'fulfilled' ? postsCountResult.value.data().count : 0;
    const eventsCount =
      eventsCountResult.status === 'fulfilled'
        ? eventsCountResult.value.docs.reduce((count, docItem) => {
            const data = docItem.data() as Record<string, unknown>;
            const eventItem: Pick<EventItem, 'date' | 'is_past'> = {
              date: safeDate(data.date),
              is_past: Number(data.is_past ?? 0),
            };
            return isPastEventByPageRule(eventItem) ? count : count + 1;
          }, 0)
        : 0;
    const supportCount = supportCountResult.status === 'fulfilled' ? supportCountResult.value.data().count : 0;
    const visitorsToday = visitorsTodayResult.status === 'fulfilled' ? visitorsTodayResult.value.data().count : 0;
    const visitorsTotal =
      visitorsTotalResult.status === 'fulfilled'
        ? visitorsTotalResult.value
        : Math.max(visitorsToday, VISITOR_LIFETIME_BASELINE);

    return {
      posts: postsCount,
      events: eventsCount,
      supportMessages: supportCount,
      visitorsToday,
      visitorsTotal,
    };
  } catch {
    const [posts, events] = await Promise.all([getPosts(), getEvents()]);
    const upcomingEvents = events.filter((item) => !isPastEventByPageRule(item));
    return { posts: posts.length, events: upcomingEvents.length, supportMessages: 0, visitorsToday: 0, visitorsTotal: 0 };
  }
}

export async function incrementVisitCount(cycleKey: string) {
  if (!db || !isFirebaseConfigured) return false;
  try {
    const counterRef = doc(db, 'visitor_counters', cycleKey);
    const lifetimeRef = doc(db, 'visitor_counters', VISITOR_LIFETIME_DOC_ID);
    let initialLifetimeTotal = VISITOR_LIFETIME_BASELINE;
    try {
      initialLifetimeTotal = await getVisitorLifetimeTotal();
    } catch {
      initialLifetimeTotal = VISITOR_LIFETIME_BASELINE;
    }

    await runTransaction(db, async (tx) => {
      const [snap, transactionLifetimeSnap] = await Promise.all([tx.get(counterRef), tx.get(lifetimeRef)]);
      const previousLifetimeTotal = transactionLifetimeSnap.exists()
        ? parseNonNegativeNumber((transactionLifetimeSnap.data() as Record<string, unknown>).total, initialLifetimeTotal)
        : initialLifetimeTotal;
      const nextLifetimeTotal = previousLifetimeTotal + 1;

      if (!snap.exists()) {
        tx.set(counterRef, {
          cycleKey,
          count: 1,
          total: nextLifetimeTotal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const data = snap.data() as Record<string, unknown>;
        const count = parseNonNegativeNumber(data.count, 0) + 1;
        tx.update(counterRef, {
          count,
          total: nextLifetimeTotal,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(lifetimeRef, {
        total: nextLifetimeTotal,
        updatedAt: serverTimestamp(),
        createdAt: transactionLifetimeSnap.exists()
          ? (transactionLifetimeSnap.data() as Record<string, unknown>).createdAt ?? serverTimestamp()
          : serverTimestamp(),
      });
    });

    await addDoc(collection(db, 'visitors'), {
      cycleKey,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    // Visitor counter must not block UI.
    console.error('incrementVisitCount failed', error);
    return false;
  }
}

export async function submitContact(payload: { name: string; phone: string; message: string }) {
  if (!db || !isFirebaseConfigured) {
    throw new Error('Firebase is not configured');
  }

  const normalized = {
    name: String(payload.name || '').trim(),
    phone: String(payload.phone || '').trim(),
    message: String(payload.message || '').trim(),
  };

  if (!normalized.name || !normalized.phone || !normalized.message) {
    throw new Error('contact-required');
  }

  try {
    await withPromiseTimeout(
      addDoc(collection(db, 'contacts'), {
        name: normalized.name,
        phone: normalized.phone,
        message: normalized.message,
        createdAt: serverTimestamp(),
      }),
      7000,
      'sdk-timeout'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const canFallback =
      message.includes('sdk-timeout') ||
      message.includes('unavailable') ||
      message.includes('network') ||
      message.includes('Failed to fetch');

    if (canFallback) {
      try {
        await submitContactViaRest(normalized);
        return;
      } catch (restError) {
        throw normalizeFirestoreError(restError);
      }
    }

    throw normalizeFirestoreError(error);
  }
}

export async function deleteContact(contactId: string) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'contacts', contactId));
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function deleteSupportMessage(messageId: string) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'support_messages', messageId));
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function getSupportMessages(): Promise<SupportMessageItem[]> {
  if (!db || !isFirebaseConfigured) return [];
  try {
    const snap = await getDocs(query(collection(db, 'support_messages'), orderBy('createdAt', 'desc'), limit(30)));
    if (snap.empty) return [];
    return snap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        name: String(data.name ?? ''),
        phone: String(data.phone ?? ''),
        content: String(data.content ?? ''),
        createdAt: safeDate(data.createdAt),
      } satisfies SupportMessageItem;
    });
  } catch {
    return [];
  }
}

export async function submitSupportMessage(payload: { name: string; phone: string; content: string }) {
  if (!db || !isFirebaseConfigured) return null;
  try {
    const docRef = await withPromiseTimeout(
      addDoc(collection(db, 'support_messages'), {
        name: payload.name,
        phone: payload.phone,
        content: payload.content,
        type: '응원메시지',
        createdAt: serverTimestamp(),
      }),
      7000,
      'sdk-timeout'
    );

    return {
      id: docRef.id,
      name: payload.name,
      phone: payload.phone,
      content: payload.content,
      createdAt: new Date().toISOString(),
    } satisfies SupportMessageItem;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const canFallback =
      message.includes('sdk-timeout') ||
      message.includes('unavailable') ||
      message.includes('network') ||
      message.includes('Failed to fetch');

    if (canFallback) {
      try {
        return await submitSupportMessageViaRest(payload);
      } catch (restError) {
        throw normalizeFirestoreError(restError);
      }
    }

    throw normalizeFirestoreError(error);
  }
}

export async function getPolicies(): Promise<PolicyCatalogItem[]> {
  if (!db || !isFirebaseConfigured) return DEFAULT_POLICY_CATALOG;

  const policiesRef = collection(db, 'policies');

  const normalizePolicies = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) =>
    docs
      .map((docItem) => {
        const data = docItem.data();
        return {
          id: docItem.id,
          category: String(data.category ?? ''),
          title: String(data.title ?? ''),
          desc: String(data.desc ?? ''),
          content: String(data.content ?? ''),
          order: Number(data.order ?? Number.MAX_SAFE_INTEGER),
        } satisfies PolicyCatalogItem;
      })
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title);
      });

  try {
    const snap = await getDocs(policiesRef);
    if (!snap.empty) {
      return normalizePolicies(snap.docs.map((docItem) => ({ id: docItem.id, data: () => docItem.data() as Record<string, unknown> })));
    }

    const batch = writeBatch(db);
    DEFAULT_POLICY_CATALOG.forEach((item) => {
      batch.set(doc(db, 'policies', item.id), {
        category: item.category,
        title: item.title,
        desc: item.desc,
        content: item.content,
        order: item.order,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return DEFAULT_POLICY_CATALOG;
  } catch {
    return DEFAULT_POLICY_CATALOG;
  }
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const updatedAt = new Date().toISOString();
  if (!db || !isFirebaseConfigured) {
    const recentPosts = [...FALLBACK_POSTS];
    const upcomingEvents = FALLBACK_EVENTS.slice(0, 5);
    const todayCycleStart = new Date(getVisitorCycleKey());
    return {
      totals: {
        posts: recentPosts.length,
        events: upcomingEvents.length,
        policyProposals: 0,
        supportMessages: 0,
        contacts: 0,
        visitorsToday: 0,
      },
      visitorTrend: getVisitorHourBuckets(new Date()),
      dailyVisitorTrend: getRecentVisitorDayBuckets(todayCycleStart, 7).map((point) => ({
        dateLabel: point.dateLabel,
        count: point.count,
      })),
      members: [],
      recentPosts,
      upcomingEvents,
      recentPolicies: [],
      recentSupportMessages: [],
      recentContacts: [],
      updatedAt,
    };
  }

  try {
    const cycleKey = getVisitorCycleKey();
    const cycleStart = new Date(cycleKey);
    const dailyBuckets = getRecentVisitorDayBuckets(cycleStart, 7);
    const postsRef = collection(db, 'posts');
    const eventsRef = collection(db, 'events');
    const supportRef = collection(db, 'support_messages');
    const proposalsRef = collection(db, 'policy_proposals');
    const contactsRef = collection(db, 'contacts');
    const membersRef = collection(db, 'admin_members');
    const visitorsQuery = query(collection(db, 'visitors'), where('cycleKey', '==', cycleKey));

    const contactsCountPromise = getCountFromServer(contactsRef).catch(() => null);
    const recentContactsPromise = getDocs(query(contactsRef, orderBy('createdAt', 'desc'), limit(50))).catch(() => null);

    const [
      postsCountSnap,
      eventsCountSnap,
      policyProposalsCountSnap,
      supportCountSnap,
      contactsCountSnap,
      visitorsCountSnap,
      visitorsTrendSnap,
      recentPostsSnap,
      upcomingEventsSnap,
      recentSupportSnap,
      recentContactsSnap,
      supportMembersSnap,
      proposalMembersSnap,
      manualMembersSnap,
      visitorsTodayTotal,
      ...dailyVisitorTotals
    ] = await Promise.all([
      getCountFromServer(postsRef),
      getCountFromServer(eventsRef),
      getCountFromServer(proposalsRef),
      getCountFromServer(supportRef),
      contactsCountPromise,
      getCountFromServer(visitorsQuery),
      getDocs(visitorsQuery),
      getDocs(query(postsRef, orderBy('date', 'desc'))),
      getDocs(query(eventsRef, orderBy('date', 'asc'))),
      getDocs(query(supportRef, orderBy('createdAt', 'desc'))),
      recentContactsPromise,
      getDocs(query(supportRef, orderBy('createdAt', 'desc'))),
      getDocs(query(proposalsRef, orderBy('createdAt', 'desc'))),
      getDocs(query(membersRef, orderBy('createdAt', 'desc'))),
      getVisitorCounterTotal(cycleKey, true),
      ...dailyBuckets.map((bucket) => getVisitorCounterTotal(bucket.cycleKey, bucket.cycleKey === cycleKey)),
    ]);

    const visitorTrend = getVisitorHourBuckets(cycleStart);
    visitorsTrendSnap.docs.forEach((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      const createdAtIso = safeDate(data.createdAt);
      const createdAt = new Date(createdAtIso);
      const diffMs = createdAt.getTime() - cycleStart.getTime();
      const hourIndex = Math.floor(diffMs / (1000 * 60 * 60));
      if (hourIndex >= 0 && hourIndex < 24) {
        visitorTrend[hourIndex].count += 1;
      }
    });
    const dailyVisitorTrend = dailyBuckets.map((bucket, index) => ({
      dateLabel: bucket.dateLabel,
      count: Number(dailyVisitorTotals[index]) || 0,
    }));

    const recentPosts = recentPostsSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        title: String(data.title ?? ''),
        content: String(data.content ?? ''),
        date: safeDate(data.date),
        tags: String(data.tags ?? ''),
        image_url: String(data.image_url ?? ''),
      } satisfies Post;
    });

    const upcomingEvents = upcomingEventsSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        title: String(data.title ?? ''),
        description: String(data.description ?? ''),
        date: safeDate(data.date),
        location: String(data.location ?? ''),
        is_past: Number(data.is_past ?? 0),
      } satisfies EventItem;
    });

    const recentSupportMessages = recentSupportSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        name: String(data.name ?? ''),
        phone: String(data.phone ?? ''),
        content: String(data.content ?? ''),
        createdAt: safeDate(data.createdAt),
      } satisfies SupportMessageItem;
    });

    const recentContacts = (recentContactsSnap?.docs ?? []).map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        name: String(data.name ?? ''),
        phone: String(data.phone ?? ''),
        message: String(data.message ?? ''),
        createdAt: safeDate(data.createdAt),
      } satisfies ContactInquiryItem;
    });

    const allPolicyProposals = proposalMembersSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        proposer: String(data.proposer ?? ''),
        phone: String(data.phone ?? '-'),
        title: String(data.title ?? ''),
        content: String(data.content ?? ''),
        createdAt: safeDate(data.createdAt),
        category: String(data.category ?? ''),
        desc: String(data.desc ?? ''),
        order: Number(data.order ?? 0),
        reflectedPolicyId: String(data.reflectedPolicyId ?? ''),
        reflectedAt:
          typeof data.reflectedAt === 'string' && data.reflectedAt
            ? data.reflectedAt
            : data.reflectedAt && typeof data.reflectedAt === 'object' && 'toDate' in data.reflectedAt &&
              typeof (data.reflectedAt as { toDate?: () => Date }).toDate === 'function'
              ? (data.reflectedAt as { toDate: () => Date }).toDate().toISOString()
              : '',
      } satisfies PolicyProposalItem;
    });
    const supportMembers: MemberManagementItem[] = supportMembersSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      const item = {
        id: docItem.id,
        name: String(data.name ?? ''),
        phone: String(data.phone ?? ''),
        content: String(data.content ?? ''),
        createdAt: safeDate(data.createdAt),
      } satisfies SupportMessageItem;
      return {
      id: `support-${item.id}`,
      name: item.name,
      phone: item.phone,
      address: '-',
      type: '응원메시지',
      createdAt: item.createdAt,
      sourceCollection: 'support_messages',
      sourceId: item.id,
      };
    });

    const proposalMembers: MemberManagementItem[] = allPolicyProposals.map((item) => ({
      id: `proposal-${item.id}`,
      name: item.proposer || '익명',
      phone: item.phone || '-',
      address: '-',
      type: '정책제안',
      createdAt: item.createdAt,
      sourceCollection: 'policy_proposals',
      sourceId: item.id,
    }));

    const manualMembers: MemberManagementItem[] = manualMembersSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      const rawType = String(data.type ?? '응원메시지');
      const type: '응원메시지' | '정책제안' | '일반' =
        rawType === '정책제안' ? '정책제안' : rawType === '일반' ? '일반' : '응원메시지';
      return {
        id: `member-${docItem.id}`,
        name: String(data.name ?? ''),
        phone: String(data.phone ?? '-'),
        address: String(data.address ?? '-'),
        type,
        createdAt: safeDate(data.createdAt),
        sourceCollection: 'admin_members',
        sourceId: docItem.id,
      };
    });

    const dedupeCandidates = [...manualMembers, ...supportMembers, ...proposalMembers]
      .sort((a, b) => {
        const aPriority = a.sourceCollection === 'admin_members' ? 0 : 1;
        const bPriority = b.sourceCollection === 'admin_members' ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aTime = Number.isNaN(Date.parse(a.createdAt)) ? 0 : Date.parse(a.createdAt);
        const bTime = Number.isNaN(Date.parse(b.createdAt)) ? 0 : Date.parse(b.createdAt);
        if (aTime !== bTime) return aTime - bTime;
        return a.id.localeCompare(b.id);
      });

    const members = dedupeMembersByIdentity(dedupeCandidates)
      .sort((a, b) => {
        const aTime = Number.isNaN(Date.parse(a.createdAt)) ? 0 : Date.parse(a.createdAt);
        const bTime = Number.isNaN(Date.parse(b.createdAt)) ? 0 : Date.parse(b.createdAt);
        if (bTime !== aTime) return bTime - aTime;
        return b.id.localeCompare(a.id);
      });

    return {
      totals: {
        posts: postsCountSnap.data().count,
        events: eventsCountSnap.data().count,
        policyProposals: policyProposalsCountSnap.data().count,
        supportMessages: supportCountSnap.data().count,
        contacts: contactsCountSnap ? contactsCountSnap.data().count : recentContacts.length,
        visitorsToday: Number(visitorsTodayTotal) || visitorsCountSnap.data().count,
      },
      visitorTrend,
      dailyVisitorTrend,
      members,
      recentPosts,
      upcomingEvents,
      recentPolicies: allPolicyProposals,
      recentSupportMessages,
      recentContacts,
      updatedAt,
    };
  } catch {
    const [posts, events, support, policyProposals] = await Promise.all([getPosts(), getEvents(), getSupportMessages(), getPolicyProposals()]);
    const todayCycleStart = new Date(getVisitorCycleKey());
    const fallbackMembers = dedupeMembersByIdentity(
      support.map((item) => ({
        id: `support-${item.id}`,
        name: item.name,
        phone: item.phone,
        address: '-',
        type: '응원메시지' as const,
        createdAt: item.createdAt,
        sourceCollection: 'support_messages' as const,
        sourceId: item.id,
      }))
    );
    return {
      totals: {
        posts: posts.length,
        events: events.length,
        policyProposals: policyProposals.length,
        supportMessages: support.length,
        contacts: 0,
        visitorsToday: 0,
      },
      visitorTrend: getVisitorHourBuckets(new Date()),
      dailyVisitorTrend: getRecentVisitorDayBuckets(todayCycleStart, 7).map((point) => ({
        dateLabel: point.dateLabel,
        count: point.count,
      })),
      members: fallbackMembers,
      recentPosts: posts,
      upcomingEvents: events.slice(0, 5),
      recentPolicies: policyProposals,
      recentSupportMessages: support.slice(0, 7),
      recentContacts: [],
      updatedAt,
    };
  }
}

export async function submitPolicyProposal(payload: { proposer: string; phone: string; title: string; content: string }) {
  if (!db || !isFirebaseConfigured) return null;

  try {
    const docRef = await addDoc(collection(db, 'policy_proposals'), {
      proposer: payload.proposer,
      phone: payload.phone,
      title: payload.title,
      content: payload.content,
      type: '정책제안',
      createdAt: serverTimestamp(),
    });

    return {
      id: docRef.id,
      proposer: payload.proposer,
      phone: payload.phone,
      title: payload.title,
      content: payload.content,
      createdAt: new Date().toISOString(),
    } satisfies PolicyProposalItem;
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function updatePolicyProposal(
  proposalId: string,
  payload: {
    title: string;
    content: string;
    category?: string;
    desc?: string;
    order?: number;
  }
) {
  if (!db || !isFirebaseConfigured) return;
  const title = String(payload.title || '').trim();
  const content = String(payload.content || '').trim();
  if (!title || !content) throw new Error('proposal-required');

  try {
    const nextPayload: Record<string, unknown> = {
      title,
      content,
      updatedAt: serverTimestamp(),
    };
    if (typeof payload.category === 'string') {
      nextPayload.category = payload.category.trim();
    }
    if (typeof payload.desc === 'string') {
      nextPayload.desc = payload.desc.trim();
    }
    if (Number.isFinite(payload.order)) {
      nextPayload.order = Number(payload.order);
    }
    await updateDoc(doc(db, 'policy_proposals', proposalId), nextPayload);
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function reflectPolicyProposalToCatalog(
  proposalId: string,
  payload: {
    category: string;
    title: string;
    desc: string;
    content: string;
    order?: number;
  }
) {
  if (!db || !isFirebaseConfigured) return null;
  const category = String(payload.category || '').trim();
  const title = String(payload.title || '').trim();
  const desc = String(payload.desc || '').trim();
  const content = String(payload.content || '').trim();
  if (!category || !title || !desc || !content) throw new Error('policy-required');

  try {
    let order = Number(payload.order ?? 0);
    if (!Number.isFinite(order) || order < 1) {
      const maxOrderSnap = await getDocs(query(collection(db, 'policies'), orderBy('order', 'desc'), limit(1)));
      const maxOrder = maxOrderSnap.empty
        ? 0
        : Number((maxOrderSnap.docs[0]?.data() as Record<string, unknown>).order ?? 0);
      order = Math.max(1, maxOrder + 1);
    }

    const policyId = `proposal-${proposalId}`;
    await setDoc(
      doc(db, 'policies', policyId),
      {
        category,
        title,
        desc,
        content,
        order,
        sourceProposalId: proposalId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await updateDoc(doc(db, 'policy_proposals', proposalId), {
      category,
      title,
      desc,
      content,
      order,
      reflectedPolicyId: policyId,
      reflectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return policyId;
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function getPolicyProposals(): Promise<PolicyProposalItem[]> {
  if (!db || !isFirebaseConfigured) return [];
  try {
    const snap = await getDocs(query(collection(db, 'policy_proposals'), orderBy('createdAt', 'desc'), limit(50)));
    if (snap.empty) return [];
    return snap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        proposer: String(data.proposer ?? ''),
        phone: String(data.phone ?? ''),
        title: String(data.title ?? ''),
        content: String(data.content ?? ''),
        createdAt: safeDate(data.createdAt),
        category: String(data.category ?? ''),
        desc: String(data.desc ?? ''),
        order: Number(data.order ?? 0),
        reflectedPolicyId: String(data.reflectedPolicyId ?? ''),
        reflectedAt:
          typeof data.reflectedAt === 'string' && data.reflectedAt
            ? data.reflectedAt
            : data.reflectedAt && typeof data.reflectedAt === 'object' && 'toDate' in data.reflectedAt &&
              typeof (data.reflectedAt as { toDate?: () => Date }).toDate === 'function'
              ? (data.reflectedAt as { toDate: () => Date }).toDate().toISOString()
              : '',
      } satisfies PolicyProposalItem;
    });
  } catch {
    return [];
  }
}

export async function getPolicyReactionCounts(policyIds: string[]): Promise<PolicyReactionCountMap> {
  if (!db || !isFirebaseConfigured) {
    return policyIds.reduce<PolicyReactionCountMap>((acc, policyId) => {
      acc[policyId] = 0;
      return acc;
    }, {});
  }

  try {
    const entries = await Promise.all(
      policyIds.map(async (policyId) => {
        const reactionRef = doc(db, 'policy_reactions', policyId);
        return runTransaction(db, async (tx) => {
          const snap = await tx.get(reactionRef);
          if (!snap.exists()) {
            const base = getRandomPolicyReactionBase();
            tx.set(reactionRef, {
              policyId,
              count: base,
              voters: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            return [policyId, base] as const;
          }
          const data = snap.data() as Record<string, unknown>;
          return [policyId, parseNonNegativeNumber(data.count, getRandomPolicyReactionBase())] as const;
        });
      })
    );

    return entries.reduce<PolicyReactionCountMap>((acc, [policyId, count]) => {
      acc[policyId] = count;
      return acc;
    }, {});
  } catch {
    return policyIds.reduce<PolicyReactionCountMap>((acc, policyId) => {
      acc[policyId] = 0;
      return acc;
    }, {});
  }
}

export async function incrementPolicyReactionCount(policyId: string, voterId: string): Promise<PolicyReactionIncrementResult> {
  if (!db || !isFirebaseConfigured) return { count: 0, incremented: false };

  try {
    const reactionRef = doc(db, 'policy_reactions', policyId);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(reactionRef);
      if (!snap.exists()) {
        const base = getRandomPolicyReactionBase();
        tx.set(reactionRef, {
          policyId,
          count: base + 1,
          voters: [voterId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return { count: base + 1, incremented: true };
      }

      const data = snap.data() as Record<string, unknown>;
      const voters = Array.isArray(data.voters)
        ? data.voters.filter((item): item is string => typeof item === 'string')
        : [];
      if (voters.includes(voterId)) {
        return { count: parseNonNegativeNumber(data.count, 0), incremented: false };
      }
      const nextCount = parseNonNegativeNumber(data.count, 0) + 1;
      tx.update(reactionRef, {
        count: nextCount,
        voters: [...voters, voterId],
        updatedAt: serverTimestamp(),
      });
      return { count: nextCount, incremented: true };
    });
  } catch {
    return { count: 0, incremented: false };
  }
}

const HERO_BACKGROUND_SLOTS = [1, 2, 3, 4];

export async function getHeroBackgroundImages(): Promise<HeroBackgroundImageItem[]> {
  if (!db || !isFirebaseConfigured) return [];
  try {
    const docs = await Promise.all(
      HERO_BACKGROUND_SLOTS.map(async (slot) => {
        const snap = await getDoc(doc(db, 'hero_background_images', `slot_${slot}`));
        if (!snap.exists()) return null;
        const data = snap.data() as Record<string, unknown>;
        const dataUrl = String(data.dataUrl ?? '');
        if (!dataUrl) return null;
        return {
          slot,
          dataUrl,
          sizeBytes: parseNonNegativeNumber(data.sizeBytes, 0),
          updatedAt: safeDate(data.updatedAt),
        } satisfies HeroBackgroundImageItem;
      })
    );
    return docs.filter((item): item is HeroBackgroundImageItem => item !== null).sort((a, b) => a.slot - b.slot);
  } catch {
    return [];
  }
}

export async function saveHeroBackgroundImage(slot: number, payload: { dataUrl: string; sizeBytes: number }) {
  if (!db || !isFirebaseConfigured) throw new Error('Firebase is not configured');
  if (!HERO_BACKGROUND_SLOTS.includes(slot)) throw new Error('Invalid slot');
  if (!payload.dataUrl.startsWith('data:image/')) throw new Error('Invalid image format');
  if (payload.sizeBytes <= 0) throw new Error('Invalid image size');

  await setDoc(doc(db, 'hero_background_images', `slot_${slot}`), {
    slot,
    dataUrl: payload.dataUrl,
    sizeBytes: payload.sizeBytes,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteHeroBackgroundImage(slot: number) {
  if (!db || !isFirebaseConfigured) throw new Error('Firebase is not configured');
  if (!HERO_BACKGROUND_SLOTS.includes(slot)) throw new Error('Invalid slot');
  await deleteDoc(doc(db, 'hero_background_images', `slot_${slot}`));
}

export async function createAdminMember(payload: {
  name: string;
  phone: string;
  address: string;
  type: '응원메시지' | '정책제안' | '일반';
}) {
  if (!db || !isFirebaseConfigured) return null;
  try {
    const ref = await addDoc(collection(db, 'admin_members'), {
      name: payload.name,
      phone: payload.phone,
      address: payload.address || '-',
      type: payload.type,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function updateAdminMember(
  memberId: string,
  payload: {
    name: string;
    phone: string;
    address: string;
    type: '응원메시지' | '정책제안' | '일반';
  }
) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await updateDoc(doc(db, 'admin_members', memberId), {
      name: payload.name,
      phone: payload.phone,
      address: payload.address || '-',
      type: payload.type,
    });
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function deleteMemberBySource(sourceCollection: MemberManagementItem['sourceCollection'], sourceId: string) {
  if (!db || !isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, sourceCollection, sourceId));
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function deleteMemberAndRelatedContent(member: MemberManagementItem) {
  if (!db || !isFirebaseConfigured) return;

  try {
    const batch = writeBatch(db);

    // 1) Always delete the selected source document first.
    batch.delete(doc(db, member.sourceCollection, member.sourceId));

    // 2) Delete related support messages by same writer.
    const supportSnap = await getDocs(query(collection(db, 'support_messages'), where('name', '==', member.name)));
    supportSnap.docs.forEach((item) => {
      const data = item.data() as Record<string, unknown>;
      const phone = String(data.phone ?? '-');
      const shouldDelete = member.phone === '-' ? true : phone === member.phone;
      if (shouldDelete) {
        batch.delete(item.ref);
      }
    });

    // 3) Delete related policy proposals by same proposer name.
    const proposalSnap = await getDocs(query(collection(db, 'policy_proposals'), where('proposer', '==', member.name)));
    proposalSnap.docs.forEach((item) => {
      batch.delete(item.ref);
    });

    // 4) Delete related manually created members by same identity.
    const adminMemberSnap = await getDocs(query(collection(db, 'admin_members'), where('name', '==', member.name)));
    adminMemberSnap.docs.forEach((item) => {
      const data = item.data() as Record<string, unknown>;
      const phone = String(data.phone ?? '-');
      const shouldDelete = member.phone === '-' ? true : phone === member.phone;
      if (shouldDelete) {
        batch.delete(item.ref);
      }
    });

    await batch.commit();
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

export async function createAdminSession(profile?: Partial<AdminIdentityProfile>) {
  const token = createAdminSessionToken();
  await setDoc(doc(db, ADMIN_SESSION_COLLECTION, token), {
    active: true,
    username: String(profile?.username || '').trim() || 'admin',
    name: String(profile?.name || '').trim() || '관리자',
    role: String(profile?.role || '').trim() || 'admin',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return token;
}

export async function verifyAdminSession(token: string) {
  if (!token) return false;
  try {
    const snap = await getDoc(doc(db, ADMIN_SESSION_COLLECTION, token));
    if (!snap.exists()) return false;
    return snap.data()?.active !== false;
  } catch {
    return false;
  }
}

export async function deleteAdminSession(token: string) {
  if (!token) return;
  try {
    await deleteDoc(doc(db, ADMIN_SESSION_COLLECTION, token));
  } catch {
    // ignore session cleanup failure
  }
}

export async function upsertAdminAccount(uid: string, username: string, name?: string) {
  if (!uid) return;
  await setDoc(
    doc(db, 'admin_accounts', uid),
    {
      username,
      name: (name || '').trim() || username,
      role: 'admin',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getAdminAccountProfile(uid: string): Promise<AdminIdentityProfile | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'admin_accounts', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const username = String(data.username ?? '').trim();
    const name = String(data.name ?? '').trim();
    const role = String(data.role ?? 'admin').trim() || 'admin';
    if (!username && !name) return null;
    return {
      username: username || 'admin',
      name: name || username || '관리자',
      role,
    };
  } catch {
    return null;
  }
}

export async function getAdminSessionProfile(token: string): Promise<AdminIdentityProfile | null> {
  if (!token) return null;
  try {
    const snap = await getDoc(doc(db, ADMIN_SESSION_COLLECTION, token));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (data.active === false) return null;
    const username = String(data.username ?? '').trim();
    const name = String(data.name ?? '').trim();
    const role = String(data.role ?? 'admin').trim() || 'admin';
    return {
      username: username || 'admin',
      name: name || username || '관리자',
      role,
    };
  } catch {
    return null;
  }
}

export async function updateMemberBySource(
  sourceCollection: MemberManagementItem['sourceCollection'],
  sourceId: string,
  payload: {
    name: string;
    phone: string;
    address: string;
    type: '응원메시지' | '정책제안' | '일반';
  }
) {
  if (!db || !isFirebaseConfigured) return;
  try {
    if (sourceCollection === 'support_messages') {
      await updateDoc(doc(db, sourceCollection, sourceId), {
        name: payload.name,
        phone: payload.phone,
      });
      return;
    }

    if (sourceCollection === 'policy_proposals') {
      await updateDoc(doc(db, sourceCollection, sourceId), {
        proposer: payload.name,
        phone: payload.phone,
      });
      return;
    }

    await updateAdminMember(sourceId, payload);
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}
