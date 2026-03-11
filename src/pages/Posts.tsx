import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Tag, ArrowRight, X, ImagePlus } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { formatDate, stripHtmlTags } from '../lib/utils';
import { createPost, getPosts, type Post } from '../lib/firebaseData';

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function optimizeImageDataUrl(file: File) {
  const source = await fileToDataUrl(file);
  const image = new Image();
  image.src = source;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('이미지 미리보기를 생성하지 못했습니다.'));
  });

  const maxWidth = 960;
  const maxHeight = 960;
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
  while (result.length > 500_000 && quality > 0.55) {
    quality -= 0.08;
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
  return Boolean(wrapper.querySelector('img'));
}

function getPostPreviewText(content: string) {
  if (content.includes('data:image/')) {
    return '이미지와 텍스트가 포함된 소식입니다.';
  }
  return stripHtmlTags(content);
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
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
  const isLatestOnly = new URLSearchParams(location.search).get('source') === 'latest';

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

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPostSubmitError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    try {
      const optimized = await optimizeImageDataUrl(file);
      setPostForm((prev) => ({ ...prev, imageUrl: optimized }));
      setPostSubmitError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '이미지 처리에 실패했습니다.';
      setPostSubmitError(message);
    }
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
    imageNode.style.height = 'auto';
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

    const nextHtml = editor.innerHTML;
    postContentHtmlRef.current = nextHtml;
    setPostForm((prev) => ({
      ...prev,
      imageUrl: prev.imageUrl || extractFirstImageFromHtml(nextHtml),
    }));
  };

  const handleInlineImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPostSubmitError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    try {
      const optimized = await optimizeImageDataUrl(file);
      insertImageIntoEditor(optimized);
      setPostSubmitError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '이미지 처리에 실패했습니다.';
      setPostSubmitError(message);
    }
  };

  const handleSubmitPost = async (event: React.FormEvent) => {
    event.preventDefault();
    const rawContent = contentEditorRef.current?.innerHTML || postContentHtmlRef.current || '';
    const normalizedContent = rawContent.trim();
    const fallbackImage = postForm.imageUrl || extractFirstImageFromHtml(normalizedContent);
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

  return (
    <div className="pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-4">활동 소식</h1>
            <p className="text-slate-600">교육감 예비<br />후보 이현준의 생생한 활동 현장을 전해드립니다.</p>
          </div>
          {!isLatestOnly && (
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
              <div className="aspect-[2/1] overflow-hidden rounded-xl bg-slate-100">
                <img
                  src={selectedPost.image_url || `https://picsum.photos/seed/post${selectedPost.id}/1200/675`}
                  alt={selectedPost.title}
                  className="w-full h-full object-cover"
                />
              </div>
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
                className="text-sm leading-7 text-slate-700 whitespace-pre-wrap [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-3"
                dangerouslySetInnerHTML={{ __html: selectedPost.content }}
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
            className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
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

            <form onSubmit={handleSubmitPost} className="p-5 space-y-4">
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
                    onChange={handleInlineImageChange}
                    className="hidden"
                  />
                </div>
                <div
                  ref={contentEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(event) =>
                    {
                      postContentHtmlRef.current = event.currentTarget.innerHTML;
                    }
                  }
                  className="mt-2 min-h-44 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus-within:ring-2 focus-within:ring-burgundy outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">이미지</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
                {postForm.imageUrl ? (
                  <img src={postForm.imageUrl} alt="업로드 미리보기" className="mt-3 w-full h-44 object-cover rounded-lg border border-slate-100" />
                ) : null}
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
