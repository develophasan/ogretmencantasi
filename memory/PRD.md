# PRD — Öğretmen Çantası (Okul Öncesi Eğitim Yönetim Sistemi)

## Original Problem Statement
Bir 'Okul Öncesi Eğitim Yönetim Sistemi' için tam donanımlı Backend ve Frontend altyapısı tasarla.
Veri modelleme: Teachers (Ad-Soyad, Email, Şifre, Okul Adı, Eğitim Modeli Maarif/EÇE, Sınıf saatleri, yemek saatleri). Students (Zorunlu: Ad-Soyad, Doğum Tarihi, Cinsiyet; Opsiyonel: T.C., Veli, Adres, Sağlık vb.).
Frontend: Dashboard, Sınıf Kurulum Sihirbazı, Aday Kayıt Formu, Öğrenci Kartları, Responsive.
Teknik: React Hook Form, Date-picker, Axios, Context API.

## Architecture
- Backend: FastAPI + Motor (async MongoDB), Pydantic v2 models, Emergent-managed Google OAuth with httpOnly cookie session_token
- Frontend: React 19 + React Router v7 + TailwindCSS + shadcn/ui tokens + Phosphor Icons (duotone) + sonner toasts
- Design: "Organic & Earthy" palette (sage #4B6858, terracotta #D48D7C, cream #FDFBF7). Typography: Outfit (headings) + Figtree (body). Turkish UI.

## User Personas
1. **Okul Öncesi Öğretmeni** — Tek başına 15-25 öğrencilik sınıfı yönetir. Masaüstü ve tablet kullanır, günlük veri girişi yapar.

## Core Requirements (static)
- Emergent Google Auth zorunlu (ek şifre yok)
- Sınıf kurulumu (Maarif vs ECE) ilk girişte zorunlu
- Öğrenci CRUD + sağlık notları + alerji rozetleri
- Rapor taslağı (8 bölüm: sosyal-duygusal, bilişsel, dil, motor, öz bakım, yaratıcılık, notlar, öneriler)
- Responsive (mobil + tablet)
- Turkish UI baştan sona

## Implemented (2026-02-20)
- [x] Backend `/api/auth/{session,me,logout}` — Emergent Google Auth
- [x] Backend `/api/class-settings` GET/PUT (incl. class_type Tam/Yarım Gün + Sabahçı/Öğleci shift)
- [x] Backend `/api/students` CRUD + search/status filter + teacher isolation
- [x] Backend `/api/reports/draft` + `/api/reports` list (boş 8 bölüm)
- [x] Backend `/api/dashboard` özeti
- [x] Frontend `/login` — split screen, Google ile devam et
- [x] Frontend `/setup` — 4 adımlı sihirbaz (Okul → Model → Sınıf Tipi/Vardiya → Saatler)
- [x] Akıllı saat/öğün mantığı: Sabahçı→kahvaltı, Öğleci→ikindi, Tam Gün→hepsi
- [x] Frontend `/dashboard` — koşullu akış kartları (vardiyaya göre)
- [x] Frontend `/students` — arama + status filtresi + grid
- [x] Frontend `/students/new` — zorunlu/isteğe bağlı görsel ayrım + React Hook Form
- [x] Frontend `/students/:id` — kart + inline düzenleme + ara/WhatsApp/sil
- [x] Frontend `/reports` — tarih aralığı + modal taslak görüntüleme
- [x] Frontend `/settings` — sınıf ayarları + sınıf tipi/vardiya güncellemesi
- [x] Pytest suite (25/25) + Playwright E2E geçti

## Backlog
### P1
- [ ] Aday Kayıt PDF formundan OCR import
- [ ] AI rapor doldurma (Claude/GPT-5.2 entegrasyonu)
- [ ] Öğrenci fotoğrafı yükleme (object storage)
- [ ] Yoklama/devam takibi

### P2
- [ ] Ebeveyn paylaşımlı rapor link'i
- [ ] Sınıf takvimi ve etkinlikler
- [ ] Çoklu sınıf desteği (bir öğretmen → birden fazla şube)
- [ ] Shadcn Calendar ile tarih seçici iyileştirmesi
- [ ] Öğrenci listesi sayfalama (100+ öğrenci için)

## Next Tasks
Suggested P1 önceliği: AI rapor doldurma — Claude Sonnet 4.5 ile boş taslağı dönem gözlemlerine göre doldurur.
