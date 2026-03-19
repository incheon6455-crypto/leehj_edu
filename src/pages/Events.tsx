import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Building2, Calendar, ExternalLink, ImagePlus, Newspaper, Plus, Tag, X } from 'lucide-react';
import { formatDate, stripHtmlTags } from '../lib/utils';
import {
  ADMIN_SESSION_STORAGE_KEY,
  createPressReport,
  getAdminSessionProfile,
  getPressReports,
  type PressReportItem,
} from '../lib/firebaseData';

const ADMIN_PROFILE_STORAGE_KEY = 'admin_profile_cache';

function getFallbackImage(seed: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/450`;
}

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
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200&h=675`;
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

type VideoEmbedInfo =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'mp4'; sourceUrl: string };

function detectVideoEmbedInfo(url: string): VideoEmbedInfo | null {
  const youtubeId = extractYouTubeVideoId(url);
  if (youtubeId) return { kind: 'youtube', videoId: youtubeId };
  if (/\.mp4($|\?)/i.test(url)) return { kind: 'mp4', sourceUrl: url };
  return null;
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

function extractFirstUrlFromContent(html: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const anchor = wrapper.querySelector('a[href]');
  const href = anchor?.getAttribute('href') || '';
  if (href) return href;
  const plainText = wrapper.textContent || '';
  const matched = plainText.match(/https?:\/\/[^\s<]+/i);
  return matched?.[0] || '';
}

function getReportThumbnail(report: PressReportItem) {
  if (report.image_url) return report.image_url;
  const firstInlineImage = extractFirstImageFromHtml(report.content || '');
  if (firstInlineImage) return firstInlineImage;

  const candidateUrl = report.article_url || extractFirstUrlFromContent(report.content || '');
  if (candidateUrl) {
    const youtubeId = extractYouTubeVideoId(candidateUrl);
    if (youtubeId) {
      return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
    }
    if (isNewsLikeUrl(candidateUrl)) {
      return buildNewsThumbnailUrl(candidateUrl);
    }
  }

  return getFallbackImage(`press-${report.id}`);
}

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

function hasRichContent(html: string) {
  const plain = stripHtmlTags(html).trim();
  if (plain) return true;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  return Boolean(wrapper.querySelector('img,iframe,video'));
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

function sanitizeRichHtml(rawHtml: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = rawHtml;

  wrapper.querySelectorAll('script,style,link,meta,object,embed').forEach((node) => node.remove());

  const nodes = Array.from(wrapper.querySelectorAll('*'));
  nodes.forEach((node) => {
    const attrs = Array.from(node.attributes);
    attrs.forEach((attr) => {
      const attrName = attr.name.toLowerCase();
      if (attrName.startsWith('on') || attrName === 'srcdoc') {
        node.removeAttribute(attr.name);
      }
    });

    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) {
        node.removeAttribute('href');
      }
      node.setAttribute('rel', 'noopener noreferrer');
    }

    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (!/^(https?:\/\/|data:image\/)/i.test(src)) {
        node.remove();
      }
    }

    if (node.tagName === 'IFRAME') {
      const src = node.getAttribute('src') || '';
      if (!/^https?:\/\//i.test(src)) {
        node.remove();
        return;
      }
      node.setAttribute('loading', 'lazy');
      node.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      if (!node.getAttribute('sandbox')) {
        node.setAttribute(
          'sandbox',
          'allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation'
        );
      }
    }
  });

  return wrapper.innerHTML;
}

function sanitizeDetailContent(rawHtml: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeRichHtml(rawHtml);
  const anchors = Array.from(wrapper.querySelectorAll('a[href]'));
  anchors.forEach((anchor) => {
    if (anchor.closest('[data-article-embed="true"]')) return;
    const href = anchor.getAttribute('href') || '';
    const info = detectVideoEmbedInfo(href);
    if (info) {
      anchor.replaceWith(buildVideoEmbedNode(info));
      return;
    }
    if (isNewsLikeUrl(href)) {
      anchor.replaceWith(buildArticleEmbedNode(href));
    }
  });
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
  });
  return wrapper.innerHTML;
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
    tags: '',
    content: '',
    imageUrl: '',
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const contentEditorRef = useRef<HTMLDivElement | null>(null);
  const postContentHtmlRef = useRef('');
  const inlineImageInputRef = useRef<HTMLInputElement | null>(null);

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
  const selectedReportDetailHtml = selectedReport ? sanitizeDetailContent(selectedReport.content || '') : '';
  const selectedReportHasEmbeddedMedia = /<(img|iframe|video)\b/i.test(selectedReportDetailHtml);
  const shouldHideDetailHeroImage =
    selectedReportHasEmbeddedMedia || (selectedReport ? isGeneratedNewsThumbnail(selectedReport.image_url || '') : false);

  const openWriteModal = () => {
    setSubmitError('');
    setSubmitSuccess('');
    setForm({
      title: '',
      tags: '',
      content: '',
      imageUrl: '',
    });
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
    setForm((prev) => ({
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
      setSubmitError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    try {
      for (const file of files) {
        const optimized = await optimizeImageDataUrl(file);
        insertImageIntoEditor(optimized);
      }
      setSubmitError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '이미지 처리에 실패했습니다.';
      setSubmitError(message);
    }
  };

  const handleEditorPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const plainText = event.clipboardData.getData('text/plain');
    if (!plainText) return;

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(plainText);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const editor = contentEditorRef.current;
    if (!editor) return;
    const sanitized = sanitizeRichHtml(editor.innerHTML);
    if (sanitized !== editor.innerHTML) {
      editor.innerHTML = sanitized;
    }
    applyEditorMediaConstraints(editor);
    postContentHtmlRef.current = editor.innerHTML;
    setForm((prev) => ({ ...prev, content: editor.innerHTML }));
  };

  const handleCreatePressReport = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    const rawContent = contentEditorRef.current?.innerHTML || postContentHtmlRef.current || '';
    const transformed = transformContentWithVideoEmbeds(rawContent);
    const normalizedContent = sanitizeRichHtml(transformed.html).trim();
    const normalizedTitle = form.title.trim();
    const normalizedTags = form.tags.trim();
    const fallbackImage =
      form.imageUrl || extractFirstImageFromHtml(normalizedContent) || transformed.firstVideoThumbnail;

    if (!normalizedTitle || !hasRichContent(normalizedContent)) {
      setSubmitError('제목과 내용을 입력해 주세요.');
      return;
    }

    if (normalizedContent.length > 900_000) {
      setSubmitError('본문 이미지 용량이 큽니다. 사진 수를 줄이거나 다시 업로드해 주세요.');
      return;
    }

    const summary = stripHtmlTags(normalizedContent).trim().slice(0, 240);
    const source = normalizedTags.split(',')[0]?.trim() || '언론보도';

    setIsSubmitting(true);
    try {
      const saved = await createPressReport({
        title: normalizedTitle,
        summary,
        source,
        tags: normalizedTags,
        content: normalizedContent,
        article_url: '',
        image_url: fallbackImage,
      });

      if (saved) {
        setReports((prev) => [saved, ...prev]);
      } else {
        await loadReports();
      }
      setSubmitSuccess('언론보도 항목이 등록되었습니다.');
      setIsWriteModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
        setSubmitError('Firestore 권한으로 저장이 차단되었습니다. press_reports rules 배포를 확인해 주세요.');
      } else {
        setSubmitError('등록에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
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
                className="group text-left w-full bg-white overflow-hidden rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl transition-all flex flex-col cursor-pointer"
              >
                <div className="aspect-[2/1] overflow-hidden bg-slate-100">
                  <img
                    src={getReportThumbnail(report)}
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
                      <Tag size={13} /> {(report.tags || report.source || '').split(',')[0]}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-burgundy transition-colors">
                    {report.title}
                  </h2>
                  <p className="text-sm text-slate-600 line-clamp-3 flex-1">{stripHtmlTags(report.content || report.summary || '')}</p>
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
              {!shouldHideDetailHeroImage ? (
                <div className="aspect-[2/1] overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src={selectedReport.image_url || getFallbackImage(`press-detail-${selectedReport.id}`)}
                    alt={selectedReport.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : null}
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={13} /> {formatDate(selectedReport.date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Tag size={13} /> {selectedReport.tags || selectedReport.source || '-'}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900">{selectedReport.title}</h3>
              {selectedReport.content ? (
                <div
                  className="text-sm leading-7 text-slate-700 whitespace-pre-wrap [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-3 [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:rounded-lg [&_iframe]:my-3 [&_video]:w-full [&_video]:max-w-full [&_video]:rounded-lg [&_video]:my-3"
                  dangerouslySetInnerHTML={{ __html: selectedReportDetailHtml }}
                />
              ) : (
                <p className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">{selectedReport.summary}</p>
              )}
              {selectedReport.article_url ? (
                <a
                  href={selectedReport.article_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-burgundy px-4 py-2 text-sm font-bold text-white hover:bg-burgundy-dark transition-all"
                >
                  <Newspaper size={15} />
                  기사 원문 보기
                </a>
              ) : null}
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
            className="w-full max-w-2xl h-[82vh] max-h-[82vh] rounded-2xl bg-white shadow-2xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">언론보도 글쓰기</h2>
              <button
                type="button"
                onClick={() => setIsWriteModalOpen(false)}
                disabled={isSubmitting}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="글쓰기 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePressReport} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-sm font-semibold text-slate-700">제목</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">태그 (쉼표 구분)</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                  placeholder="언론보도,인터뷰"
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
                  onPaste={handleEditorPaste}
                  onInput={(event) => {
                    const sanitized = sanitizeRichHtml(event.currentTarget.innerHTML);
                    if (sanitized !== event.currentTarget.innerHTML) {
                      event.currentTarget.innerHTML = sanitized;
                    }
                    applyEditorMediaConstraints(event.currentTarget);
                    postContentHtmlRef.current = event.currentTarget.innerHTML;
                    setForm((prev) => ({ ...prev, content: event.currentTarget.innerHTML }));
                  }}
                  className="mt-2 h-56 overflow-y-auto w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus-within:ring-2 focus-within:ring-burgundy outline-none whitespace-pre-wrap break-words [&_img]:max-w-full [&_img]:w-full [&_img]:max-h-[220px] [&_img]:h-auto [&_img]:object-contain [&_img]:rounded-lg [&_img]:my-2"
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
