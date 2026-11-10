# Student Identity Team 01 Integration

UniEnroll consumes consented student claims from Team 01 before enabling course registration in the web application.

## Data flow

1. A linked student enters the 10-digit student ID and Team 01 password in UniEnroll.
2. The Worker sends those credentials directly to `POST /auth/login`, then calls `GET /me` with the short-lived Team 01 token to verify that the authenticated subject matches the submitted student ID. UniEnroll does not store the Team 01 password or token.
3. After successful Team 01 authentication, UniEnroll creates the local student record from the verified `/me` profile when the Student ID is new, then issues its own JWT. Existing students keep their enrollment data; staff and legacy demo accounts continue to use local UniEnroll password hashes.
4. The web application calls `GET /api/external/student-identity/me` with the UniEnroll JWT.
5. The Worker reads the student ID from the verified JWT. It does not accept another student's ID from the browser.
6. The Worker calls Team 01:

   ```http
   GET https://student-identity.onrender.com/students/{studentId}/claims
   Authorization: Bearer <server-side service key>
   ```

7. UniEnroll normalizes `verified`, `profileComplete`, `missingFields`, and `skills`.
8. Registration controls are enabled only when both `verified` and `profileComplete` are true.
9. The outbound attempt is recorded in `partner_request_logs` without recording the service key.

## Configuration

The non-secret base URL is configured in `wrangler.jsonc` as `STUDENT_IDENTITY_BASE_URL`.

The service key must never be committed. Configure it interactively for the deployed Worker:

```bash
pnpm exec wrangler secret put STUDENT_IDENTITY_API_KEY
```

For local development, add the same variable to the ignored `.dev.vars` file. Do not place the value in source code, screenshots, API logs, or Git history.

## Consent prerequisite

Team 01 requires student consent for the service client. The student must create or update consent in Student Identity before UniEnroll can retrieve claims. A missing/invalid consent or rejected service key is returned by UniEnroll as a partner integration error; it does not bypass identity verification.

## Failure behavior

- Invalid Team 01 student credentials: `401`
- Team 01 login/profile verification unavailable or invalid: `502`
- Missing UniEnroll JWT: `401`
- Staff account: `403`
- Local student ID is not exactly 10 digits: `400`
- Service key not configured: `503`
- Team 01 rejects, times out, or returns an invalid schema: `502`
- Valid claims: `200` with a normalized `can_enroll` decision

The service key remains server-side in every case.
