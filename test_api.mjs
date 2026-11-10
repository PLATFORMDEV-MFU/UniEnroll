// Non-destructive live smoke test. Canonical rule/race coverage lives in `pnpm test`.

const BASE_URL = process.env.BASE_URL || 'https://unienroll-backend.team03-enrollment.workers.dev';
const TEST_STUDENT_CODE = process.env.TEST_STUDENT_CODE;
const TEST_STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD;

if (!TEST_STUDENT_CODE || !TEST_STUDENT_PASSWORD) {
  throw new Error('TEST_STUDENT_CODE and TEST_STUDENT_PASSWORD must be provided through environment variables.');
}

async function expectJson(path, init, expectedStatus = 200) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(`${init?.method || 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function runSmokeTest() {
  await expectJson('/health');

  const login = await expectJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_code: TEST_STUDENT_CODE,
      password: TEST_STUDENT_PASSWORD,
    }),
  });

  if (!login.token) {
    throw new Error('Login succeeded without returning a token.');
  }

  const authorization = `Bearer ${login.token}`;
  const enrollments = await expectJson('/api/enrollments/me', {
    headers: { Authorization: authorization },
  });
  const sections = await expectJson('/api/sections', {
    headers: { Authorization: authorization },
  });

  console.log(JSON.stringify({
    success: true,
    endpoint: BASE_URL,
    enrollment_count: enrollments.total,
    section_count: sections.total,
  }, null, 2));
}

runSmokeTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});