import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Sparkles, Shield, ArrowRight } from 'lucide-react';

export default function About() {
  const navigate = useNavigate();

  const values = [
    { icon: <Shield size={24} />, title: 'Uncompromising Quality', desc: 'Premium materials and careful attention to every detail.', color: '#F4C2A1' },
    { icon: <Sparkles size={24} />, title: 'Effortless Creation', desc: 'Easy for anyone to create beautiful albums in minutes.', color: '#B8A9D9' },
    { icon: <Heart size={24} />, title: 'Made with Heart', desc: 'A family business that cares about your memories.', color: '#9BCFB8' },
  ];

  const steps = ['You Create', 'We Review', 'Print & Bind', 'Quality Check', 'Delivered'];

  return (
    <div className="min-h-screen bg-[#FFF8F0] pt-24 pb-12">
      {/* Hero */}
      <div className="text-center px-6 py-16">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="font-display text-5xl font-bold text-[#2D2D2D]">We're Megy Prints</motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mt-4 text-lg text-[#6B6B6B] max-w-[600px] mx-auto">A family-owned printing business dedicated to turning your precious memories into beautiful keepsakes you'll treasure forever.</motion.p>
      </div>

      {/* Values */}
      <div className="max-w-[1000px] mx-auto px-6 grid md:grid-cols-3 gap-6 mb-16">
        {values.map((v, i) => (
          <motion.div key={v.title} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * i }}
            className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${v.color}20`, color: v.color }}>{v.icon}</div>
            <h3 className="font-display text-lg font-semibold text-[#2D2D2D]">{v.title}</h3>
            <p className="text-sm text-[#6B6B6B] mt-2">{v.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Process */}
      <div className="max-w-[800px] mx-auto px-6 mb-16">
        <h2 className="font-display text-3xl font-bold text-center text-[#2D2D2D] mb-8">How It Works</h2>
        <div className="flex items-center justify-between">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#FDE8E4] flex items-center justify-center text-[#E8A598] font-display font-bold text-lg mx-auto">{i + 1}</div>
                <p className="text-xs font-medium text-[#2D2D2D] mt-2">{step}</p>
              </div>
              {i < steps.length - 1 && <div className="w-12 sm:w-20 h-px bg-[#F4C2A1] mx-1 sm:mx-2" />}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center px-6">
        <button onClick={() => navigate('/builder')} className="px-8 py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 inline-flex items-center gap-2 transition-all">
          Start Your Album <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
