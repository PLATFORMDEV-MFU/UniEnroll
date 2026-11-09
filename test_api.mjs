// Automated Test Suite for UniEnroll Production API on Cloudflare

async function runProdTests() {
  const BASE_URL = 'https://unienroll-backend.team03-enrollment.workers.dev';
  console.log(`Testing Live Cloudflare Production API at: ${BASE_URL}\n`);

  // 1. Health Check
  console.log('--- 1. Health Check ---');
  const healthRes = await fetch(`${BASE_URL}/health`);
  console.log('Health:', await healthRes.json());

  // 2. Read All Enrollments
  console.log('\n--- 2. GET /api/enrollments (All) ---');
  const allRes = await fetch(`${BASE_URL}/api/enrollments`);
  const allData = await allRes.json();
  console.log(`Status: ${allRes.status}, Total records: ${allData.total}`);

  // 3. Read One
  console.log('\n--- 3. GET /api/enrollments/1 (Read One) ---');
  const oneRes = await fetch(`${BASE_URL}/api/enrollments/1`);
  console.log('Status:', oneRes.status, await oneRes.json());

  // 4. Create Enrollment (POST)
  console.log('\n--- 4. POST /api/enrollments (Student 2 -> Section 1) ---');
  const createRes = await fetch(`${BASE_URL}/api/enrollments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: 2, section_id: 1 })
  });
  const created = await createRes.json();
  console.log('Status:', createRes.status, created);
  const newEnrollmentId = created.data?.id;

  // 5. Test Duplicate Prevention (API & DB Unique Index)
  console.log('\n--- 5. Duplicate Check: POST /api/enrollments (Student 2 -> Section 1 again) ---');
  const dupRes = await fetch(`${BASE_URL}/api/enrollments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: 2, section_id: 1 })
  });
  console.log('Status:', dupRes.status, await dupRes.json());

  // 6. Test Capacity Full Check
  console.log('\n--- 6. Capacity Check: POST /api/enrollments (Student 1 -> Section 3 [Full 2/2]) ---');
  const fullRes = await fetch(`${BASE_URL}/api/enrollments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: 1, section_id: 3 })
  });
  console.log('Status:', fullRes.status, await fullRes.json());

  // 7. Update/Swap Section (PATCH)
  if (newEnrollmentId) {
    console.log(`\n--- 7. PATCH /api/enrollments/${newEnrollmentId} (Swap to Section 4) ---`);
    const patchRes = await fetch(`${BASE_URL}/api/enrollments/${newEnrollmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_id: 4 })
    });
    console.log('Status:', patchRes.status, await patchRes.json());

    // 8. Delete / Drop Enrollment (DELETE)
    console.log(`\n--- 8. DELETE /api/enrollments/${newEnrollmentId} (Drop Section) ---`);
    const delRes = await fetch(`${BASE_URL}/api/enrollments/${newEnrollmentId}`, {
      method: 'DELETE'
    });
    console.log('Status:', delRes.status, await delRes.json());
  }

  // 9. Verify Section 4 capacity updated properly
  console.log('\n--- 9. Verify Section Availability after drop ---');
  const secRes = await fetch(`${BASE_URL}/api/sections/4`);
  console.log('Section 4 availability:', await secRes.json());

  // 10. Duplicate Race Condition Simulation (Same Student, simultaneous requests)
  console.log('\n--- 10. Duplicate Race Test (Same Student simultaneous requests) ---');
  const dupReqs = [
    fetch(`${BASE_URL}/api/enrollments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: 3, section_id: 4 })
    }),
    fetch(`${BASE_URL}/api/enrollments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: 3, section_id: 4 }) // Duplicate
    })
  ];
  const dupResults = await Promise.all(dupReqs);
  for (let i = 0; i < dupResults.length; i++) {
    const res = dupResults[i];
    const data = await res.json();
    console.log(`Duplicate Request #${i + 1} Status: ${res.status}`, data.message || data.error_code || data.error);
  }

  // 11. Capacity Race Condition Simulation (3 Different Students -> 1 remaining seat)
  console.log('\n--- 11. Capacity Race Test (3 Different Students -> 1 remaining seat) ---');
  const capReqs = [
    fetch(`${BASE_URL}/api/enrollments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: 1, section_id: 3 }) // Section 3 is full
    }),
    fetch(`${BASE_URL}/api/enrollments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: 4, section_id: 3 })
    }),
    fetch(`${BASE_URL}/api/enrollments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: 5, section_id: 3 })
    })
  ];
  const capResults = await Promise.all(capReqs);
  for (let i = 0; i < capResults.length; i++) {
    const res = capResults[i];
    const data = await res.json();
    console.log(`Capacity Race Request #${i + 1} Status: ${res.status}`, data.message || data.error_code || data.error);
  }

  // 12. Test Official Withdrawal: POST /api/enrollments/:id/withdraw (Records 'W' Grade)
  console.log('\n--- 12. Withdrawal Test: POST /api/enrollments/1/withdraw ---');
  const withdrawRes = await fetch(`${BASE_URL}/api/enrollments/1/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Partner-Key': 'partner-secret-key-2026' },
    body: JSON.stringify({ reason: 'Official academic schedule adjustment' })
  });
  console.log('Withdrawal Status:', withdrawRes.status, await withdrawRes.json());

  // 13. Test Override Authority: Student Attempt -> 403 Forbidden
  console.log('\n--- 13. Override Authority Test (Unauthorized Student Attempt) ---');
  const unauthOverride = await fetch(`${BASE_URL}/api/overrides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_code: '65010042',
      section_id: 3,
      override_type: 'CAPACITY',
      reason: 'Student attempting self-override'
    })
  });
  console.log('Unauthorized Override Status (Expect 401/403):', unauthOverride.status, await unauthOverride.json());

  // 14. Test Staff Override: Authorized Staff -> 201 Created
  console.log('\n--- 14. Staff Override Test: POST /api/overrides (Authorized Staff) ---');
  const staffOverride = await fetch(`${BASE_URL}/api/overrides`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Partner-Key': 'partner-secret-key-2026',
    },
    body: JSON.stringify({
      student_code: '65010042',
      section_id: 3, // Full section
      override_type: 'CAPACITY',
      reason: 'Dean approved capacity override for graduating student'
    })
  });
  console.log('Staff Override Status:', staffOverride.status, await staffOverride.json());

  // 15. Test Overrides Audit Trail: GET /api/overrides
  console.log('\n--- 15. Overrides Audit Trail: GET /api/overrides ---');
  const auditRes = await fetch(`${BASE_URL}/api/overrides`, {
    headers: { 'X-Partner-Key': 'partner-secret-key-2026' }
  });
  const auditData = await auditRes.json();
  console.log(`Audit Trail Status: ${auditRes.status}, Total Overrides: ${auditData.total}`);

  console.log('\n🎉 ALL PRODUCTION API, CONCURRENCY, WITHDRAWAL & OVERRIDE TESTS COMPLETE!');
}

runProdTests().catch(console.error);
