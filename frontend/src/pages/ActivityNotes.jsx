import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import { NotePencil, Plus, Trash, Calendar, Palette } from "@phosphor-icons/react";

export default function ActivityNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ activity_name: "", description: "", date: "" });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/activity-notes");
      setNotes(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.activity_name.trim()) { toast.error("Etkinlik adı zorunlu."); return; }
    setSaving(true);
    try {
      await api.post("/activity-notes", {
        activity_name: form.activity_name.trim(),
        description: form.description.trim() || null,
        date: form.date || null,
      });
      toast.success("Etkinlik notu kaydedildi.");
      setForm({ activity_name: "", description: "", date: "" });
      load();
    } catch (_e) {
      toast.error("Kaydetme başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Not silinsin mi?")) return;
    try {
      await api.delete(`/activity-notes/${id}`);
      setNotes((prev) => prev.filter((c) => c.id !== id));
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
          <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Etkinlik Notları</p>
          <h1 className="font-heading text-4xl sm:text-5xl mt-2">Etkinlik Notları</h1>
          <p className="text-[#6B7280] mt-2 max-w-xl">
            Parmak boyama, müzik, drama… Etkinliğin adını girin ve yaşananları günlük gibi not edin. Asistan üzerinden sesli de ekleyebilirsiniz.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          <form onSubmit={submit} className="md:col-span-2 bg-white rounded-2xl border border-[#E6E2D6] p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Plus size={20} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Yeni Etkinlik Notu</h2>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Etkinlik Adı *</span>
              <input
                value={form.activity_name}
                onChange={(e) => setForm({ ...form, activity_name: e.target.value })}
                data-testid="activity-name-input"
                className={`${inputClass} mt-2`}
                placeholder="örn. Parmak Boyama"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Yaşananlar</span>
              <textarea
                rows={6}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                data-testid="activity-desc-input"
                className={`${inputClass} mt-2`}
                placeholder="Kim katıldı, nasıl geçti, ne gözlemlediniz…"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Tarih</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                data-testid="activity-date-input"
                className={`${inputClass} mt-2`}
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              data-testid="activity-submit-btn"
              className="w-full inline-flex items-center justify-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-5 py-3 rounded-full text-sm transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"} <Plus size={16} weight="bold" />
            </button>
          </form>

          <div className="md:col-span-3 bg-white rounded-2xl border border-[#E6E2D6] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Palette size={20} weight="duotone" className="text-[#4B6858]" />
                <h2 className="font-heading text-lg">Günlük</h2>
              </div>
              <span className="text-xs text-[#6B7280]">{notes.length} not</span>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-[#6B7280] py-10 text-center">Henüz not yok.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="border border-[#E6E2D6] rounded-xl p-4" data-testid={`activity-row-${n.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-heading text-base">{n.activity_name}</p>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-[#6B7280]">
                          <span className="inline-flex items-center gap-1"><Calendar size={12} weight="duotone" /> {n.date}</span>
                        </div>
                        {n.description && <p className="text-sm mt-2 leading-relaxed text-[#28332D]/85 whitespace-pre-wrap">{n.description}</p>}
                      </div>
                      <button
                        onClick={() => remove(n.id)}
                        className="h-8 w-8 rounded-full border border-[#E6E2D6] text-[#C86B5E] hover:bg-[#C86B5E]/10"
                        data-testid={`activity-delete-${n.id}`}
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
