# Canva Slide Content — UniEnroll Final Presentation

> **รูปแบบ:** 12 สไลด์ · เวลาพรีประมาณ 7–9 นาที  
> **หลักการ:** บนสไลด์ใช้ข้อความสั้น เน้นภาพ/แผนผัง ส่วนรายละเอียดให้อยู่ใน Speaker Notes  
> **Cross-Group Integration ที่นำเสนอ:** Team 01 Student Identity เท่านั้น

---

# Slide 1 — Title

## ข้อความบนสไลด์

**UniEnroll**  
Course Enrollment Platform

- Team 03
- 2026 Platform Development
- Cloud-Native · Secure · API-Integrated

## ภาพที่แนะนำ

- Logo หรือภาพหน้า Course Catalog ของ UniEnroll
- Logo/ไอคอน Cloudflare Pages, Workers และ D1 ขนาดเล็กด้านล่าง

## พูด

> “สวัสดีครับ โปรเจกต์ของเราชื่อ UniEnroll เป็นระบบลงทะเบียนรายวิชาที่ทำงานบน Cloudflare และเชื่อม Student Identity ของ Team 01 ผ่าน API จริงครับ”

---

# Slide 2 — Problem

## หัวข้อ

**ปัญหาของการลงทะเบียนรายวิชา**

## ข้อความบนสไลด์

- นักศึกษาหลายคนแย่งที่นั่งสุดท้ายพร้อมกัน
- ตารางเรียนชน ลงวิชาซ้ำ หรือเกินหน่วยกิต
- ต้องตรวจวิชาบังคับก่อนอย่างถูกต้อง
- ต้องยืนยันตัวตนและ Consent ก่อนลงทะเบียน

## ภาพที่แนะนำ

ใช้ไอคอน 4 รูป:

1. ที่นั่งเต็ม
2. ตารางเวลาชนกัน
3. วิชาบังคับก่อน
4. Identity/Consent

## พูด

> “ปัญหาหลักไม่ใช่แค่การกดเลือกวิชาครับ ระบบต้องจัดการการแย่งที่นั่ง ตรวจเงื่อนไขทางการศึกษา และยืนยันตัวตนโดยไม่เปิดเผยข้อมูลเกินความจำเป็น”

---

# Slide 3 — Our Solution

## หัวข้อ

**UniEnroll แก้ปัญหาอย่างไร**

## ข้อความบนสไลด์

- Login ด้วย Student Identity Team 01
- ตรวจ Eligibility ก่อนทุกการลงทะเบียน
- ป้องกัน Duplicate และ Capacity Race
- แสดงผลใน My Schedule ทันที

## ภาพที่แนะนำ

ใช้ Flow แนวนอน:

```text
Login → Verify Identity → Select Course → Validate Rules → My Schedule
```

ใช้ Screenshot หน้า Course Catalog และ My Schedule อย่างละหนึ่งภาพ

## พูด

> “นักศึกษาใช้บัญชี Team 01 Login เข้ามา ระบบตรวจ Identity และกฎการลงทะเบียน จากนั้นบันทึกผลลง D1 และแสดงใน My Schedule ครับ”

---

# Slide 4 — Users & Features

## หัวข้อ

**ผู้ใช้งานและความสามารถหลัก**

## ข้อความบนสไลด์

### Student

- ดูรายวิชาและจำนวนที่นั่ง
- ลงทะเบียน เปลี่ยน Section และถอนวิชา
- ดูตารางเรียนของตนเอง

### Staff

- ดู Enrollment Overview
- อนุมัติ Override พร้อมเหตุผล
- ตรวจสอบ Audit Trail

## ภาพที่แนะนำ

แบ่งสไลด์เป็นสองฝั่ง:

- ซ้าย: Student + ภาพ Course Catalog
- ขวา: Staff + ภาพ Staff Override

## พูด

> “ระบบมีสองบทบาทครับ Student จัดการการลงทะเบียนของตนเอง ส่วน Staff สามารถอนุมัติกรณีพิเศษ เช่น วิชาเต็มหรือยกเว้น prerequisite โดยทุกการอนุมัติต้องมีเหตุผลและ Audit Log”

---

# Slide 5 — System Architecture

## หัวข้อ

**Cloud Architecture**

## ข้อความบนสไลด์

```text
Student Browser
      ↓ HTTPS
Next.js Frontend — Cloudflare Pages
      ↓ REST API + JWT
Hono Backend — Cloudflare Workers
      ├── Cloudflare D1
      ├── Workers AI
      └── Team 01 Student Identity API
```

ข้อความกำกับสั้น:

- **D1:** Courses, Sections, Students, Enrollments, Audit
- **Workers AI:** Explanation only
- **Team 01:** Authentication, Profile, Consent

## ภาพที่แนะนำ

วาด Architecture Diagram ด้วยกล่อง 4 กล่องและลูกศร ห้ามใส่ข้อความยาว

## พูด

> “Frontend อยู่บน Cloudflare Pages และเรียก Hono API บน Workers ข้อมูลเก็บใน D1 ส่วน Team 01 ใช้ยืนยันตัวตนและ Consent สำหรับ AI เราใช้เฉพาะช่วยอธิบายผล ไม่ได้ใช้ตัดสินการลงทะเบียนครับ”

---

# Slide 6 — Cross-Group Integration

## หัวข้อ

**Integration with Team 01 Student Identity**

## ข้อความบนสไลด์

- Provider: **Team 01 Student Identity**
- Consumer: **Team 03 UniEnroll**
- Protocol: **HTTPS REST API**
- Consent: **Enrollment / profile:read**

```text
POST /auth/login → Temporary Token
GET /me → Verify Token Owner
GET /students/{id}/claims → Verify Identity & Consent
```

## ภาพที่แนะนำ

- ภาพหน้า Team 01 Consent ที่แสดง `Enrollment: Sharing`
- ลูกศร Team 01 → UniEnroll
- ภาพแถบ `Student Identity · Team 01` ใน UniEnroll

## พูด

> “นี่เป็นการเชื่อมจริง ไม่ใช่ Mock ครับ UniEnroll Worker เรียก Team 01 ผ่าน HTTPS การ Login ใช้ `/auth/login` และ `/me` ส่วน Claims API ใช้ตรวจ verified, profile completeness และ Consent ก่อนเปิดสิทธิ์ลงทะเบียน”

---

# Slide 7 — How Student Login Works

## หัวข้อ

**How Students Login**

## ข้อความบนสไลด์

```text
1. Student enters Team 01 credentials
2. UniEnroll Worker calls Team 01 /auth/login
3. Temporary token is verified through /me
4. New student is created by JIT Provisioning
5. Team 01 token is discarded
6. UniEnroll issues its own JWT
```

ข้อความเน้นด้านล่าง:

**No Team 01 password or access token is stored.**

## ภาพที่แนะนำ

ใช้ Sequence Diagram ระหว่าง:

```text
Student → UniEnroll → Team 01 → UniEnroll JWT
```

## พูด

> “Team 01 เป็นผู้ตรวจรหัสผ่านครับ หลัง Login เราใช้ token ชั่วคราวเรียก `/me` เพื่อยืนยันว่าเป็น Student ID เดียวกัน ถ้าเป็นบัญชีใหม่จะทำ JIT Provisioning จากนั้นทิ้ง token ของ Team 01 แล้วออก JWT ของ UniEnroll เอง”

---

# Slide 8 — API & Code Flow

## หัวข้อ

**API Connection & Source Code**

## ข้อความบนสไลด์

```text
Frontend API Client
src/lib/api.ts
        ↓
Worker Route Registration
src/backend/index.ts
        ↓
Authentication & JIT
src/backend/routes/auth.ts
        ↓
Team 01 API Client
src/backend/lib/student-identity-client.ts
        ↓
Claims & Consent Gate
src/backend/routes/external.ts
```

## ภาพที่แนะนำ

- ใช้ Flowchart ไฟล์ 5 กล่อง
- ใส่ Screenshot code สั้น ๆ เฉพาะบรรทัด `app.route(...)` และ `fetch(...)`
- ห้ามใส่โค้ดเต็มหน้า

## พูด

> “Frontend เรียก Backend ผ่าน `api.ts`, `index.ts` เป็นตัว mount routes, `auth.ts` ควบคุม Login และ JIT, ส่วน `student-identity-client.ts` เป็น client ที่เรียก Team 01 จริง สำหรับ Claims และ Consent อยู่ใน `external.ts` ครับ”

---

# Slide 9 — Enrollment Rule Engine

## หัวข้อ

**Deterministic Enrollment Rules**

## ข้อความบนสไลด์

ระบบตรวจก่อนบันทึก:

- Prerequisite & Grade
- Schedule Conflict
- 22-Credit Limit
- Duplicate Enrollment
- Available Capacity

ข้อความเน้น:

**D1 is the final capacity arbiter.**

## ภาพที่แนะนำ

```text
Enrollment Request
        ↓
Rule Engine
  ✓ Prerequisite
  ✓ Schedule
  ✓ Credits
  ✓ Duplicate
  ✓ Capacity
        ↓
Cloudflare D1
```

## พูด

> “Eligibility มาจาก deterministic rules ทั้งหมดครับ ส่วนจำนวนที่นั่งให้ D1 เป็นผู้ตัดสินสุดท้ายแบบ atomic จึงป้องกันกรณีหลายคนแย่งที่นั่งสุดท้ายพร้อมกันและไม่เกิด oversell”

---

# Slide 10 — Security & PDPA

## หัวข้อ

**Security & PDPA by Design**

## ข้อความบนสไลด์

- Consent + Data Minimization: `Enrollment / profile:read`
- JWT Authentication + Student/Staff RBAC
- ไม่เก็บ Password/Team 01 token; Service Key อยู่ใน Worker Secret
- Prepared Statements + Idempotency + Audit Log

## ภาพที่แนะนำ

ใช้ไอคอน:

- Consent
- JWT Shield
- Cloud Secret
- Database Lock
- Audit Log

## พูด

> “ด้าน PDPA นักศึกษาเป็นผู้อนุญาตการแชร์ profile และระบบอ่านเฉพาะข้อมูลที่จำเป็น ด้าน Security เราไม่เก็บรหัสผ่านหรือ token ของ Team 01, service key อยู่ฝั่ง Worker และทุก protected API ตรวจ JWT กับ Role ครับ”

---

# Slide 11 — Testing & Quality Assurance

## หัวข้อ

**Testing & Quality Assurance**

## ข้อความบนสไลด์

- Authentication & Partner Response Tests
- Enrollment Rule Tests
- Concurrency · Idempotency · Webhook Retry
- TypeScript · ESLint · Production Build

ข้อความเน้น:

```text
60 requests / 50 seats → No Overselling
```

## ภาพที่แนะนำ

- Screenshot terminal ผล `pnpm run test`
- Badge: Tests Passed
- Diagram คน 60 คนแย่ง 50 ที่นั่ง แต่สำเร็จไม่เกิน 50

## พูด

> “เราไม่ได้ทดสอบเฉพาะ Happy Path ครับ มีทั้งรหัสผ่านผิด, Partner ล่ม, Consent ไม่ผ่าน, กฎการลงทะเบียน และ concurrency test ที่ยิง 60 requests เข้า 50 ที่นั่งเพื่อยืนยันว่าไม่ oversell”

---

# Slide 12 — Deployment, Development & Conclusion

## หัวข้อ

**Production-Ready Workflow**

## ข้อความบนสไลด์

- Cloud Stack: **Pages + Workers + D1**
- Git-based development on `preproduct`
- Test → Typecheck → Build → Deploy → Health Check
- Production URLs พร้อมตรวจสอบจริง

ข้อความสรุปใหญ่:

**Verified Identity. Deterministic Rules. Safe Enrollment.**

Production URLs ขนาดเล็กด้านล่าง:

```text
unienroll-frontend.pages.dev
unienroll-backend.team03-enrollment.workers.dev
```

## ภาพที่แนะนำ

- ภาพ Production URL
- Cloudflare deployment result
- Git commit graph ขนาดเล็ก

## พูด

> “สรุป UniEnroll เป็นระบบลงทะเบียนที่ deploy จริงบน Cloudflare เชื่อม Team 01 ผ่าน API และ Consent จริง ใช้กฎที่ตรวจสอบได้และ D1 ป้องกัน capacity race พร้อม automated tests และ workflow ที่สามารถแก้ ทดสอบ และ redeploy ได้ครับ”

---

# ลำดับ Live Demo หลังจบสไลด์

1. เปิด Production Frontend
2. Login ด้วยบัญชี Team 01
3. ชี้แถบ `Student Identity · Team 01`
4. เลือก Section ที่ยังว่างและผ่านกฎ
5. กด `Register Section`
6. เปิด `My Schedule`
7. เปิด Source Code ตาม Slide 8 หากอาจารย์ถาม API

---

# Screenshot Checklist สำหรับทำ Canva

- [ ] หน้า Login ของ UniEnroll Production
- [ ] หน้า Team 01 Consent — `Enrollment: Sharing`
- [ ] แถบ `Student Identity · Team 01`
- [ ] Course Catalog และจำนวนที่นั่ง
- [ ] My Schedule ที่มีวิชาลงทะเบียนแล้ว
- [ ] Staff Override พร้อม Audit Log
- [ ] Terminal ผล Automated Tests
- [ ] Cloudflare Pages/Workers Deployment
- [ ] Git commit history

> ห้ามให้ภาพมี password, JWT, API key, Authorization header หรือค่าจาก `.dev.vars`

---

# กฎการออกแบบใน Canva

- ใช้ไม่เกิน 4 bullet ต่อสไลด์ หากเกินให้ใช้ Diagram
- Font หัวข้อใหญ่ อ่านได้จากท้ายห้อง
- ใช้สีหลัก Navy / Blue / White ตามหน้า UniEnroll
- ใช้ Screenshot จริงจาก Production
- ขีดเส้นหรือกรอบเฉพาะจุดที่กำลังอธิบาย
- ห้ามใส่ Source Code ยาว ให้แสดงเฉพาะ 5–10 บรรทัดสำคัญ
- ทุกสไลด์ควรตอบได้ว่า “ผู้ชมต้องจำอะไรจากหน้านี้หนึ่งอย่าง”
