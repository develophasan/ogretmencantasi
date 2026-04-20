import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import { Siren, Plus, Trash, Calendar, User as UserIcon } from "@phosphor-icons/react";

export default function DailyCases() {
  const [cases, setCases] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ student_id: "", title: "", description: "", date: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        api.get("/daily-cases"),
        api.get("/students", { params: { status: "Aktif" } }),
      ]);
      setCases(c.data);
      setStudents(s.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Başlık boş olamaz."); return; }
    setSaving(true);
    try {
      const student = students.find((x) => x.id === form.student_id);
      await api.post("/daily-cases", {
        student_id: form.student_id || null,
        student_name: student ? `${student.first_name} ${student.last_name}` : null,
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: form.date || null,
      });
      toast.success("Günlük vaka kaydedildi.");
      setForm({ student_id: "", title: "", description: "", date: "" });
      load();
    } catch (_e) {
      toast.error("Kaydetme başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Vaka silinsin mi?")) return;
    try {
      await api.delete(`/daily-cases/${id}`);
      setCases((prev) => prev.filter((c) => c.id !== id));
      toast.success("Silindi.");
    } catch (_e) {
      toast.error("Silme başarısız.");
    }
  };

  const inputClass = "w-full rounded-xl border border-[#E6E2D6] bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4B6858] focus:border-transparent transition-all";

  return (
    <Layout>
      <div className="fade-up">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Günlük Vakalar</p>
          <h1 className="font-heading text-4xl sm:text-5xl mt-2">Günlük Vakalar</h1>
          <p className="text-[#6B7280] mt-2 max-w-xl">
            Düşme, kavga, üzüntü, başarı… Gün içinde dikkat çeken kısa notları buraya kaydedin. Asistana konuşarak da ekleyebilirsiniz.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          <form onSubmit={submit} className="md:col-span-2 bg-white rounded-2xl border border-[#E6E2D6] p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Plus size={20} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Yeni Vaka</h2>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Öğrenci (opsiyonel)</span>
              <select
                value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                className={`${inputClass} mt-2`}
                data-testid="case-student-select"
              >
                <option value="">Genel / Sınıf</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Başlık *</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                data-testid="case-title-input"
                className={`${inputClass} mt-2`}
                placeholder="örn. Parktayken düştü"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Ayrıntı</span>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                data-testid="case-desc-input"
                className={`${inputClass} mt-2`}
                placeholder="Ne oldu, ne yapıldı, nasıl kapatıldı?"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Tarih</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                data-testid="case-date-input"
                className={`${inputClass} mt-2`}
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              data-testid="case-submit-btn"
              className="w-full inline-flex items-center justify-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-5 py-3 rounded-full text-sm transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"} <Plus size={16} weight="bold" />
            </button>
          </form>

          <div className="md:col-span-3 bg-white rounded-2xl border border-[#E6E2D6] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Siren size={20} weight="duotone" className="text-[#C86B5E]" />
                <h2 className="font-heading text-lg">Kayıtlar</h2>
              </div>
              <span className="text-xs text-[#6B7280]">{cases.length} kayıt</span>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
              </div>
            ) : cases.length === 0 ? (
              <p className="text-sm text-[#6B7280] py-10 text-center">Henüz kayıt yok.</p>
            ) : (
              <ul className="space-y-3">
                {cases.map((c) => (
                  <li key={c.id} className="border border-[#E6E2D6] rounded-xl p-4" data-testid={`case-row-${c.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-heading text-base">{c.title}</p>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-[#6B7280]">
                          <span className="inline-flex items-center gap-1"><Calendar size={12} weight="duotone" /> {c.date}</span>
                          {c.student_name && <span className="inline-flex items-center gap-1"><UserIcon size={12} weight="duotone" /> {c.student_name}</span>}
                        </div>
                        {c.description && <p className="text-sm mt-2 leading-relaxed text-[#28332D]/85 whitespace-pre-wrap">{c.description}</p>}
                      </div>
                      <button
                        onClick={() => remove(c.id)}
                        className="h-8 w-8 rounded-full border border-[#E6E2D6] text-[#C86B5E] hover:bg-[#C86B5E]/10"
                        data-testid={`case-delete-${c.id}`}
                      >
                        <Trash size={14} weight="duotone" className="mx-auto" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
