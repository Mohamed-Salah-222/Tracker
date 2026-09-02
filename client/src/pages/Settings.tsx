import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { Bell, Database, Palette, Settings as SettingsIcon, ShieldCheck, Target } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

/**
 * Settings, as a placeholder.
 *
 * Deliberately empty of controls. Everything listed here is either already editable
 * somewhere else or not built yet, and a settings page that duplicates the real
 * control is how two copies of one number start disagreeing. Each row says where the
 * setting lives today, or that it does not exist yet.
 */
const SECTIONS: { icon: typeof SettingsIcon; title: string; body: string; where?: { label: string; to: string } }[] = [
  {
    icon: Target,
    title: "Targets",
    body: "Calories, protein, water, steps, the sleep range and how many days a month each habit is meant to be kept.",
    where: { label: "Dashboard, under Goals", to: "/" },
  },
  {
    icon: Palette,
    title: "Appearance",
    body: "The app is black and white by design and has no theme to choose yet. Anything that lands here would be about density and text size rather than colour.",
  },
  {
    icon: Bell,
    title: "Reminders",
    body: "Not built. Now that the app can be installed to the home screen, a nudge at a set time is possible; it needs notification permission and a scheduler behind it.",
  },
  {
    icon: Database,
    title: "Your data",
    body: "Export and backup. Nothing here can get your data out of the app yet, which is the gap worth closing before anything else on this page.",
  },
  {
    icon: ShieldCheck,
    title: "Account",
    body: "There is no account. Everything is one person's data on one server, and this section is where signing in will go when there is more than one of you.",
  },
];

export default function Settings() {
  return (
    <div className="w-full max-w-[720px] space-y-4">
      <motion.header {...fadeUp} className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </motion.header>

      <motion.div {...fadeUp} className="rounded-xl border border-dashed border-border-strong px-4 py-3">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          A placeholder. Nothing on this page is wired up yet: it is here to hold the shape of what belongs in one place, and to say where each of these actually lives
          today.
        </p>
      </motion.div>

      <div className="space-y-2">
        {SECTIONS.map((section, i) => (
          <motion.div key={section.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: Math.min(i, 6) * 0.03 }}>
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground">
                  <section.icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">{section.title}</h2>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{section.body}</p>
                  {section.where && (
                    <Link to={section.where.to} className="mt-1.5 inline-block text-[11px] font-medium underline underline-offset-2 hover:no-underline">
                      {section.where.label}
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
