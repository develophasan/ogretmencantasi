import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import { CalendarBlank, FilePlus, UsersThree, Scroll } from "@phosphor-icons/react";

export default function Reports() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openDraft, setOpenDraft] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, d] = await Promise.all([
          api.get("/students", { params: { status: "Aktif" } }),
          api.get("/reports"),
        ]);
        setStudents(s.data);
        setDrafts(d.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const create = async () => {
    if (!studentId || !start || !end) {
      toast.error("Öğrenci ve tarih aralığı seçin.");
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post("/reports/draft", {
        student_id: studentId,
        start_date: start,
        end_date: end,
      });
      setDrafts((prev) => [data, ...prev]);
      setOpenDraft(data);
      toast.success("Rapor taslağı oluşturuldu.");
    } catch (_e) {
      toast.error("Taslak oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>
      <div className="fade-up">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Dönem Raporları</p>
          <h1 className="font-heading text-4xl sm:text-5xl mt-2">Rapor Taslağı Oluştur</h1>
          <p className="text-[#6B7280] mt-2 max-w-xl">
            Seçtiğiniz tarih aralığı için boş bir rapor iskeleti hazırlar. İlerleyen sürümde yapay zekâ burayı sizin adınıza doldurabilecek.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          <div className="md:col-span-2 bg-white rounded-2xl border border-[#E6E2D6] p-6">
            <div className="flex items-center gap-3 mb-4">
              <FilePlus size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Yeni Taslak</h2>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Öğrenci</span>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                data-testid="report-student-select"
                className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-[#FDFBF7] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4B6858]"
              >
                <option value="">Seçiniz…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <label className="block">
                <span className="text-sm font-medium">Başlangıç</span>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  data-testid="report-start-date"
                  className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-[#FDFBF7] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4B6858]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Bitiş</span>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  data-testid="report-end-date"
                  className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-[#FDFBF7] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4B6858]"
                />
              </label>
            </div>
            <button
              onClick={create}
              disabled={creating}
              data-testid="create-report-btn"
              className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-5 py-3 rounded-full text-sm transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {creating ? "Hazırlanıyor…" : "Taslağı Oluştur"} <CalendarBlank size={16} weight="duotone" />
            </button>

            {students.length === 0 && !loading && (
              <p className="mt-6 flex items-start gap-2 text-xs text-[#6B7280]">
                <UsersThree size={16} weight="duotone" />
                Rapor için önce Öğrenciler sekmesinden kayıt oluşturun.
              </p>
            )}
          </div>

          <div className="md:col-span-3 bg-white rounded-2xl border border-[#E6E2D6] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Scroll size={22} weight="duotone" className="text-[#4B6858]" />
                <h2 className="font-heading text-lg">Son Taslaklar</h2>
              </div>
              <span className="text-xs text-[#6B7280]">{drafts.length} kayıt</span>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
              </div>
            ) : drafts.length === 0 ? (
              <p className="text-sm text-[#6B7280] py-10 text-center">Henüz taslak yok.</p>
            ) : (
              <ul className="divide-y divide-[#E6E2D6]">
                {drafts.map((d) => (
                  <li key={d.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{d.student_name}</p>
                      <p className="text-xs text-[#6B7280]">{d.period.start} → {d.period.end}</p>
                    </div>
                    <button
                      onClick={() => setOpenDraft(d)}
                      data-testid={`open-draft-${d.id}`}
                      className="text-xs text-[#4B6858] hover:underline"
                    >
                      Görüntüle
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {openDraft && (
          <div className="fixed inset-0 bg-[#28332D]/40 z-50 flex items-center justify-center p-4" onClick={() => setOpenDraft(null)}>
            <div
              className="bg-white rounded-3xl border border-[#E6E2D6] max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8"
              onClick={(e) => e.stopPropagation()}
              data-testid="draft-modal"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Rapor Taslağı</p>
                  <h3 className="font-heading text-2xl mt-1">{openDraft.student_name}</h3>
                  <p className="text-xs text-[#6B7280]">{openDraft.period.start} → {openDraft.period.end}</p>
                </div>
                <button onClick={() => setOpenDraft(null)} className="text-sm text-[#6B7280] hover:text-[#28332D]">Kapat</button>
              </div>
              <div className="space-y-4">
                {Object.entries(openDraft.sections).map(([key, sec]) => (
                  <div key={key} className="rounded-xl border border-[#E6E2D6] p-4 bg-[#FDFBF7]">
                    <p className="text-xs tracking-[0.2em] uppercase text-[#4B6858] font-semibold">{sec.title}</p>
                    <p className="text-sm text-[#6B7280] mt-2 italic">
                      {sec.content || "— Bu bölüm ileride yapay zekâ ile veya manuel olarak doldurulacak —"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
