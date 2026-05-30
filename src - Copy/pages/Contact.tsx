import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, ChevronDown, Send, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const faqs = [
  { q: 'How long does printing take?', a: 'Most albums are printed and ready within 5-7 business days. Premium options may take 2-3 additional days.' },
  { q: 'What file formats do you accept?', a: 'We accept JPG and PNG files. Photos should be at least 1MB for best print quality.' },
  { q: 'Can I edit my album after submitting?', a: 'Contact us within 2 hours of submission and we\'ll help you make changes.' },
  { q: 'What is your refund policy?', a: 'Since albums are custom printed, we don\'t offer refunds. However, if there\'s a defect, we\'ll reprint at no charge.' },
  { q: 'Do you offer bulk discounts?', a: 'Yes! Schools and events ordering 10+ albums receive special pricing. Contact us for details.' },
  { q: 'Can I see a preview before printing?', a: 'Yes! Our preview feature shows exactly how your album will look.' },
  { q: 'How do I pay?', a: 'We currently accept bank transfer and cash on delivery. Online payment coming soon!' },
];

export default function Contact() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', email: '', subject: 'General Inquiry', message: '' });
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0] pt-24 pb-12 px-6">
      <div className="max-w-[1000px] mx-auto">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-bold text-[#2D2D2D]">Get in Touch</h1>
          <p className="text-[#6B6B6B] mt-2">We'd love to hear from you</p>
        </div>

        {/* Contact methods */}
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          {[
            { icon: <Phone size={20} />, title: 'Call Us', value: '(555) 123-4567', note: 'Mon-Sat, 9AM-6PM', bg: '#FDE8E4' },
            { icon: <Mail size={20} />, title: 'Email Us', value: 'hello@megyprints.com', note: 'Reply within 24h', bg: '#E8E0F0' },
            { icon: <MapPin size={20} />, title: 'Visit Us', value: '123 Main Street', note: 'Mon-Sat, 9AM-6PM', bg: '#E4F0E0' },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl p-5 text-center" style={{ backgroundColor: c.bg }}>
              <div className="text-[#6B6B6B] mb-2 flex justify-center">{c.icon}</div>
              <h3 className="font-medium text-[#2D2D2D]">{c.title}</h3>
              <p className="text-sm text-[#4A4A4A] font-medium mt-1">{c.value}</p>
              <p className="text-xs text-[#9B9B9B]">{c.note}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Contact Form */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            {sent ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-[#E4F0E0] flex items-center justify-center mx-auto mb-3">
                  <Send size={20} className="text-[#2E7D4A]" />
                </div>
                <h3 className="font-display text-lg font-semibold text-[#2D2D2D]">Message Sent!</h3>
                <p className="text-sm text-[#6B6B6B] mt-1">We'll get back to you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded-lg px-3 py-2 text-sm" placeholder="Your Name" />
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded-lg px-3 py-2 text-sm" placeholder="Email Address" />
                <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded-lg px-3 py-2 text-sm">
                  {['General Inquiry', 'Order Question', 'Custom Album', 'Feedback', 'Other'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded-lg px-3 py-2 text-sm h-24 resize-none" placeholder="Your message..." />
                <button type="submit" className="w-full py-2.5 bg-[#F4C2A1] text-white font-medium rounded-lg hover:brightness-105 transition-all">
                  Send Message
                </button>
              </form>
            )}
          </div>

          {/* FAQ */}
          <div>
            <h3 className="font-display text-lg font-semibold text-[#2D2D2D] mb-4">Frequently Asked</h3>
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left">
                    <span className="text-sm font-medium text-[#2D2D2D]">{faq.q}</span>
                    <ChevronDown size={16} className="text-[#9B9B9B] flex-shrink-0 transition-transform" style={{ transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                  {openFaq === i && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="overflow-hidden">
                      <p className="px-4 pb-3 text-sm text-[#6B6B6B]">{faq.a}</p>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-10">
          <button onClick={() => navigate('/builder')} className="px-8 py-3 bg-[#F4C2A1] text-white font-semibold rounded-xl hover:brightness-105 inline-flex items-center gap-2 transition-all">
            Create Your Album <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
