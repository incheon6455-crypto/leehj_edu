import React, { useState } from 'react';
import { motion } from 'motion/react';
import type { FirebaseError } from 'firebase/app';
import { Lock, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, fetchSignInMethodsForEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  ADMIN_SESSION_STORAGE_KEY,
  createAdminSession,
  getAdminAccountProfile,
  upsertAdminAccount,
  type AdminIdentityProfile,
} from '../lib/firebaseData';

const ADMIN_SESSION_KEY = 'admin_dashboard_auth';
const ADMIN_PROFILE_STORAGE_KEY = 'admin_profile_cache';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupId, setSignupId] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const [signupError, setSignupError] = useState('');
  const [isSignupSubmitting, setIsSignupSubmitting] = useState(false);
  const [isCheckingSignupId, setIsCheckingSignupId] = useState(false);
  const [signupIdCheckMessage, setSignupIdCheckMessage] = useState('');
  const [isSignupIdChecked, setIsSignupIdChecked] = useState(false);
  const [checkedSignupId, setCheckedSignupId] = useState('');

  const normalizeId = (raw: string) => raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const toHiddenEmail = (id: string) => `${normalizeId(id)}@myapp.com`;

  const applyAdminSession = async (profile: Partial<AdminIdentityProfile>) => {
    const sessionToken = await createAdminSession(profile);
    localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, sessionToken);
    localStorage.setItem(ADMIN_SESSION_KEY, '1');
    localStorage.setItem(
      ADMIN_PROFILE_STORAGE_KEY,
      JSON.stringify({
        username: String(profile.username || 'admin'),
        name: String(profile.name || profile.username || '관리자'),
        role: String(profile.role || 'admin'),
      })
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedId = normalizeId(username);

    if (normalizedId === 'admin' && password === 'admin1234') {
      try {
        await applyAdminSession({ username: 'admin', name: '관리자', role: 'admin' });
        setError('');
        navigate('/admin');
      } catch {
        setError('로그인 세션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      return;
    }

    if (!normalizedId) {
      setError('아이디를 확인해 주세요.');
      return;
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, toHiddenEmail(normalizedId), password);

      try {
        await upsertAdminAccount(credential.user.uid, normalizedId);
      } catch (profileError) {
        console.error('admin profile upsert failed after login', profileError);
      }

      let resolvedProfile: Partial<AdminIdentityProfile> = { username: normalizedId, name: normalizedId, role: 'admin' };
      try {
        const profile = await getAdminAccountProfile(credential.user.uid);
        if (profile) resolvedProfile = profile;
      } catch (profileLoadError) {
        console.error('admin profile read failed after login', profileLoadError);
      }

      try {
        await applyAdminSession(resolvedProfile);
      } catch (sessionError) {
        console.error('admin session create failed after login', sessionError);
        localStorage.setItem(ADMIN_SESSION_KEY, '1');
        localStorage.setItem(
          ADMIN_PROFILE_STORAGE_KEY,
          JSON.stringify({
            username: String(resolvedProfile.username || normalizedId),
            name: String(resolvedProfile.name || normalizedId),
            role: String(resolvedProfile.role || 'admin'),
          })
        );
      }

      setError('');
      navigate('/admin');
    } catch (error) {
      const authError = error as FirebaseError;
      if (
        authError?.code === 'auth/user-not-found' ||
        authError?.code === 'auth/wrong-password' ||
        authError?.code === 'auth/invalid-credential'
      ) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setError('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    }
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = signupName.trim();
    const normalizedId = normalizeId(signupId);

    if (!trimmedName) {
      setSignupError('이름을 입력해 주세요.');
      return;
    }
    if (!normalizedId) {
      setSignupError('아이디는 영문/숫자로 입력해 주세요.');
      return;
    }
    if (!isSignupIdChecked || checkedSignupId !== normalizedId) {
      setSignupError('아이디 중복확인을 먼저 진행해 주세요.');
      return;
    }
    if (signupPassword.length < 6) {
      setSignupError('비밀번호는 6자 이상 입력해 주세요.');
      return;
    }
    if (signupPassword !== signupPasswordConfirm) {
      setSignupError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSignupSubmitting(true);
    setSignupError('');
    try {
      const credential = await createUserWithEmailAndPassword(auth, toHiddenEmail(normalizedId), signupPassword);

      try {
        await upsertAdminAccount(credential.user.uid, normalizedId, trimmedName);
      } catch (profileError) {
        console.error('admin profile upsert failed after signup', profileError);
      }

      try {
        await applyAdminSession({ username: normalizedId, name: trimmedName, role: 'admin' });
      } catch (sessionError) {
        console.error('admin session create failed after signup', sessionError);
        localStorage.setItem(ADMIN_SESSION_KEY, '1');
        localStorage.setItem(
          ADMIN_PROFILE_STORAGE_KEY,
          JSON.stringify({ username: normalizedId, name: trimmedName, role: 'admin' })
        );
      }

      setIsSignupOpen(false);
      setSignupName('');
      setSignupId('');
      setSignupPassword('');
      setSignupPasswordConfirm('');
      setSignupIdCheckMessage('');
      setIsSignupIdChecked(false);
      setCheckedSignupId('');
      setError('');
      navigate('/admin');
    } catch (error) {
      const authError = error as FirebaseError;
      if (authError?.code === 'auth/email-already-in-use') {
        setSignupError('이미 사용 중인 아이디입니다.');
      } else {
        setSignupError('회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setIsSignupSubmitting(false);
    }
  };

  const handleCheckSignupIdDuplicate = async () => {
    const normalizedId = normalizeId(signupId);
    setSignupError('');
    setSignupIdCheckMessage('');
    setIsSignupIdChecked(false);
    setCheckedSignupId('');

    if (!normalizedId) {
      setSignupIdCheckMessage('아이디는 영문/숫자로 입력해 주세요.');
      return;
    }
    if (normalizedId === 'admin') {
      setSignupIdCheckMessage('사용할 수 없는 아이디입니다.');
      return;
    }

    setIsCheckingSignupId(true);
    try {
      const methods = await fetchSignInMethodsForEmail(auth, toHiddenEmail(normalizedId));
      if (methods.length > 0) {
        setSignupIdCheckMessage('이미 사용 중인 아이디입니다.');
        return;
      }
      setSignupIdCheckMessage('사용 가능한 아이디입니다.');
      setIsSignupIdChecked(true);
      setCheckedSignupId(normalizedId);
    } catch {
      setSignupIdCheckMessage('중복확인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsCheckingSignupId(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 pt-28 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-xl p-8"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-burgundy/5 text-burgundy rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={30} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">로그인</h1>
          <p className="text-sm text-slate-500 mt-1">관리 페이지 접근을 위해 로그인해 주세요.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-semibold text-slate-700">
              아이디
            </label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-burgundy"
                placeholder="아이디 입력"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-semibold text-slate-700">
              비밀번호
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-burgundy"
                placeholder="비밀번호 입력"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-burgundy text-white font-bold hover:bg-burgundy-dark transition-colors"
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => {
              setSignupError('');
              setIsSignupOpen(true);
            }}
            className="hidden w-full py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            회원가입
          </button>
        </form>
      </motion.div>

      {isSignupOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 px-4 py-6 flex items-center justify-center"
          onClick={() => {
            if (isSignupSubmitting) return;
            setIsSignupOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-slate-100 shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">회원가입</h2>
              <button
                type="button"
                onClick={() => setIsSignupOpen(false)}
                disabled={isSignupSubmitting}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                닫기
              </button>
            </div>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">이름</label>
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                  placeholder="이름 입력"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">아이디</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={signupId}
                    onChange={(e) => {
                      setSignupId(e.target.value);
                      setSignupIdCheckMessage('');
                      setIsSignupIdChecked(false);
                      setCheckedSignupId('');
                    }}
                    className="w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                    placeholder="영문/숫자 아이디"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleCheckSignupIdDuplicate}
                    disabled={isCheckingSignupId}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {isCheckingSignupId ? '확인중...' : '중복확인'}
                  </button>
                </div>
                {signupIdCheckMessage ? (
                  <p className={`mt-1 text-xs ${isSignupIdChecked ? 'text-emerald-600' : 'text-red-600'}`}>{signupIdCheckMessage}</p>
                ) : null}
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">비밀번호</label>
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                  placeholder="6자 이상"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">비밀번호 확인</label>
                <input
                  type="password"
                  value={signupPasswordConfirm}
                  onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-burgundy"
                  required
                />
              </div>
              {signupError ? <p className="text-sm text-red-600">{signupError}</p> : null}
              <button
                type="submit"
                disabled={isSignupSubmitting}
                className="w-full py-3 rounded-xl bg-burgundy text-white font-bold hover:bg-burgundy-dark disabled:opacity-60"
              >
                {isSignupSubmitting ? '가입 중...' : '회원가입'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
