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
  title: string;
  content: string;
  createdAt: string;
}

export interface PolicyReactionCountMap {
  [policyId: string]: number;
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
    supportMessages: number;
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
  recentSupportMessages: SupportMessageItem[];
  updatedAt: string;
}

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

function get6amCycleKey(now: Date = new Date()) {
  const cycleStart = new Date(now);
  cycleStart.setHours(6, 0, 0, 0);
  if (now < cycleStart) {
    cycleStart.setDate(cycleStart.getDate() - 1);
  }
  return cycleStart.toISOString();
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

const DAILY_VISITOR_MIN = 2000;
const DAILY_VISITOR_MAX = 3000;

function getRandomDailyBase() {
  return Math.floor(Math.random() * (DAILY_VISITOR_MAX - DAILY_VISITOR_MIN + 1)) + DAILY_VISITOR_MIN;
}

function parseNonNegativeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function getVisitorCounterTotal(cycleKey: string, initializeIfMissing = false) {
  if (!db || !isFirebaseConfigured) return 0;

  const counterRef = doc(db, 'visitor_counters', cycleKey);

  if (initializeIfMissing) {
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      if (!snap.exists()) {
        const base = getRandomDailyBase();
        tx.set(counterRef, {
          cycleKey,
          base,
          count: 0,
          total: base,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return base;
      }
      const data = snap.data() as Record<string, unknown>;
      const base = parseNonNegativeNumber(data.base, getRandomDailyBase());
      const count = parseNonNegativeNumber(data.count, 0);
      return parseNonNegativeNumber(data.total, base + count);
    });
  }

  const snap = await getDoc(counterRef);
  if (!snap.exists()) return 0;
  const data = snap.data() as Record<string, unknown>;
  const base = parseNonNegativeNumber(data.base, 0);
  const count = parseNonNegativeNumber(data.count, 0);
  return parseNonNegativeNumber(data.total, base + count);
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
    const ref = await addDoc(collection(db, 'posts'), {
      title: payload.title,
      content: payload.content,
      tags: payload.tags,
      image_url: payload.image_url,
      date: serverTimestamp(),
    });

    return {
      id: ref.id,
      title: payload.title,
      content: payload.content,
      tags: payload.tags,
      image_url: payload.image_url,
      date: new Date().toISOString(),
    } satisfies Post;
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

export async function getStats() {
  const cycleKey = get6amCycleKey();
  if (!db || !isFirebaseConfigured) {
    const [posts, events] = await Promise.all([getPosts(), getEvents()]);
    return { posts: posts.length, events: events.length, supportMessages: 0, visitorsToday: 0 };
  }

  try {
    const postsRef = collection(db, 'posts');
    const eventsRef = collection(db, 'events');
    const supportRef = collection(db, 'support_messages');

    const [postsCountResult, eventsCountResult, supportCountResult, visitorsTodayResult] = await Promise.allSettled([
      getCountFromServer(postsRef),
      getCountFromServer(eventsRef),
      getCountFromServer(supportRef),
      getVisitorCounterTotal(cycleKey, true),
    ]);

    const postsCount = postsCountResult.status === 'fulfilled' ? postsCountResult.value.data().count : 0;
    const eventsCount = eventsCountResult.status === 'fulfilled' ? eventsCountResult.value.data().count : 0;
    const supportCount = supportCountResult.status === 'fulfilled' ? supportCountResult.value.data().count : 0;
    const visitorsToday = visitorsTodayResult.status === 'fulfilled' ? visitorsTodayResult.value : 0;

    return {
      posts: postsCount,
      events: eventsCount,
      supportMessages: supportCount,
      visitorsToday,
    };
  } catch {
    const [posts, events] = await Promise.all([getPosts(), getEvents()]);
    return { posts: posts.length, events: events.length, supportMessages: 0, visitorsToday: 0 };
  }
}

export async function incrementVisitCount(cycleKey: string) {
  if (!db || !isFirebaseConfigured) return false;
  try {
    const counterRef = doc(db, 'visitor_counters', cycleKey);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      if (!snap.exists()) {
        const base = getRandomDailyBase();
        tx.set(counterRef, {
          cycleKey,
          base,
          count: 1,
          total: base + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const data = snap.data() as Record<string, unknown>;
      const base = parseNonNegativeNumber(data.base, getRandomDailyBase());
      const count = parseNonNegativeNumber(data.count, 0) + 1;
      tx.update(counterRef, {
        count,
        total: base + count,
        updatedAt: serverTimestamp(),
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
  if (!db || !isFirebaseConfigured) return;
  try {
    await addDoc(collection(db, 'contacts'), {
      name: payload.name,
      phone: payload.phone,
      message: payload.message,
      createdAt: serverTimestamp(),
    });
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

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const updatedAt = new Date().toISOString();
  if (!db || !isFirebaseConfigured) {
    const recentPosts = [...FALLBACK_POSTS];
    const upcomingEvents = FALLBACK_EVENTS.slice(0, 5);
    const todayCycleStart = new Date(get6amCycleKey());
    return {
      totals: {
        posts: recentPosts.length,
        events: upcomingEvents.length,
        supportMessages: 0,
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
      recentSupportMessages: [],
      updatedAt,
    };
  }

  try {
    const cycleKey = get6amCycleKey();
    const cycleStart = new Date(cycleKey);
    const dailyBuckets = getRecentVisitorDayBuckets(cycleStart, 7);
    const postsRef = collection(db, 'posts');
    const eventsRef = collection(db, 'events');
    const supportRef = collection(db, 'support_messages');
    const proposalsRef = collection(db, 'policy_proposals');
    const membersRef = collection(db, 'admin_members');
    const visitorsQuery = query(collection(db, 'visitors'), where('cycleKey', '==', cycleKey));

    const [
      postsCountSnap,
      eventsCountSnap,
      supportCountSnap,
      visitorsCountSnap,
      visitorsTrendSnap,
      recentPostsSnap,
      upcomingEventsSnap,
      recentSupportSnap,
      supportMembersSnap,
      proposalMembersSnap,
      manualMembersSnap,
      visitorsTodayTotal,
      ...dailyVisitorTotals
    ] = await Promise.all([
      getCountFromServer(postsRef),
      getCountFromServer(eventsRef),
      getCountFromServer(supportRef),
      getCountFromServer(visitorsQuery),
      getDocs(visitorsQuery),
      getDocs(query(postsRef, orderBy('date', 'desc'))),
      getDocs(query(eventsRef, orderBy('date', 'asc'), limit(5))),
      getDocs(query(supportRef, orderBy('createdAt', 'desc'), limit(7))),
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

    const allPolicyProposals = proposalMembersSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>;
      return {
        id: docItem.id,
        proposer: String(data.proposer ?? ''),
        title: String(data.title ?? ''),
        content: String(data.content ?? ''),
        createdAt: safeDate(data.createdAt),
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
      phone: '-',
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

    const members = [...manualMembers, ...supportMembers, ...proposalMembers]
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
        supportMessages: supportCountSnap.data().count,
        visitorsToday: Number(visitorsTodayTotal) || visitorsCountSnap.data().count,
      },
      visitorTrend,
      dailyVisitorTrend,
      members,
      recentPosts,
      upcomingEvents,
      recentSupportMessages,
      updatedAt,
    };
  } catch {
    const [posts, events, support] = await Promise.all([getPosts(), getEvents(), getSupportMessages()]);
    const todayCycleStart = new Date(get6amCycleKey());
    return {
      totals: {
        posts: posts.length,
        events: events.length,
        supportMessages: support.length,
        visitorsToday: 0,
      },
      visitorTrend: getVisitorHourBuckets(new Date()),
      dailyVisitorTrend: getRecentVisitorDayBuckets(todayCycleStart, 7).map((point) => ({
        dateLabel: point.dateLabel,
        count: point.count,
      })),
      members: support.map((item) => ({
        id: `support-${item.id}`,
        name: item.name,
        phone: item.phone,
        address: '-',
        type: '응원메시지',
        createdAt: item.createdAt,
        sourceCollection: 'support_messages',
        sourceId: item.id,
      })),
      recentPosts: posts,
      upcomingEvents: events.slice(0, 5),
      recentSupportMessages: support.slice(0, 7),
      updatedAt,
    };
  }
}

export async function submitPolicyProposal(payload: { proposer: string; title: string; content: string }) {
  if (!db || !isFirebaseConfigured) return null;

  try {
    const docRef = await addDoc(collection(db, 'policy_proposals'), {
      proposer: payload.proposer,
      title: payload.title,
      content: payload.content,
      type: '정책제안',
      createdAt: serverTimestamp(),
    });

    return {
      id: docRef.id,
      proposer: payload.proposer,
      title: payload.title,
      content: payload.content,
      createdAt: new Date().toISOString(),
    } satisfies PolicyProposalItem;
  } catch (error) {
    throw normalizeFirestoreError(error);
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
        const snap = await getDoc(doc(db, 'policy_reactions', policyId));
        if (!snap.exists()) return [policyId, 0] as const;
        const data = snap.data() as Record<string, unknown>;
        return [policyId, parseNonNegativeNumber(data.count, 0)] as const;
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

export async function incrementPolicyReactionCount(policyId: string) {
  if (!db || !isFirebaseConfigured) return 0;

  try {
    const reactionRef = doc(db, 'policy_reactions', policyId);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(reactionRef);
      if (!snap.exists()) {
        tx.set(reactionRef, {
          policyId,
          count: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return 1;
      }

      const data = snap.data() as Record<string, unknown>;
      const nextCount = parseNonNegativeNumber(data.count, 0) + 1;
      tx.update(reactionRef, {
        count: nextCount,
        updatedAt: serverTimestamp(),
      });
      return nextCount;
    });
  } catch {
    return 0;
  }
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
      });
      return;
    }

    await updateAdminMember(sourceId, payload);
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}
