import React from 'react';
import { Link } from 'react-router-dom';
import { CONFIG } from '../config';
import { Facebook, Instagram, Youtube, Mail, MapPin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-gradient-to-b from-[#7a0f2c] via-[#660a24] to-[#4f071c] text-white/80 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-2">
            <h2 className="text-2xl font-bold text-white mb-4">교육감 예비후보<br />{CONFIG.candidateName} 캠프</h2>
            <p className="text-white/75 mb-6 max-w-md">
              {CONFIG.slogan}
            </p>
            <div className="flex space-x-4">
              <a href={CONFIG.contact.sns.facebook} className="p-2 bg-white/10 border border-white/20 rounded-full hover:bg-white/20 transition-colors">
                <Facebook size={20} />
              </a>
              <a
                href={CONFIG.contact.sns.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-white/10 border border-white/20 rounded-full hover:bg-white/20 transition-colors"
              >
                <Instagram size={20} />
              </a>
              <a
                href={CONFIG.contact.sns.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-white/10 border border-white/20 rounded-full hover:bg-white/20 transition-colors"
              >
                <Youtube size={20} />
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="text-gold font-bold mb-4">바로가기</h3>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm md:block md:space-y-2">
              <li className="whitespace-nowrap"><Link to="/about" className="hover:text-gold transition-colors">후보 소개</Link></li>
              <li className="whitespace-nowrap"><Link to="/policies" className="hover:text-gold transition-colors">핵심 정책</Link></li>
              <li className="whitespace-nowrap"><Link to="/posts" className="hover:text-gold transition-colors">최신 소식</Link></li>
              <li className="whitespace-nowrap"><Link to="/events" className="hover:text-gold transition-colors">행사 일정</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-gold font-bold mb-4">연락처</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <MapPin size={18} className="text-gold shrink-0" />
                <span>인천 미추홀구 경인로425번길 6 3층</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail size={18} className="text-gold shrink-0" />
                <span>incheon6455@naver.com</span>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-white/20 text-center text-xs text-white/60">
          <p>© 2026 교육감 예비후보<br />{CONFIG.candidateName} 캠프. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
