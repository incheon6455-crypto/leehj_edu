import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Tag, ArrowRight, X, ImagePlus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDate, stripHtmlTags } from '../lib/utils';
import {
  ADMIN_SESSION_STORAGE_KEY,
  createPost,
  getAdminSessionProfile,
  getPosts,
  type Post,
} from '../lib/firebaseData';

const ADMIN_PROFILE_STORAGE_KEY = 'admin_profile_cache';

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function optimizeImageDataUrl(file: File, maxDataUrlLength = 180_000) {
  const source = await fileToDataUrl(file);
  const image = new Image();
  image.src = source;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('이미지 미리보기를 생성하지 못했습니다.'));
  });

  const maxWidth = 780;
  const maxHeight = 780;
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(image, 0, 0, width, height);
  let quality = 0.82;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > maxDataUrlLength && quality > 0.32) {
    quality -= 0.06;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  return result;
}

function extractFirstImageFromHtml(html: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const img = wrapper.querySelector('img');
  return img?.getAttribute('src') || '';
}

type VideoEmbedInfo =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'mp4'; sourceUrl: string };

function isNewsLikeUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = parsed.pathname.toLowerCase();
    return (
      host.includes('news') ||
      host.includes('press') ||
      host.includes('journal') ||
      host.includes('times') ||
      path.includes('/news/') ||
      path.includes('/article')
    );
  } catch {
    return false;
  }
}

function buildNewsThumbnailUrl(url: string) {
  // WordPress mShots provides a best-effort webpage screenshot for link previews.
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200&h=675`;
}

function buildFallbackThumbnailUrl(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/450`;
}

function isGeneratedNewsThumbnail(url: string) {
  return url.includes('https://s.wordpress.com/mshots/v1/');
}

function extractYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      return parsed.pathname.replace(/\//g, '').trim();
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v') || '';
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || '';
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || '';
      }
    }
    return '';
  } catch {
    return '';
  }
}

function detectVideoEmbedInfo(url: string): VideoEmbedInfo | null {
  const youtubeId = extractYouTubeVideoId(url);
  if (youtubeId) return { kind: 'youtube', videoId: youtubeId };
  if (/\.mp4($|\?)/i.test(url)) return { kind: 'mp4', sourceUrl: url };
  return null;
}

function buildYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function buildArticleEmbedNode(url: string) {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-article-embed', 'true');
  wrapper.style.margin = '10px 0';
  wrapper.style.padding = '10px';
  wrapper.style.border = '1px solid #e2e8f0';
  wrapper.style.borderRadius = '10px';
  wrapper.style.background = '#f8fafc';

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation');
  iframe.style.width = '100%';
  iframe.style.minHeight = '420px';
  iframe.style.border = '0';
  iframe.style.borderRadius = '8px';
  iframe.style.background = '#ffffff';

  const link = document.createElement('a');
  try {
    const parsed = new URL(url);
    link.textContent = `${parsed.hostname.replace(/^www\./, '')} 기사 원문 보기`;
  } catch {
    link.textContent = '기사 원문 보기';
  }
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'inline-block';
  link.style.marginTop = '8px';
  link.style.fontSize = '13px';
  link.style.fontWeight = '700';
  link.style.color = '#9f1239';

  wrapper.appendChild(iframe);
  wrapper.appendChild(link);
  return wrapper;
}

function buildVideoEmbedNode(info: VideoEmbedInfo) {
  if (info.kind === 'youtube') {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${info.videoId}?autoplay=1&mute=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`;
    iframe.width = '100%';
    iframe.height = '420';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.loading = 'lazy';
    iframe.style.width = '100%';
    iframe.style.maxWidth = '100%';
    iframe.style.aspectRatio = '16 / 9';
    iframe.style.border = '0';
    iframe.style.borderRadius = '8px';
    iframe.style.margin = '10px 0';
    return iframe;
  }

  const video = document.createElement('video');
  video.src = info.sourceUrl;
  video.autoplay = true;
  video.controls = true;
  video.playsInline = true;
  video.style.width = '100%';
  video.style.maxWidth = '100%';
  video.style.borderRadius = '8px';
  video.style.margin = '10px 0';
  return video;
}

function transformContentWithVideoEmbeds(rawHtml: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = rawHtml;
  const thumbnailCandidates: string[] = [];
  const textNodes: Text[] = [];

  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  const urlPattern = /(https?:\/\/[^\s<]+)/gi;
  textNodes.forEach((node) => {
    const parentElement = node.parentElement;
    if (!parentElement) return;
    // Skip URL conversion inside existing embeds/links to avoid duplicated article cards.
    if (
      parentElement.closest('[data-article-embed="true"]') ||
      parentElement.closest('a') ||
      parentElement.closest('iframe') ||
      parentElement.closest('video')
    ) {
      return;
    }

    const source = node.textContent || '';
    if (!source.trim()) return;
    const matches = [...source.matchAll(urlPattern)];
    if (matches.length === 0) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    matches.forEach((match) => {
      const foundUrl = match[0];
      const start = match.index ?? 0;
      if (start > cursor) {
        fragment.appendChild(document.createTextNode(source.slice(cursor, start)));
      }

      const info = detectVideoEmbedInfo(foundUrl);
      if (info) {
        fragment.appendChild(buildVideoEmbedNode(info));
        fragment.appendChild(document.createElement('br'));
        if (info.kind === 'youtube') {
          thumbnailCandidates.push(`https://img.youtube.com/vi/${info.videoId}/hqdefault.jpg`);
        }
      } else if (isNewsLikeUrl(foundUrl)) {
        fragment.appendChild(buildArticleEmbedNode(foundUrl));
        fragment.appendChild(document.createElement('br'));
        thumbnailCandidates.push(buildNewsThumbnailUrl(foundUrl));
      } else {
        fragment.appendChild(document.createTextNode(foundUrl));
      }
      cursor = start + foundUrl.length;
    });

    if (cursor < source.length) {
      fragment.appendChild(document.createTextNode(source.slice(cursor)));
    }

    node.parentNode?.replaceChild(fragment, node);
  });

  return {
    html: wrapper.innerHTML,
    firstVideoThumbnail: thumbnailCandidates[0] || '',
  };
}

function hasRichContent(html: string) {
  const plain = stripHtmlTags(html).trim();
  if (plain) return true;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  return Boolean(wrapper.querySelector('img,iframe,video'));
}

function getPostPreviewText(content: string) {
  if (content.includes('data:image/')) {
    return '이미지와 텍스트가 포함된 소식입니다.';
  }
  if (content.includes('data-article-embed')) {
    return '기사 링크가 포함된 소식입니다.';
  }
  return stripHtmlTags(content);
}

function sanitizePostDetailContent(rawHtml: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = rawHtml;
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 1024;

  // Migrate previously saved "youtube link card" content back to inline embeds.
  const legacyCards = Array.from(wrapper.querySelectorAll('[data-youtube-link-card="true"]'));
  legacyCards.forEach((card) => {
    const anchor = card.querySelector('a');
    const href = anchor?.getAttribute('href') || '';
    const videoId = extractYouTubeVideoId(href);
    if (!videoId) return;
    card.replaceWith(buildVideoEmbedNode({ kind: 'youtube', videoId }));
  });

  const anchors = Array.from(wrapper.querySelectorAll('a[href]'));
  anchors.forEach((anchor) => {
    if (anchor.closest('[data-article-embed="true"]')) return;
    const href = anchor.getAttribute('href') || '';
    const videoId = extractYouTubeVideoId(href);
    if (videoId) {
      // Replace plain YouTube links in older posts with inline embeds.
      anchor.replaceWith(buildVideoEmbedNode({ kind: 'youtube', videoId }));
      return;
    }
    if (isNewsLikeUrl(href)) {
      anchor.replaceWith(buildArticleEmbedNode(href));
    }
  });

  // Normalize editor-sized images to fit the detail layout width.
  const images = Array.from(wrapper.querySelectorAll('img'));
  images.forEach((image) => {
    image.style.width = '100%';
    image.style.maxWidth = '100%';
    image.style.height = 'auto';
    image.style.maxHeight = 'none';
    image.style.objectFit = 'cover';
    image.style.display = 'block';
    image.style.margin = '12px 0';
    image.style.borderRadius = '8px';
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

function applyEditorMediaConstraints(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll('img'));
  images.forEach((image) => {
    image.style.maxWidth = '100%';
    image.style.width = '100%';
    image.style.maxHeight = '220px';
    image.style.height = 'auto';
    image.style.objectFit = 'contain';
    image.style.display = 'block';
    image.style.margin = '8px 0';
    image.style.borderRadius = '8px';
  });
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [visibleCount, setVisibleCount] = useState(9);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postSubmitError, setPostSubmitError] = useState('');
  const [postForm, setPostForm] = useState({
    title: '',
    tags: '',
    content: '',
    imageUrl: '',
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const contentEditorRef = useRef<HTMLDivElement | null>(null);
  const postContentHtmlRef = useRef('');
  const inlineImageInputRef = useRef<HTMLInputElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isLatestOnly = new URLSearchParams(location.search).get('source') === 'latest';
  const openPostIdFromQuery = new URLSearchParams(location.search).get('postId') || '';

  useEffect(() => {
    getPosts()
      .then((data: Post[]) => {
        const sortedPosts = [...data].sort((a, b) => {
          const aTime = Number.isNaN(Date.parse(a.date)) ? 0 : Date.parse(a.date);
          const bTime = Number.isNaN(Date.parse(b.date)) ? 0 : Date.parse(b.date);
          if (bTime !== aTime) return bTime - aTime;
          return b.id.localeCompare(a.id);
        });
        setPosts(sortedPosts);
        setVisibleCount(9);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

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

      if (!cancelled) {
        setIsAdminLoggedIn(isAdmin);
      }
    };

    syncAdminSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openPostIdFromQuery) return;
    if (posts.length === 0) return;
    const target = posts.find((item) => item.id === openPostIdFromQuery);
    if (!target) return;

    setSelectedPost(target);
    const params = new URLSearchParams(location.search);
    params.delete('postId');
    const nextSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
      { replace: true }
    );
  }, [openPostIdFromQuery, posts, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (loading || visibleCount >= posts.length) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 9, posts.length));
        }
      },
      { rootMargin: '240px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, posts.length, visibleCount]);

  useEffect(() => {
    if (!selectedPost && !isWriteModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPost(null);
        setIsWriteModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPost, isWriteModalOpen]);

  const handleOpenWriteModal = () => {
    setPostSubmitError('');
    setPostForm({ title: '', tags: '', content: '', imageUrl: '' });
    postContentHtmlRef.current = '';
    setIsWriteModalOpen(true);
    window.requestAnimationFrame(() => {
      if (contentEditorRef.current) {
        contentEditorRef.current.innerHTML = '';
      }
    });
  };

  const insertImageIntoEditor = (src: string) => {
    const editor = contentEditorRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const imageNode = document.createElement('img');
    imageNode.src = src;
    imageNode.alt = '첨부 이미지';
    imageNode.style.maxWidth = '100%';
    imageNode.style.width = '100%';
    imageNode.style.maxHeight = '220px';
    imageNode.style.height = 'auto';
    imageNode.style.objectFit = 'contain';
    imageNode.style.display = 'block';
    imageNode.style.margin = '8px 0';
    imageNode.style.borderRadius = '8px';

    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(imageNode);
      const lineBreak = document.createElement('br');
      imageNode.after(lineBreak);
      range.setStartAfter(lineBreak);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      editor.appendChild(imageNode);
      editor.appendChild(document.createElement('br'));
    }

    applyEditorMediaConstraints(editor);
    const nextHtml = editor.innerHTML;
    postContentHtmlRef.current = nextHtml;
    setPostForm((prev) => ({
      ...prev,
      imageUrl: prev.imageUrl || extractFirstImageFromHtml(nextHtml),
    }));
  };

  const handleInlineImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    const hasNonImage = files.some((file) => !file.type.startsWith('image/'));
    if (hasNonImage) {
      setPostSubmitError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    try {
      for (const file of files) {
        const optimized = await optimizeImageDataUrl(file);
        insertImageIntoEditor(optimized);
      }
      setPostSubmitError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '이미지 처리에 실패했습니다.';
      setPostSubmitError(message);
    }
  };

  const handleSubmitPost = async (event: React.FormEvent) => {
    event.preventDefault();
    const rawContent = contentEditorRef.current?.innerHTML || postContentHtmlRef.current || '';
    const transformed = transformContentWithVideoEmbeds(rawContent);
    const normalizedContent = transformed.html.trim();
    const fallbackImage =
      postForm.imageUrl || extractFirstImageFromHtml(normalizedContent) || transformed.firstVideoThumbnail;
    const payload = {
      title: postForm.title.trim(),
      tags: postForm.tags.trim(),
      content: normalizedContent,
      image_url: fallbackImage,
    };

    if (!payload.title || !hasRichContent(payload.content)) {
      setPostSubmitError('제목과 내용을 입력해 주세요.');
      return;
    }
    if (payload.content.length > 900_000) {
      setPostSubmitError('본문 이미지 용량이 큽니다. 사진 수를 줄이거나 다시 업로드해 주세요.');
      return;
    }

    setIsSubmittingPost(true);
    setPostSubmitError('');
    try {
      const saved = await createPost(payload);
      if (saved) {
        setPosts((prev) => [saved, ...prev]);
      }
      setIsWriteModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('permission-denied')) {
        setPostSubmitError('Firestore 권한으로 저장이 차단되었습니다. rules 배포를 확인해 주세요.');
      } else {
        setPostSubmitError('게시글 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setIsSubmittingPost(false);
    }
  };

  const visiblePosts = posts.slice(0, visibleCount);
  const selectedPostDetailHtml = selectedPost ? sanitizePostDetailContent(selectedPost.content) : '';
  const selectedPostHasEmbeddedMedia = /<(img|iframe|video)\b/i.test(selectedPostDetailHtml);
  const shouldHideDetailHeroImage =
    selectedPostHasEmbeddedMedia || (selectedPost ? isGeneratedNewsThumbnail(selectedPost.image_url || '') : false);

  useEffect(() => {
    if (!selectedPost) return;
    if (window.innerWidth >= 1024) return; // PC 웹은 변경하지 않음

    const timer = window.setTimeout(() => {
      const detailRoot = document.querySelector('[data-post-detail-content="true"]');
      if (!detailRoot) return;

      const iframes = Array.from(detailRoot.querySelectorAll('iframe'));
      iframes.forEach((iframe) => {
        try {
          const parsed = new URL(iframe.src);
          parsed.searchParams.set('autoplay', '1');
          parsed.searchParams.set('mute', '1');
          parsed.searchParams.set('playsinline', '1');
          parsed.searchParams.set('rel', '0');
          parsed.searchParams.set('modestbranding', '1');
          parsed.searchParams.set('enablejsapi', '1');
          const nextSrc = parsed.toString();
          iframe.setAttribute('loading', 'eager');
          // Reset src to force mobile autoplay params to take effect after modal mount.
          iframe.src = nextSrc;
        } catch {
          // ignore malformed iframe src
        }
      });

      const videos = Array.from(detailRoot.querySelectorAll('video'));
      videos.forEach((video) => {
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [selectedPost?.id, selectedPostDetailHtml]);

  return (
    <div className="pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-4">활동 소식</h1>
            <p className="text-slate-600">교육감 예비후보<br />이현준의 생생한 활동 현장을 전해드립니다.</p>
          </div>
          {!isLatestOnly && isAdminLoggedIn && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleOpenWriteModal}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-burgundy text-white hover:bg-burgundy-dark transition-all"
              >
                글쓰기
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse bg-white rounded-3xl h-96 border border-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visiblePosts.map((post, i) => (
              <motion.button
                key={post.id}
                type="button"
                onClick={() => setSelectedPost(post)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="group w-full bg-white overflow-hidden shadow-sm border border-slate-100 hover:shadow-xl transition-all flex flex-col cursor-pointer"
              >
                <div className="aspect-[2/1] overflow-hidden relative">
                  <img 
                    src={post.image_url || `https://picsum.photos/seed/post${post.id}/800/450`} 
                    alt={post.title}
                    onError={(event) => {
                      const target = event.currentTarget;
                      target.onerror = null;
                      target.src = buildFallbackThumbnailUrl(`post-news-${post.id}`);
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="bg-burgundy text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider">
                      News
                    </span>
                  </div>
                </div>
                
                <div className="p-[14px] flex-1 flex flex-col">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1.5">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} /> {formatDate(post.date)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Tag size={14} /> {post.tags?.split(',')[0]}
                    </span>
                  </div>
                  
                  <h3 className="text-[16px] font-bold text-slate-900 mb-2 group-hover:text-burgundy transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  
                  <p className="text-slate-600 text-[12px] line-clamp-3 mb-3.5 flex-1">
                    {getPostPreviewText(post.content)}
                  </p>
                  
                  <span className="text-burgundy font-bold text-[11px] flex items-center gap-1 group/btn">
                    자세히 보기 <ArrowRight size={11} className="group-hover/btn:translate-x-1 transition-transform" />
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div ref={loadMoreRef} className="h-12" aria-hidden="true" />
        )}
      </div>

      {selectedPost && (
        <div
          className="fixed inset-0 z-50 bg-black/60 px-4 py-6 flex items-center justify-center"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">활동 소식 상세</h2>
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!shouldHideDetailHeroImage ? (
                <div className="aspect-[2/1] overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src={selectedPost.image_url || `https://picsum.photos/seed/post${selectedPost.id}/1200/675`}
                    alt={selectedPost.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={13} /> {formatDate(selectedPost.date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Tag size={13} /> {selectedPost.tags || '-'}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900">{selectedPost.title}</h3>
              <div
                data-post-detail-content="true"
                className="text-sm leading-7 text-slate-700 whitespace-pre-wrap [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-3 [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:rounded-lg [&_iframe]:my-3 [&_video]:w-full [&_video]:max-w-full [&_video]:rounded-lg [&_video]:my-3"
                dangerouslySetInnerHTML={{ __html: selectedPostDetailHtml }}
              />
            </div>
          </div>
        </div>
      )}

      {isWriteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 px-4 py-6 flex items-center justify-center"
          onClick={() => {
            if (isSubmittingPost) return;
            setIsWriteModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl h-[82vh] max-h-[82vh] rounded-2xl bg-white shadow-2xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">활동 소식 글쓰기</h2>
              <button
                type="button"
                onClick={() => setIsWriteModalOpen(false)}
                disabled={isSubmittingPost}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="글쓰기 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitPost} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-sm font-semibold text-slate-700">제목</label>
                <input
                  type="text"
                  required
                  value={postForm.title}
                  onChange={(event) => setPostForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">태그 (쉼표 구분)</label>
                <input
                  type="text"
                  value={postForm.tags}
                  onChange={(event) => setPostForm((prev) => ({ ...prev, tags: event.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                  placeholder="활동,교육정책"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">내용</label>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">사진 버튼으로 이미지를 본문에 바로 삽입할 수 있습니다.</p>
                  <button
                    type="button"
                    onClick={() => inlineImageInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <ImagePlus size={14} />
                    사진
                  </button>
                  <input
                    ref={inlineImageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleInlineImageChange}
                    className="hidden"
                  />
                </div>
                <div
                  ref={contentEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(event) => {
                    applyEditorMediaConstraints(event.currentTarget);
                    postContentHtmlRef.current = event.currentTarget.innerHTML;
                  }}
                  className="mt-2 h-56 overflow-y-auto w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus-within:ring-2 focus-within:ring-burgundy outline-none whitespace-pre-wrap break-words [&_img]:max-w-full [&_img]:w-full [&_img]:max-h-[220px] [&_img]:h-auto [&_img]:object-contain [&_img]:rounded-lg [&_img]:my-2"
                />
              </div>
              {postSubmitError ? <p className="text-sm text-red-600">{postSubmitError}</p> : null}

              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWriteModalOpen(false)}
                  disabled={isSubmittingPost}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPost}
                  className="px-4 py-2 rounded-lg bg-burgundy text-white font-bold hover:bg-burgundy-dark disabled:opacity-60"
                >
                  {isSubmittingPost ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
