import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import StudentCard from "@/components/StudentCard";
import { MagnifyingGlass, Plus, Users } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Students() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== "all") params.status = filter;
      if (q.trim()) params.search = q.trim();
      const { data } = await api.get("/students", { params });
      setStudents(data);
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    load();
    
    // Listen for AI-driven enrollment events
    window.addEventListener("student-added", load);
    return () => window.removeEventListener("student-added", load);
  }, [load]);

  const handleDelete = async (student) => {
    if (!window.confirm(`${student.first_name} ${student.last_name} silinsin mi?`)) return;
    try {
      await api.delete(`/students/${student.id}`);
      toast.success("Öğrenci silindi.");
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
    } catch (_e) {
      toast.error("Silme başarısız.");
    }
  };

  return (
    <Layout>
      <div className="fade-up">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Sınıf Listesi</p>
            <h1 className="font-heading text-4xl sm:text-5xl mt-2">Öğrencileriniz</h1>
            <p className="text-[#6B7280] mt-2">Toplam {students.length} kayıt görüntüleniyor.</p>
          </div>
          <Link
            to="/students/new"
            data-testid="add-student-btn"
            className="inline-flex items-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-5 py-3 rounded-full text-sm transition-all hover:-translate-y-0.5"
          >
            <Plus size={18} weight="bold" /> Yeni Öğrenci
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6E2D6] p-4 mb-6 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-[#FDFBF7] rounded-xl border border-[#E6E2D6] px-3 py-2">
            <MagnifyingGlass size={18} weight="duotone" className="text-[#6B7280]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="İsim ile ara…"
              data-testid="student-search-input"
              className="bg-transparent focus:outline-none text-sm flex-1"
            />
            {q && (
              <button
                onClick={() => { setQ(""); load(); }}
                className="text-xs text-[#6B7280] hover:text-[#28332D]"
                data-testid="clear-search-btn"
              >
                Temizle
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {[
              { v: "all", l: "Tümü" },
              { v: "Aktif", l: "Aktif" },
              { v: "Pasif", l: "Pasif" },
            ].map((f) => (
              <button
                key={f.v}
                onClick={() => setFilter(f.v)}
                data-testid={`filter-${f.v}`}
                className={`px-4 py-2 rounded-full text-xs transition-all ${
                  filter === f.v
                    ? "bg-[#4B6858] text-white"
                    : "border border-[#E6E2D6] text-[#6B7280] hover:bg-[#F1EDE4]"
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="h-10 w-10 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#E6E2D6] py-16 text-center" data-testid="students-empty">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
              <Users size={30} weight="duotone" className="text-[#4B6858]" />
            </div>
            <p className="mt-4 font-heading text-lg">Kayıt bulunamadı</p>
            <p className="text-sm text-[#6B7280] mt-1">Aday formunu kullanarak ilk kaydı oluşturun.</p>
            <Link
              to="/students/new"
              className="inline-flex items-center gap-2 mt-6 bg-[#4B6858] hover:bg-[#3A5244] text-white px-5 py-2.5 rounded-full text-sm transition-all"
            >
              <Plus size={16} weight="bold" /> Yeni Öğrenci
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 fade-up fade-up-delay-1">
            {students.map((s) => (
              <StudentCard key={s.id} student={s} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
