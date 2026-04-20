import { 
  ChartBar, 
  Users, 
  GraduationCap, 
  Cpu, 
  CheckCircle, 
  XCircle, 
  Eye,
  Clock,
  ArrowsClockwise
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [requests, setRequests] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [chatLogs, setChatLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [aiLogs, setAiLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, reqRes, teachRes, chatRes, actRes, aiRes] = await Promise.all([
        api.get("/admin/dashboard"),
        api.get("/admin/requests"),
        api.get("/admin/teachers"),
        api.get("/admin/logs/chat"),
        api.get("/admin/logs/activities"),
        api.get("/admin/logs/ai")
      ]);
      setStats(statsRes.data);
      setRequests(reqRes.data);
      setTeachers(teachRes.data);
      setChatLogs(chatRes.data);
      setActivityLogs(actRes.data);
      setAiLogs(aiRes.data);
    } catch (error) {
      toast.error("Veriler yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (id) => {
    try {
      await api.post(`/admin/requests/${id}/approve`);
      toast.success("Kullanıcı onaylandı.");
      fetchData();
    } catch (error) {
      toast.error("İşlem başarısız.");
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm("Bu talebi reddetmek istediğinize emin misiniz?")) return;
    try {
      await api.post(`/admin/requests/${id}/reject`);
      toast.success("Talep reddedildi.");
      fetchData();
    } catch (error) {
      toast.error("İşlem başarısız.");
    }
  };

  if (loading && !stats) return <div className="p-12 text-center text-[#4B6858]">Yükleniyor...</div>;

  return (
    <div className="min-h-screen bg-[#FDFBF7] p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-10">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-heading text-4xl text-[#28332D]">Yönetim Paneli</h1>
            <p className="text-[#6B7280] mt-2">Sistem performansı ve kullanıcı yönetimi.</p>
          </div>
          <button 
            onClick={fetchData} 
            className="flex items-center gap-2 px-6 py-3 bg-white border border-[#E6E2D6] rounded-full text-sm font-medium hover:bg-[#F1EDE4] transition-all"
          >
            <ArrowsClockwise size={18} /> Verileri Yenile
          </button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Aktif Okul" 
            value={stats?.total_approved} 
            icon={<GraduationCap size={24} weight="duotone" />} 
            color="bg-emerald-50 text-emerald-600"
          />
          <StatCard 
            title="Toplam Öğrenci" 
            value={stats?.total_students} 
            icon={<Users size={24} weight="duotone" />} 
            color="bg-blue-50 text-blue-600"
          />
          <StatCard 
            title="Bekleyen Talep" 
            value={stats?.pending_requests} 
            icon={<Clock size={24} weight="duotone" />} 
            color="bg-amber-50 text-amber-600"
          />
          <StatCard 
            title="AI İşlemleri" 
            value={stats?.ai_calls} 
            icon={<Cpu size={24} weight="duotone" />} 
            color="bg-purple-50 text-purple-600"
          />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-[32px] shadow-sm border border-[#E6E2D6] overflow-hidden">
          <div className="flex border-b border-[#E6E2D6] overflow-x-auto no-scrollbar">
            <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")} label="Genel Bakış" />
            <TabButton active={activeTab === "requests"} onClick={() => setActiveTab("requests")} label={`Talepler (${requests.length})`} />
            <TabButton active={activeTab === "teachers"} onClick={() => setActiveTab("teachers")} label="Öğretmenler" />
            <TabButton active={activeTab === "chat"} onClick={() => setActiveTab("chat")} label="Sohbetler" />
            <TabButton active={activeTab === "activities"} onClick={() => setActiveTab("activities")} label="Aktiviteler" />
            <TabButton active={activeTab === "ai_usage"} onClick={() => setActiveTab("ai_usage")} label="AI Log" />
          </div>

          <div className="p-6">
            {activeTab === "overview" && (
              <div className="space-y-8">
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="font-heading text-xl">Sistem Sağlığı</h3>
                    <div className="p-6 rounded-2xl bg-[#FDFBF7] border border-[#E6E2D6] space-y-4">
                      <HealthItem label="Veritabanı" status="Çalışıyor" />
                      <HealthItem label="Gemini API" status="Aktif" />
                      <HealthItem label="Resim Servisi" status="Aktif" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-heading text-xl">Hızlı Kayıt Özeti</h3>
                    <p className="text-sm text-[#6B7280]">Son 24 saat içinde {stats?.pending_requests} yeni kayıt talebi alındı.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "requests" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-widest text-[#9CA3AF] border-b border-[#E6E2D6]">
                      <th className="pb-4 font-semibold p-4">Öğretmen / Okul</th>
                      <th className="pb-4 font-semibold p-4">İletişim</th>
                      <th className="pb-4 font-semibold p-4">Tarih</th>
                      <th className="pb-4 font-semibold p-4 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr><td colSpan="4" className="text-center py-12 text-[#6B7280]">Bekleyen kayıt talebi bulunmuyor.</td></tr>
                    ) : (
                      requests.map((req) => (
                        <tr key={req.id} className="border-b border-[#F1EDE4] last:border-0 hover:bg-[#FDFBF7] transition-all">
                          <td className="p-4">
                            <p className="font-medium">{req.name}</p>
                            <p className="text-xs text-[#6B7280]">{req.school_name}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm">{req.phone}</p>
                            <p className="text-xs text-[#6B7280]">{req.email}</p>
                          </td>
                          <td className="p-4 text-xs text-[#6B7280]">
                            {new Date(req.created_at).toLocaleDateString('tr-TR')}
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <button 
                              onClick={() => handleReject(req.id)}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Reddet"
                            >
                              <XCircle size={20} />
                            </button>
                            <button 
                              onClick={() => handleApprove(req.id)}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Onayla"
                            >
                              <CheckCircle size={20} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "teachers" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-widest text-[#9CA3AF] border-b border-[#E6E2D6]">
                      <th className="pb-4 font-semibold p-4">Öğretmen</th>
                      <th className="pb-4 font-semibold p-4">Okul</th>
                      <th className="pb-4 font-semibold p-4">Öğrenci</th>
                      <th className="pb-4 font-semibold p-4">AI Kullanımı</th>
                      <th className="pb-4 font-semibold p-4 text-right">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((teach) => (
                      <tr key={teach.user_id} className="border-b border-[#F1EDE4] last:border-0 hover:bg-[#FDFBF7] transition-all">
                        <td className="p-4">
                          <p className="font-medium">{teach.name}</p>
                          <p className="text-xs text-[#6B7280]">{teach.phone}</p>
                        </td>
                        <td className="p-4 text-sm">{teach.school_name || "—"}</td>
                        <td className="p-4">
                          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-semibold">
                            {teach.student_count} öğrenci
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="px-3 py-1 bg-purple-50 text-purple-600 rounded-full text-xs font-semibold">
                            {teach.ai_usage_count} işlem
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {teach.is_approved ? (
                            <span className="text-emerald-500 font-medium text-xs">Onaylı</span>
                          ) : (
                            <span className="text-amber-500 font-medium text-xs">Beklemede</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "chat" && (
              <div className="space-y-4">
                {chatLogs.length === 0 ? (
                  <p className="text-center py-12 text-[#6B7280]">Henüz sohbet kaydı yok.</p>
                ) : (
                  chatLogs.map((log) => (
                    <div key={log.id} className="p-4 rounded-2xl bg-[#FDFBF7] border border-[#E6E2D6] space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-[#4B6858]">{log.teacher_name}</span>
                        <span className="text-[#9CA3AF]">{new Date(log.timestamp).toLocaleString('tr-TR')}</span>
                      </div>
                      <div className={`p-3 rounded-xl text-sm ${log.role === 'user' ? 'bg-[#4B6858]/5 border-l-4 border-[#4B6858]' : 'bg-white border border-[#E6E2D6]'}`}>
                        <p className="text-xs uppercase tracking-tighter font-bold opacity-50 mb-1">{log.role === 'user' ? 'Öğretmen' : 'AI Destek'}</p>
                        <p className="whitespace-pre-wrap">{log.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "activities" && (
              <div className="space-y-3">
                {activityLogs.length === 0 ? (
                  <p className="text-center py-12 text-[#6B7280]">Henüz aktivite kaydı yok.</p>
                ) : (
                  activityLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-4 p-4 bg-white border border-[#F1EDE4] rounded-2xl hover:shadow-sm transition-all">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                        log.type === 'attendance' ? 'bg-emerald-50 text-emerald-600' :
                        log.type === 'case' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {log.type === 'attendance' ? <CheckCircle size={20} /> : <Eye size={20} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#28332D] truncate">{log.teacher_name}</p>
                        <p className="text-xs text-[#6B7280]">{log.details}</p>
                      </div>
                      <div className="text-[10px] text-[#9CA3AF] font-medium whitespace-nowrap uppercase">
                        {new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "ai_usage" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-widest text-[#9CA3AF] border-b border-[#E6E2D6]">
                      <th className="pb-4 font-semibold p-4">Öğretmen</th>
                      <th className="pb-4 font-semibold p-4">İşlem</th>
                      <th className="pb-4 font-semibold p-4">Token (G/Ç)</th>
                      <th className="pb-4 font-semibold p-4 text-right">Tarih / Saat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiLogs.map((log) => (
                      <tr key={log.id} className="border-b border-[#F1EDE4] last:border-0 hover:bg-[#FDFBF7] transition-all text-sm">
                        <td className="p-4 font-medium">{log.teacher_name}</td>
                        <td className="p-4"><span className="capitalize">{log.features || "Genel"}</span></td>
                        <td className="p-4">
                          <span className="font-mono text-xs text-[#6B7280]">
                            {log.prompt_tokens} / {log.response_tokens}
                          </span>
                        </td>
                        <td className="p-4 text-right text-xs text-[#6B7280]">
                          {new Date(log.timestamp).toLocaleString('tr-TR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className="bg-white p-6 rounded-[32px] border border-[#E6E2D6] shadow-sm flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">{title}</p>
        <p className="text-3xl font-heading mt-1">{value || 0}</p>
      </div>
      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button 
      onClick={onClick}
      className={`px-8 py-5 text-sm font-medium transition-all relative ${
        active ? "text-[#4B6858]" : "text-[#9CA3AF] hover:text-[#6B7280]"
      }`}
    >
      {label}
      {active && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#4B6858]" />}
    </button>
  );
}

function HealthItem({ label, status }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[#6B7280]">{label}</span>
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-medium text-[#28332D]">{status}</span>
      </div>
    </div>
  );
}
