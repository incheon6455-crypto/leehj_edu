import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, X } from 'lucide-react';
import { CONFIG } from '../config';
import { stripHtmlTags } from '../lib/utils';
import { KPISection } from '../components/KPISection';
import {
  getHeroBackgroundImages,
  getPosts,
  getSupportMessages,
  submitSupportMessage,
  type Post,
} from '../lib/firebaseData';
import leftBackgroundImage from '../../Assets/image-removebg-preview.png';
import heroImage2 from '../../Assets/IMG_7612.jpg';
import heroImage3 from '../../Assets/IMG_7613.jpg';
import heroImage4 from '../../Assets/IMG_7614.jpg';

const DEFAULT_HERO_IMAGES = [leftBackgroundImage, heroImage2, heroImage3, heroImage4];
const DEFAULT_SOCIAL_THUMBNAIL_URL = 'https://leehj-edu.web.app/og-main-left-image-removebg.jpg';
const HERO_IMAGES_CACHE_KEY = 'home_hero_images_cache_v1';
const SUPPORT_VISIBLE_ROWS = 15;
const SUPPORT_ROW_HEIGHT_PX = 44;
const SUPPORT_SCROLL_THUMB_MIN_HEIGHT = 28;

const DEFAULT_SUPPORT_MESSAGES = [
  { id: 'default-1', content: "아이들을 위한 진심이 느껴집니다. 끝까지 응원하겠습니다.", name: "김민수", phone: "010-1234-5678" },
  { id: 'default-2', content: "현장 중심의 교육 정책 기대하고 있습니다.", name: "이서연", phone: "010-2345-6789" },
  { id: 'default-3', content: "학생과 교사가 함께 행복한 학교를 만들어 주세요.", name: "박지훈", phone: "010-3456-7890" },
  { id: 'default-4', content: "늘 한결같은 모습으로 힘내주세요. 응원합니다.", name: "최유진", phone: "010-4567-8901" },
  { id: 'default-5', content: "교육의 기본을 바로 세우는 후보가 되어 주세요.", name: "정하늘", phone: "010-5678-9012" },
  { id: 'default-6', content: "학부모의 마음을 잘 이해해 주셔서 감사합니다.", name: "윤도현", phone: "010-6789-0123" },
  { id: 'default-7', content: "정의로운 교육, 반드시 실현해 주시길 바랍니다.", name: "강지우", phone: "010-7890-1234" },
  { id: 'default-8', content: "우리 아이들의 배움이 더 즐거워지길 바랍니다.", name: "송민재", phone: "010-8901-2345" },
  { id: 'default-9', content: "학교 현장의 목소리를 끝까지 들어주세요.", name: "한소율", phone: "010-9012-3456" },
  { id: 'default-10', content: "좋은 교육으로 지역의 미래를 밝혀 주세요.", name: "오준서", phone: "010-1122-3344" },
].reverse();

function maskName(name: string) {
  if (name.length < 2) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}*${name[name.length - 1]}`;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 2) return '***-****-****';
  const tail = digits.slice(-2);
  return `***-****-**${tail}`;
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function extractYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      return parsed.pathname.replace(/\//g, '').trim();
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
      if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || '';
      if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/')[2] || '';
    }
    return '';
  } catch {
    return '';
  }
}

function buildYouTubeIframe(videoId: string) {
  return `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1" width="100%" height="420" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%;max-width:100%;aspect-ratio:16/9;border:0;border-radius:8px;margin:10px 0;"></iframe>`;
}

function buildPostDetailHtml(content: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = content;
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 1024;

  const anchors = Array.from(wrapper.querySelectorAll('a[href]'));
  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    const videoId = extractYouTubeVideoId(href);
    if (!videoId) return;
    const iframeWrap = document.createElement('div');
    iframeWrap.innerHTML = buildYouTubeIframe(videoId);
    anchor.replaceWith(iframeWrap.firstElementChild || anchor);
  });

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  const urlPattern = /(https?:\/\/[^\s<]+)/gi;
  textNodes.forEach((node) => {
    const source = node.textContent || '';
    if (!source.trim()) return;
    const matches = [...source.matchAll(urlPattern)];
    if (matches.length === 0) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    matches.forEach((match) => {
      const foundUrl = match[0];
      const start = match.index ?? 0;
      if (start > cursor) fragment.appendChild(document.createTextNode(source.slice(cursor, start)));

      const videoId = extractYouTubeVideoId(foundUrl);
      if (videoId) {
        const iframeWrap = document.createElement('div');
        iframeWrap.innerHTML = buildYouTubeIframe(videoId);
        if (iframeWrap.firstElementChild) fragment.appendChild(iframeWrap.firstElementChild);
      } else {
        fragment.appendChild(document.createTextNode(foundUrl));
      }
      cursor = start + foundUrl.length;
    });
    if (cursor < source.length) fragment.appendChild(document.createTextNode(source.slice(cursor)));
    node.parentNode?.replaceChild(fragment, node);
  });

  const images = Array.from(wrapper.querySelectorAll('img'));
  images.forEach((image) => {
    image.style.maxWidth = '100%';
    image.style.height = 'auto';
    image.style.borderRadius = '8px';
    image.style.margin = '12px 0';
    if (isMobileViewport) {
      image.style.setProperty('position', 'static', 'important');
      image.style.setProperty('top', 'auto', 'important');
      image.style.setProperty('right', 'auto', 'important');
      image.style.setProperty('bottom', 'auto', 'important');
      image.style.setProperty('left', 'auto', 'important');
      image.style.setProperty('transform', 'none', 'important');
      image.style.setProperty('z-index', 'auto', 'important');
    }
  });

  return wrapper.innerHTML;
}

function upsertMetaTag(selector: string, attrName: 'property' | 'name', attrValue: string, content: string) {
  let tag = document.querySelector(selector) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attrName, attrValue);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function toAbsoluteUrl(image: string) {
  const source = String(image || '').trim();
  if (!source) return DEFAULT_SOCIAL_THUMBNAIL_URL;
  if (source.startsWith('data:image/')) return source;
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith('/')) return `${window.location.origin}${source}`;
  return DEFAULT_SOCIAL_THUMBNAIL_URL;
}

function syncHomeThumbnailMeta(image: string) {
  const content = toAbsoluteUrl(image);
  upsertMetaTag('meta[property="og:image"]', 'property', 'og:image', content);
  upsertMetaTag('meta[property="og:image:url"]', 'property', 'og:image:url', content);
  upsertMetaTag('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', content);
  upsertMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', content);
}

function readCachedHeroImages() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HERO_IMAGES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map((item) => String(item || '').trim()).filter(Boolean);
    return normalized.length > 0 ? normalized : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const navigate = useNavigate();
  const [latestPosts, setLatestPosts] = useState<Post[]>([]);
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [heroImages, setHeroImages] = useState<string[]>(() => readCachedHeroImages());
  const [heroImagesResolved, setHeroImagesResolved] = useState(() => readCachedHeroImages().length > 0);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [supportMessages, setSupportMessages] = useState(DEFAULT_SUPPORT_MESSAGES);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [selectedSupportMessage, setSelectedSupportMessage] = useState<{ id: string; name: string; phone: string; content: string } | null>(null);
  const [supportForm, setSupportForm] = useState({ name: '', phone: '', content: '' });
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [supportSubmitError, setSupportSubmitError] = useState('');
  const submitFallbackTimerRef = useRef<number | null>(null);
  const supportListRef = useRef<HTMLUListElement | null>(null);
  const selectedPostDetailHtml = selectedPost ? buildPostDetailHtml(selectedPost.content) : '';
  const supportListNeedsScroll = supportMessages.length > SUPPORT_VISIBLE_ROWS;
  const [supportScrollMetrics, setSupportScrollMetrics] = useState({ top: 0, client: 0, scroll: 0 });

  useEffect(() => {
    getPosts()
      .then((data: Post[]) => {
        const sortedPosts = [...data].sort((a, b) => {
          const aTime = Number.isNaN(Date.parse(a.date)) ? 0 : Date.parse(a.date);
          const bTime = Number.isNaN(Date.parse(b.date)) ? 0 : Date.parse(b.date);
          if (bTime !== aTime) return bTime - aTime;
          return b.id.localeCompare(a.id);
        });
        setLatestPosts(sortedPosts.slice(0, 9));
      });
  }, []);

  useEffect(() => {
    getSupportMessages().then((data) => {
      if (data.length > 0) {
        setSupportMessages(data.map((item) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
          content: item.content,
        })));
      }
    });
  }, []);

  useEffect(() => {
    getHeroBackgroundImages()
      .then((data) => {
        const merged = [...DEFAULT_HERO_IMAGES];
        if (data.length > 0) {
          data.forEach((item) => {
            if (item.slot >= 1 && item.slot <= 4 && item.dataUrl) {
              merged[item.slot - 1] = item.dataUrl;
            }
          });
        }
        setHeroImages(merged);
        window.localStorage.setItem(HERO_IMAGES_CACHE_KEY, JSON.stringify(merged));
      })
      .finally(() => {
        setHeroImagesResolved(true);
      });
  }, []);

  useEffect(() => {
    if (heroImages.length <= 1) return;
    const interval = setInterval(() => {
      setHeroImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [heroImages.length]);

  useEffect(() => {
    if (heroImages.length === 0) return;
    const activeImage = heroImages[heroImageIndex] || heroImages[0] || DEFAULT_SOCIAL_THUMBNAIL_URL;
    syncHomeThumbnailMeta(activeImage);
  }, [heroImageIndex, heroImages]);

  useEffect(() => {
    if (heroImages.length === 0) return;
    setHeroImageIndex((prev) => (prev < heroImages.length ? prev : 0));
  }, [heroImages.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSupportMessages((prev) => {
        if (prev.length <= 1) return prev;
        return [...prev.slice(1), prev[0]];
      });
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedPost && !isSupportModalOpen && !selectedSupportMessage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPost(null);
        setIsSupportModalOpen(false);
        setSelectedSupportMessage(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPost, isSupportModalOpen, selectedSupportMessage]);

  useEffect(() => {
    return () => {
      if (submitFallbackTimerRef.current) {
        window.clearTimeout(submitFallbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!supportListNeedsScroll) {
      setSupportScrollMetrics({ top: 0, client: 0, scroll: 0 });
      return;
    }
    const node = supportListRef.current;
    if (!node) return;

    const syncSupportScrollMetrics = () => {
      setSupportScrollMetrics({
        top: node.scrollTop,
        client: node.clientHeight,
        scroll: node.scrollHeight,
      });
    };

    syncSupportScrollMetrics();
    window.addEventListener('resize', syncSupportScrollMetrics);
    return () => window.removeEventListener('resize', syncSupportScrollMetrics);
  }, [supportListNeedsScroll, supportMessages.length]);

  const supportScrollableDistance = Math.max(1, supportScrollMetrics.scroll - supportScrollMetrics.client);
  const supportThumbHeight = supportListNeedsScroll
    ? Math.max(
        SUPPORT_SCROLL_THUMB_MIN_HEIGHT,
        (supportScrollMetrics.client * supportScrollMetrics.client) / Math.max(1, supportScrollMetrics.scroll)
      )
    : 0;
  const supportThumbTop = supportListNeedsScroll
    ? (supportScrollMetrics.top / supportScrollableDistance) * Math.max(0, supportScrollMetrics.client - supportThumbHeight)
    : 0;

  const handleSupportSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedPhoneDigits = supportForm.phone.replace(/\D/g, '');
    const trimmed = {
      name: supportForm.name.trim(),
      phone: formatPhoneInput(normalizedPhoneDigits),
      content: supportForm.content.trim(),
    };
    if (!trimmed.name || !trimmed.phone || !trimmed.content) {
      setSupportSubmitError('이름, 연락처, 응원 메시지를 모두 입력해 주세요.');
      return;
    }
    if (normalizedPhoneDigits.length !== 11) {
      setSupportSubmitError('연락처는 숫자 11자리를 정확히 입력해 주세요.');
      return;
    }

    setIsSubmittingSupport(true);
    setSupportSubmitError('');
    if (submitFallbackTimerRef.current) {
      window.clearTimeout(submitFallbackTimerRef.current);
    }
    // Firestore 요청이 pending으로 걸리는 환경에서도 UI가 영구 잠기지 않도록 안전장치.
    submitFallbackTimerRef.current = window.setTimeout(() => {
      setIsSubmittingSupport(false);
      setSupportSubmitError('Firebase 응답이 지연되고 있습니다. 네트워크 또는 Firestore 설정을 확인해 주세요.');
    }, 15000);

    try {
      const saved = await withTimeout(
        submitSupportMessage(trimmed),
        12000,
        'Firebase 저장 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.'
      );
      if (saved) {
        setSupportMessages((prev) => [
          { id: saved.id, name: saved.name, phone: saved.phone, content: saved.content },
          ...prev,
        ]);
      } else {
        setSupportMessages((prev) => [
          { id: `local-${Date.now()}`, name: trimmed.name, phone: trimmed.phone, content: trimmed.content },
          ...prev,
        ]);
      }
      setSupportForm({ name: '', phone: '', content: '' });
      setIsSupportModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
        setSupportSubmitError('Firebase 권한 설정으로 저장이 차단되었습니다. Firestore rules를 배포해 주세요.');
      } else if (message.includes('unauthenticated')) {
        setSupportSubmitError('Firebase 인증 상태 문제로 저장이 실패했습니다. 앱 설정을 확인해 주세요.');
      } else if (message.includes('failed-precondition')) {
        setSupportSubmitError('Firestore 데이터베이스/인덱스 설정이 완료되지 않았습니다.');
      } else if (message.includes('시간이 초과')) {
        setSupportSubmitError(message);
      } else {
        setSupportSubmitError('응원글 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      console.error('submitSupportMessage failed:', error);
    } finally {
      if (submitFallbackTimerRef.current) {
        window.clearTimeout(submitFallbackTimerRef.current);
        submitFallbackTimerRef.current = null;
      }
      setIsSubmittingSupport(false);
    }
  };

  return (
    <div className="space-y-24 pb-24">
      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex flex-col lg:items-center pt-20 overflow-hidden bg-white">
        <div className="order-1 w-full grid grid-cols-1 lg:absolute lg:inset-0 lg:grid-cols-2">
          <div className="relative h-[30vh] lg:h-full bg-burgundy/[0.04] overflow-hidden">
            {heroImages.length === 0 && !heroImagesResolved ? (
              <div className="absolute inset-0 bg-burgundy/[0.06]" />
            ) : (
              heroImages.map((image, index) => (
                <div
                  key={`${image}-${index}`}
                  className="absolute inset-0 bg-contain bg-center bg-no-repeat transition-opacity duration-700"
                  style={{
                    backgroundImage: `url(${image})`,
                    opacity: heroImageIndex === index ? 1 : 0,
                  }}
                />
              ))
            )}
          </div>
          <div className="hidden h-[30vh] lg:block lg:h-full bg-burgundy/[0.02]" />
        </div>
        
        <div className="order-3 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center lg:-translate-y-[100px]">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="text-left translate-y-[15px] lg:translate-y-[150px] lg:translate-x-[100px] order-1 lg:order-2 lg:col-start-2"
            >
              <span className="inline-block px-4 py-1.5 rounded-full bg-burgundy/10 text-burgundy text-sm font-bold mb-6 whitespace-nowrap">
                제22대 교육감 예비후보
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-[1.3] mb-8">
                아이들의 미래, 정의로운 교육으로 <br /> 열겠습니다
              </h1>
              <p className="text-lg text-slate-600 mb-10 leading-relaxed max-w-lg whitespace-pre-line">
                {CONFIG.mainMessage}
              </p>
              <div className="-translate-y-[15px] lg:translate-y-0 flex flex-wrap gap-4 max-md:justify-center">
                <Link to="/policies" className="bg-burgundy text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-burgundy-dark transition-all shadow-xl shadow-burgundy/20 flex items-center gap-2 max-md:px-6 max-md:py-3 max-md:text-base">
                  정책 보기 <ArrowRight size={20} />
                </Link>
                <Link to="/about" className="bg-white text-slate-900 border border-slate-200 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-50 transition-all max-md:px-6 max-md:py-3 max-md:text-base">
                  후보자 소개
                </Link>
              </div>
            </motion.div>
          </div>
        </div>

        {/* KPI Section at the bottom of Hero */}
        <div className="order-2 w-full z-20 lg:absolute lg:bottom-0 lg:left-0 lg:right-0">
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="absolute bottom-[158px] left-1/2 -translate-x-1/2 max-md:translate-y-[25px] flex flex-row items-center gap-2 z-30 md:bottom-auto md:-left-4 md:top-1/2 md:-translate-x-[40px] md:-translate-y-1/2 lg:-left-8">
              {heroImages.map((image, index) => (
                <button
                  type="button"
                  key={`${image}-dot`}
                  onClick={() => setHeroImageIndex(index)}
                  aria-label={`${index + 1}번 배경 이미지 보기`}
                  className={`h-3.5 w-3.5 rounded-full border border-burgundy/60 transition-colors cursor-pointer ${
                    heroImageIndex === index ? 'bg-burgundy' : 'bg-transparent'
                  }`}
                />
              ))}
            </div>
            <KPISection />
          </div>
        </div>

      </section>

      {/* News & Events Preview */}
      <section className="relative -mt-[121px] bg-gradient-to-b from-[#7a0f2c] via-[#660a24] to-[#4f071c] py-24 text-white">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="absolute left-1/2 top-[45px] -translate-x-1/2 flex flex-col items-center gap-1 text-white pointer-events-none"
        >
          <div className="h-9 w-5 rounded-full border border-white/70 flex justify-center pt-1.5 bg-white/10">
            <motion.span
              animate={{ y: [0, 8, 0], opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="h-1.5 w-1.5 rounded-full bg-white"
            />
          </div>
        </motion.div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">최신 소식 & 후보의 하루</h2>
              <p className="text-white/75">캠프의 활동과 후보의 하루를 확인하세요.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-12">
            <div className="space-y-6">
              <div className="mb-8 flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold border-l-4 border-gold pl-4 text-white">최신 소식</h3>
                <Link to="/posts?source=latest" className="shrink-0 text-gold font-bold flex items-center gap-1 hover:underline">
                  전체보기 <ArrowRight size={16} />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {latestPosts.map((post, i) => (
                  <div
                    key={post.id}
                    onClick={() => navigate(`/posts?source=latest&postId=${encodeURIComponent(post.id)}`)}
                    className="bg-white/10 border border-white/20 backdrop-blur-sm p-3 hover:bg-white/15 transition-colors cursor-pointer group shadow-lg shadow-black/20"
                  >
                    <div className="w-full h-24 rounded-lg overflow-hidden mb-2">
                      <img src={post.image_url || `https://picsum.photos/seed/news${post.id || i}/300/200`} alt={post.title} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-gold text-[11px] font-bold mb-1">{post.tags?.split(',')[0] || '활동 소식'}</p>
                    <h4 className="text-sm font-bold mb-1 group-hover:text-gold transition-colors line-clamp-2">{post.title}</h4>
                    <p className="text-white/70 text-xs line-clamp-2">{stripHtmlTags(post.content)}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="mb-8 flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold border-l-4 border-gold pl-4 text-white">후보에게 응원의 메세지를 남겨 주세요</h3>
                <button
                  type="button"
                  onClick={() => setIsSupportModalOpen(true)}
                  className="shrink-0 rounded-lg bg-gold/20 px-3 py-1.5 text-sm font-bold text-gold border border-gold/40 hover:bg-gold/30 transition-colors"
                >
                  응원글 쓰기
                </button>
              </div>
              <div className="bg-white/10 border border-white/20 backdrop-blur-sm border-l-4 border-gold shadow-lg shadow-black/20">
                <div className="grid grid-cols-[minmax(0,1fr)_96px_132px] bg-white/5 border-b border-white/15 text-xs font-bold text-gold/90">
                  <span className="px-4 py-2 truncate">내용</span>
                  <span className="px-3 py-2 border-l border-white/20 text-center truncate">이름</span>
                  <span className="px-3 py-2 border-l border-white/20 text-center truncate">전화번호</span>
                </div>
                <div className="relative">
                  <ul
                    ref={supportListRef}
                    className={
                      supportListNeedsScroll ? 'support-messages-scroll max-h-[660px] overflow-y-scroll pr-3' : ''
                    }
                    style={
                      supportListNeedsScroll
                        ? { maxHeight: `${SUPPORT_VISIBLE_ROWS * SUPPORT_ROW_HEIGHT_PX}px`, scrollbarGutter: 'stable' }
                        : undefined
                    }
                    onScroll={() => {
                      const node = supportListRef.current;
                      if (!node) return;
                      setSupportScrollMetrics({
                        top: node.scrollTop,
                        client: node.clientHeight,
                        scroll: node.scrollHeight,
                      });
                    }}
                  >
                    {supportMessages.map((message) => (
                      <li
                        key={message.id}
                        className="grid h-11 grid-cols-[minmax(0,1fr)_96px_132px] border-b border-white/10 last:border-b-0 text-sm text-white/90 cursor-pointer hover:bg-white/10 transition-colors"
                        onClick={() => setSelectedSupportMessage(message)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedSupportMessage(message);
                          }
                        }}
                      >
                        <span className="px-4 truncate self-center">{message.content}</span>
                        <span className="px-3 border-l border-white/20 text-center truncate self-center">{maskName(message.name)}</span>
                        <span className="px-3 border-l border-white/20 text-center truncate self-center">{maskPhone(message.phone)}</span>
                      </li>
                    ))}
                  </ul>
                  {supportListNeedsScroll && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-2 bg-white/20">
                      <div
                        className="absolute left-0 right-0 rounded-full bg-gold/90"
                        style={{ height: `${supportThumbHeight}px`, transform: `translateY(${supportThumbTop}px)` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedPost && (
        <div
          className="fixed inset-0 z-50 bg-black/60 px-4 py-6 md:py-10 flex items-center justify-center"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-burgundy font-bold mb-1">{selectedPost.tags?.split(',')[0] || '활동 소식'}</p>
                <h3 className="text-xl font-bold text-slate-900">{selectedPost.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                aria-label="모달 닫기"
                className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="w-full rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={selectedPost.image_url || `https://picsum.photos/seed/news${selectedPost.id}/1200/700`}
                  alt={selectedPost.title}
                  className="w-full h-auto object-cover"
                />
              </div>
              <div
                className="text-slate-700 leading-relaxed whitespace-pre-line [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-3 [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:rounded-lg [&_iframe]:my-3 [&_video]:w-full [&_video]:max-w-full [&_video]:rounded-lg [&_video]:my-3"
                dangerouslySetInnerHTML={{ __html: selectedPostDetailHtml }}
              />
            </div>
          </div>
        </div>
      )}

      {selectedSupportMessage && (
        <div
          className="fixed inset-0 z-50 bg-black/60 px-4 py-6 md:py-10 flex items-center justify-center"
          onClick={() => setSelectedSupportMessage(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-burgundy font-bold mb-1">응원 메시지 상세</p>
                <h3 className="text-xl font-bold text-slate-900">{maskName(selectedSupportMessage.name)}</h3>
                <p className="text-sm text-slate-500 mt-1">{maskPhone(selectedSupportMessage.phone)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSupportMessage(null)}
                aria-label="응원 메시지 모달 닫기"
                className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedSupportMessage.content}</p>
            </div>
          </div>
        </div>
      )}

      {isSupportModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 px-4 py-6 md:py-10 flex items-center justify-center"
          onClick={() => {
            if (isSubmittingSupport) return;
            setIsSupportModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-burgundy font-bold mb-1">응원 메시지</p>
                <h3 className="text-xl font-bold text-slate-900">후보에게 응원글 쓰기</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(false)}
                aria-label="모달 닫기"
                className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                disabled={isSubmittingSupport}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSupportSubmit} className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">이름</label>
                <input
                  required
                  type="text"
                  value={supportForm.name}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="이름을 입력해 주세요"
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-burgundy transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">연락처</label>
                <input
                  required
                  type="tel"
                  value={supportForm.phone}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, phone: formatPhoneInput(e.target.value) }))}
                  placeholder="연락처를 입력해 주세요"
                  inputMode="numeric"
                  maxLength={13}
                  pattern="[0-9]{3}-?[0-9]{4}-?[0-9]{4}"
                  title="휴대폰 번호 11자리를 입력해 주세요."
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-burgundy transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">응원 메시지</label>
                <textarea
                  required
                  rows={4}
                  value={supportForm.content}
                  onChange={(e) => setSupportForm((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="응원 메시지를 작성해 주세요"
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-burgundy transition-all resize-none"
                />
              </div>
              {supportSubmitError ? <p className="text-sm text-red-600">{supportSubmitError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSupportModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  disabled={isSubmittingSupport}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-burgundy text-white font-bold hover:bg-burgundy-dark transition-colors disabled:opacity-60"
                  disabled={isSubmittingSupport}
                >
                  {isSubmittingSupport ? '저장 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Core Policies */}
      <section className="relative mt-44 lg:mt-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">핵심 정책</h2>
          <div className="w-20 h-1.5 bg-burgundy mx-auto rounded-full" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { title: '기초학력 책임교육', desc: '단 한 명의 아이도 포기하지 않는 맞춤형 학습 지원 체계 구축' },
            { title: '디지털 미래 교육', desc: 'AI·SW 교육 강화 및 미래형 디지털 학습 환경 조성' },
            { title: '안전한 학교 공동체', desc: '폭력 없는 학교, 마음이 건강한 성장을 돕는 상담 시스템 확대' }
          ].map((policy, i) => (
            <motion.div
              key={policy.title}
              whileHover={{ y: -10 }}
              className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 bg-burgundy/5 text-burgundy rounded-lg flex items-center justify-center font-bold text-xl mb-6">
                0{i + 1}
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">{policy.title}</h3>
              <p className="text-slate-600 mb-6 leading-relaxed">{policy.desc}</p>
              <Link to="/policies" className="text-burgundy font-bold flex items-center gap-1 hover:gap-2 transition-all">
                자세히 보기 <ChevronRight size={18} />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
