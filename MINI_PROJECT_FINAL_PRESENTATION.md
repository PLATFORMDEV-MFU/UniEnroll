# Mini Project Final Presentation — UniEnroll

> **วิชา:** 2026 Platform Development  
> **วันประเมิน:** 10 November 2026, 13:00–18:00  
> **เวลาต่อกลุ่ม:** ประมาณ 5–10 นาที  
> **Repository:** `https://github.com/PLATFORMDEV-MFU/UniEnroll`  
> **Production Backend:** `https://unienroll-backend.team03-enrollment.workers.dev`  
> **Production Frontend:** `https://unienroll-frontend.pages.dev`

---

## 0. จุดที่ต้องปิดก่อนเข้าห้องประเมิน

- [x] **Deploy Frontend ขึ้น Cloudflare Pages** — `https://unienroll-frontend.pages.dev`
- [x] Frontend ใช้ Production API `https://unienroll-backend.team03-enrollment.workers.dev`
- [x] เปิด Frontend production URL จาก browser session แยกแล้ว — หน้า Login ตอบ HTTP 200
- [x] Commit และ push source ล่าสุดแล้ว — `dfd87ca` อยู่ทั้ง `preproduct` และ `origin/preproduct`
- [ ] ซ้อมบัญชี Team 01 ใหม่หนึ่งรอบ: สมัคร → Consent → Login UniEnroll → Identity ผ่าน → ลงทะเบียน
- [ ] ตรวจ Team 01 และ UniEnroll health ก่อนถึงคิว
- [ ] เตรียมบัญชีสำรองที่เปิด Consent แล้ว แต่ห้ามใส่รหัสผ่านไว้ในเอกสารหรือสไลด์
- [ ] ทุกคนในกลุ่มทราบหน้าที่และอยู่ครบ
- [ ] ประสาน Team 01 ให้ service พร้อมในช่วง 13:00–18:00
- [ ] หลังพรีให้ rotate Student Identity service key ที่เคยใช้ระหว่างพัฒนา

### Health check ก่อนพรี

```bash
curl https://unienroll-backend.team03-enrollment.workers.dev/health
```

ผลที่ต้องได้:

```json
{ "status": "ok", "timestamp": "..." }
```

---

# 1. สคริปต์พรี 7 นาที

## 0:00–0:30 — แนะนำปัญหาและระบบ

**พูด:**

> “โปรเจกต์ของเราชื่อ UniEnroll เป็นระบบลงทะเบียนรายวิชาที่แก้ปัญหาการแย่งที่นั่ง การลงซ้ำ ตารางชน วิชาบังคับก่อน และจำนวนหน่วยกิตเกิน ระบบทำงานบน Cloudflare และเชื่อมกับ Student Identity ของ Team 01 เพื่อยืนยันตัวตนและ Consent จริงผ่าน API”

**เปิด:** Production Frontend หน้า Login  
**ชี้:** URL ต้องเป็น Cloud URL ไม่ใช่ `localhost`

---

## 0:30–1:10 — Architecture

```text
Student Browser
      |
      v
Next.js Frontend (Cloud URL)
      |
      v
Hono API on Cloudflare Workers
      |-- Cloudflare D1: users, courses, sections, enrollments, audit/outbox
      |-- Workers AI: เขียนคำอธิบายเท่านั้น ไม่ตัดสิน eligibility
      `-- Team 01 Student Identity API
             |-- /auth/login + /me: ยืนยันบัญชี
             `-- /students/{id}/claims: verified/profileComplete/consent
```

**พูด:**

> “Frontend ใช้ Next.js ส่วน API ใช้ Hono บน Cloudflare Workers และเก็บข้อมูลใน Cloudflare D1 การตัดสินว่าลงทะเบียนได้หรือไม่ได้เป็น deterministic rules ทั้งหมด ส่วน AI ใช้เฉพาะช่วยอธิบายผล จึงไม่สามารถข้ามกฎของระบบได้”

**หลักฐาน source:**

- Worker entrypoint: `src/backend/index.ts`
- D1 schema: `src/backend/db/schema.sql`
- Enrollment rules: `src/backend/lib/enrollment-rule-engine.ts`
- AI explanation: `src/backend/lib/decision-explainer.ts`
- Deployment config: `wrangler.jsonc`

---

## 1:10–3:40 — Happy Path: สมัคร Team 01 แล้วเข้า UniEnroll

### ขั้นที่ 1 — สมัคร/เปิดบัญชี Team 01

**ทำ:** สมัครด้วย Student ID 10 หลักและอีเมลใหม่ หรือใช้บัญชี demo ที่เตรียมไว้

**พูด:**

> “นักศึกษาใช้บัญชีจาก Student Identity ของ Team 01 ระบบ UniEnroll ไม่ได้สร้างหรือเก็บรหัสผ่าน Team 01 เอง”

### ขั้นที่ 2 — ให้ Consent

**ทำ:** Team 01 → `Consent & sharing` → การ์ด `Enrollment` → ติ๊ก `profile:read` → `Save`

**ชี้:** สถานะต้องเปลี่ยนจาก `Not sharing` เป็น `Sharing`

**พูด:**

> “ตามหลัก PDPA นักศึกษาต้องให้ Consent แก่ service Enrollment ก่อน UniEnroll จึงจะอ่านสถานะ verified และความครบถ้วนของ profile ได้ ไม่ต้องอนุญาตให้บริการอื่น”

### ขั้นที่ 3 — Login UniEnroll

**ทำ:** กรอก Student ID และรหัสผ่านเดียวกับ Team 01

**พูด:**

> “UniEnroll ส่ง credential จาก Worker ไป Team 01 ผ่าน HTTPS จากนั้นใช้ token ชั่วคราวเรียก `/me` เพื่อตรวจว่าเป็น Student ID เดียวกัน แล้วทิ้ง Team 01 token ก่อนออก JWT ของ UniEnroll”

### ขั้นที่ 4 — JIT Provisioning

**ชี้:** ชื่อและ Student ID บน UniEnroll

**พูด:**

> “ถ้า Student ID นี้ยังไม่มีใน UniEnroll ระบบจะสร้าง student record จาก profile ที่ Team 01 ยืนยันแล้วอัตโนมัติ เรียกว่า Just-in-Time Provisioning แต่จะไม่เก็บรหัสผ่านหรือ Team 01 token”

### ขั้นที่ 5 — Identity Gate

**ชี้:** แถบ `Student Identity · Team 01`

ผลที่ต้องแสดง:

- `verified: true`
- `profileComplete: true`
- `missingFields: []`
- `can_enroll: true`

**พูด:**

> “ปุ่มลงทะเบียนจะเปิดเฉพาะเมื่อ verified และ profileComplete เป็น true ทั้งคู่ ถ้าไม่มี Consent ระบบปฏิเสธและไม่เปิดให้ลงทะเบียน”

### ขั้นที่ 6 — ลงทะเบียนวิชา

**ทำ:** เลือกวิชาที่มีที่นั่งและผ่าน prerequisite → กด Enroll → เปิด `My Schedule`

**พูด:**

> “คำขอนี้ผ่านกฎ prerequisite, ตารางชน, 22-credit limit, duplicate และ capacity ก่อนบันทึกลง D1 เมื่อสำเร็จจะแสดงในตารางของนักศึกษา”

---

## 3:40–4:30 — Cross-Group Integration Evidence

### Partner

- **Provider:** Team 01 Student Identity
- **Consumer:** Team 03 UniEnroll
- **Protocol:** HTTPS REST API
- **Consent scope:** `Enrollment / profile:read`

### Request flow

```text
POST Team 01 /auth/login
  -> short-lived access token
GET Team 01 /me
  -> verify returned student_id matches submitted Student ID
DISCARD Team 01 token
  -> issue UniEnroll JWT
GET Team 01 /students/{studentId}/claims
  -> verified, profileComplete, missingFields, skills
```

### หลักฐานที่เปิดให้อาจารย์ดู

1. `src/backend/lib/student-identity-client.ts` — API client, timeout, response validation
2. `src/backend/routes/auth.ts` — federated login และ JIT provisioning
3. `src/backend/routes/external.ts` — claims endpoint และ enrollment gate
4. `docs/student-identity-integration.md` — data flow และ failure behavior
5. `tests/student-identity.test.ts` — API response/schema tests
6. `tests/auth-security.test.ts` — auth และ provisioning tests
7. หน้า Team 01 ที่ขึ้น `Enrollment: Sharing`
8. หน้า UniEnroll ที่ Identity ผ่าน
9. Cloudflare logs/API Logs ที่แสดง request status โดยไม่แสดง secret

**พูด:**

> “นี่เป็น integration จริง ไม่ใช่ mock เพราะ UniEnroll เรียก Team 01 ผ่าน HTTPS และใช้ผล claims จริงควบคุมปุ่มลงทะเบียน ถ้า Team 01 ปฏิเสธหรือ response ผิด schema ระบบจะ fail closed”

---

## 4:30–5:20 — Security และ PDPA

| Control | สิ่งที่ทำจริง | หลักฐาน |
|---|---|---|
| Authentication | JWT HS256 อายุ 24 ชั่วโมง; reject เมื่อ secret หาย/สั้น | `src/backend/middleware/auth.ts` |
| Federated password | ส่งไป Team 01 ทาง HTTPS; ไม่เก็บ password/token | `src/backend/lib/student-identity-client.ts` |
| Staff password | PBKDF2-HMAC-SHA256, random salt, 100,000 iterations, constant-time compare | `src/backend/lib/crypto.ts` |
| Authorization | Student/Staff RBAC; staff-only routes | `requireRole()` และ route middleware |
| Consent | อ่าน claims เฉพาะ service `Enrollment` ที่ได้รับ `profile:read` | Team 01 Consent UI + claims route |
| Data minimization | ใช้เฉพาะ Student ID, ชื่อ, email, faculty/major และ claims ที่จำเป็น | auth/JIT code |
| Injection prevention | D1 prepared statements และ `.bind()` | Backend routes |
| Replay/duplicate | `Idempotency-Key` ผูก actor+method+path+request hash | `src/backend/middleware/idempotency.ts` |
| Capacity race | D1 transaction/constraint เป็น final arbiter | enrollment route + schema + concurrency tests |
| Webhook integrity | HMAC-SHA256 signature, stable `event_id`, retry/outbox | `src/backend/lib/webhook-sender.ts` |
| Secret handling | Wrangler secrets; ไม่มีค่าจริงใน `wrangler.jsonc` | `wrangler secret list`, config |
| Audit evidence | partner request logs, webhook logs, rule decisions | D1 schema/routes |

**พูด:**

> “PDPA ของเราใช้ consent และ data minimization นักศึกษาควบคุมการแชร์ profile ได้ และ secret ทุกตัวอยู่ฝั่ง Worker ส่วน browser ไม่เห็น service key การลงทะเบียนใช้ prepared statements, JWT, RBAC, idempotency และ database constraints เพื่อป้องกันการโจมตีและ race condition”

> **ห้ามพูดว่า ‘ปลอดภัย 100%’** ให้พูดว่า “มี controls สำหรับความเสี่ยงหลักและมี tests รองรับ”

---

## 5:20–6:10 — Testing & QA

### Automated tests ล่าสุด

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run build
```

ผลที่ตรวจล่าสุด:

- Vitest: **7 files / 44 tests passed**
- TypeScript: **passed**
- ESLint: **0 errors / 32 existing warnings**
- Next.js production build: **passed**

### Critical cases

- Happy-path enrollment
- Invalid Team 01 password → `401` และไม่สร้าง student
- Team 01 subject mismatch/invalid response → fail closed
- Missing Consent → claims rejected และปุ่ม enrollment disabled
- Prerequisite failure
- Schedule conflict
- 22-credit limit
- Duplicate enrollment/idempotent replay
- Last-seat race: 49/50 + 2 requests → สำเร็จเพียง 1
- Load race: 60 requests for 50 seats → ไม่ oversell
- Webhook retry ใช้ `event_id` เดิม
- Unauthorized student override → rejected

### Manual tests ที่ต้องบันทึกก่อนพรี

| Case | Expected | Result/เวลา |
|---|---|---|
| Cloud Frontend เปิดจาก Incognito | หน้า Login โหลดได้ | `[กรอก]` |
| Backend `/health` | HTTP 200 | `[กรอก]` |
| Team 01 login ถูกต้อง | UniEnroll login สำเร็จ | `[กรอก]` |
| Team 01 password ผิด | HTTP 401 | `[กรอก]` |
| ไม่มี Consent | Identity rejected, ลงทะเบียนไม่ได้ | `[กรอก]` |
| เปิด Consent แล้วกด Check Again | `can_enroll: true` | `[กรอก]` |
| Enroll happy path | HTTP 201 และแสดงใน schedule | `[กรอก]` |
| Enroll ซ้ำ | ถูกปฏิเสธ/replay ตาม key | `[กรอก]` |

---

## 6:10–6:40 — Development Process และ AI Usage

**พูด:**

> “เราใช้ Git บน branch `preproduct` และพัฒนาแบบ test-driven ในส่วนที่มีความเสี่ยง เช่น authentication, integration, capacity concurrency และ webhook retry ทุกการเปลี่ยนสำคัญตรวจด้วย tests, typecheck, lint และ production build ก่อน deploy”

### AI ที่ใช้

1. **AI สำหรับพัฒนา:** Hermes Agent — ใช้ช่วยวิเคราะห์ source, เขียน tests, debug response contract และตรวจ build โดยสมาชิกยังต้องอ่าน diff และรัน verification จริง
2. **AI ในระบบ:** Cloudflare Workers AI — ใช้เขียนคำอธิบาย failed rules ให้อ่านง่ายเท่านั้น
3. **Safety boundary:** AI ไม่มีสิทธิ์ตัดสิน eligibility และมี deterministic fallback หาก AI timeout/error

### Git evidence

```bash
git log --oneline --decorate -10
git status --short
git diff --cached --stat
```

> ก่อนพรีต้องให้ feature ล่าสุดมี commit และ push แล้ว จึงใช้อ้างอิง commit history ได้อย่างถูกต้อง

### Team contribution — กรอกก่อนพรี

| สมาชิก | หน้าที่ | ไฟล์/Commit ที่อธิบายได้ |
|---|---|---|
| `[ชื่อ 1]` | `[Frontend/Auth/etc.]` | `[path/commit]` |
| `[ชื่อ 2]` | `[Backend/Enrollment/etc.]` | `[path/commit]` |
| `[ชื่อ 3]` | `[Integration/Testing/etc.]` | `[path/commit]` |

---

## 6:40–7:00 — สรุป

**พูด:**

> “สรุป UniEnroll เป็นระบบลงทะเบียนที่ deploy บน Cloudflare ใช้ D1 ป้องกันข้อมูลเกิน capacity เชื่อม Student Identity ของ Team 01 ด้วย API และ Consent จริง มี security controls, automated tests และสามารถ redeploy ได้ ระบบแยก deterministic decision ออกจาก AI explanation เพื่อให้ผลลัพธ์ตรวจสอบได้”

---

# 2. Demo Runbook แบบกดตามลำดับ

## ก่อนเริ่ม

1. เปิด Production Frontend
2. เปิด Team 01 ที่หน้า Consent
3. เปิด GitHub repo ที่ไฟล์ `student-identity-client.ts`
4. เปิด Terminal ที่ repo แต่ยังไม่พิมพ์ secret
5. เปิดผล `pnpm run test` หรือเตรียมรันใหม่
6. ตรวจ backend `/health`

## Live demo

1. `OPEN` Team 01 account
2. `CLICK` Consent & sharing
3. `CHECK` `Enrollment → profile:read`
4. `CLICK` Save
5. `POINT TO` Sharing
6. `OPEN` UniEnroll production URL
7. `TYPE` Student ID; ให้เจ้าของบัญชีพิมพ์ password โดยไม่แชร์หน้าจอถ้าจำเป็น
8. `CLICK` Sign In
9. `POINT TO` Student Identity ผ่าน
10. `CLICK` Enroll ใน section ที่เตรียมไว้
11. `OPEN` My Schedule
12. `OPEN` source integration files
13. `RUN` tests เฉพาะเมื่อเวลาพอ

## ห้ามทำตอน Live

- ห้ามเปิด `.dev.vars` หรือ Cloudflare secret value
- ห้ามแสดง password/JWT/access token/API key
- ห้ามรัน remote seed/reset
- ห้ามแก้ production D1 ด้วยคำสั่ง destructive
- ห้ามเลือก section ที่เต็มหรือมี prerequisite ถ้าต้องการ Happy Path
- ห้ามพึ่ง Team 01 account ที่ยัง `Not sharing`

---

# 3. แผนสำรองหาก Live Demo มีปัญหา

## Team 01 ช้า/ล่ม

**พูด:**

> “ระบบออกแบบให้ fail closed ครับ ถ้ายืนยันตัวตนกับ Team 01 ไม่ได้ UniEnroll จะไม่ออก session และไม่เปิด enrollment เพื่อไม่ให้ bypass identity”

จากนั้นแสดง:

- source timeout/error mapping
- automated test ที่จำลอง upstream failure
- บัญชีสำรองที่ login/consent ไว้แล้ว (ถ้ายังมี session)

## Consent ไม่ผ่าน

1. กลับ Team 01
2. ตรวจเฉพาะ `Enrollment → profile:read`
3. ตรวจสถานะ `Sharing`
4. กลับ UniEnroll แล้วกด `Check Again`

## วิชา Happy Path ลงไม่ได้

- ใช้ section สำรองที่ตรวจไว้ก่อนพรี
- แสดง error code และอธิบายว่ากฎใดปฏิเสธ
- ห้าม reset production database เพื่อให้ demo ผ่าน

## Frontend มีปัญหาแต่ Backend ยังอยู่

แสดง Backend health และ API contract ได้ แต่ **ไม่ควรใช้เป็นแผนหลัก** เพราะโจทย์ต้องการ deployed system ที่สาธิตได้ครบ

---

# 4. คำถามที่อาจารย์น่าจะถาม

## Q: How do students log in? / นักศึกษา Login อย่างไร?

### คำตอบสั้น 20 วินาที

> “นักศึกษาใช้ Student ID และรหัสผ่านของ Student Identity Team 01 ครับ Browser ส่งข้อมูลผ่าน HTTPS มาที่ UniEnroll Worker จากนั้น Worker เรียก Team 01 `/auth/login` และใช้ token ชั่วคราวเรียก `/me` เพื่อตรวจว่าเจ้าของ token เป็น Student ID เดียวกัน เมื่อยืนยันสำเร็จ UniEnroll จะทิ้ง token ของ Team 01 แล้วออก JWT ของ UniEnroll เอง โดยไม่เก็บรหัสผ่านของนักศึกษา”

### ถ้าอาจารย์ให้ขยายความ

```text
1. Student กรอก Student ID + password ที่หน้า UniEnroll
2. Frontend → POST UniEnroll /api/auth/login ผ่าน HTTPS
3. UniEnroll Worker → POST Team 01 /auth/login
4. Team 01 → short-lived access token
5. UniEnroll Worker → GET Team 01 /me ด้วย token ชั่วคราว
6. ตรวจว่า /me.student_id ตรงกับ Student ID ที่กรอก
7. ถ้ายังไม่มี local record → ทำ JIT Provisioning
8. ทิ้ง Team 01 token → ออก UniEnroll JWT อายุ 24 ชั่วโมง
9. Frontend ใช้ UniEnroll JWT เรียก API ลงทะเบียนครั้งต่อไป
```

**ประเด็นที่ต้องย้ำ:**

- Team 01 เป็นผู้ตรวจรหัสผ่าน ไม่ใช่ UniEnroll
- UniEnroll ไม่บันทึก password และไม่บันทึก Team 01 access token
- `/me` ใช้ป้องกันการรับ token มาแล้วเชื่อทันทีโดยไม่ตรวจเจ้าของ
- ถ้า Team 01 ปฏิเสธ, timeout, ล่ม หรือคืน schema ผิด ระบบไม่ออก UniEnroll JWT (`fail closed`)

**เปิดโค้ดตามลำดับ:**

1. `src/backend/routes/auth.ts:15-48` — รับ request, validate และเลือก Student Identity flow
2. `src/backend/lib/student-identity-client.ts:130-204` — เรียก `/auth/login`, `/me`, timeout และตรวจ subject
3. `src/backend/routes/auth.ts:60-72` — JIT Provisioning
4. `src/backend/routes/auth.ts:89-113` — ออก UniEnroll JWT และ response

## Q: How does the API connect? / API เชื่อมกันอย่างไร?

### คำตอบสั้น 20 วินาที

> “เราเชื่อมแบบ server-to-server REST API ผ่าน HTTPS ครับ Browser คุยกับ UniEnroll Worker เท่านั้น แล้ว Worker เป็นผู้เรียก Student Identity Team 01 ทำให้ service key ไม่ออกไปที่ browser การ Login ใช้ `/auth/login` กับ `/me` ส่วนการตรวจ Consent และความพร้อมลงทะเบียนใช้ `/students/{studentId}/claims`”

### ภาพการเชื่อมต่อที่วาดตอบได้ทันที

```text
Student Browser
  └─ HTTPS → Next.js Frontend
       └─ HTTPS + UniEnroll JWT → UniEnroll Worker
            ├─ D1: student, section, enrollment
            └─ HTTPS server-to-server → Team 01 Student Identity
                 ├─ POST /auth/login
                 ├─ GET  /me
                 └─ GET  /students/{studentId}/claims
```

### API แต่ละตัวทำหน้าที่อะไร

| API | ผู้เรียก | Authentication | หน้าที่ |
|---|---|---|---|
| `POST UniEnroll /api/auth/login` | Frontend | Student ID + password ผ่าน HTTPS | เริ่ม federated login และรับ UniEnroll JWT |
| `POST Team 01 /auth/login` | UniEnroll Worker | Student ID + password | ให้ Team 01 ตรวจ credential |
| `GET Team 01 /me` | UniEnroll Worker | Team 01 token ชั่วคราว | ตรวจเจ้าของ token และรับ profile สำหรับ JIT |
| `GET UniEnroll /api/external/student-identity/me` | Frontend | UniEnroll JWT | ขอผล identity/consent สำหรับเปิดหรือปิดปุ่ม Enroll |
| `GET Team 01 /students/{id}/claims` | UniEnroll Worker | Service key ใน Wrangler Secret | อ่าน `verified`, `profileComplete`, `missingFields` ตาม Consent |
| `POST UniEnroll /api/enrollments` | Frontend | UniEnroll JWT + `Idempotency-Key` | ตรวจ rules แล้วบันทึก enrollment ลง D1 |

**ทำไมไม่ให้ Browser เรียก Team 01 claims โดยตรง?**

> “เพราะ claims API ใช้ service credential ถ้าเรียกจาก browser key จะอยู่ใน JavaScript bundle หรือ Network tab เราจึงเก็บ key เป็น Cloudflare Worker Secret และให้ Worker เป็นตัวกลาง”

## Q: Explain the code / ช่วยอธิบายโค้ดส่วน API

### สคริปต์เปิดโค้ด 60–90 วินาที

1. **เริ่มที่ `src/backend/index.ts:58-76`**
   - `app.route('/api/auth', authRoutes)` ลงทะเบียน API Login
   - `app.route('/api/enrollments', enrollmentRoutes)` ลงทะเบียน API จองวิชา
   - `app.route('/api/external', externalRoutes)` ลงทะเบียน route ที่เชื่อม Team 01

   **พูด:**

   > “ไฟล์นี้เป็น entrypoint ของ Hono Worker ครับ หน้าที่คือประกอบ middleware และ mount route แต่ business logic แยกอยู่ในแต่ละ module”

2. **เปิด `src/backend/routes/auth.ts:15-113`**
   - ตรวจ JSON และ field ที่จำเป็น
   - Student ID 10 หลักใช้ Team 01; Staff ใช้ local password hash
   - เรียก `authenticateStudentIdentity(...)`
   - ถ้าเป็นนักศึกษาใหม่สร้าง local record ด้วย prepared statement
   - สุดท้ายเซ็น HS256 JWT ของ UniEnroll อายุ 24 ชั่วโมง

   **พูด:**

   > “Route นี้เป็น orchestration layer ครับ ไม่ได้ตรวจรหัสผ่านนักศึกษาเอง แต่ส่งให้ Team 01 client ตรวจ เมื่อสำเร็จจึง provision ผู้ใช้และออก session ของระบบเรา”

3. **เปิด `src/backend/lib/student-identity-client.ts:130-204`**
   - `fetch(.../auth/login)` ส่ง credential ผ่าน HTTPS
   - ตรวจ HTTP status และ response schema
   - `fetch(.../me)` พร้อม Bearer token ชั่วคราว
   - เปรียบเทียบ `profile.studentId !== studentId`
   - มี timeout 5 วินาทีและแปลง upstream error เป็น error code ของ UniEnroll

   **พูด:**

   > “ไฟล์ client แยก network contract ออกจาก route มี timeout, runtime validation และ subject check ถ้า partner ตอบผิดรูปแบบจะไม่ปล่อยให้ Login ผ่าน”

4. **เปิด `src/backend/routes/external.ts:10-68`**
   - `authMiddleware` ตรวจ UniEnroll JWT ก่อน
   - อนุญาตเฉพาะ role `STUDENT`
   - เรียก `fetchStudentIdentityClaims(...)`
   - บันทึก partner request log โดยไม่บันทึก secret
   - คำนวณ `can_enroll = verified && profileComplete`

   **พูด:**

   > “Login กับ Claims แยกหน้าที่กันครับ Login พิสูจน์ credential และเจ้าของบัญชี ส่วน Claims พิสูจน์ verified, profile completeness และ Consent ก่อนเปิดสิทธิ์ลงทะเบียน”

5. **ถ้าถามว่าเชื่อม Database ตรงไหน** เปิด `src/backend/routes/enrollments.ts`
   - ใช้ D1 prepared statements และ `.bind()`
   - ตรวจ prerequisite, ตารางชน, credit limit, duplicate และ capacity
   - บันทึก enrollment และ outbox หลังผ่านกฎ

### ประโยคสรุปโค้ดหนึ่งประโยค

> “เราแยกเป็น route สำหรับควบคุม flow, client สำหรับ contract กับ partner, middleware สำหรับ JWT/RBAC, rule engine สำหรับตัดสิน eligibility และ D1 สำหรับ persistence ทำให้แต่ละส่วนทดสอบและอธิบายแยกกันได้ครับ”

## Q: API ส่งข้อมูลอะไร และตอบกลับอะไร?

**Login request ที่ Browser ส่งเข้า UniEnroll:**

```json
{
  "student_code": "[STUDENT_ID]",
  "password": "[REDACTED]"
}
```

**Login response ที่ Frontend ใช้:**

```json
{
  "success": true,
  "token": "[UNI_ENROLL_JWT_REDACTED]",
  "user": {
    "student_code": "[STUDENT_ID]",
    "full_name": "[NAME]",
    "role": "STUDENT"
  }
}
```

**Claims ที่ UniEnroll normalize ก่อนส่งให้ UI:**

```json
{
  "verified": true,
  "profile_complete": true,
  "missing_fields": [],
  "can_enroll": true
}
```

> เวลาเปิด Network/API Logs ให้แสดงเฉพาะ method, path, status และ duration ห้ามเปิด password, JWT, service key หรือ Authorization header

## Q: รหัสผ่าน Team 01 ถูกเก็บใน UniEnroll หรือไม่?

**A:** ไม่เก็บครับ Worker ส่งไป Team 01 ผ่าน HTTPS เพื่อ login ใช้ token ชั่วคราวเรียก `/me` ตรวจ Student ID แล้วทิ้ง token ก่อนออก UniEnroll JWT

## Q: ทำไมต้องเรียก `/me` หลัง login?

**A:** เพื่อยืนยันว่า token ที่ Team 01 คืนมาเป็นของ Student ID ที่ผู้ใช้กรอกจริง ป้องกันการเชื่อเพียงว่า login สำเร็จโดยไม่ตรวจ subject

## Q: ถ้าเป็นบัญชีใหม่ที่ไม่มีใน UniEnroll ล่ะ?

**A:** หลัง Team 01 ยืนยันตัวตนสำเร็จ ระบบทำ JIT provisioning จาก profile ที่ได้รับจาก `/me` แล้วสร้างเฉพาะ local student record โดยไม่คัดลอกรหัสผ่านหรือ token

## Q: ถ้าไม่ให้ Consent จะเกิดอะไรขึ้น?

**A:** Login ยืนยันบัญชีได้ แต่ claims request ถูก Team 01 ปฏิเสธ ทำให้ `can_enroll` ไม่ผ่านและปุ่มลงทะเบียนถูกปิด

## Q: ถ้า Team 01 ล่ม ยัง login ได้ไหม?

**A:** ไม่ได้ครับ ระบบ fail closed และไม่ออก UniEnroll JWT เพราะไม่สามารถยืนยัน credential/subject ได้

## Q: ป้องกันคนสองคนแย่งที่นั่งสุดท้ายอย่างไร?

**A:** Availability check ช่วยตอบเร็ว แต่ตัวตัดสินสุดท้ายคือ atomic D1 transaction/constraint ผู้ที่ commit ก่อนสำเร็จ อีกคนได้ `ERR_CAPACITY_FULL` จึงไม่ oversell

## Q: AI เป็นคนอนุมัติการลงทะเบียนหรือไม่?

**A:** ไม่ใช่ครับ eligibility มาจาก deterministic rules เท่านั้น AI ช่วยเรียบเรียงคำอธิบาย และถ้า AI ล่มจะใช้ deterministic fallback

## Q: ป้องกันการกดซ้ำอย่างไร?

**A:** Client ส่ง `Idempotency-Key`; server ผูก key กับผู้ใช้ method path และ request hash ถ้า request เดิมซ้ำจะ replay ผลเดิม แต่ถ้า body ต่างจะตอบ conflict

## Q: PDPA ทำอะไรจริง ไม่ใช่แค่อธิบาย?

**A:** มี Consent UI ของ Team 01 จริง, claims endpoint ปฏิเสธเมื่อไม่อนุญาต, จำกัด scope เป็น `profile:read`, ไม่ส่ง service key ไป browser และเก็บข้อมูลเฉพาะที่ใช้กับ enrollment

## Q: Webhook ปลอดภัยอย่างไร?

**A:** Payload เซ็นด้วย HMAC-SHA256 มี stable `event_id`, consumer deduplicate ได้ มี transactional outbox, retry และ delivery log

## Q: Redeploy อย่างไร?

```bash
pnpm run test
pnpm run typecheck
pnpm run build
pnpm exec wrangler deploy
```

จากนั้นตรวจ:

```bash
curl https://unienroll-backend.team03-enrollment.workers.dev/health
```

---

# 5. Source Code Map สำหรับแบ่งกันตอบ

| หัวข้อ | ไฟล์หลัก |
|---|---|
| App/route registration | `src/backend/index.ts` |
| Authentication/JIT | `src/backend/routes/auth.ts` |
| JWT/RBAC | `src/backend/middleware/auth.ts` |
| Team 01 client | `src/backend/lib/student-identity-client.ts` |
| Claims gate | `src/backend/routes/external.ts` |
| Enrollment CRUD/rules | `src/backend/routes/enrollments.ts` |
| Rule engine | `src/backend/lib/enrollment-rule-engine.ts` |
| Explanation | `src/backend/lib/decision-explainer.ts` |
| Idempotency | `src/backend/middleware/idempotency.ts` |
| Webhook sender/outbox | `src/backend/lib/webhook-sender.ts` |
| Database | `src/backend/db/schema.sql` |
| API contract | `docs/openapi.yaml` |
| Integration documentation | `docs/student-identity-integration.md` |
| Integration tests | `tests/student-identity.test.ts` |
| Security tests | `tests/auth-security.test.ts` |
| Concurrency tests | `tests/capacity-concurrency.test.ts` |
| UI identity gate | `src/app/page.tsx`, `src/components/CourseCatalog.tsx` |

---

# 6. Requirement Coverage Matrix

| Requirement | Evidence | สถานะ |
|---|---|---|
| System completion & cloud | Cloudflare Pages + Worker + D1; `/health` HTTP 200 | **Frontend และ Backend production verified** |
| Key features & Happy Path | Login, claims gate, enroll, schedule, rule engine | Login, Identity และ Enrollment production verified |
| Cross-group integration | Team 01 REST API + consent + live claims | Implemented และ live backend response verified |
| Development & AI evidence | Architecture, Git, tests, Hermes, Workers AI | ต้อง commit/push และกรอก team contribution |
| Security & PDPA | JWT, PBKDF2, RBAC, consent, prepared statements, HMAC | Implemented; แสดง source + live denial case |
| Testing & QA | 44 automated tests + manual matrix | Automated passed; กรอก manual run เวลา final |
| Source understanding | Source map + Q&A | สมาชิกต้องแบ่งไฟล์และซ้อมตอบ |
| Live modification/redeploy | test/typecheck/build/wrangler workflow | Backend redeploy verified |
| Attendance | สมาชิกทุกคน | ต้องยืนยันก่อนเวลา |

---

# 7. Final 60-Second Checklist

- [ ] URL เป็น production cloud จริง
- [ ] Backend health 200
- [ ] Team 01 account/profile พร้อม
- [ ] `Enrollment → profile:read → Sharing`
- [ ] Demo section ยังมีที่นั่งและผ่าน prerequisite
- [ ] ไม่มี secret/password อยู่บนหน้าจอ
- [ ] GitHub มี commit ล่าสุด
- [ ] Test result พร้อมเปิด
- [ ] Team 01 พร้อมออนไลน์
- [ ] สมาชิกทุกคนรู้ว่าจะพูดส่วนไหน

---

# 8. คำตอบครบ 8 เกณฑ์แบบพูดได้ทันที

## 1) Complete & Cloud Deploy

### คำตอบ

> “ระบบ UniEnroll ทำงานครบและ deploy บน Cloudflare ครับ Frontend เป็น Next.js static site บน Cloudflare Pages, Backend เป็น Hono API บน Cloudflare Workers และ Database เป็น Cloudflare D1 ผู้ประเมินสามารถเปิด Production URL และใช้งาน Login, ดูรายวิชา, ลงทะเบียน และดู My Schedule ได้จริง”

### หลักฐานที่เปิด

- Frontend: `https://unienroll-frontend.pages.dev`
- Backend: `https://unienroll-backend.team03-enrollment.workers.dev`
- Health: `https://unienroll-backend.team03-enrollment.workers.dev/health`
- Config: `wrangler.jsonc`
- Worker entrypoint: `src/backend/index.ts`

## 2) Demo Features & Happy Path

### คำตอบ

> “Happy Path เริ่มจากนักศึกษาใช้บัญชี Team 01 Login เข้า UniEnroll ระบบตรวจ Identity และ Consent จากนั้นแสดง section ที่ลงทะเบียนได้ นักศึกษากด Register ระบบตรวจ prerequisite, ตารางชน, credit limit, duplicate และ capacity เมื่อผ่านจึงบันทึกลง D1 และแสดงใน My Schedule”

### ลำดับ Demo

```text
Team 01 account
→ Enrollment consent: Sharing
→ Login UniEnroll
→ Student Identity: verified
→ เลือก section ที่ว่าง
→ Register Section
→ My Schedule
```

### หลักฐานที่เปิด

- UI flow: `src/app/page.tsx`
- Enrollment API: `src/backend/routes/enrollments.ts`
- Rule engine: `src/backend/lib/enrollment-rule-engine.ts`

## 3) Integrate with at Least 1 Group

### คำตอบ

> “เราเชื่อมกับ Team 01 Student Identity จริงผ่าน HTTPS REST API ครับ ไม่ใช่ mock การ Login ใช้ `/auth/login` และ `/me` ส่วนการตรวจ Identity และ Consent ใช้ `/students/{studentId}/claims` โดย UniEnroll Worker เป็นผู้เรียก Team 01 แบบ server-to-server”

### API Flow

```text
Browser → UniEnroll Worker
             ├─ POST Team 01 /auth/login
             ├─ GET  Team 01 /me
             └─ GET  Team 01 /students/{studentId}/claims
```

### หลักฐานที่เปิด

- `src/backend/lib/student-identity-client.ts`
- `src/backend/routes/auth.ts`
- `src/backend/routes/external.ts`
- หน้า Team 01 Consent ที่แสดง `Enrollment: Sharing`
- หน้า UniEnroll ที่แสดง `Student Identity · Team 01`

## 4) Development Process & AI

### คำตอบ

> “เราใช้ Git แยกงานบน branch `preproduct` และตรวจการเปลี่ยนแปลงด้วย tests, TypeScript, ESLint และ production build ก่อน deploy เราใช้ Hermes Agent ช่วยวิเคราะห์ source, เขียน tests และ debug แต่สมาชิกตรวจ diff และผล execution จริง ส่วน Workers AI ในระบบใช้เฉพาะช่วยเขียนคำอธิบายผล ไม่ได้ตัดสินว่านักศึกษาลงทะเบียนได้หรือไม่”

### ถ้าถามว่า AI ทำอะไร

- **Hermes Agent:** ช่วยพัฒนาและตรวจสอบ แต่ไม่แทนการ review ของสมาชิก
- **Workers AI:** เรียบเรียง failed-rule explanation
- **Enrollment decision:** มาจาก deterministic rule engine เท่านั้น
- **AI ล่ม:** ใช้ deterministic fallback ระบบยังอธิบายผลได้

### หลักฐานที่เปิด

- `git log --oneline --decorate -10`
- `src/backend/lib/decision-explainer.ts`
- `src/backend/lib/enrollment-rule-engine.ts`

## 5) Security & PDPA

### คำตอบ

> “ด้าน PDPA นักศึกษาต้องให้ Consent `Enrollment / profile:read` ก่อน UniEnroll อ่าน claims เราใช้ข้อมูลเท่าที่จำเป็นและไม่เก็บรหัสผ่านหรือ access token ของ Team 01 ด้าน Security ใช้ HTTPS, JWT, RBAC, prepared statements, idempotency และเก็บ service key ใน Cloudflare Worker Secret ไม่ส่งไปที่ browser”

### ถ้าถามว่าป้องกันอะไรบ้าง

- Password/Team 01 token: ใช้ชั่วคราวและไม่บันทึก
- API secret: อยู่ใน Wrangler Secret
- Unauthorized request: JWT middleware ตอบ `401`
- Permission: Student/Staff RBAC
- SQL injection: D1 prepared statement + `.bind()`
- กดลงทะเบียนซ้ำ: `Idempotency-Key` และ database constraints
- แย่งที่นั่งสุดท้าย: atomic D1 capacity update
- Partner ล่มหรือ schema ผิด: fail closed

### หลักฐานที่เปิด

- `src/backend/middleware/auth.ts`
- `src/backend/lib/student-identity-client.ts`
- `src/backend/middleware/idempotency.ts`
- `src/backend/db/schema.sql`

## 6) Testing & Quality Assurance

### คำตอบ

> “เรามี automated tests ครอบคลุม Happy Path, authentication, partner response, prerequisite, schedule conflict, credit limit, duplicate, idempotency, webhook retry และ capacity concurrency นอกจากนี้ยังตรวจ typecheck, lint และ production build ก่อน deploy”

### คำสั่งที่เปิดหรือรัน

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run build
```

### Test สำคัญที่ควรพูด

- รหัสผ่าน Team 01 ผิด → `401` และไม่สร้าง local student
- Team 01 subject ไม่ตรง → fail closed
- ไม่มี Consent → ลงทะเบียนไม่ได้
- 60 requests แย่ง 50 ที่นั่ง → ไม่เกิน capacity
- Webhook retry → ใช้ `event_id` เดิม

### หลักฐานที่เปิด

- `tests/student-identity.test.ts`
- `tests/auth-security.test.ts`
- `tests/enrollment-rules.test.ts`
- `tests/capacity-concurrency.test.ts`
- `tests/webhook-retry.test.ts`

## 7) Explain Code, Modify & Redeploy

### คำตอบอธิบายโค้ด

> “โค้ดแบ่งเป็น Frontend API client, Hono routes, authentication middleware, partner client, rule engine และ D1 persistence ครับ `index.ts` mount route, `auth.ts` ควบคุม Login, `student-identity-client.ts` เชื่อม Team 01, `external.ts` ตรวจ claims และ `enrollments.ts` ตรวจ rules ก่อนบันทึก D1”

### ลำดับไฟล์ที่เปิด

1. `src/lib/api.ts` — Frontend เรียก Backend
2. `src/backend/index.ts` — Mount API routes
3. `src/backend/routes/auth.ts` — Login/JIT/JWT
4. `src/backend/lib/student-identity-client.ts` — Team 01 API client
5. `src/backend/routes/external.ts` — Claims และ Consent gate
6. `src/backend/routes/enrollments.ts` — Enrollment flow
7. `src/backend/lib/enrollment-rule-engine.ts` — Rules

### ถ้าให้แก้และ Redeploy สด

```bash
pnpm run test
pnpm run typecheck
pnpm run build
pnpm exec wrangler deploy
curl https://unienroll-backend.team03-enrollment.workers.dev/health
```

ถ้าแก้ Frontend:

```bash
pnpm run frontend:deploy
```

> ก่อน deploy ให้อธิบายว่าแก้อะไรและผลที่ผู้ใช้จะเห็น ห้ามแก้ secret, schema หรือ reset Production D1 ใน Live Evaluation

## 8) Final Evaluation & Full Attendance

### คำตอบ

> “สมาชิกทุกคนเข้าร่วมการประเมินและแบ่งส่วนรับผิดชอบชัดเจนครับ แต่ละคนสามารถอธิบายงานของตนเอง เปิด source ที่เกี่ยวข้อง ตอบคำถาม และช่วยทำ live modification หรือ redeploy ได้”

### สิ่งที่ต้องทำก่อนเข้าห้อง

- กรอกชื่อสมาชิกและหน้าที่ในตาราง Team Contribution
- แบ่งว่าใคร Demo, ใครอธิบาย API, ใครอธิบาย Security/Testing
- ทุกคนรู้ Production URL และไฟล์ที่ตนเองต้องเปิด
- ทุกคนอยู่ครบตลอด Final Evaluation

## คำตอบสรุป 30 วินาทีครอบคลุมทั้งงาน

> “UniEnroll เป็นระบบลงทะเบียนที่ deploy จริงบน Cloudflare Pages, Workers และ D1 ครับ นักศึกษา Login ผ่าน Student Identity Team 01 ซึ่งเป็น REST API integration จริงและมี Consent ตาม PDPA ระบบตรวจ prerequisite, ตารางชน, credit limit, duplicate และ capacity แบบ deterministic ก่อนบันทึก มี JWT, RBAC, prepared statements และ automated tests รองรับ เราใช้ Git และ AI ช่วยในกระบวนการพัฒนา แต่ AI ไม่ได้เป็นผู้ตัดสิน enrollment และระบบสามารถ test, modify และ redeploy ได้จาก source นี้ครับ”
