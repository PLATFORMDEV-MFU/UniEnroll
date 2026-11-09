# PRD — Enrollment (Team 03)

## Purpose
Let eligible students add or drop course sections while enforcing capacity and prerequisite rules.

## Scope
Screens: available sections, enrolment cart/history, staff override console. Entities: Enrollment, SectionSeat, RuleDecision. REST: `GET /enrollments/me`, `GET /sections/{id}/availability`, `POST /enrollments`, `PATCH /enrollments/{id}`, `DELETE /enrollments/{id}`, `POST /enrollments/{id}/withdraw`, `POST /overrides`.

## Integrations
Consume Identity claims and Course Catalog rules. Publish idempotent `enrollment.changed` to Timetable & Room, Attendance, Notification Hub, and Data & Analytics. Consumers must accept duplicated events.

## AI and quality
AI explains an ineligible decision in plain language; fallback lists failed deterministic rules. Tests (minimum 7): add, drop, full section, prerequisite fail, duplicate request, override authority, webhook retry.
