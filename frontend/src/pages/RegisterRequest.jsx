import { GraduationCap, Sparkle, Phone, User, Student, Envelope, ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function RegisterRequest() {
  const [formData, setFormData] = useState({
    name: "",
    school_name: "",
    email: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/register-request", formData);
      setSubmitted(true);
    } catch (error) {
      const msg = error.response?.data?.detail || "İstek gönderilirken bir hata oluştu.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center space-y-6">
          <div className="h-16 w-16 bg-[#4B6858]/10 text-[#4B6858] rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={40} weight="duotone" />
          </div>
          <h1 className="font-heading text-2xl text-[#28332D]">Talebiniz Alındı</h1>
          <p className="text-[#6B7280] leading-relaxed">
            Kayıt talebiniz başarıyla yönetime iletildi. Talebiniz onaylandığında telefon numaranızla giriş yapabilirsiniz.
          </p>
          <Link
            to="/login"
            className="inline-block w-full bg-[#28332D] text-white rounded-full py-4 font-medium transition-all hover:bg-[#111816]"
          >
            Giriş Ekranına Dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid md:grid-cols-5 bg-[#FDFBF7]">
      {/* Left panel */}
      <div className="relative md:col-span-2 hidden md:block overflow-hidden">
        <div className="absolute inset-0 bg-[#4B6858]" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <GraduationCap size={28} weight="duotone" />
            <span className="font-heading text-xl">Öğretmen Çantası</span>
          </div>
          <div className="space-y-6">
            <Sparkle size={48} weight="duotone" className="text-white/20" />
            <h2 className="font-heading text-3xl leading-tight">Aramıza katılmak için ilk adımı atın.</h2>
            <p className="text-white/80 leading-relaxed">
              Öğretmen Çantası ailesine katılmak üzere talebinizi iletin. Yönetici onayının ardından tüm özelliklere erişebileceksiniz.
            </p>
          </div>
          <p className="text-white/40 text-[10px] uppercase tracking-widest">Premium Eğitmen Topluluğu</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="md:col-span-3 flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-lg space-y-10">
          <div className="flex items-center gap-4">
            <Link to="/login" className="h-10 w-10 rounded-full border border-[#E6E2D6] flex items-center justify-center text-[#6B7280] hover:bg-[#F1EDE4] transition-all">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="font-heading text-3xl text-[#28332D]">Kayıt Talebi</h1>
              <p className="text-[#6B7280] mt-1">Lütfen bilgilerinizi eksiksiz doldurun.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] ml-1">Ad Soyad</label>
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    required
                    type="text"
                    placeholder="Gamze H."
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-white border border-[#E6E2D6] rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-2 focus:ring-[#4B6858]/10 focus:border-[#4B6858] transition-all"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] ml-1">Okul Adı</label>
                <div className="relative">
                  <Student size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    required
                    type="text"
                    placeholder="Güneş Anaokulu"
                    value={formData.school_name}
                    onChange={(e) => setFormData({...formData, school_name: e.target.value})}
                    className="w-full bg-white border border-[#E6E2D6] rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-2 focus:ring-[#4B6858]/10 focus:border-[#4B6858] transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] ml-1">E-posta</label>
              <div className="relative">
                <Envelope size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  required
                  type="email"
                  placeholder="gamze@örnek.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-white border border-[#E6E2D6] rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-2 focus:ring-[#4B6858]/10 focus:border-[#4B6858] transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] ml-1">Telefon</label>
              <div className="relative">
                <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  required
                  type="tel"
                  placeholder="5XX XXX XX XX"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full bg-white border border-[#E6E2D6] rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-2 focus:ring-[#4B6858]/10 focus:border-[#4B6858] transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#28332D] hover:bg-[#111816] text-white rounded-full py-5 font-medium transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading ? "Talep İletiliyor..." : "Kayıt Talebi Gönder"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
