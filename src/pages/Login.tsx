import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ADMIN_SESSION_STORAGE_KEY, createAdminSession } from '../lib/firebaseData';

const ADMIN_SESSION_KEY = 'admin_dashboard_auth';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (username === 'admin' && password === 'admin1234') {
      try {
        const sessionToken = await createAdminSession();
        localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, sessionToken);
        localStorage.setItem(ADMIN_SESSION_KEY, '1');
        setError('');
        navigate('/admin');
      } catch {
        setError('로그인 세션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      return;
    }

    setError('아이디 또는 비밀번호가 올바르지 않습니다.');
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
        </form>
      </motion.div>
    </div>
  );
}
