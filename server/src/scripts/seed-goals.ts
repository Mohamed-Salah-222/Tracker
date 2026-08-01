import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { LifeGoal, type GoalIcon, type GoalKind } from "../models/LifeGoal";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// The Goals board used to render from a hardcoded array in the client. Moving it
// to the database would otherwise throw that content away, so this carries the
// real goals across once. The gym-platform project is deliberately not included:
// it was placeholder content, not real data about this app.
//
// Idempotent by title — re-running it will not duplicate a goal that already exists.

type SeedTask = { title: string; section?: string; done?: boolean };

const ticket = (title: string): SeedTask => ({ title });

const medicalWebsiteTasks: SeedTask[] = [
  { section: "Infrastructure & Security", title: "Fix inconsistent API base URL (central api.ts vs direct calls disagree on whether /api is included)" },
  { section: "Infrastructure & Security", title: "Fix ChapterIntro posting to wrong endpoint (/api/course/... vs /api/courses/...)" },
  { section: "Infrastructure & Security", title: "Remove Front-End/.env from git tracking and rotate any exposed values" },
  { section: "Infrastructure & Security", title: "Move hardcoded Mailtrap credentials in emailService.ts into env vars" },
  { section: "Infrastructure & Security", title: "Fix maintenance-mode admin bypass (runs before auth sets req.user)" },
  { section: "Infrastructure & Security", title: "Sanitize HTML lesson/chapter content before rendering (XSS risk via dangerouslySetInnerHTML)" },
  { section: "Infrastructure & Security", title: "Fix canAccessLesson querying nonexistent chapterNumber field" },
  { section: "Infrastructure & Security", title: "Fix canAccessFinalExam scoping (checks chapters globally instead of per-course)" },
  { section: "Infrastructure & Security", title: "Fix chatbot accepting any lessonId without checking lesson access/lock status" },
  { section: "Infrastructure & Security", title: "Remove duplicate final exam route registration" },
  { section: "Infrastructure & Security", title: "Add sessionId validation to submitExamValidator" },
  { section: "Infrastructure & Security", title: "Standardize score storage (raw count vs percentage) across quiz/test/final progress" },
  { section: "Infrastructure & Security", title: "Add cascade delete: course -> chapters/lessons/progress/certificates/sessions/chat usage" },
  { section: "Infrastructure & Security", title: "Add cascade delete: question deletion -> remove from lesson/chapter/course assignments" },
  { section: "Infrastructure & Security", title: "Add cascade delete: user deletion -> certificates/chat usage/sessions" },
  { section: "Infrastructure & Security", title: "Apply Settings course defaults instead of hardcoded controller defaults" },
  { section: "Infrastructure & Security", title: "Hash/encrypt password reset tokens and email verification codes (currently plaintext)" },
  { section: "Infrastructure & Security", title: "Add rate limiting (login, register, verification, password reset, chatbot)" },
  { section: "Infrastructure & Security", title: "Add helmet or equivalent security headers middleware" },
  { section: "Infrastructure & Security", title: "Restrict CORS to an actual origin allowlist (currently wide open)" },
  { section: "Infrastructure & Security", title: "Reconsider JWT storage (localStorage -> httpOnly cookie, if feasible)" },
  { section: "Infrastructure & Security", title: "Wire up testEmail admin endpoint to actually send (currently simulated)" },
  { section: "Infrastructure & Security", title: "Remove unused App.css import / dead code cleanup pass" },
  { section: "Infrastructure & Security", title: "Update stale README (React version, collection count, env var guidance)" },

  { section: "General Site-Wide", title: "Apply navy/neutral color scheme everywhere (Landing is done, remaining pages need it)" },
  { section: "General Site-Wide", title: "Full responsiveness pass on every remaining page (mobile/tablet/desktop)" },
  { section: "General Site-Wide", title: "Apply a consistent design system across all pages, not just Landing" },

  { section: "Pages", title: "Landing page - redesigned, new sections, responsive, real images", done: true },
  { section: "Pages", title: "Sign up / Login page - styling update to match new palette" },
  { section: "Pages", title: "Privacy Policy page - confirm real content exists, not placeholder" },
  { section: "Pages", title: "Terms of Service page - confirm real content exists, not placeholder" },
  { section: "Pages", title: "Forgot/Reset password pages - styling pass" },
  { section: "Pages", title: "Verify email page - styling pass" },
  { section: "Pages", title: "Course detail page - styling + content pass" },
  { section: "Pages", title: "Dashboard - real redesign; define what good looks like and build it" },
  { section: "Pages", title: "Lesson view page - styling pass plus sanitization/access fixes" },
  { section: "Pages", title: "Quiz view page - styling pass" },
  { section: "Pages", title: "Chapter intro page - styling pass and endpoint bug fix" },
  { section: "Pages", title: "Chapter test page - styling pass" },
  { section: "Pages", title: "Final exam page - styling pass" },
  { section: "Pages", title: "Certificate view page - styling pass" },
  { section: "Pages", title: "Verify certificate page (public) - styling pass" },
  { section: "Pages", title: "Maintenance page - styling pass" },
  { section: "Pages", title: "Admin panel + all admin sub-pages - deferred and lowest priority, but still needed eventually" },

  { section: "New Products / Features", title: "CV & Career Subscription service - define scope, pricing, delivery mechanism, and build it" },
  { section: "New Products / Features", title: "Interpreter Handbook - produce content and decide delivery format (PDF, in-site reader, etc.)" },
  { section: "New Products / Features", title: "Specialized Glossary books (US/Canadian abbreviations) - produce content and delivery format" },
  { section: "New Products / Features", title: "Job application / CV guidance content - write landing section and deeper in-app version" },
  { section: "New Products / Features", title: "Audio Practice Module - coming soon on site, still needs to actually be built" },

  { section: "Payment", title: "Integrate Paymob" },
  { section: "Payment", title: "Design enrollment flow (role upgrade on successful payment, currently manual admin-only)" },
  { section: "Payment", title: "Handle failed payments, webhooks, and refunds" },
  { section: "Payment", title: "Decide pricing tiers (course only vs course + subscription bundle)" },

  { section: "Pre-Launch / Go-Live Readiness", title: "Real content/copy review across all pages (no lorem ipsum, no placeholder text)" },
  { section: "Pre-Launch / Go-Live Readiness", title: "Replace all images with real assets and confirm none are left as icon placeholders" },
  { section: "Pre-Launch / Go-Live Readiness", title: "Legal review of Terms/Privacy content for accuracy, not just existence" },
  { section: "Pre-Launch / Go-Live Readiness", title: "Load/basic performance check before ad traffic hits" },
  { section: "Pre-Launch / Go-Live Readiness", title: "Analytics/tracking setup to measure ad spend ROI" },
  { section: "Pre-Launch / Go-Live Readiness", title: "Domain/SSL/production env vars double-checked (NODE_ENV=production, secure cookies, etc.)" },

  { section: "Brand & Revenue Assets", title: "Create a real logo and simple brand kit (logo, mark, colors, typography, favicon)" },
  { section: "Brand & Revenue Assets", title: "Design certificate PNG/templates and make generated certificates feel premium" },
  { section: "Brand & Revenue Assets", title: "Create course product mockups for landing page and ads" },
  { section: "Brand & Revenue Assets", title: "Build instructor credibility/trust section with your story, outcomes, and proof" },
  { section: "Brand & Revenue Assets", title: "Write sales funnel emails: welcome, verification, abandoned checkout, purchase, reminder" },
  { section: "Brand & Revenue Assets", title: "Define support/refund policy and add it to the customer journey" },
  { section: "Brand & Revenue Assets", title: "Plan testimonial/case-study capture flow for future students" },
  { section: "Brand & Revenue Assets", title: "Prepare ad creative kit: hooks, short video scripts, thumbnails, and landing variants" },
];

type SeedGoal = {
  title: string;
  subtitle: string;
  kind: GoalKind;
  color: string;
  icon: GoalIcon;
  tasks?: SeedTask[];
  money?: { target: number; currency: string; startingAmount: number };
  weight?: {
    unit: string;
    start: number;
    targetMin: number;
    targetMax: number;
    startFat: number;
    targetFatMin: number;
    targetFatMax: number;
  };
};

const seedGoals: SeedGoal[] = [
  {
    title: "Medical Interpretation Website",
    subtitle: "Turn the existing site into a paid course business",
    kind: "project",
    color: "#0f766e",
    icon: "globe",
    tasks: medicalWebsiteTasks,
  },
  {
    title: "Aflam Party Game",
    subtitle: "Party game with single and teams modes",
    kind: "project",
    color: "#18181b",
    icon: "globe",
    tasks: [
      ticket("Landing Page"),
      ticket("Settings Page"),
      ticket("Setup Page (Single)"),
      ticket("Setup Page (Teams)"),
      ticket("Classic Game Single"),
      ticket("Classic Game Teams"),
      ticket("Rules Game Singles"),
      ticket("Rules Game Teams"),
      ticket("Challenge Games Single"),
      ticket("Challenge Games Teams"),
    ],
  },
  {
    title: "Werewolf Game",
    subtitle: "Social deduction game flow and assets",
    kind: "project",
    color: "#18181b",
    icon: "globe",
    tasks: [
      ticket("Home Page"),
      ticket("Create / Join Modals"),
      ticket("How To Play Page"),
      ticket("Waiting Room"),
      ticket("Role Reveal Page"),
      ticket("Night Phase"),
      ticket("Discussion Phase"),
      ticket("Vote Phase"),
      ticket("End Game Screen"),
      ticket("Characters"),
      ticket("Theme"),
      ticket("Backgrounds"),
    ],
  },
  {
    title: "Bank Saving LE",
    subtitle: "Egyptian pound bank saving target",
    kind: "money",
    color: "#18181b",
    icon: "banknote",
    money: { target: 100000, currency: "LE", startingAmount: 0 },
  },
  {
    title: "Bank Saving $",
    subtitle: "Dollar bank saving target",
    kind: "money",
    color: "#18181b",
    icon: "banknote",
    money: { target: 10000, currency: "$", startingAmount: 0 },
  },
  {
    title: "Body Composition Target",
    subtitle: "Reach 100-105 kg with 15-20% body fat",
    kind: "weight",
    color: "#ea580c",
    icon: "scale",
    weight: {
      unit: "kg",
      start: 128.7,
      targetMin: 100,
      targetMax: 105,
      startFat: 42.5,
      targetFatMin: 15,
      targetFatMax: 20,
    },
  },
];

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set in .env");

  await mongoose.connect(uri);

  let created = 0;
  let skipped = 0;
  let order = await LifeGoal.countDocuments({});

  for (const seed of seedGoals) {
    const existing = await LifeGoal.findOne({ title: seed.title });
    if (existing) {
      console.log(`skip (already exists): ${seed.title}`);
      skipped++;
      continue;
    }

    await LifeGoal.create({
      title: seed.title,
      subtitle: seed.subtitle,
      kind: seed.kind,
      color: seed.color,
      icon: seed.icon,
      order: order++,
      tasks: (seed.tasks ?? []).map((task, index) => ({
        title: task.title,
        section: task.section ?? "",
        status: task.done ? "completed" : "planning",
        done: !!task.done,
        threadCount: 0,
        order: index,
      })),
      money: seed.money ?? null,
      weight: seed.weight ?? null,
    });
    console.log(`created: ${seed.title}`);
    created++;
  }

  console.log(`\nDone. created=${created} skipped=${skipped}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
