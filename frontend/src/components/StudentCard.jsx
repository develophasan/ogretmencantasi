import { Link } from "react-router-dom";
import { Phone, ChatCircle, Warning, PencilSimple, Trash } from "@phosphor-icons/react";

function calcAge(birthDate) {
  if (!birthDate) return "—";
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} ay`;
  if (m === 0) return `${y} yaş`;
  return `${y} yaş ${m} ay`;
}

export default function StudentCard({ student, onDelete }) {
  const hasAllergy = student.health?.allergies && student.health.allergies.trim();
  const parent = student.parent_mother?.name ? student.parent_mother : student.parent_father;
  const phone = parent?.phone?.replace(/\s/g, "");

  return (
    <div
      data-testid={`student-card-${student.id}`}
      className="bg-white rounded-2xl border border-[#E6E2D6] p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:border-[#4B6858]/30 flex flex-col"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center font-heading text-lg"
               style={{ background: student.gender === "Kız" ? "#D48D7C20" : "#4B685820", color: student.gender === "Kız" ? "#D48D7C" : "#4B6858" }}>
            {student.first_name?.[0]}{student.last_name?.[0]}
          </div>
          <div>
            <p className="font-heading text-lg leading-tight">
              {student.first_name} {student.last_name}
            </p>
            <p className="text-xs text-[#6B7280]">{student.gender} · {calcAge(student.birth_date)}</p>
          </div>
        </div>

        <span
          className={`text-[10px] px-2 py-0.5 rounded-full tracking-wider uppercase ${
            student.status === "Aktif"
              ? "bg-[#5E8B7E]/15 text-[#5E8B7E]"
              : "bg-[#6B7280]/15 text-[#6B7280]"
          }`}
        >
          {student.status}
        </span>
      </div>

      {hasAllergy && (
        <div
          data-testid={`allergy-badge-${student.id}`}
          className="mt-4 flex items-center gap-2 bg-[#C86B5E]/10 text-[#C86B5E] rounded-xl px-3 py-2 text-xs"
        >
          <Warning size={16} weight="fill" />
          <span className="truncate">Alerji: {student.health.allergies}</span>
        </div>
      )}

      <div className="mt-4 text-xs text-[#6B7280] space-y-1">
        <p><span className="text-[#28332D]/70">Veli:</span> {parent?.name || "—"}</p>
        <p><span className="text-[#28332D]/70">Telefon:</span> {parent?.phone || "—"}</p>
      </div>

      <div className="mt-auto pt-5 flex items-center gap-2">
        <a
          href={phone ? `tel:${phone}` : undefined}
          data-testid={`call-parent-${student.id}`}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-[#E6E2D6] px-3 py-2 text-xs transition-all ${
            phone ? "hover:bg-[#F1EDE4] hover:border-[#4B6858]/30" : "opacity-40 pointer-events-none"
          }`}
        >
          <Phone size={14} weight="duotone" /> Ara
        </a>
        <a
          href={phone ? `https://wa.me/${phone.replace(/^\+/, "")}` : undefined}
          target="_blank"
          rel="noreferrer"
          data-testid={`whatsapp-parent-${student.id}`}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-[#E6E2D6] px-3 py-2 text-xs transition-all ${
            phone ? "hover:bg-[#F1EDE4] hover:border-[#4B6858]/30" : "opacity-40 pointer-events-none"
          }`}
        >
          <ChatCircle size={14} weight="duotone" /> Mesaj
        </a>
        <Link
          to={`/students/${student.id}`}
          data-testid={`edit-student-${student.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#4B6858] hover:bg-[#3A5244] text-white px-3 py-2 text-xs transition-all"
        >
          <PencilSimple size={14} weight="duotone" /> Kart
        </Link>
        <button
          onClick={() => onDelete?.(student)}
          data-testid={`delete-student-${student.id}`}
          className="inline-flex items-center justify-center rounded-full border border-[#E6E2D6] h-8 w-8 text-[#C86B5E] hover:bg-[#C86B5E]/10 hover:border-[#C86B5E]/30 transition-all"
          aria-label="Sil"
        >
          <Trash size={14} weight="duotone" />
        </button>
      </div>
    </div>
  );
}
