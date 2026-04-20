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
  SunHorizon,
  Sun,
  Moon,
} from "@phosphor-icons/react";

// Helper: which meal/time fields to show for a given class_type + shift
function visibleScheduleFields(class_type, shift) {
  if (class_type === "Tam Gün") {
    return ["arrival_time", "breakfast_time", "lunch_time", "afternoon_snack_time", "departure_time"];
  }
  if (class_type === "Yarım Gün" && shift === "Sabahçı") {
    return ["arrival_time", "breakfast_time", "departure_time"];
  }
  if (class_type === "Yarım Gün" && shift === "Öğleci") {
    return ["arrival_time", "afternoon_snack_time", "departure_time"];
  }
  return [];
}

const FIELD_LABELS = {
  arrival_time: "Sınıfa Giriş",
  breakfast_time: "Kahvaltı",
  lunch_time: "Öğle Yemeği",
  afternoon_snack_time: "İkindi",
  departure_time: "Sınıftan Çıkış",
};

// Reasonable default times per shift
function defaultsFor(class_type, shift) {
  if (class_type === "Tam Gün") {
    return {
      arrival_time: "08:30",
      breakfast_time: "09:30",
      lunch_time: "12:00",
      afternoon_snack_time: "14:30",
      departure_time: "16:00",
    };
  }
  if (class_type === "Yarım Gün" && shift === "Sabahçı") {
    return {
      arrival_time: "08:30",
      breakfast_time: "09:30",
      departure_time: "12:30",
    };
  }
  if (class_type === "Yarım Gün" && shift === "Öğleci") {
    return {
      arrival_time: "13:00",
      afternoon_snack_time: "15:00",
      departure_time: "17:30",
    };
  }
  return {};
}

export default function Setup() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      school_name: user?.school_name || "",
      education_model: user?.education_model || "",
      class_type: user?.class_schedule?.class_type || "",
      shift: user?.class_schedule?.shift || "",
      arrival_time: user?.class_schedule?.arrival_time || "",
      departure_time: user?.class_schedule?.departure_time || "",
      breakfast_time: user?.class_schedule?.breakfast_time || "",
      lunch_time: user?.class_schedule?.lunch_time || "",
      afternoon_snack_time: user?.class_schedule?.afternoon_snack_time || "",
    },
  });

  const educationModel = watch("education_model");
  const schoolName = watch("school_name");
  const classType = watch("class_type");
  const shift = watch("shift");

  const applyDefaults = (ct, sh) => {
    const defs = defaultsFor(ct, sh);
    Object.entries(defs).forEach(([k, v]) => setValue(k, v));
    // clear unrelated fields so stale values don't get saved
    ["arrival_time", "breakfast_time", "lunch_time", "afternoon_snack_time", "departure_time"].forEach((k) => {
      if (!(k in defs)) setValue(k, "");
    });
  };

  const nextStep = () => {
    if (step === 1) {
      if (!schoolName?.trim()) { toast.error("Lütfen okul adını girin."); return; }
      setStep(2); return;
    }
    if (step === 2) {
      if (!educationModel) { toast.error("Bir eğitim modeli seçin."); return; }
      setStep(3); return;
    }
    if (step === 3) {
      if (!classType) { toast.error("Sınıf tipini seçin."); return; }
      if (classType === "Yarım Gün" && !shift) { toast.error("Vardiyayı seçin."); return; }
      setStep(4); return;
    }
  };

  const onFinish = async (data) => {
    setSaving(true);
    const visible = visibleScheduleFields(data.class_type, data.shift);
    const schedule = {
      class_type: data.class_type,
      shift: data.class_type === "Yarım Gün" ? data.shift : null,
      arrival_time: null,
      departure_time: null,
      breakfast_time: null,
      lunch_time: null,
      afternoon_snack_time: null,
    };
    visible.forEach((k) => { schedule[k] = data[k] || null; });

    try {
      await api.put("/class-settings", {
        school_name: data.school_name,
        education_model: data.education_model,
        class_schedule: schedule,
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

  const visible = visibleScheduleFields(classType, shift);

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl fade-up">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-10">
          {[1, 2, 3, 4].map((n, i) => (
            <div key={n} className="flex items-center flex-1 last:flex-none">
              <div
                data-testid={`step-indicator-${n}`}
                className={`h-10 w-10 rounded-full flex items-center justify-center font-heading text-sm transition-all duration-300 ${
                  step >= n ? "bg-[#4B6858] text-white" : "bg-white border border-[#E6E2D6] text-[#6B7280]"
                }`}
              >
                {step > n ? <CheckCircle size={20} weight="fill" /> : n}
              </div>
              {i < 3 && (
                <div className={`h-0.5 flex-1 mx-3 transition-all duration-500 ${step > n ? "bg-[#4B6858]" : "bg-[#E6E2D6]"}`} />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onFinish)} className="bg-white rounded-3xl border border-[#E6E2D6] shadow-sm p-8 sm:p-10">
          {/* STEP 1 — SCHOOL */}
          {step === 1 && (
            <div className="space-y-6 fade-up" data-testid="setup-step-1">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
                  <Buildings size={22} weight="duotone" className="text-[#4B6858]" />
                </div>
                <div>
                  <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Adım 1 / 4</p>
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

          {/* STEP 2 — EDUCATION MODEL */}
          {step === 2 && (
            <div className="space-y-6 fade-up" data-testid="setup-step-2">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
                  <BookOpen size={22} weight="duotone" className="text-[#4B6858]" />
                </div>
                <div>
                  <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Adım 2 / 4</p>
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
                      educationModel === opt.value ? "border-[#4B6858] bg-[#F1EDE4]" : "border-[#E6E2D6] bg-white hover:border-[#4B6858]/40"
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

          {/* STEP 3 — CLASS TYPE & SHIFT */}
          {step === 3 && (
            <div className="space-y-6 fade-up" data-testid="setup-step-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
                  <SunHorizon size={22} weight="duotone" className="text-[#4B6858]" />
                </div>
                <div>
                  <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Adım 3 / 4</p>
                  <h2 className="font-heading text-2xl sm:text-3xl">Sınıf Tipi</h2>
                </div>
              </div>
              <p className="text-[#6B7280] leading-relaxed">
                Sınıfınız tam gün mü yarım gün mü işliyor? Buna göre öğün ve saat alanları otomatik uyum sağlar.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { value: "Tam Gün", title: "Tam Gün", desc: "Sabah açılır, akşam kapanır. Kahvaltı, öğle ve ikindi yapılır.", icon: Sun },
                  { value: "Yarım Gün", title: "Yarım Gün", desc: "Sabahçı veya öğleci olarak tek vardiya.", icon: SunHorizon },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`class-type-${opt.value}`}
                    onClick={() => {
                      setValue("class_type", opt.value, { shouldValidate: true });
                      if (opt.value === "Tam Gün") {
                        setValue("shift", "");
                        applyDefaults("Tam Gün", null);
                      } else if (shift) {
                        applyDefaults("Yarım Gün", shift);
                      }
                    }}
                    className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 hover:-translate-y-0.5 ${
                      classType === opt.value ? "border-[#4B6858] bg-[#F1EDE4]" : "border-[#E6E2D6] bg-white hover:border-[#4B6858]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <opt.icon size={20} weight="duotone" className="text-[#4B6858]" />
                        <span className="font-heading text-lg">{opt.title}</span>
                      </div>
                      {classType === opt.value && <CheckCircle size={22} weight="fill" className="text-[#4B6858]" />}
                    </div>
                    <p className="text-sm text-[#6B7280]">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <input type="hidden" {...register("class_type", { required: true })} />

              {classType === "Yarım Gün" && (
                <div className="fade-up">
                  <p className="text-sm font-medium mb-3">Vardiya</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { value: "Sabahçı", title: "Sabahçı", desc: "Sabah açılış, öğlen kapanış. Kahvaltı yapılır.", icon: Sun },
                      { value: "Öğleci", title: "Öğleci", desc: "Öğlen açılış, akşamüstü kapanış. İkindi yapılır.", icon: Moon },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`shift-${opt.value}`}
                        onClick={() => {
                          setValue("shift", opt.value, { shouldValidate: true });
                          applyDefaults("Yarım Gün", opt.value);
                        }}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${
                          shift === opt.value ? "border-[#4B6858] bg-[#F1EDE4]" : "border-[#E6E2D6] hover:border-[#4B6858]/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <opt.icon size={18} weight="duotone" className="text-[#4B6858]" />
                            <span className="font-heading">{opt.title}</span>
                          </div>
                          {shift === opt.value && <CheckCircle size={18} weight="fill" className="text-[#4B6858]" />}
                        </div>
                        <p className="text-xs text-[#6B7280]">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                  <input type="hidden" {...register("shift")} />
                </div>
              )}
            </div>
          )}

          {/* STEP 4 — TIMES (dynamic) */}
          {step === 4 && (
            <div className="space-y-6 fade-up" data-testid="setup-step-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
                  <Clock size={22} weight="duotone" className="text-[#4B6858]" />
                </div>
                <div>
                  <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Adım 4 / 4</p>
                  <h2 className="font-heading text-2xl sm:text-3xl">Günlük Saatler</h2>
                </div>
              </div>
              <p className="text-[#6B7280] leading-relaxed">
                <strong>{classType}{shift ? ` · ${shift}` : ""}</strong> seçtiğiniz için aşağıdaki alanlar düzenlenebilir. Dilediğiniz zaman Sınıf Ayarları'ndan değiştirebilirsiniz.
              </p>

              {visible.length === 0 ? (
                <p className="text-sm text-[#C86B5E]">Önceki adımdan sınıf tipini seçmelisiniz.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {visible.map((name) => (
                    <label key={name} className="block">
                      <span className="text-sm font-medium">{FIELD_LABELS[name]}</span>
                      <input
                        type="time"
                        {...register(name)}
                        data-testid={`input-${name}`}
                        className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-[#FDFBF7] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#4B6858] focus:border-transparent transition-all"
                      />
                    </label>
                  ))}
                </div>
              )}
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

            {step < 4 ? (
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
