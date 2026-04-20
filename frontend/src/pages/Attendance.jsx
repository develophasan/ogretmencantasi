import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { tr as trLocale } from "date-fns/locale";
import "react-day-picker/dist/style.css";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import {
  CalendarBlank,
  CheckCircle,
  XCircle,
  ClockCountdown,
  NoteBlank,
  Sparkle,
  FloppyDisk,
  Users,
} from "@phosphor-icons/react";

const STATUS_OPTIONS = [
  { value: "Geldi", label: "Geldi", color: "#5E8B7E", icon: CheckCircle },
  { value: "Gelmedi", label: "Gelmedi", color: "#C86B5E", icon: XCircle },
  { value: "Geç Kaldı", label: "Geç Kaldı", color: "#E8A365", icon: ClockCountdown },
  { value: "İzinli", label: "İzinli", color: "#6B7280", icon: NoteBlank },
];

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function firstDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export default function Attendance() {
  const { user } = useAuth();
  const [selected, setSelected] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(firstDayOfMonth(new Date()));
  const [dayData, setDayData] = useState({ entries: [] });
  const [rangeData, setRangeData] = useState({ days: [], total_students: 0 });
  const [loadingDay, setLoadingDay] = useState(true);
  const [loadingRange, setLoadingRange] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState({}); // student_id -> entry override

  const shiftArrival = user?.class_schedule?.arrival_time || null;
  const shiftDeparture = user?.class_schedule?.departure_time || null;

  const loadDay = useCallback(async (date) => {
    setLoadingDay(true);
    try {
      const { data } = await api.get("/attendance", { params: { date } });
      setDayData(data);
      setDirty({});
    } finally {
      setLoadingDay(false);
    }
  }, []);

  const loadRange = useCallback(async (month) => {
    setLoadingRange(true);
    try {
      const start = toISO(firstDayOfMonth(month));
      const end = toISO(lastDayOfMonth(month));
      const { data } = await api.get("/attendance/range", { params: { start, end } });
      setRangeData(data);
    } finally {
      setLoadingRange(false);
    }
  }, []);

  useEffect(() => { loadDay(toISO(selected)); }, [selected, loadDay]);
  useEffect(() => { loadRange(viewMonth); }, [viewMonth, loadRange]);

  const setStatus = (student_id, status) => {
    setDirty((prev) => {
      const existing = dayData.entries.find((e) => e.student_id === student_id) || {};
      return {
        ...prev,
        [student_id]: {
          ...existing,
          ...(prev[student_id] || {}),
          student_id,
          status,
          check_in_time:
            status === "Geldi" || status === "Geç Kaldı"
              ? (prev[student_id]?.check_in_time ?? existing.check_in_time ?? shiftArrival)
              : null,
          check_out_time:
            status === "Geldi"
              ? (prev[student_id]?.check_out_time ?? existing.check_out_time ?? shiftDeparture)
              : null,
        },
      };
    });
  };

  const setNote = (student_id, notes) => {
    setDirty((prev) => {
      const existing = dayData.entries.find((e) => e.student_id === student_id) || {};
      return {
        ...prev,
        [student_id]: {
          ...existing,
          ...(prev[student_id] || {}),
          student_id,
          notes,
        },
      };
    });
  };

  const markAllPresent = () => {
    const next = {};
    for (const e of dayData.entries) {
      next[e.student_id] = {
        student_id: e.student_id,
        status: "Geldi",
        notes: e.notes || null,
        check_in_time: shiftArrival,
        check_out_time: shiftDeparture,
      };
    }
    setDirty(next);
    toast.success("Tümü 'Geldi' olarak işaretlendi. Kaydetmeyi unutmayın.");
  };

  const save = async () => {
    // Build payload: merge current entries with dirty overrides
    const map = {};
    for (const e of dayData.entries) {
      if (e.status) {
        map[e.student_id] = {
          student_id: e.student_id,
          status: e.status,
          notes: e.notes || null,
          check_in_time: e.check_in_time || null,
          check_out_time: e.check_out_time || null,
        };
      }
    }
    for (const [sid, v] of Object.entries(dirty)) {
      if (v.status) {
        map[sid] = {
          student_id: sid,
          status: v.status,
          notes: v.notes ?? (map[sid]?.notes ?? null),
          check_in_time: v.check_in_time ?? null,
          check_out_time: v.check_out_time ?? null,
        };
      }
    }
    const entries = Object.values(map);
    if (entries.length === 0) {
      toast.error("Kaydedilecek bir işaret yok.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/attendance", { date: toISO(selected), entries });
      toast.success(`${entries.length} öğrenci için yoklama kaydedildi.`);
      await Promise.all([loadDay(toISO(selected)), loadRange(viewMonth)]);
    } catch (_e) {
      toast.error("Kaydetme başarısız.");
    } finally {
      setSaving(false);
    }
  };

  // Build modifiers for day-picker (color coded per day based on presence ratio)
  const { presentDays, absentDays, partialDays } = useMemo(() => {
    const total = rangeData.total_students || 0;
    const p = [];
    const a = [];
    const par = [];
    for (const d of rangeData.days || []) {
      const marked = (d["Geldi"] || 0) + (d["Gelmedi"] || 0) + (d["İzinli"] || 0) + (d["Geç Kaldı"] || 0);
      if (marked === 0) continue;
      const date = new Date(d.date + "T00:00:00");
      if (d["Gelmedi"] === 0 && (d["Geldi"] || 0) > 0 && marked >= Math.max(1, total * 0.8)) {
        p.push(date);
      } else if ((d["Gelmedi"] || 0) > 0 && (d["Geldi"] || 0) === 0) {
        a.push(date);
      } else {
        par.push(date);
      }
    }
    return { presentDays: p, absentDays: a, partialDays: par };
  }, [rangeData]);

  const effectiveStatus = (student_id) => dirty[student_id]?.status
    ?? (dayData.entries.find((e) => e.student_id === student_id)?.status ?? null);

  const totalMarked = dayData.entries.filter((e) => {
    const st = effectiveStatus(e.student_id);
    return !!st;
  }).length;

  return (
    <Layout>
      <div className="fade-up">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-xs tracking-[0.25em] uppercase text-[#6B7280] font-semibold">Yoklama & Devam</p>
            <h1 className="font-heading text-4xl sm:text-5xl mt-2">Yoklama Takvimi</h1>
            <p className="text-[#6B7280] mt-2 max-w-xl">
              Takvimden bir gün seçin, öğrencileri işaretleyin. Giriş ve çıkış saatleri vardiyanıza göre otomatik doldurulur.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Calendar column */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-[#E6E2D6] p-6">
            <div className="flex items-center gap-3 mb-4">
              <CalendarBlank size={22} weight="duotone" className="text-[#4B6858]" />
              <h2 className="font-heading text-lg">Takvim</h2>
              {loadingRange && <span className="text-xs text-[#6B7280]">yükleniyor…</span>}
            </div>
            <div data-testid="attendance-calendar" className="attendance-calendar">
              <DayPicker
                mode="single"
                locale={trLocale}
                selected={selected}
                onSelect={(d) => d && setSelected(d)}
                month={viewMonth}
                onMonthChange={setViewMonth}
                showOutsideDays
                weekStartsOn={1}
                modifiers={{
                  present: presentDays,
                  absent: absentDays,
                  partial: partialDays,
                }}
                modifiersClassNames={{
                  present: "att-present",
                  absent: "att-absent",
                  partial: "att-partial",
                  selected: "att-selected",
                  today: "att-today",
                }}
              />
            </div>

            <div className="mt-5 space-y-2 text-xs">
              <p className="text-[#6B7280] uppercase tracking-[0.2em] font-semibold">Gösterge</p>
              <div className="flex flex-wrap gap-3 text-[#28332D]">
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#5E8B7E]" /> Tam katılım</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#E8A365]" /> Kısmi</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#C86B5E]" /> Yüksek devamsızlık</span>
              </div>
            </div>
          </div>

          {/* Day entries */}
          <div className="md:col-span-3 bg-white rounded-2xl border border-[#E6E2D6] p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <div>
                <p className="text-xs tracking-[0.2em] uppercase text-[#6B7280] font-semibold">Seçilen Gün</p>
                <h2 className="font-heading text-2xl mt-1">
                  {selected.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </h2>
                <p className="text-xs text-[#6B7280] mt-1">
                  {totalMarked}/{dayData.entries.length} işaretlendi
                  {shiftArrival && ` · Giriş ${shiftArrival}`}
                  {shiftDeparture && ` · Çıkış ${shiftDeparture}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={markAllPresent}
                  disabled={dayData.entries.length === 0}
                  data-testid="mark-all-present-btn"
                  className="inline-flex items-center gap-2 rounded-full border border-[#E6E2D6] px-4 py-2 text-xs hover:bg-[#F1EDE4] disabled:opacity-40"
                >
                  <Sparkle size={14} weight="duotone" /> Tümü Geldi
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  data-testid="attendance-save-btn"
                  className="inline-flex items-center gap-2 bg-[#4B6858] hover:bg-[#3A5244] text-white px-4 py-2 rounded-full text-xs transition-all hover:-translate-y-0.5 disabled:opacity-60"
                >
                  <FloppyDisk size={14} weight="duotone" /> {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </div>

            {loadingDay ? (
              <div className="py-12 flex justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-[#4B6858]/20 border-t-[#4B6858] animate-spin" />
              </div>
            ) : dayData.entries.length === 0 ? (
              <div className="py-10 text-center">
                <div className="h-14 w-14 mx-auto rounded-xl bg-[#F1EDE4] flex items-center justify-center">
                  <Users size={24} weight="duotone" className="text-[#4B6858]" />
                </div>
                <p className="mt-3 text-sm text-[#6B7280]">Aktif öğrenci bulunamadı.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#E6E2D6]">
                {dayData.entries.map((e) => {
                  const active = effectiveStatus(e.student_id);
                  const note = dirty[e.student_id]?.notes ?? e.notes ?? "";
                  return (
                    <li key={e.student_id} className="py-3" data-testid={`att-row-${e.student_id}`}>
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div
                            className="h-10 w-10 rounded-xl flex items-center justify-center font-heading text-xs"
                            style={{
                              background: e.gender === "Kız" ? "#D48D7C20" : "#4B685820",
                              color: e.gender === "Kız" ? "#D48D7C" : "#4B6858",
                            }}
                          >
                            {e.first_name[0]}{e.last_name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">{e.first_name} {e.last_name}</p>
                            <p className="text-xs text-[#6B7280]">{e.gender}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {STATUS_OPTIONS.map((opt) => {
                            const isActive = active === opt.value;
                            const Icon = opt.icon;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => setStatus(e.student_id, opt.value)}
                                data-testid={`att-${e.student_id}-${opt.value}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-all"
                                style={{
                                  background: isActive ? opt.color : "white",
                                  color: isActive ? "white" : opt.color,
                                  borderColor: isActive ? opt.color : "#E6E2D6",
                                }}
                              >
                                <Icon size={14} weight={isActive ? "fill" : "duotone"} />
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {active && (
                        <input
                          type="text"
                          value={note}
                          onChange={(ev) => setNote(e.student_id, ev.target.value)}
                          placeholder="Not (opsiyonel): geç nedeni, izin belgesi…"
                          data-testid={`att-note-${e.student_id}`}
                          className="mt-2 w-full rounded-xl border border-[#E6E2D6] bg-[#FDFBF7] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#4B6858]"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
