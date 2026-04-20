import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import {
  Users,
  GenderFemale,
  GenderMale,
  Warning,
  Clock,
  ForkKnife,
  Sun,
  Coffee,
  Plus,
  ArrowRight,
  Baby,
  SunHorizon,
} from "@phosphor-icons/react";

const SCHEDULE_ROWS = {
  arrival_time: { label: "Sınıfa Giriş", icon: Clock, accent: "#4B6858" },
  breakfast_time: { label: "Kahvaltı", icon: Coffee, accent: "#E8A365" },
  lunch_time: { label: "Öğle Yemeği", icon: ForkKnife, accent: "#D48D7C" },
  afternoon_snack_time: { label: "İkindi", icon: Sun, accent: "#5E8B7E" },
  departure_time: { label: "Sınıftan Çıkış", icon: Clock, accent: "#6B7280" },
};

function visibleScheduleFields(class_type, shift) {
  if (class_type === "Tam Gün") return ["arrival_time", "breakfast_time", "lunch_time", "afternoon_snack_time", "departure_time"];
  if (class_type === "Yarım Gün" && shift === "Sabahçı") return ["arrival_time", "breakfast_time", "departure_time"];
  if (class_type === "Yarım Gün" && shift === "Öğleci") return ["arrival_time", "afternoon_snack_time", "departure_time"];
  // Fallback: show everything if not set
  return ["arrival_time", "breakfast_time", "lunch_time", "afternoon_snack_time", "departure_time"];
}

const StatTile = ({ icon: Icon, label, value, accent = "#4B6858", testId }) => (
  <div
    data-testid={testId}
    className="bg-white rounded-2xl border border-[#E6E2D6] p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:border-[#4B6858]/30"
  >
    <div className="flex items-center justify-between">
      <div
        className="h-11 w-11 rounded-xl flex items-center justify-center"
        style={{ background: `${accent}15` }}
      >
        <Icon size={22} weight="duotone" style={{ color: accent }} />
      </div>
    </div>
    <p className="font-heading text-4xl mt-6" style={{ color: accent }}>{value}</p>
    <p className="text-sm text-[#6B7280] mt-1">{label}</p>
  </div>
);

const ScheduleRow = ({ icon: Icon, label, time, accent }) => (
  <div className="flex items-center justify-between py-3">
    <div className="flex items-center gap-3">
      <div
        className="h-9 w-9 rounded-lg flex items-center justify-center"
        style={{ background: `${accent}15` }}
      >
        <Icon size={18} weight="duotone" style={{ color: accent }} />
      </div>
      <span className="text-sm">{label}</span>
    </div>
    <span className="font-heading text-base tabular-nums">{time || "—"}</span>
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get("/dashboard");
        setData(data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="h-64 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
        </div>
      </Layout>
    );
  }

  const c = data?.counts || {};
  const s = data?.class_schedule || {};

  return (
    <Layout>
      <div className="fade-up">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Kontrol Paneli</p>
            <h1 className="font-heading text-4xl sm:text-5xl mt-2">Merhaba, {user?.name?.split(" ")[0] || "Öğretmenim"}</h1>
            <p className="text-[#6B7280] mt-2 max-w-xl">
              {data?.school_name ? `${data.school_name} · ` : ""}
              {data?.education_model === "Maarif" ? "Maarif Modeli" : "EÇE Modeli"} · Bugün sınıfınızla ilgili özet.
            </p>
          </div>
          <Link
            to="/students/new"
            data-testid="quick-add-student"
            className="inline-flex items-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-5 py-3 rounded-full text-sm transition-all duration-200 hover:-translate-y-0.5"
          >
            <Plus size={18} weight="bold" /> Yeni Öğrenci
          </Link>
        </div>

        {/* Stats Bento */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 fade-up fade-up-delay-1">
          <StatTile icon={Users} label="Toplam Öğrenci" value={c.total ?? 0} accent="#4B6858" testId="stat-total" />
          <StatTile icon={GenderFemale} label="Kız" value={c.girls ?? 0} accent="#D48D7C" testId="stat-girls" />
          <StatTile icon={GenderMale} label="Erkek" value={c.boys ?? 0} accent="#5E8B7E" testId="stat-boys" />
          <StatTile icon={Warning} label="Alerji / Sağlık" value={c.with_allergy ?? 0} accent="#C86B5E" testId="stat-allergy" />
        </div>

        <div className="grid md:grid-cols-5 gap-6 mt-6 fade-up fade-up-delay-2">
          {/* Schedule */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading text-xl">Bugünün Akışı</h2>
              <Link to="/settings" className="text-xs text-[#4B6858] hover:underline">Düzenle</Link>
            </div>
            {(s.class_type || s.shift) && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F1EDE4] text-[#4B6858] text-xs mb-3">
                <SunHorizon size={14} weight="duotone" />
                {s.class_type}{s.shift ? ` · ${s.shift}` : ""}
              </div>
            )}
            <div className="divide-y divide-[#E6E2D6]">
              {visibleScheduleFields(s.class_type, s.shift).map((key) => {
                const conf = SCHEDULE_ROWS[key];
                return (
                  <ScheduleRow key={key} icon={conf.icon} label={conf.label} time={s[key]} accent={conf.accent} />
                );
              })}
            </div>
          </div>

          {/* Recent students */}
          <div className="md:col-span-3 bg-white rounded-2xl border border-[#E6E2D6] p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-xl">Son Eklenen Öğrenciler</h2>
              <Link to="/students" data-testid="view-all-students" className="text-xs text-[#4B6858] hover:underline inline-flex items-center gap-1">
                Tümünü gör <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
            {(!data?.recent_students || data.recent_students.length === 0) ? (
              <div className="text-center py-10">
                <div className="h-16 w-16 mx-auto rounded-2xl bg-[#F1EDE4] flex items-center justify-center">
                  <Baby size={30} weight="duotone" className="text-[#4B6858]" />
                </div>
                <p className="mt-4 font-heading text-lg">Henüz öğrenci yok</p>
                <p className="text-sm text-[#6B7280] mt-1">İlk kaydınızı oluşturup sınıfınızı doldurun.</p>
                <Link
                  to="/students/new"
                  className="inline-flex items-center gap-2 mt-6 bg-[#4B6858] hover:bg-[#3A5244] text-white px-5 py-2.5 rounded-full text-sm transition-all"
                >
                  <Plus size={16} weight="bold" /> Öğrenci Ekle
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-[#E6E2D6]">
                {data.recent_students.map((st) => (
                  <li key={st.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#F1EDE4] flex items-center justify-center font-heading text-sm text-[#4B6858]">
                        {st.first_name?.[0]}{st.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{st.first_name} {st.last_name}</p>
                        <p className="text-xs text-[#6B7280]">{st.gender} · {st.birth_date}</p>
                      </div>
                    </div>
                    <Link
                      to={`/students/${st.id}`}
                      data-testid={`recent-student-${st.id}`}
                      className="text-xs text-[#4B6858] hover:underline"
                    >
                      Kart
                    </Link>
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
