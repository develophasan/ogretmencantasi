import { GraduationCap, Sparkle, Phone, ArrowRight } from "@phosphor-icons/react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const { phoneLogin } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("Lütfen telefon numaranızı girin.");
      return;
    }
    setLoading(true);
    try {
      await phoneLogin(phone);
      toast.success("Başarıyla giriş yapıldı.");
      navigate("/dashboard");
    } catch (error) {
      console.error("Login error details:", error);
      const msg = error.response?.data?.detail || "Giriş yapılırken bir hata oluştu.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-5 bg-[#FDFBF7]">
      {/* Left panel */}
      <div className="relative md:col-span-3 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1770520219404-b1c2296ea79a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NjV8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMG5hdHVyYWwlMjBiYWNrZ3JvdW5kJTIwdGV4dHVyZSUyMHBhc3RlbHxlbnwwfHx8fDE3NzY2Njk5NDR8MA&ixlib=rb-4.1.0&q=85"
          alt="background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#4B6858]/70 via-[#4B6858]/40 to-[#D48D7C]/40" />
        <div className="absolute inset-0 grain-overlay" />
        <div className="relative z-10 h-full flex flex-col justify-between p-8 sm:p-12 lg:p-16 text-white">
          <div className="flex items-center gap-3 fade-up">
            <div className="h-11 w-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <GraduationCap size={24} weight="duotone" />
            </div>
            <span className="font-heading text-lg">Öğretmen Çantası</span>
          </div>

          <div className="max-w-lg space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur border border-white/20 fade-up fade-up-delay-1">
              <Sparkle size={14} weight="fill" />
              <span className="text-xs tracking-widest uppercase">Okul Öncesi Yönetim</span>
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl leading-[1.05] fade-up fade-up-delay-2">
              Geleceği şekillendiren ellere, hoş geldiniz.
            </h1>
            <p className="text-white/85 text-base sm:text-lg leading-relaxed max-w-md fade-up fade-up-delay-3">
              Sınıfınızı, öğrencilerinizi ve rapor taslaklarınızı tek bir sakin arayüzde yönetin. Kahvaltıdan uyku saatine, her ayrıntı elinizin altında.
            </p>
          </div>

          <p className="text-white/70 text-xs fade-up fade-up-delay-4">
            © {new Date().getFullYear()} Öğretmen Çantası · Öğretmenler için tasarlandı.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="md:col-span-2 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-sm space-y-8 fade-up">
          <div>
            <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">
              Oturum Aç
            </p>
            <h2 className="font-heading text-3xl sm:text-4xl mt-3">Sınıfınıza Girin</h2>
            <div className="text-[#6B7280] mt-3 leading-relaxed flex flex-col gap-2">
              <p>Telefon numaranızla giriş yapın.</p>
              <p className="text-xs">
                Hesabınız yok mu?{" "}
                <Link to="/register-request" className="text-[#4B6858] font-semibold hover:underline">
                  Kayıt Talebi Oluşturun
                </Link>
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280]">
                <Phone size={18} weight="duotone" />
              </div>
              <input
                type="tel"
                placeholder="5XX XXX XX XX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#F1EDE4]/50 border border-[#E6E2D6] rounded-2xl pl-11 pr-4 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#4B6858]/20 focus:border-[#4B6858] transition-all"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-[#28332D] hover:bg-[#111816] disabled:opacity-50 text-white rounded-full px-6 py-4 transition-all duration-200 hover:-translate-y-0.5 shadow-sm"
            >
              {loading ? (
                "Giriş yapılıyor..."
              ) : (
                <>
                  <span className="text-sm font-medium">Giriş Yap</span>
                  <ArrowRight size={18} weight="bold" />
                </>
              )}
            </button>
          </form>

          <div className="soft-divider" />

          <ul className="space-y-3 text-sm text-[#6B7280]">
            <li className="flex items-start gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#4B6858]" />
              Sınıf saatlerinizi ve eğitim modelinizi tek yerde tutar.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#4B6858]" />
              Öğrenci kartları, sağlık notları ve veli iletişimi.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#4B6858]" />
              Dönem sonu rapor taslakları için sade bir zemin.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
