import React from 'react';
import { motion } from 'motion/react';
import { GraduationCap } from 'lucide-react';
import { CONFIG } from '../config';
import candidateProfileImage from '../../Assets/image-removebg-preview.png';

const timeline = [
  { year: '1991.3 ~ 2018', title: '교사', desc: '27년' },
  { year: '2018.3 ~ 2025.8', title: '교장', desc: '7년 6월' },
  { title: '(전)인하대학교 총동문회 상임 부회장' },
  { title: '(전)인천인재평생교육진흥원 운영위원장' },
  { title: '(전) 인천 사립교장회 회장' },
  { title: '(전)대한사립교장회 부회장' },
  { title: '(현)넥스트인천교육 상임대표' },
  { title: '(현)내리감리교회 장로' },
  { title: '(현)참살이미술관 명예 관장' },
];

export default function About() {
  return (
    <div className="pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16 items-start">
          {/* Profile Sidebar */}
          <div className="lg:col-span-1 sticky top-0 lg:top-32 z-20 lg:z-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center"
            >
              <div className="w-48 h-48 mx-auto rounded-2xl overflow-hidden mb-8 shadow-lg">
                <img src={candidateProfileImage} alt={CONFIG.candidateName} className="w-full h-full object-contain" />
              </div>
              <p className="text-burgundy font-bold mb-2 whitespace-nowrap">제22대 교육감 예비후보</p>
              <h1 className="text-3xl font-bold text-slate-900 mb-6">{CONFIG.candidateName}</h1>
              
              <div className="space-y-4 text-left border-t border-slate-100 pt-6">
                <div className="flex items-center gap-3 text-slate-700">
                  <GraduationCap size={18} className="text-burgundy" />
                  <span className="text-sm font-semibold">학력</span>
                </div>
                <ul className="space-y-2 pl-1">
                  {[
                    '창영초 졸업',
                    '선인중 졸업',
                    '인천고 졸업',
                    '인하대학교 상업교육학과 졸업',
                    '대구대학교 교육대학원 교육학 석사',
                  ].map((item, i) => (
                    <li key={i} className="text-sm text-slate-600 leading-relaxed flex items-start gap-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-burgundy/10">
                        <span className="h-2.5 w-2.5 rounded-full border border-burgundy bg-transparent" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </motion.div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-16">
            <section>
              <h2 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                <span className="w-2 h-8 bg-burgundy rounded-full" />
                걸어온 길
              </h2>
              <div className="space-y-8 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {timeline.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    viewport={{ once: true }}
                    className="relative pl-10"
                  >
                    <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-white border-4 border-burgundy z-10" />
                    {item.year ? <span className="text-sm font-bold text-burgundy mb-1 block">{item.year}</span> : null}
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h3>
                    {item.desc ? <p className="text-slate-600">{item.desc}</p> : null}
                  </motion.div>
                ))}
              </div>
            </section>

            <section className="bg-burgundy/5 p-10 rounded-3xl border border-burgundy/10">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">후보자의 철학</h2>
              <p className="text-lg text-slate-700 leading-relaxed italic">
                "교육은 아이들의 꿈을 가두는 틀이 아니라, 그 꿈이 날아오를 수 있게 하는 날개가 되어야 합니다. 
                현장의 목소리에 귀 기울이고, 아이들의 눈높이에서 정책을 만들겠습니다."
              </p>
            </section>

            <section>
              <h2 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                <span className="w-2 h-8 bg-burgundy rounded-full" />
                주요 경력 및 활동
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { title: '학력', items: ['청영초 졸업', '선인중 졸업', '인천고 졸업', '인하대학교 사업교육과 졸업', '대구대학교 교육대학원 교육학 석사'] },
                  { title: '주요 경력', items: ['전) 인하대학교 총동문회 상임 부회장', '전) 인천인재평생교육진흥원 운영위원장', '전) 인천 사립교장회 회장', '전) 대한 사립교장회 부회장', '현)넥스트인천교육 상임대표', '현)내리감리교회 장로', '현) 참살이미술관 명예관장'] },
                  { title: '임명 내역', items: ['인천 사립교장회 회장 임명장', '대한 사립교장회 부회장 임명장', '참살이미술관 명예관장 임명장'] },
                  { title: '저서', items: ['시간의 기억', '새로운 시작', '여현준의 교실 이데아'] },
                ].map((section) => (
                  <div key={section.title} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="font-bold text-burgundy mb-4">{section.title}</h3>
                    <ul className="space-y-2">
                      {section.items.map((item, i) => (
                        <li key={i} className="text-slate-600 text-sm flex items-start gap-2">
                          <span className="text-burgundy mt-1">•</span> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
