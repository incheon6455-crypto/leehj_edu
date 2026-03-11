import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Send, Phone, Mail, MapPin, CheckCircle2, HeartHandshake } from 'lucide-react';
import { CONFIG } from '../config';
import { submitContact } from '../lib/firebaseData';

export default function Contact() {
  const [inquiryData, setInquiryData] = useState({ name: '', phone: '', message: '' });
  const [isRobot, setIsRobot] = useState(false);
  const [submittedType, setSubmittedType] = useState<'inquiry' | null>(null);

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRobot) {
      alert('로봇이 아님을 확인해 주세요.');
      return;
    }

    submitContact(inquiryData)
      .then(() => {
        setSubmittedType('inquiry');
      })
      .catch(() => {
        alert('문의 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      });
  };

  if (submittedType) {
    return (
      <div className="pt-48 pb-24 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6 max-w-md mx-auto px-4"
        >
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">문의가 접수되었습니다</h1>
          <p className="text-slate-600">
            소중한 의견 감사드립니다. 이현준 캠프에서 확인 후 신속하게 연락드리겠습니다.
          </p>
          <button
            onClick={() => setSubmittedType(null)}
            className="text-burgundy font-bold hover:underline"
          >
            계속 작성하기
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">후원/문의</h1>
          <p className="text-slate-600 text-lg">
            후원 안내와 정책 문의를 한 페이지에서 확인할 수 있습니다.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 items-start">
          <div>
            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-burgundy/5 text-burgundy rounded-xl flex items-center justify-center shrink-0">
                  <MapPin size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">캠프 위치</h3>
                  <p className="text-slate-600 text-sm">{CONFIG.contact.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-burgundy/5 text-burgundy rounded-xl flex items-center justify-center shrink-0">
                  <Phone size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">전화 번호</h3>
                  <p className="text-slate-600 text-sm">{CONFIG.contact.phone}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-burgundy/5 text-burgundy rounded-xl flex items-center justify-center shrink-0">
                  <Mail size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">이메일</h3>
                  <p className="text-slate-600 text-sm">{CONFIG.contact.email}</p>
                </div>
              </div>
            </div>

            <div className="mt-10 rounded-3xl border border-burgundy/15 bg-burgundy/5 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-burgundy text-white rounded-xl flex items-center justify-center">
                  <HeartHandshake size={20} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">후원/참여 안내</h2>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                정기 후원, 일시 후원, 자원봉사 참여를 신청하시면 담당자가 확인 후 개별 안내드립니다.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white p-4 border border-slate-100">
                  <p className="text-slate-400 mb-1">문의 전화</p>
                  <p className="font-bold text-slate-800">{CONFIG.contact.phone}</p>
                </div>
                <div className="rounded-xl bg-white p-4 border border-slate-100">
                  <p className="text-slate-400 mb-1">문의 이메일</p>
                  <p className="font-bold text-slate-800">{CONFIG.contact.email}</p>
                </div>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white p-8 md:p-10 rounded-3xl shadow-xl border border-slate-100 lg:-mt-[100px]"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">문의하기</h2>
            <form onSubmit={handleInquirySubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">이름</label>
                <input
                  required
                  type="text"
                  placeholder="성함을 입력해 주세요"
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-burgundy transition-all"
                  value={inquiryData.name}
                  onChange={(e) => setInquiryData({ ...inquiryData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">연락처</label>
                <input
                  required
                  type="tel"
                  placeholder="연락 가능한 번호를 입력해 주세요"
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-burgundy transition-all"
                  value={inquiryData.phone}
                  onChange={(e) => setInquiryData({ ...inquiryData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">문의 내용</label>
                <textarea
                  required
                  rows={5}
                  placeholder="의견이나 궁금하신 점을 자유롭게 적어주세요"
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-burgundy transition-all resize-none"
                  value={inquiryData.message}
                  onChange={(e) => setInquiryData({ ...inquiryData, message: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <input
                  type="checkbox"
                  id="robot"
                  className="w-5 h-5 rounded border-slate-300 text-burgundy focus:ring-burgundy"
                  checked={isRobot}
                  onChange={(e) => setIsRobot(e.target.checked)}
                />
                <label htmlFor="robot" className="text-sm text-slate-600 cursor-pointer">
                  로봇이 아닙니다 (필수 확인)
                </label>
              </div>

              <button
                type="submit"
                className="w-full bg-burgundy text-white py-5 rounded-xl font-bold text-lg hover:bg-burgundy-dark transition-all flex items-center justify-center gap-3 shadow-lg shadow-burgundy/20"
              >
                <Send size={20} /> 메시지 보내기
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
