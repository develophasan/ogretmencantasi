# PRD — Öğretmen Çantası (Okul Öncesi Eğitim Yönetim Sistemi)

## Original Problem Statement
Bir 'Okul Öncesi Eğitim Yönetim Sistemi'. Teachers (ad-soyad, email, okul, Maarif/ECE, vardiya saatleri). Students (ad, soyad, doğum tarihi, cinsiyet + opsiyonel veli/sağlık/adres). Dashboard, kurulum sihirbazı, aday kayıt formu, öğrenci kartları, responsive.

## Architecture
- **Backend**: FastAPI + Motor + Pydantic v2 + Emergent Google Auth (httpOnly cookie 7-day)
- **Frontend**: React 19 + React Router v7 + Tailwind + Phosphor Icons (duotone) + sonner toasts + react-hook-form
- **AI**: Claude Sonnet 4.5 (emergentintegrations + Emergent Universal Key) · JSON-command execution pattern
- **STT**: OpenAI Whisper-1 (emergentintegrations) · Türkçe
- **Design**: "Organic & Earthy" (#4B6858 sage, #D48D7C terracotta, #FDFBF7 cream). Outfit + Figtree.

## Implemented (2026-02 → 2026-04)
- [x] Auth: /api/auth/{session,me,logout}
- [x] Class settings: Tam Gün / Yarım Gün · Sabahçı / Öğleci dinamik saat alanları
- [x] Students CRUD + search + status filter + teacher isolation
- [x] Attendance: upsert/day/range/history + takvim (Türkçe) + koşullu vardiya saatleri
- [x] Reports: boş 8 bölümlü taslak
- [x] Daily Cases (Günlük Vakalar) — CRUD + AI ekleyebilir
- [x] Activity Notes (Etkinlik Notları) — CRUD + AI ekleyebilir
- [x] **AI Asistan (Chat)**
  - /api/chat/message — Claude Sonnet 4.5, JSON output, komut yürütme
  - /api/chat/voice — Whisper transcription + aynı pipeline
  - /api/chat/history (GET/DELETE)
  - Komutlar: mark_attendance, mark_all_present, add_daily_case, add_activity_note
  - Katı sistem prompt'u: sadece JSON + görev dışı konuşmaz
- [x] Mobile UX: Ortalanmış üst bar + 5 item Bottom Nav + Chat FAB
- [x] Desktop: Yatay top nav + Chat docked panel (380×560)
- [x] Pytest 61/62 ✅ (1 voice edge-case düzeltildi) · Playwright E2E ✅

## User Personas
- **Okul Öncesi Öğretmeni**: 15-25 öğrencilik sınıfı yönetir, sık mobil kullanır, yoğun günde hızlı veri girer.

## Backlog
### P1
- [ ] Aday Kayıt PDF'inden OCR toplu içe aktarma
- [ ] Öğrenci profil fotoğrafı (object storage)
- [ ] AI rapor doldurma (yoklama + günlük vaka + etkinlik notu → dönem raporu)

### P2
- [ ] Server.py'ı routers'a böl (sınır: ~1200 satır)
- [ ] Aylık devam raporu PDF dışa aktarma
- [ ] Veli paylaşım linki (gözlem özeti)
- [ ] Çoklu sınıf desteği

## Agent Notes
- `_run_assistant` şu anda önceki user turnlarını Claude'a replay ediyor → maliyeti artırabilir. İleride session-memory optimizasyonu.
- Sistem prompt JSON-only; düşük hata riski.
- Voice endpoint artık tüm hatalarda 200 + dostça yanıt.
