import { useForm } from "react-hook-form";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import {
  Buildings,
  BookOpen,
  Clock,
  FloppyDisk,
  CheckCircle,
  SunHorizon,
  Sun,
  Moon,
} from "@phosphor-icons/react";

function visibleScheduleFields(class_type, shift) {
  if (class_type === "Tam Gün") return ["arrival_time", "breakfast_time", "lunch_time", "afternoon_snack_time", "departure_time"];
  if (class_type === "Yarım Gün" && shift === "Sabahçı") return ["arrival_time", "breakfast_time", "departure_time"];
  if (class_type === "Yarım Gün" && shift === "Öğleci") return ["arrival_time", "afternoon_snack_time", "departure_time"];
  return [];
}
const FIELD_LABELS = {
  arrival_time: "Sınıfa Giriş",
  breakfast_time: "Kahvaltı",
  lunch_time: "Öğle Yemeği",
  afternoon_snack_time: "İkindi",
  departure_time: "Sınıftan Çıkış",
};
function defaultsFor(ct, sh) {
  if (ct === "Tam Gün") return { arrival_time: "08:30", breakfast_time: "09:30", lunch_time: "12:00", afternoon_snack_time: "14:30", departure_time: "16:00" };
  if (ct === "Yarım Gün" && sh === "Sabahçı") return { arrival_time: "08:30", breakfast_time: "09:30", departure_time: "12:30" };
  if (ct === "Yarım Gün" && sh === "Öğleci") return { arrival_time: "13:00", afternoon_snack_time: "15:00", departure_time: "17:30" };
  return {};
}

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      school_name: user?.school_name || "",
      education_model: user?.education_model || "Maarif",
      class_type: user?.class_schedule?.class_type || "Tam Gün",
      shift: user?.class_schedule?.shift || "",
      arrival_time: user?.class_schedule?.arrival_time || "",
      departure_time: user?.class_schedule?.departure_time || "",
      breakfast_time: user?.class_schedule?.breakfast_time || "",
      lunch_time: user?.class_schedule?.lunch_time || "",
      afternoon_snack_time: user?.class_schedule?.afternoon_snack_time || "",
    },
  });

  const model = watch("education_model");
  const classType = watch("class_type");
  const shift = watch("shift");
  const visible = visibleScheduleFields(classType, shift);

  const applyDefaults = (ct, sh) => {
    const defs = defaultsFor(ct, sh);
    Object.entries(defs).forEach(([k, v]) => setValue(k, v));
    ["arrival_time", "breakfast_time", "lunch_time", "afternoon_snack_time", "departure_time"].forEach((k) => {
      if (!(k in defs)) setValue(k, "");
    });
  };

  const onSubmit = async (data) => {
    if (data.class_type === "Yarım Gün" && !data.shift) {
      toast.error("Yarım gün için vardiya seçin.");
      return;
    }
    setSaving(true);
    const vis = visibleScheduleFields(data.class_type, data.shift);
    const schedule = {
      class_type: data.class_type,
      shift: data.class_type === "Yarım Gün" ? data.shift : null,
      arrival_time: null,
      departure_time: null,
      breakfast_time: null,
      lunch_time: null,
      afternoon_snack_time: null,
    };
    vis.forEach((k) => { schedule[k] = data[k] || null; });

    try {
      await api.put("/class-settings", {
        school_name: data.school_name,
        education_model: data.education_model,
        class_schedule: schedule,
        setup_completed: true,
      });
      await refreshUser();
      toast.success("Sınıf ayarları güncellendi.");
    } catch (_e) {
      toast.error("Güncelleme başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-[#E6E2D6] bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4B6858] focus:border-transparent transition-all";

  return (
    <Layout>
      <div className="fade-up max-w-3xl">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Sınıf Ayarları</p>
          <h1 className="font-heading text-4xl sm:text-5xl mt-2">Tercihleriniz</h1>
          <p className="text-[#6B7280] mt-2">Okul adı, eğitim modeli, sınıf tipi ve günlük saatlerinizi buradan güncelleyebilirsiniz.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* School */}
          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <Buildings size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Okul</h2>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Okul Adı</span>
              <input {...register("school_name", { required: true })} className={`${inputClass} mt-2`} data-testid="settings-school-name" />
            </label>
          </div>

          {/* Model */}
          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <BookOpen size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Eğitim Modeli</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[{ value: "Maarif", title: "Maarif Modeli" }, { value: "ECE", title: "EÇE Modeli" }].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("education_model", opt.value)}
                  data-testid={`settings-model-${opt.value}`}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    model === opt.value ? "border-[#4B6858] bg-[#F1EDE4]" : "border-[#E6E2D6] hover:border-[#4B6858]/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-heading">{opt.title}</span>
                    {model === opt.value && <CheckCircle size={18} weight="fill" className="text-[#4B6858]" />}
                  </div>
                </button>
              ))}
            </div>
            <input type="hidden" {...register("education_model")} />
          </div>

          {/* Class Type + Shift */}
          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <SunHorizon size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Sınıf Tipi</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { value: "Tam Gün", title: "Tam Gün", desc: "Kahvaltı, öğle ve ikindi.", icon: Sun },
                { value: "Yarım Gün", title: "Yarım Gün", desc: "Sabahçı veya öğleci vardiya.", icon: SunHorizon },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`settings-class-type-${opt.value}`}
                  onClick={() => {
                    setValue("class_type", opt.value);
                    if (opt.value === "Tam Gün") {
                      setValue("shift", "");
                      applyDefaults("Tam Gün", null);
                    } else if (shift) {
                      applyDefaults("Yarım Gün", shift);
                    }
                  }}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    classType === opt.value ? "border-[#4B6858] bg-[#F1EDE4]" : "border-[#E6E2D6] hover:border-[#4B6858]/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <opt.icon size={18} weight="duotone" className="text-[#4B6858]" />
                      <span className="font-heading">{opt.title}</span>
                    </div>
                    {classType === opt.value && <CheckCircle size={18} weight="fill" className="text-[#4B6858]" />}
                  </div>
                  <p className="text-xs text-[#6B7280]">{opt.desc}</p>
                </button>
              ))}
            </div>
            <input type="hidden" {...register("class_type")} />

            {classType === "Yarım Gün" && (
              <div className="mt-5 fade-up">
                <p className="text-sm font-medium mb-3">Vardiya</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { value: "Sabahçı", desc: "Sabah-öğle, Kahvaltı yapılır.", icon: Sun },
                    { value: "Öğleci", desc: "Öğle-akşam, İkindi yapılır.", icon: Moon },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      data-testid={`settings-shift-${opt.value}`}
                      onClick={() => {
                        setValue("shift", opt.value);
                        applyDefaults("Yarım Gün", opt.value);
                      }}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        shift === opt.value ? "border-[#4B6858] bg-[#F1EDE4]" : "border-[#E6E2D6] hover:border-[#4B6858]/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <opt.icon size={18} weight="duotone" className="text-[#4B6858]" />
                          <span className="font-heading">{opt.value}</span>
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

          {/* Times */}
          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <Clock size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Günlük Saatler</h2>
            </div>
            {visible.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Önce sınıf tipini seçin.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {visible.map((name) => (
                  <label key={name} className="block">
                    <span className="text-sm font-medium">{FIELD_LABELS[name]}</span>
                    <input type="time" {...register(name)} data-testid={`settings-${name}`} className={`${inputClass} mt-2`} />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              data-testid="settings-save-btn"
              className="inline-flex items-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-6 py-3 rounded-full text-sm transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"} <FloppyDisk size={16} weight="duotone" />
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
