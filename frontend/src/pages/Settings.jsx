import { useForm } from "react-hook-form";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import { Buildings, BookOpen, Clock, FloppyDisk, CheckCircle } from "@phosphor-icons/react";

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      school_name: user?.school_name || "",
      education_model: user?.education_model || "Maarif",
      arrival_time: user?.class_schedule?.arrival_time || "08:30",
      departure_time: user?.class_schedule?.departure_time || "16:00",
      breakfast_time: user?.class_schedule?.breakfast_time || "09:30",
      lunch_time: user?.class_schedule?.lunch_time || "12:00",
      afternoon_snack_time: user?.class_schedule?.afternoon_snack_time || "14:30",
    },
  });

  const model = watch("education_model");

  const onSubmit = async (data) => {
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
          <p className="text-[#6B7280] mt-2">Okul adı, eğitim modeli ve günlük saatlerinizi buradan güncelleyebilirsiniz.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <Buildings size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Okul</h2>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Okul Adı</span>
              <input
                {...register("school_name", { required: true })}
                className={`${inputClass} mt-2`}
                data-testid="settings-school-name"
              />
            </label>
          </div>

          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <BookOpen size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Eğitim Modeli</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { value: "Maarif", title: "Maarif Modeli" },
                { value: "ECE", title: "EÇE Modeli" },
              ].map((opt) => (
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

          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <Clock size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Günlük Saatler</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { n: "arrival_time", l: "Sınıfa Giriş" },
                { n: "departure_time", l: "Sınıftan Çıkış" },
                { n: "breakfast_time", l: "Kahvaltı" },
                { n: "lunch_time", l: "Öğle Yemeği" },
                { n: "afternoon_snack_time", l: "İkindi" },
              ].map((f) => (
                <label key={f.n} className="block">
                  <span className="text-sm font-medium">{f.l}</span>
                  <input
                    type="time"
                    {...register(f.n)}
                    data-testid={`settings-${f.n}`}
                    className={`${inputClass} mt-2`}
                  />
                </label>
              ))}
            </div>
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
