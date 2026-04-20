import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import {
  ArrowLeft,
  Phone,
  ChatCircle,
  Warning,
  Baby,
  Heartbeat,
  User,
  House,
  NotePencil,
  Trash,
  FloppyDisk,
  Calendar,
} from "@phosphor-icons/react";

const Row = ({ label, value }) => (
  <div className="py-2 flex items-start justify-between gap-4">
    <span className="text-xs text-[#6B7280] uppercase tracking-wider">{label}</span>
    <span className="text-sm text-[#28332D] text-right max-w-[60%]">{value || "—"}</span>
  </div>
);

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/students/${id}`);
        setStudent(data);
        setForm({
          status: data.status,
          notes: data.notes || "",
          allergies: data.health?.allergies || "",
          chronic_diseases: data.health?.chronic_diseases || "",
          medications: data.health?.medications || "",
          special_notes: data.health?.special_notes || "",
        });
      } catch (_e) {
        toast.error("Öğrenci yüklenemedi.");
        navigate("/students", { replace: true });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const save = async () => {
    try {
      const payload = {
        status: form.status,
        notes: form.notes,
        health: {
          ...(student.health || {}),
          allergies: form.allergies,
          chronic_diseases: form.chronic_diseases,
          medications: form.medications,
          special_notes: form.special_notes,
        },
      };
      const { data } = await api.put(`/students/${id}`, payload);
      setStudent(data);
      toast.success("Kayıt güncellendi.");
      setEditMode(false);
    } catch (_e) {
      toast.error("Güncelleme başarısız.");
    }
  };

  const remove = async () => {
    if (!window.confirm("Bu öğrenciyi silmek istediğinize emin misiniz?")) return;
    try {
      await api.delete(`/students/${id}`);
      toast.success("Öğrenci silindi.");
      navigate("/students");
    } catch (_e) {
      toast.error("Silme başarısız.");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="h-64 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
        </div>
      </Layout>
    );
  }
  if (!student) return null;

  const mother = student.parent_mother;
  const father = student.parent_father;
  const hasAllergy = student.health?.allergies?.trim();

  return (
    <Layout>
      <div className="fade-up">
        <Link to="/students" className="text-xs text-[#6B7280] hover:text-[#28332D] inline-flex items-center gap-1 mb-4">
          <ArrowLeft size={14} weight="bold" /> Öğrenci listesine dön
        </Link>

        {/* Header Card */}
        <div className="bg-white rounded-3xl border border-[#E6E2D6] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div
            className="h-20 w-20 rounded-2xl flex items-center justify-center font-heading text-2xl"
            style={{ background: student.gender === "Kız" ? "#D48D7C20" : "#4B685820", color: student.gender === "Kız" ? "#D48D7C" : "#4B6858" }}
          >
            {student.first_name?.[0]}{student.last_name?.[0]}
          </div>
          <div className="flex-1">
            <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Öğrenci Kartı</p>
            <h1 className="font-heading text-3xl sm:text-4xl mt-1">
              {student.first_name} {student.last_name}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-[#F1EDE4] text-[#4B6858]">{student.gender}</span>
              <span className="px-3 py-1 rounded-full bg-[#F1EDE4] text-[#4B6858] inline-flex items-center gap-1.5">
                <Calendar size={12} weight="duotone" /> {student.birth_date}
              </span>
              <span className={`px-3 py-1 rounded-full ${
                student.status === "Aktif" ? "bg-[#5E8B7E]/15 text-[#5E8B7E]" : "bg-[#6B7280]/15 text-[#6B7280]"
              }`}>{student.status}</span>
              {hasAllergy && (
                <span data-testid="detail-allergy-badge" className="px-3 py-1 rounded-full bg-[#C86B5E]/15 text-[#C86B5E] inline-flex items-center gap-1.5">
                  <Warning size={12} weight="fill" /> Alerji var
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(mother?.phone || father?.phone) && (
              <>
                <a
                  href={`tel:${(mother?.phone || father?.phone).replace(/\s/g, "")}`}
                  data-testid="detail-call"
                  className="inline-flex items-center gap-2 rounded-full border border-[#E6E2D6] px-4 py-2 text-sm hover:bg-[#F1EDE4]"
                >
                  <Phone size={16} weight="duotone" /> Veliyi Ara
                </a>
                <a
                  href={`https://wa.me/${(mother?.phone || father?.phone).replace(/[^\d]/g, "")}`}
                  target="_blank" rel="noreferrer"
                  data-testid="detail-whatsapp"
                  className="inline-flex items-center gap-2 rounded-full border border-[#E6E2D6] px-4 py-2 text-sm hover:bg-[#F1EDE4]"
                >
                  <ChatCircle size={16} weight="duotone" /> WhatsApp
                </a>
              </>
            )}
            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                data-testid="detail-edit-btn"
                className="inline-flex items-center gap-2 rounded-full bg-[#4B6858] hover:bg-[#3A5244] text-white px-4 py-2 text-sm"
              >
                <NotePencil size={16} weight="duotone" /> Düzenle
              </button>
            ) : (
              <button
                onClick={save}
                data-testid="detail-save-btn"
                className="inline-flex items-center gap-2 rounded-full bg-[#4B6858] hover:bg-[#3A5244] text-white px-4 py-2 text-sm"
              >
                <FloppyDisk size={16} weight="duotone" /> Kaydet
              </button>
            )}
            <button
              onClick={remove}
              data-testid="detail-delete-btn"
              className="inline-flex items-center justify-center rounded-full border border-[#E6E2D6] h-9 w-9 text-[#C86B5E] hover:bg-[#C86B5E]/10 hover:border-[#C86B5E]/30"
              aria-label="Sil"
            >
              <Trash size={16} weight="duotone" />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6">
            <div className="flex items-center gap-3 mb-3">
              <User size={20} weight="duotone" className="text-[#4B6858]" />
              <h3 className="font-heading text-lg">Aile Bilgileri</h3>
            </div>
            <Row label="Anne" value={mother?.name} />
            <Row label="Anne Tel" value={mother?.phone} />
            <Row label="Baba" value={father?.name} />
            <Row label="Baba Tel" value={father?.phone} />
            <Row label="Kardeş Sayısı" value={student.sibling_count?.toString()} />
            <Row label="Aile Durumu" value={student.family_status} />
            <Row label="T.C. No" value={student.tc_no} />
          </div>

          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6">
            <div className="flex items-center gap-3 mb-3">
              <House size={20} weight="duotone" className="text-[#4B6858]" />
              <h3 className="font-heading text-lg">Adres & Geçmiş</h3>
            </div>
            <Row label="Adres" value={student.address} />
            <Row label="Önceki Okul" value={student.previous_school} />
            <Row label="Kan Grubu" value={student.health?.blood_type} />
            <Row label="Kayıt Tarihi" value={student.enrollment_date} />
          </div>

          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 md:col-span-2">
            <div className="flex items-center gap-3 mb-3">
              <Heartbeat size={20} weight="duotone" className="text-[#C86B5E]" />
              <h3 className="font-heading text-lg">Sağlık</h3>
            </div>
            {editMode ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <Edit label="Alerjiler" value={form.allergies} onChange={(v) => setForm({ ...form, allergies: v })} data-testid="edit-allergies" />
                <Edit label="Kronik Hastalıklar" value={form.chronic_diseases} onChange={(v) => setForm({ ...form, chronic_diseases: v })} />
                <Edit label="İlaçlar" value={form.medications} onChange={(v) => setForm({ ...form, medications: v })} />
                <Edit label="Özel Notlar" value={form.special_notes} onChange={(v) => setForm({ ...form, special_notes: v })} />
              </div>
            ) : (
              <>
                <Row label="Alerjiler" value={student.health?.allergies} />
                <Row label="Kronik" value={student.health?.chronic_diseases} />
                <Row label="İlaçlar" value={student.health?.medications} />
                <Row label="Özel Notlar" value={student.health?.special_notes} />
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#E6E2D6] p-6 md:col-span-2">
            <div className="flex items-center gap-3 mb-3">
              <Baby size={20} weight="duotone" className="text-[#4B6858]" />
              <h3 className="font-heading text-lg">Gelişim Özeti & Notlar</h3>
            </div>
            {editMode ? (
              <>
                <label className="text-xs text-[#6B7280] uppercase tracking-wider">Durum</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="block mt-2 w-full max-w-xs rounded-xl border border-[#E6E2D6] bg-white px-4 py-3 text-sm"
                  data-testid="edit-status"
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Pasif">Pasif</option>
                </select>
                <label className="text-xs text-[#6B7280] uppercase tracking-wider mt-4 block">Notlar</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={4}
                  data-testid="edit-notes"
                  className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-white px-4 py-3 text-sm"
                />
              </>
            ) : (
              <p className="text-sm text-[#28332D]/80 whitespace-pre-wrap leading-relaxed">
                {student.notes || "Henüz not eklenmedi."}
              </p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Edit({ label, value, onChange, ...rest }) {
  return (
    <label className="block">
      <span className="text-xs text-[#6B7280] uppercase tracking-wider">{label}</span>
      <textarea
        rows={2}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-white px-4 py-3 text-sm"
        {...rest}
      />
    </label>
  );
}
