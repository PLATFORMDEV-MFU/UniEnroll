import { RuleDecisionResult, RuleFailure } from '../types';

type TargetSection = {
  course_id: number;
  course_code: string;
  credits: number;
  semester: string;
  schedule: string;
};

type PrerequisiteRecord = {
  prerequisite_course_id: number;
  required_course_code: string;
  minimum_grade: string;
  earned_grade: string | null;
  completion_status: string | null;
};

type ActiveEnrollmentRecord = {
  course_code: string;
  credits: number;
  schedule: string;
};

const GRADE_RANK: Record<string, number> = {
  F: 0,
  NP: 0,
  D: 1,
  'D+': 2,
  C: 3,
  'C+': 4,
  B: 5,
  'B+': 6,
  A: 7,
  P: 7,
};

function meetsMinimumGrade(earned: string | null, minimum: string): boolean {
  if (!earned) return false;
  return (GRADE_RANK[earned] ?? -1) >= (GRADE_RANK[minimum] ?? Number.POSITIVE_INFINITY);
}

type MeetingTime = { days: Set<string>; start: number; end: number };

function parseSchedule(schedule: string): MeetingTime | null {
  const match = schedule
    .trim()
    .toUpperCase()
    .match(/^([A-Z_]+)\s+(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) return null;
  return {
    days: new Set(match[1].split('_')),
    start: Number(match[2]) * 60 + Number(match[3]),
    end: Number(match[4]) * 60 + Number(match[5]),
  };
}

function schedulesOverlap(left: string, right: string): boolean {
  const first = parseSchedule(left);
  const second = parseSchedule(right);
  if (!first || !second) return false;
  const sharesDay = [...first.days].some((day) => second.days.has(day));
  return sharesDay && first.start < second.end && second.start < first.end;
}

export async function evaluateEnrollmentRules(
  db: D1Database,
  studentId: number,
  sectionId: number
): Promise<RuleDecisionResult> {
  const target = await db.prepare(`
    SELECT s.course_id, c.course_code, c.credits, s.semester, s.schedule
    FROM sections s
    JOIN courses c ON c.id = s.course_id
    WHERE s.id = ?
  `).bind(sectionId).first<TargetSection>();

  if (!target) {
    return { eligible: true, failed_rules: [] };
  }

  const { results: prerequisites } = await db.prepare(`
    SELECT
      cp.prerequisite_course_id,
      required.course_code AS required_course_code,
      cp.minimum_grade,
      history.grade AS earned_grade,
      history.status AS completion_status
    FROM course_prerequisites cp
    JOIN courses required ON required.id = cp.prerequisite_course_id
    LEFT JOIN student_course_history history
      ON history.student_id = ?
      AND history.course_id = cp.prerequisite_course_id
    WHERE cp.course_id = ?
  `).bind(studentId, target.course_id).all<PrerequisiteRecord>();

  const failedRules: RuleFailure[] = prerequisites
    .filter(
      (rule) =>
        rule.completion_status !== 'COMPLETED' ||
        !meetsMinimumGrade(rule.earned_grade, rule.minimum_grade)
    )
    .map((rule) => ({
      code: 'ERR_PREREQUISITE_NOT_MET',
      message: `Complete ${rule.required_course_code} with grade ${rule.minimum_grade} or better before enrolling in ${target.course_code}.`,
      details: {
        required_course: rule.required_course_code,
        minimum_grade: rule.minimum_grade,
        earned_grade: rule.earned_grade,
      },
    }));

  const { results: activeEnrollments } = await db.prepare(`
    SELECT c.course_code, c.credits, s.schedule
    FROM enrollments e
    JOIN sections s ON s.id = e.section_id
    JOIN courses c ON c.id = s.course_id
    WHERE e.student_id = ?
      AND e.status IN ('ENROLLED', 'OVERRIDDEN')
      AND s.semester = ?
  `).bind(studentId, target.semester).all<ActiveEnrollmentRecord>();

  const currentCredits = activeEnrollments.reduce((sum, enrollment) => sum + enrollment.credits, 0);
  if (currentCredits + target.credits > 22) {
    failedRules.push({
      code: 'ERR_CREDIT_LIMIT_EXCEEDED',
      message: `Adding ${target.course_code} would raise the semester load to ${currentCredits + target.credits} credits, above the 22-credit maximum.`,
      details: {
        current_credits: currentCredits,
        requested_credits: target.credits,
        maximum_credits: 22,
      },
    });
  }

  for (const enrollment of activeEnrollments) {
    if (schedulesOverlap(target.schedule, enrollment.schedule)) {
      failedRules.push({
        code: 'ERR_SCHEDULE_CONFLICT',
        message: `${target.course_code} (${target.schedule}) overlaps with ${enrollment.course_code} (${enrollment.schedule}).`,
        details: {
          requested_schedule: target.schedule,
          conflicting_course: enrollment.course_code,
          conflicting_schedule: enrollment.schedule,
        },
      });
    }
  }

  return {
    eligible: failedRules.length === 0,
    failed_rules: failedRules,
  };
}