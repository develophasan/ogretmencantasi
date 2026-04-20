import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  BookOpen,
  Clock,
  Buildings,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
} from "@phosphor-icons/react";

export default function Setup() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      school_name: user?.school_name || "",
      education_model: user?.education_model || "",
      arrival_time: user?.class_schedule?.arrival_time || "08:30",
      departure_time: user?.class_schedule?.departure_time || "16:00",
      breakfast_time: user?.class_schedule?.breakfast_time || "09:30",
      lunch_time: user?.class_schedule?.lunch_time || "12:00",
      afternoon_snack_time: user?.class_schedule?.afternoon_snack_time || "14:30",
    },
  });

  const educationModel = watch("education_model");
  const schoolName = watch("school_name");

  const nextStep = async () => {
    if (step === 1) {
      if (!schoolName?.trim()) {
        toast.error("Lütfen okul adını girin.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!educationModel) {
        toast.error("Bir eğitim modeli seçin.");
        return;
      }
      setStep(3);
      return;
    }
  };

  const onFinish = async (data) => {
    setSaving(true);
    try {
      await api.put("/class-settings", {
        school_name: data.school_name,
        education_model: data.education_model,
        class_schedule: {
          arrival_time: data.arrival_time,
          departure_time: data.departure_time,
          breakfast_time: data.breakfast_time,
          lunch_time: data.lunch_time,
          afternoon_snack_time: data.afternoon_snack_time,
        },
        setup_completed: true,
      });
      await refreshUser();
      toast.success("Kurulum tamamlandı. Sınıfınız hazır!");
      navigate("/dashboard", { replace: true });
    } catch (_e) {
      toast.error("Bir şey ters gitti, lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl fade-up">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-10">
          {[1, 2, 3].map((n, i) => (
            <div key={n} className="flex items-center flex-1 last:flex-none">
              <div
                data-testid={`step-indicator-${n}`}
                className={`h-10 w-10 rounded-full flex items-center justify-center font-heading text-sm transition-all duration-300 ${
                  step >= n
                    ? "bg-[#4B6858] text-white"
                    : "bg-white border border-[#E6E2D6] text-[#6B7280]"
                }`}
              >
                {step > n ? <CheckCircle size={20} weight="fill" /> : n}
              </div>
              {i < 2 && (
                <div className={`h-0.5 flex-1 mx-3 transition-all duration-500 ${step > n ? "bg-[#4B6858]" : "bg-[#E6E2D6]"}`} />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onFinish)} className="bg-white rounded-3xl border border-[#E6E2D6] shadow-sm p-8 sm:p-10">
          {step === 1 && (
            <div className="space-y-6 fade-up" data-testid="setup-step-1">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
                  <Buildings size={22} weight="duotone" className="text-[#4B6858]" />
                </div>
                <div>
                  <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Adım 1 / 3</p>
                  <h2 className="font-heading text-2xl sm:text-3xl">Okulunuz</h2>
                </div>
              </div>
              <p className="text-[#6B7280] leading-relaxed">
                Hoş geldiniz <strong className="text-[#28332D]">{user?.name?.split(" ")[0]}</strong>. Sınıf panelinizi hazırlamadan önce okulunuzun adını öğrenelim.
              </p>

              <label className="block">
                <span className="text-sm font-medium">Okul Adı *</span>
                <input
                  {...register("school_name", { required: true })}
                  type="text"
                  placeholder="örn. Küçük Yıldızlar Anaokulu"
                  data-testid="input-school-name"
                  className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-[#FDFBF7] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#4B6858] focus:border-transparent transition-all"
                />
                {errors.school_name && <span className="text-xs text-[#C86B5E] mt-1 block">Okul adı zorunludur.</span>}
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 fade-up" data-testid="setup-step-2">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
                  <BookOpen size={22} weight="duotone" className="text-[#4B6858]" />
                </div>
                <div>
                  <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Adım 2 / 3</p>
                  <h2 className="font-heading text-2xl sm:text-3xl">Eğitim Modeli</h2>
                </div>
              </div>
              <p className="text-[#6B7280] leading-relaxed">
                Sınıfınızı hangi çerçevede işliyorsunuz? Raporlar ve önerilerde bu seçim temel alınır.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { value: "Maarif", title: "Maarif Modeli", desc: "MEB 2024 Okul Öncesi Eğitim Programı." },
                  { value: "ECE", title: "EÇE Modeli", desc: "Early Childhood Education, proje tabanlı." },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`education-model-${opt.value}`}
                    onClick={() => setValue("education_model", opt.value, { shouldValidate: true })}
                    className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 hover:-translate-y-0.5 ${
                      educationModel === opt.value
                        ? "border-[#4B6858] bg-[#F1EDE4]"
                        : "border-[#E6E2D6] bg-white hover:border-[#4B6858]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-heading text-lg">{opt.title}</span>
                      {educationModel === opt.value && <CheckCircle size={22} weight="fill" className="text-[#4B6858]" />}
                    </div>
                    <p className="text-sm text-[#6B7280]">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <input type="hidden" {...register("education_model", { required: true })} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 fade-up" data-testid="setup-step-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
                  <Clock size={22} weight="duotone" className="text-[#4B6858]" />
                </div>
                <div>
                  <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Adım 3 / 3</p>
                  <h2 className="font-heading text-2xl sm:text-3xl">Günlük Saatler</h2>
                </div>
              </div>
              <p className="text-[#6B7280] leading-relaxed">
                Sınıfınızın giriş-çıkış ve yemek saatlerini belirleyin. Bunları panelde ve raporlarda göreceksiniz.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { name: "arrival_time", label: "Sınıfa Giriş" },
                  { name: "departure_time", label: "Sınıftan Çıkış" },
                  { name: "breakfast_time", label: "Kahvaltı" },
                  { name: "lunch_time", label: "Öğle Yemeği" },
                  { name: "afternoon_snack_time", label: "İkindi" },
                ].map((f) => (
                  <label key={f.name} className="block">
                    <span className="text-sm font-medium">{f.label}</span>
                    <input
                      type="time"
                      {...register(f.name)}
                      data-testid={`input-${f.name}`}
                      className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-[#FDFBF7] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#4B6858] focus:border-transparent transition-all"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-10">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              data-testid="setup-back-button"
              className={`inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm transition-all ${
                step === 1 ? "opacity-40 cursor-not-allowed" : "hover:bg-[#F1EDE4] text-[#6B7280]"
              }`}
            >
              <ArrowLeft size={18} weight="bold" /> Geri
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={nextStep}
                data-testid="setup-next-button"
                className="inline-flex items-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-6 py-3 rounded-full text-sm transition-all duration-200 hover:-translate-y-0.5"
              >
                Devam <ArrowRight size={18} weight="bold" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                data-testid="setup-finish-button"
                className="inline-flex items-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-6 py-3 rounded-full text-sm transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60"
              >
                {saving ? "Kaydediliyor…" : "Kurulumu Tamamla"} <CheckCircle size={18} weight="fill" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
