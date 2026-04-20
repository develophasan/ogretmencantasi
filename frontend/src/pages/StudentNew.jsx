import { useForm } from "react-hook-form";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import {
  Baby,
  User,
  House,
  Heartbeat,
  NotePencil,
  ArrowLeft,
  CheckCircle,
  Asterisk,
} from "@phosphor-icons/react";

const Section = ({ icon: Icon, title, subtitle, tone = "required", children }) => (
  <div
    data-testid={`section-${title}`}
    className={`rounded-2xl p-6 sm:p-8 border ${
      tone === "required" ? "bg-[#F1EDE4]/60 border-[#4B6858]/20" : "bg-white border-[#E6E2D6]"
    }`}
  >
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white border border-[#E6E2D6] flex items-center justify-center">
          <Icon size={20} weight="duotone" className="text-[#4B6858]" />
        </div>
        <div>
          <h3 className="font-heading text-lg">{title}</h3>
          {subtitle && <p className="text-xs text-[#6B7280]">{subtitle}</p>}
        </div>
      </div>
      <span
        className={`text-[10px] px-2 py-1 rounded-full tracking-wider uppercase ${
          tone === "required"
            ? "bg-[#4B6858] text-white"
            : "bg-[#E6E2D6] text-[#6B7280]"
        }`}
      >
        {tone === "required" ? "Zorunlu" : "İsteğe Bağlı"}
      </span>
    </div>
    <div className="grid sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

const Field = ({ label, required, children, span }) => (
  <label className={`block ${span === 2 ? "sm:col-span-2" : ""}`}>
    <span className="text-sm font-medium flex items-center gap-1">
      {label}
      {required && <Asterisk size={10} weight="bold" className="text-[#C86B5E]" />}
    </span>
    <div className="mt-2">{children}</div>
  </label>
);

const inputClass =
  "w-full rounded-xl border border-[#E6E2D6] bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4B6858] focus:border-transparent transition-all";

export default function StudentNew() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      gender: "Kız",
      sibling_count: 0,
    },
  });

  const onSubmit = async (data) => {
    setSaving(true);
    const payload = {
      first_name: data.first_name,
      last_name: data.last_name,
      birth_date: data.birth_date,
      gender: data.gender,
      tc_no: data.tc_no || null,
      sibling_count: Number(data.sibling_count) || 0,
      family_status: data.family_status || null,
      address: data.address || null,
      previous_school: data.previous_school || null,
      parent_mother: {
        name: data.mother_name || null,
        phone: data.mother_phone || null,
        relationship: "Anne",
      },
      parent_father: {
        name: data.father_name || null,
        phone: data.father_phone || null,
        relationship: "Baba",
      },
      emergency_contact: {
        name: data.emergency_name || null,
        phone: data.emergency_phone || null,
        relationship: data.emergency_relationship || null,
      },
      health: {
        allergies: data.allergies || null,
        chronic_diseases: data.chronic_diseases || null,
        medications: data.medications || null,
        special_notes: data.special_notes || null,
        blood_type: data.blood_type || null,
      },
      notes: data.notes || null,
    };
    try {
      const { data: created } = await api.post("/students", payload);
      toast.success("Öğrenci kaydı oluşturuldu.");
      navigate(`/students/${created.id}`);
    } catch (_e) {
      toast.error("Kayıt oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="fade-up">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-[#6B7280] hover:text-[#28332D] inline-flex items-center gap-1 mb-4"
          data-testid="back-btn"
        >
          <ArrowLeft size={14} weight="bold" /> Geri
        </button>

        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Aday Kayıt Formu</p>
            <h1 className="font-heading text-4xl sm:text-5xl mt-2">Yeni Öğrenci</h1>
            <p className="text-[#6B7280] mt-2 max-w-xl">
              Zorunlu alanlar <span className="text-[#C86B5E]">*</span> ile işaretlidir. Kalanlar velilerle tanıştıkça tamamlanabilir.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* REQUIRED */}
          <Section icon={Baby} title="Öğrenci Temel Bilgileri" subtitle="Kayıt için gerekli" tone="required">
            <Field label="Ad" required>
              <input
                {...register("first_name", { required: true })}
                className={inputClass}
                data-testid="input-first-name"
                placeholder="örn. Deniz"
              />
              {errors.first_name && <span className="text-xs text-[#C86B5E]">Zorunlu alan.</span>}
            </Field>
            <Field label="Soyad" required>
              <input
                {...register("last_name", { required: true })}
                className={inputClass}
                data-testid="input-last-name"
                placeholder="örn. Yılmaz"
              />
              {errors.last_name && <span className="text-xs text-[#C86B5E]">Zorunlu alan.</span>}
            </Field>
            <Field label="Doğum Tarihi" required>
              <input
                type="date"
                {...register("birth_date", { required: true })}
                className={inputClass}
                data-testid="input-birth-date"
              />
              {errors.birth_date && <span className="text-xs text-[#C86B5E]">Zorunlu alan.</span>}
            </Field>
            <Field label="Cinsiyet" required>
              <div className="flex gap-2">
                {["Kız", "Erkek"].map((g) => (
                  <label
                    key={g}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-[#E6E2D6] bg-white px-4 py-3 text-sm cursor-pointer has-[:checked]:bg-[#4B6858] has-[:checked]:text-white has-[:checked]:border-[#4B6858] transition-all"
                  >
                    <input type="radio" value={g} {...register("gender", { required: true })} className="hidden" />
                    {g}
                  </label>
                ))}
              </div>
            </Field>
          </Section>

          {/* OPTIONAL - Identity */}
          <Section icon={User} title="Kimlik & Aile" subtitle="Veli ile birlikte doldurulur" tone="optional">
            <Field label="T.C. Kimlik No">
              <input
                {...register("tc_no")}
                maxLength={11}
                className={inputClass}
                data-testid="input-tc-no"
                placeholder="11 haneli"
              />
            </Field>
            <Field label="Kardeş Sayısı">
              <input type="number" min={0} {...register("sibling_count")} className={inputClass} data-testid="input-sibling-count" />
            </Field>
            <Field label="Anne Ad-Soyad">
              <input {...register("mother_name")} className={inputClass} data-testid="input-mother-name" />
            </Field>
            <Field label="Anne Telefon">
              <input {...register("mother_phone")} className={inputClass} data-testid="input-mother-phone" placeholder="+90 ..." />
            </Field>
            <Field label="Baba Ad-Soyad">
              <input {...register("father_name")} className={inputClass} data-testid="input-father-name" />
            </Field>
            <Field label="Baba Telefon">
              <input {...register("father_phone")} className={inputClass} data-testid="input-father-phone" placeholder="+90 ..." />
            </Field>
            <Field label="Aile Durumu">
              <select {...register("family_status")} className={inputClass} data-testid="select-family-status">
                <option value="">Seçiniz</option>
                <option value="Öz">Öz aile</option>
                <option value="Üvey">Üvey</option>
                <option value="Tek Ebeveyn">Tek ebeveyn</option>
                <option value="Vasi">Vasi</option>
              </select>
            </Field>
            <Field label="Acil Durum Kişisi">
              <input {...register("emergency_name")} className={inputClass} data-testid="input-emergency-name" />
            </Field>
            <Field label="Acil Durum Telefonu">
              <input {...register("emergency_phone")} className={inputClass} data-testid="input-emergency-phone" />
            </Field>
            <Field label="Yakınlık">
              <input {...register("emergency_relationship")} className={inputClass} data-testid="input-emergency-relationship" placeholder="örn. Teyze" />
            </Field>
          </Section>

          {/* Address */}
          <Section icon={House} title="Adres & Geçmiş" subtitle="İkamet ve eğitim geçmişi" tone="optional">
            <Field label="Ev Adresi" span={2}>
              <textarea {...register("address")} rows={2} className={inputClass} data-testid="input-address" />
            </Field>
            <Field label="Önceki Okul / Kreş">
              <input {...register("previous_school")} className={inputClass} data-testid="input-previous-school" />
            </Field>
            <Field label="Kan Grubu">
              <select {...register("blood_type")} className={inputClass} data-testid="select-blood-type">
                <option value="">Seçiniz</option>
                {["A Rh+", "A Rh-", "B Rh+", "B Rh-", "AB Rh+", "AB Rh-", "0 Rh+", "0 Rh-"].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Field>
          </Section>

          {/* Health */}
          <Section icon={Heartbeat} title="Sağlık & Beslenme" subtitle="Alerji ve özel durumlar" tone="optional">
            <Field label="Alerjiler" span={2}>
              <textarea {...register("allergies")} rows={2} className={inputClass} data-testid="input-allergies" placeholder="örn. Fıstık, süt ürünleri" />
            </Field>
            <Field label="Kronik Hastalıklar">
              <textarea {...register("chronic_diseases")} rows={2} className={inputClass} data-testid="input-chronic" />
            </Field>
            <Field label="Düzenli İlaçlar">
              <textarea {...register("medications")} rows={2} className={inputClass} data-testid="input-medications" />
            </Field>
            <Field label="Özel Notlar" span={2}>
              <textarea {...register("special_notes")} rows={2} className={inputClass} data-testid="input-special-notes" />
            </Field>
          </Section>

          {/* Notes */}
          <Section icon={NotePencil} title="Öğretmen Notları" subtitle="Gözlem ve genel bilgiler" tone="optional">
            <Field label="Notlar" span={2}>
              <textarea {...register("notes")} rows={3} className={inputClass} data-testid="input-notes" placeholder="Çocuğun ilgi alanları, gelişim notları..." />
            </Field>
          </Section>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate("/students")}
              className="px-5 py-3 rounded-full text-sm text-[#6B7280] hover:bg-[#F1EDE4]"
              data-testid="cancel-btn"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              data-testid="submit-student-btn"
              className="inline-flex items-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-6 py-3 rounded-full text-sm transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {saving ? "Kaydediliyor…" : "Kaydı Oluştur"} <CheckCircle size={16} weight="fill" />
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
