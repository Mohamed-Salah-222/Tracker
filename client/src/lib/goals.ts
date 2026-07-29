import { Banknote, Dumbbell, Globe2, Scale } from "lucide-react";

export type GoalKind = "project" | "money" | "weight";
export type GoalTaskStatus = "planning" | "working" | "completed";

export type GoalTask = {
  id: string;
  title: string;
  done: boolean;
  threadCount: number;
  section?: string;
  status?: GoalTaskStatus;
};

export type InBodyEntry = {
  id: string;
  date: string;
  weightKg: number;
  fatPct: number;
  musclePct: number;
  waterPct: number;
  boneKg: number;
};

export type Goal = {
  id: string;
  title: string;
  subtitle: string;
  kind: GoalKind;
  color: string;
  icon: typeof Globe2;
  tasks?: GoalTask[];
  money?: {
    current: number;
    target: number;
    currency: string;
    transactions?: { id: string; date: string; amount: number }[];
  };
  weight?: {
    current: number;
    start: number;
    target: number;
    targetMin?: number;
    targetMax?: number;
    unit: string;
    fatPct?: number;
    targetFatMin?: number;
    targetFatMax?: number;
    musclePct?: number;
    waterPct?: number;
    boneKg?: number;
    logs?: InBodyEntry[];
  };
};

const ticket = (id: string, title: string): GoalTask => ({
  id,
  title,
  done: false,
  status: "planning",
  threadCount: 0,
});

const gymPlatformTasks: GoalTask[] = [
  ticket("gym-arch-01", "ARCH: enforce tenant scoping rule"),
  ticket("gym-arch-02", "ARCH: define public/auth/admin route boundaries"),
  ticket("gym-arch-03", "ARCH: lock bilingual RTL conventions"),
  ticket("gym-arch-04", "ARCH: confirm API error shape"),
  ticket("gym-video-01", "BLOCKER: decide video licensing path"),
  ticket("gym-video-02", "BLOCKER: source placeholder video URLs"),
  ticket("gym-video-03", "BLOCKER: plan self-filmed machine video list"),

  ticket("gym-p0-1a", "P0-1: initialize repository"),
  ticket("gym-p0-1b", "P0-1: add .gitignore"),
  ticket("gym-p0-1c", "P0-1: scaffold /server"),
  ticket("gym-p0-1d", "P0-1: scaffold /client"),
  ticket("gym-p0-1e", "P0-1: add root README"),
  ticket("gym-p0-1f", "P0-1: configure ESLint + Prettier"),
  ticket("gym-p0-2a", "P0-2: create Express app"),
  ticket("gym-p0-2b", "P0-2: add JSON parsing + CORS"),
  ticket("gym-p0-2c", "P0-2: add central error handler"),
  ticket("gym-p0-2d", "P0-2: implement /api/health"),
  ticket("gym-p0-2e", "P0-2: add server env loading"),
  ticket("gym-p0-3a", "P0-3: create MongoDB Atlas cluster"),
  ticket("gym-p0-3b", "P0-3: implement db config"),
  ticket("gym-p0-3c", "P0-3: fail fast on DB connection errors"),
  ticket("gym-p0-3d", "P0-3: add Mongo env example"),
  ticket("gym-p0-4a", "P0-4: create Gym model"),
  ticket("gym-p0-4b", "P0-4: create User model"),
  ticket("gym-p0-4c", "P0-4: create Machine model"),
  ticket("gym-p0-4d", "P0-4: create Video model"),
  ticket("gym-p0-4e", "P0-4: create ProgressEntry model"),
  ticket("gym-p0-4f", "P0-4: add tenant indexes"),
  ticket("gym-p0-4g", "P0-4: implement withTenant middleware"),
  ticket("gym-p0-4h", "P0-4: create gym-scoped service pattern"),
  ticket("gym-p0-5a", "P0-5: implement member register API"),
  ticket("gym-p0-5b", "P0-5: implement login API"),
  ticket("gym-p0-5c", "P0-5: hash passwords"),
  ticket("gym-p0-5d", "P0-5: issue JWT"),
  ticket("gym-p0-5e", "P0-5: implement requireAuth"),
  ticket("gym-p0-5f", "P0-5: implement requireRole"),
  ticket("gym-p0-5g", "P0-5: seed superadmin"),
  ticket("gym-p0-6a", "P0-6: set up React routes"),
  ticket("gym-p0-6b", "P0-6: create API client"),
  ticket("gym-p0-6c", "P0-6: attach JWT to requests"),
  ticket("gym-p0-6d", "P0-6: create AuthProvider"),
  ticket("gym-p0-6e", "P0-6: create protected route wrapper"),
  ticket("gym-p0-6f", "P0-6: add placeholder pages"),
  ticket("gym-p0-7a", "P0-7: install react-i18next"),
  ticket("gym-p0-7b", "P0-7: create ar/en locale files"),
  ticket("gym-p0-7c", "P0-7: create LocaleProvider"),
  ticket("gym-p0-7d", "P0-7: set html dir/lang"),
  ticket("gym-p0-7e", "P0-7: add language toggle"),
  ticket("gym-p0-7f", "P0-7: remove scaffold hardcoded strings"),
  ticket("gym-p0-8a", "P0-8: deploy backend skeleton"),
  ticket("gym-p0-8b", "P0-8: deploy frontend skeleton"),
  ticket("gym-p0-8c", "P0-8: verify production CORS"),
  ticket("gym-p0-8d", "P0-8: verify production login"),

  ticket("gym-p1-a1a", "P1-A1: create admin gym APIs"),
  ticket("gym-p1-a1b", "P1-A1: build gym list UI"),
  ticket("gym-p1-a1c", "P1-A1: build create/edit gym form"),
  ticket("gym-p1-a1d", "P1-A1: add active/inactive toggle"),
  ticket("gym-p1-a1e", "P1-A1: enforce unique gym slug"),
  ticket("gym-p1-a2a", "P1-A2: create machine CRUD APIs"),
  ticket("gym-p1-a2b", "P1-A2: generate machine slug"),
  ticket("gym-p1-a2c", "P1-A2: generate unique qrToken"),
  ticket("gym-p1-a2d", "P1-A2: build machine list UI"),
  ticket("gym-p1-a2e", "P1-A2: build bilingual machine form"),
  ticket("gym-p1-a2f", "P1-A2: verify all machine queries scoped"),
  ticket("gym-p1-a3a", "P1-A3: create video CRUD APIs"),
  ticket("gym-p1-a3b", "P1-A3: build video list UI"),
  ticket("gym-p1-a3c", "P1-A3: build add/edit video form"),
  ticket("gym-p1-a3d", "P1-A3: add video reorder support"),
  ticket("gym-p1-a3e", "P1-A3: accept placeholder embed URLs"),
  ticket("gym-p1-a4a", "P1-A4: generate QR URL"),
  ticket("gym-p1-a4b", "P1-A4: export QR PNG"),
  ticket("gym-p1-a4c", "P1-A4: export QR SVG"),
  ticket("gym-p1-a4d", "P1-A4: add per-machine download UI"),
  ticket("gym-p1-a4e", "P1-A4: create bulk QR zip"),
  ticket("gym-p1-a4f", "P1-A4: create printable label layout"),

  ticket("gym-p1-b1a", "P1-B1: create public machine API"),
  ticket("gym-p1-b1b", "P1-B1: resolve machine by qrToken"),
  ticket("gym-p1-b1c", "P1-B1: return gym branding"),
  ticket("gym-p1-b1d", "P1-B1: build /m/:qrToken route"),
  ticket("gym-p1-b1e", "P1-B1: render machine name by locale"),
  ticket("gym-p1-b1f", "P1-B1: render ordered video players"),
  ticket("gym-p1-b1g", "P1-B1: add variant labels"),
  ticket("gym-p1-b1h", "P1-B1: mobile-first video layout"),
  ticket("gym-p1-b1i", "P1-B1: test QR page on phone data"),
  ticket("gym-p1-b2a", "P1-B2: unknown token page"),
  ticket("gym-p1-b2b", "P1-B2: inactive gym page"),
  ticket("gym-p1-b2c", "P1-B2: inactive machine page"),
  ticket("gym-p1-b2d", "P1-B2: remove raw public errors"),

  ticket("gym-p1-c1a", "P1-C1: member registration by gym slug"),
  ticket("gym-p1-c1b", "P1-C1: generic gym picker fallback"),
  ticket("gym-p1-c1c", "P1-C1: login/logout UI"),
  ticket("gym-p1-c1d", "P1-C1: persist member session"),
  ticket("gym-p1-c1e", "P1-C1: bilingual auth validation"),
  ticket("gym-p1-c2a", "P1-C2: create profile APIs"),
  ticket("gym-p1-c2b", "P1-C2: build profile view"),
  ticket("gym-p1-c2c", "P1-C2: build profile edit form"),
  ticket("gym-p1-c2d", "P1-C2: persist preferred language"),
  ticket("gym-p1-c3a", "P1-C3: create progress POST API"),
  ticket("gym-p1-c3b", "P1-C3: create progress history API"),
  ticket("gym-p1-c3c", "P1-C3: add progress form on machine page"),
  ticket("gym-p1-c3d", "P1-C3: add progress form on profile"),
  ticket("gym-p1-c3e", "P1-C3: add dynamic sets input"),
  ticket("gym-p1-c3f", "P1-C3: remember last machine weight"),
  ticket("gym-p1-c3g", "P1-C3: verify gymId + userId scoping"),
  ticket("gym-p1-c4a", "P1-C4: compute top-set trend"),
  ticket("gym-p1-c4b", "P1-C4: render progress chart"),
  ticket("gym-p1-c4c", "P1-C4: create progress empty state"),
  ticket("gym-p1-c4d", "P1-C4: keep chart RTL-safe"),

  ticket("gym-p1-d1a", "P1-D1: apply gym branding"),
  ticket("gym-p1-d1b", "P1-D1: create global header"),
  ticket("gym-p1-d1c", "P1-D1: add auth-aware navigation"),
  ticket("gym-p1-d1d", "P1-D1: real-phone responsiveness pass"),
  ticket("gym-p1-d1e", "P1-D1: RTL visual QA pass"),
  ticket("gym-p1-d2a", "P1-D2: seed demo gym"),
  ticket("gym-p1-d2b", "P1-D2: seed 8-10 machines"),
  ticket("gym-p1-d2c", "P1-D2: seed placeholder videos"),
  ticket("gym-p1-d2d", "P1-D2: seed QR tokens"),
  ticket("gym-p1-d2e", "P1-D2: document demo command"),
  ticket("gym-p1-d3a", "P1-D3: rate-limit auth endpoints"),
  ticket("gym-p1-d3b", "P1-D3: validate all input"),
  ticket("gym-p1-d3c", "P1-D3: hide stack traces"),
  ticket("gym-p1-d3d", "P1-D3: verify production HTTPS/CORS"),
  ticket("gym-p1-d3e", "P1-D3: add basic logging"),
  ticket("gym-p1-d4a", "P1-D4: print waterproof QR stickers"),
  ticket("gym-p1-d4b", "P1-D4: confirm real videos exist"),
  ticket("gym-p1-d4c", "P1-D4: scan-test every machine"),
  ticket("gym-p1-d4d", "P1-D4: create member feedback form"),

  ticket("gym-p2-1a", "P2-1: create Product model"),
  ticket("gym-p2-1b", "P2-1: create admin product APIs"),
  ticket("gym-p2-1c", "P2-1: build product CRUD UI"),
  ticket("gym-p2-2a", "P2-2: build store browse page"),
  ticket("gym-p2-2b", "P2-2: build product detail page"),
  ticket("gym-p2-2c", "P2-2: make store bilingual"),
  ticket("gym-p2-3a", "P2-3: create cart state"),
  ticket("gym-p2-3b", "P2-3: create Order model"),
  ticket("gym-p2-3c", "P2-3: reserve/pay-at-counter checkout"),
  ticket("gym-p2-4a", "P2-4: build admin order queue"),
  ticket("gym-p2-4b", "P2-4: mark orders collected/paid"),
  ticket("gym-p2-5a", "P2-5: basic sales summary"),
  ticket("gym-p2-5b", "P2-5: sales by product view"),

  ticket("gym-p3-1a", "P3-1: research Paymob/Fawry onboarding"),
  ticket("gym-p3-1b", "P3-1: integrate chosen gateway"),
  ticket("gym-p3-2a", "P3-2: online payment checkout"),
  ticket("gym-p3-2b", "P3-2: reconcile paid/failed payments"),
  ticket("gym-p3-3a", "P3-3: bilingual receipts"),
  ticket("gym-p3-3b", "P3-3: refund/cancellation handling"),

  ticket("gym-p4-1a", "P4-1: create Class model"),
  ticket("gym-p4-1b", "P4-1: admin creates classes"),
  ticket("gym-p4-1c", "P4-1: admin creates PT slots"),
  ticket("gym-p4-2a", "P4-2: create Booking model"),
  ticket("gym-p4-2b", "P4-2: member books class/PT"),
  ticket("gym-p4-2c", "P4-2: member cancels booking"),
  ticket("gym-p4-2d", "P4-2: enforce capacity"),
  ticket("gym-p4-3a", "P4-3: create Membership model"),
  ticket("gym-p4-3b", "P4-3: show membership status"),
  ticket("gym-p4-3c", "P4-3: freeze/pause request flow"),
  ticket("gym-p4-4a", "P4-4: attendance QR check-in"),
  ticket("gym-p4-4b", "P4-4: store attendance history"),
  ticket("gym-p4-5a", "P4-5: enable gym_admin permissions"),
  ticket("gym-p4-5b", "P4-5: gym staff admin views"),

  ticket("gym-p5-1a", "P5-1: attendance streaks"),
  ticket("gym-p5-1b", "P5-1: attendance history UI"),
  ticket("gym-p5-2a", "P5-2: badge rules"),
  ticket("gym-p5-2b", "P5-2: badge display UI"),
  ticket("gym-p5-3a", "P5-3: opt-in challenge model"),
  ticket("gym-p5-3b", "P5-3: consistency leaderboard"),
  ticket("gym-p5-3c", "P5-3: safety copy for leaderboards"),
  ticket("gym-p5-4a", "P5-4: manual InBody entry"),
  ticket("gym-p5-4b", "P5-4: CSV import sketch"),
  ticket("gym-p5-5a", "P5-5: private body measurement log"),
  ticket("gym-p5-5b", "P5-5: consent/privacy controls"),

  ticket("gym-p6-0a", "P6-GATE: consult fintech regulation expert"),
  ticket("gym-p6-0b", "P6-GATE: decide credit vs points"),
  ticket("gym-p6-1a", "P6-1: CreditWallet model"),
  ticket("gym-p6-1b", "P6-1: immutable CreditTransaction ledger"),
  ticket("gym-p6-1c", "P6-1: derive wallet balance"),
  ticket("gym-p6-2a", "P6-2: top-up via gateway"),
  ticket("gym-p6-3a", "P6-3: spend credit at checkout"),
  ticket("gym-p6-4a", "P6-4: cashback rules engine"),
  ticket("gym-p6-5a", "P6-5: reconciliation view"),
  ticket("gym-p6-5b", "P6-5: admin audit trail"),

  ticket("gym-cross-01", "CROSS: in-app announcements"),
  ticket("gym-cross-02", "CROSS: booking reminders"),
  ticket("gym-cross-03", "CROSS: admin analytics foundation"),
  ticket("gym-cross-04", "CROSS: sales analytics"),
  ticket("gym-cross-05", "CROSS: active-member analytics"),
  ticket("gym-cross-06", "CROSS: popular-machine analytics"),
  ticket("gym-cross-07", "CROSS: attendance analytics"),
  ticket("gym-cross-08", "CROSS: enforce gymId on every new collection"),
  ticket("gym-cross-09", "CROSS: audit new tenant queries"),
  ticket("gym-cross-10", "CROSS: bilingual copy for every new screen"),
  ticket("gym-cross-11", "CROSS: RTL layout QA for every new screen"),
];

const medicalWebsiteTasks: GoalTask[] = [
  { id: "api-base-url", section: "Infrastructure & Security", title: "Fix inconsistent API base URL (central api.ts vs direct calls disagree on whether /api is included)", done: false, threadCount: 0 },
  { id: "chapter-intro-endpoint", section: "Infrastructure & Security", title: "Fix ChapterIntro posting to wrong endpoint (/api/course/... vs /api/courses/...)", done: false, threadCount: 0 },
  { id: "remove-env-tracking", section: "Infrastructure & Security", title: "Remove Front-End/.env from git tracking and rotate any exposed values", done: false, threadCount: 0 },
  { id: "mailtrap-env", section: "Infrastructure & Security", title: "Move hardcoded Mailtrap credentials in emailService.ts into env vars", done: false, threadCount: 0 },
  { id: "maintenance-auth", section: "Infrastructure & Security", title: "Fix maintenance-mode admin bypass (runs before auth sets req.user)", done: false, threadCount: 0 },
  { id: "sanitize-html", section: "Infrastructure & Security", title: "Sanitize HTML lesson/chapter content before rendering (XSS risk via dangerouslySetInnerHTML)", done: false, threadCount: 0 },
  { id: "lesson-access-field", section: "Infrastructure & Security", title: "Fix canAccessLesson querying nonexistent chapterNumber field", done: false, threadCount: 0 },
  { id: "final-exam-scope", section: "Infrastructure & Security", title: "Fix canAccessFinalExam scoping (checks chapters globally instead of per-course)", done: false, threadCount: 0 },
  { id: "chatbot-access", section: "Infrastructure & Security", title: "Fix chatbot accepting any lessonId without checking lesson access/lock status", done: false, threadCount: 0 },
  { id: "duplicate-final-exam-route", section: "Infrastructure & Security", title: "Remove duplicate final exam route registration", done: false, threadCount: 0 },
  { id: "session-validator", section: "Infrastructure & Security", title: "Add sessionId validation to submitExamValidator", done: false, threadCount: 0 },
  { id: "score-storage", section: "Infrastructure & Security", title: "Standardize score storage (raw count vs percentage) across quiz/test/final progress", done: false, threadCount: 0 },
  { id: "cascade-course-delete", section: "Infrastructure & Security", title: "Add cascade delete: course -> chapters/lessons/progress/certificates/sessions/chat usage", done: false, threadCount: 0 },
  { id: "cascade-question-delete", section: "Infrastructure & Security", title: "Add cascade delete: question deletion -> remove from lesson/chapter/course assignments", done: false, threadCount: 0 },
  { id: "cascade-user-delete", section: "Infrastructure & Security", title: "Add cascade delete: user deletion -> certificates/chat usage/sessions", done: false, threadCount: 0 },
  { id: "settings-defaults", section: "Infrastructure & Security", title: "Apply Settings course defaults instead of hardcoded controller defaults", done: false, threadCount: 0 },
  { id: "hash-reset-tokens", section: "Infrastructure & Security", title: "Hash/encrypt password reset tokens and email verification codes (currently plaintext)", done: false, threadCount: 0 },
  { id: "rate-limits", section: "Infrastructure & Security", title: "Add rate limiting (login, register, verification, password reset, chatbot)", done: false, threadCount: 0 },
  { id: "security-headers", section: "Infrastructure & Security", title: "Add helmet or equivalent security headers middleware", done: false, threadCount: 0 },
  { id: "cors-allowlist", section: "Infrastructure & Security", title: "Restrict CORS to an actual origin allowlist (currently wide open)", done: false, threadCount: 0 },
  { id: "jwt-storage", section: "Infrastructure & Security", title: "Reconsider JWT storage (localStorage -> httpOnly cookie, if feasible)", done: false, threadCount: 0 },
  { id: "test-email-admin", section: "Infrastructure & Security", title: "Wire up testEmail admin endpoint to actually send (currently simulated)", done: false, threadCount: 0 },
  { id: "dead-code-cleanup", section: "Infrastructure & Security", title: "Remove unused App.css import / dead code cleanup pass", done: false, threadCount: 0 },
  { id: "stale-readme", section: "Infrastructure & Security", title: "Update stale README (React version, collection count, env var guidance)", done: false, threadCount: 0 },

  { id: "navy-neutral-site", section: "General Site-Wide", title: "Apply navy/neutral color scheme everywhere (Landing is done, remaining pages need it)", done: false, threadCount: 0 },
  { id: "responsive-pass", section: "General Site-Wide", title: "Full responsiveness pass on every remaining page (mobile/tablet/desktop)", done: false, threadCount: 0 },
  { id: "design-system-pass", section: "General Site-Wide", title: "Apply a consistent design system across all pages, not just Landing", done: false, threadCount: 0 },

  { id: "landing-page", section: "Pages", title: "Landing page - redesigned, new sections, responsive, real images", done: true, threadCount: 0 },
  { id: "auth-pages", section: "Pages", title: "Sign up / Login page - styling update to match new palette", done: false, threadCount: 0 },
  { id: "privacy-policy", section: "Pages", title: "Privacy Policy page - confirm real content exists, not placeholder", done: false, threadCount: 0 },
  { id: "terms-service", section: "Pages", title: "Terms of Service page - confirm real content exists, not placeholder", done: false, threadCount: 0 },
  { id: "password-pages", section: "Pages", title: "Forgot/Reset password pages - styling pass", done: false, threadCount: 0 },
  { id: "verify-email-page", section: "Pages", title: "Verify email page - styling pass", done: false, threadCount: 0 },
  { id: "course-detail-page", section: "Pages", title: "Course detail page - styling + content pass", done: false, threadCount: 0 },
  { id: "student-dashboard", section: "Pages", title: "Dashboard - real redesign; define what good looks like and build it", done: false, threadCount: 0 },
  { id: "lesson-view-page", section: "Pages", title: "Lesson view page - styling pass plus sanitization/access fixes", done: false, threadCount: 0 },
  { id: "quiz-view-page", section: "Pages", title: "Quiz view page - styling pass", done: false, threadCount: 0 },
  { id: "chapter-intro-page", section: "Pages", title: "Chapter intro page - styling pass and endpoint bug fix", done: false, threadCount: 0 },
  { id: "chapter-test-page", section: "Pages", title: "Chapter test page - styling pass", done: false, threadCount: 0 },
  { id: "final-exam-page", section: "Pages", title: "Final exam page - styling pass", done: false, threadCount: 0 },
  { id: "certificate-view-page", section: "Pages", title: "Certificate view page - styling pass", done: false, threadCount: 0 },
  { id: "verify-certificate-page", section: "Pages", title: "Verify certificate page (public) - styling pass", done: false, threadCount: 0 },
  { id: "maintenance-page", section: "Pages", title: "Maintenance page - styling pass", done: false, threadCount: 0 },
  { id: "admin-panel", section: "Pages", title: "Admin panel + all admin sub-pages - deferred and lowest priority, but still needed eventually", done: false, threadCount: 0 },

  { id: "cv-career-subscription", section: "New Products / Features", title: "CV & Career Subscription service - define scope, pricing, delivery mechanism, and build it", done: false, threadCount: 0 },
  { id: "interpreter-handbook", section: "New Products / Features", title: "Interpreter Handbook - produce content and decide delivery format (PDF, in-site reader, etc.)", done: false, threadCount: 0 },
  { id: "glossary-books", section: "New Products / Features", title: "Specialized Glossary books (US/Canadian abbreviations) - produce content and delivery format", done: false, threadCount: 0 },
  { id: "cv-guidance-content", section: "New Products / Features", title: "Job application / CV guidance content - write landing section and deeper in-app version", done: false, threadCount: 0 },
  { id: "audio-practice-module", section: "New Products / Features", title: "Audio Practice Module - coming soon on site, still needs to actually be built", done: false, threadCount: 0 },

  { id: "paymob", section: "Payment", title: "Integrate Paymob", done: false, threadCount: 0 },
  { id: "enrollment-flow", section: "Payment", title: "Design enrollment flow (role upgrade on successful payment, currently manual admin-only)", done: false, threadCount: 0 },
  { id: "payment-failures", section: "Payment", title: "Handle failed payments, webhooks, and refunds", done: false, threadCount: 0 },
  { id: "pricing-tiers", section: "Payment", title: "Decide pricing tiers (course only vs course + subscription bundle)", done: false, threadCount: 0 },

  { id: "content-review", section: "Pre-Launch / Go-Live Readiness", title: "Real content/copy review across all pages (no lorem ipsum, no placeholder text)", done: false, threadCount: 0 },
  { id: "real-images", section: "Pre-Launch / Go-Live Readiness", title: "Replace all images with real assets and confirm none are left as icon placeholders", done: false, threadCount: 0 },
  { id: "legal-review", section: "Pre-Launch / Go-Live Readiness", title: "Legal review of Terms/Privacy content for accuracy, not just existence", done: false, threadCount: 0 },
  { id: "performance-check", section: "Pre-Launch / Go-Live Readiness", title: "Load/basic performance check before ad traffic hits", done: false, threadCount: 0 },
  { id: "analytics-setup", section: "Pre-Launch / Go-Live Readiness", title: "Analytics/tracking setup to measure ad spend ROI", done: false, threadCount: 0 },
  { id: "production-env", section: "Pre-Launch / Go-Live Readiness", title: "Domain/SSL/production env vars double-checked (NODE_ENV=production, secure cookies, etc.)", done: false, threadCount: 0 },

  { id: "logo-brand", section: "Brand & Revenue Assets", title: "Create a real logo and simple brand kit (logo, mark, colors, typography, favicon)", done: false, threadCount: 0 },
  { id: "certificate-pngs", section: "Brand & Revenue Assets", title: "Design certificate PNG/templates and make generated certificates feel premium", done: false, threadCount: 0 },
  { id: "course-product-mockups", section: "Brand & Revenue Assets", title: "Create course product mockups for landing page and ads", done: false, threadCount: 0 },
  { id: "instructor-trust-section", section: "Brand & Revenue Assets", title: "Build instructor credibility/trust section with your story, outcomes, and proof", done: false, threadCount: 0 },
  { id: "sales-funnel-emails", section: "Brand & Revenue Assets", title: "Write sales funnel emails: welcome, verification, abandoned checkout, purchase, reminder", done: false, threadCount: 0 },
  { id: "support-refund-policy", section: "Brand & Revenue Assets", title: "Define support/refund policy and add it to the customer journey", done: false, threadCount: 0 },
  { id: "student-testimonials", section: "Brand & Revenue Assets", title: "Plan testimonial/case-study capture flow for future students", done: false, threadCount: 0 },
  { id: "ad-creative-kit", section: "Brand & Revenue Assets", title: "Prepare ad creative kit: hooks, short video scripts, thumbnails, and landing variants", done: false, threadCount: 0 },
];

export const goals: Goal[] = [
  {
    id: "project-gym-site",
    title: "Gym QR Platform",
    subtitle: "Multi-tenant gym machine QR app from scratch",
    kind: "project",
    color: "#18181b",
    icon: Dumbbell,
    tasks: gymPlatformTasks,
  },
  {
    id: "project-medical-site",
    title: "Medical Interpretation Website",
    subtitle: "Turn the existing site into a paid course business",
    kind: "project",
    color: "#0f766e",
    icon: Globe2,
    tasks: medicalWebsiteTasks,
  },
  {
    id: "project-website-3",
    title: "Aflam Party Game",
    subtitle: "Party game with single and teams modes",
    kind: "project",
    color: "#18181b",
    icon: Globe2,
    tasks: [
      ticket("aflam-landing", "Landing Page"),
      ticket("aflam-settings", "Settings Page"),
      ticket("aflam-setup-single", "Setup Page (Single)"),
      ticket("aflam-setup-teams", "Setup Page (Teams)"),
      ticket("aflam-classic-single", "Classic Game Single"),
      ticket("aflam-classic-teams", "Classic Game Teams"),
      ticket("aflam-rules-single", "Rules Game Singles"),
      ticket("aflam-rules-teams", "Rules Game Teams"),
      ticket("aflam-challenge-single", "Challenge Games Single"),
      ticket("aflam-challenge-teams", "Challenge Games Teams"),
    ],
  },
  {
    id: "project-website-4",
    title: "Werewolf Game",
    subtitle: "Social deduction game flow and assets",
    kind: "project",
    color: "#18181b",
    icon: Globe2,
    tasks: [
      ticket("werewolf-home", "Home Page"),
      ticket("werewolf-create-join", "Create / Join Modals"),
      ticket("werewolf-how-to-play", "How To Play Page"),
      ticket("werewolf-waiting-room", "Waiting Room"),
      ticket("werewolf-role-reveal", "Role Reveal Page"),
      ticket("werewolf-night-phase", "Night Phase"),
      ticket("werewolf-discussion-phase", "Discussion Phase"),
      ticket("werewolf-vote-phase", "Vote Phase"),
      ticket("werewolf-end-game", "End Game Screen"),
      ticket("werewolf-characters", "Characters"),
      ticket("werewolf-theme", "Theme"),
      ticket("werewolf-backgrounds", "Backgrounds"),
    ],
  },
  {
    id: "bank-saving-le",
    title: "Bank Saving LE",
    subtitle: "Egyptian pound bank saving target",
    kind: "money",
    color: "#18181b",
    icon: Banknote,
    money: {
      current: 0,
      target: 100000,
      currency: "LE",
      transactions: [],
    },
  },
  {
    id: "bank-saving-usd",
    title: "Bank Saving $",
    subtitle: "Dollar bank saving target",
    kind: "money",
    color: "#18181b",
    icon: Banknote,
    money: {
      current: 0,
      target: 10000,
      currency: "$",
      transactions: [],
    },
  },
  {
    id: "body-weight-goal",
    title: "Body Composition Target",
    subtitle: "Reach 100-105 kg with 15-20% body fat",
    kind: "weight",
    color: "#ea580c",
    icon: Scale,
    weight: {
      current: 128.7,
      start: 128.7,
      target: 105,
      targetMin: 100,
      targetMax: 105,
      unit: "kg",
      fatPct: 42.5,
      targetFatMin: 15,
      targetFatMax: 20,
      musclePct: 20.4,
      waterPct: 44.1,
      boneKg: 4.4,
      logs: [
        {
          id: "inbody-start-2026-07-25",
          date: "2026-07-25",
          weightKg: 128.7,
          fatPct: 42.5,
          musclePct: 20.4,
          waterPct: 44.1,
          boneKg: 4.4,
        },
      ],
    },
  },
];

export function goalPercent(goal: Goal) {
  if (goal.kind === "project") {
    const total = goal.tasks?.length ?? 0;
    const done = goal.tasks?.filter((task) => task.status === "completed" || task.done).length ?? 0;
    return total ? Math.round((done / total) * 100) : 0;
  }
  if (goal.kind === "money" && goal.money) {
    return Math.round(Math.min(goal.money.current / goal.money.target, 1) * 100);
  }
  if (goal.kind === "weight" && goal.weight) {
    const latest = [...(goal.weight.logs ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
    const currentWeight = latest?.weightKg ?? goal.weight.current;
    const currentFat = latest?.fatPct ?? goal.weight.fatPct;
    const totalToLose = goal.weight.start - goal.weight.target;
    const weightProgress = totalToLose > 0 ? Math.min(Math.max((goal.weight.start - currentWeight) / totalToLose, 0), 1) : 0;
    if (typeof currentFat !== "number" || typeof goal.weight.targetFatMax !== "number" || typeof goal.weight.fatPct !== "number") {
      return Math.round(weightProgress * 100);
    }
    const fatToLose = goal.weight.fatPct - goal.weight.targetFatMax;
    const fatProgress = fatToLose > 0 ? Math.min(Math.max((goal.weight.fatPct - currentFat) / fatToLose, 0), 1) : 0;
    return Math.round(((weightProgress + fatProgress) / 2) * 100);
  }
  return 0;
}
