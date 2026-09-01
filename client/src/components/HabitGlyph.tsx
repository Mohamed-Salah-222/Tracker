import { BookOpen, Bike, Brain, BriefcaseBusiness, Beef, CircleCheck, Droplet, Dumbbell, Flame, FolderKanban, Footprints, HandHeart, Heart, Languages, ListChecks, Moon, Music, PenLine, Pill, Sun, type LucideIcon } from "lucide-react";

/**
 * Habit icons are stored as names, so a habit created at runtime can carry one
 * without the client knowing about it in advance. Anything unrecognised falls back
 * rather than rendering nothing.
 */
const GLYPHS: Record<string, LucideIcon> = {
  "circle-check": CircleCheck,
  pill: Pill,
  hands: HandHeart,
  moon: Moon,
  footprints: Footprints,
  "footprints-count": Footprints,
  "book-open": BookOpen,
  "folder-kanban": FolderKanban,
  languages: Languages,
  dumbbell: Dumbbell,
  "list-checks": ListChecks,
  flame: Flame,
  beef: Beef,
  droplet: Droplet,
  briefcase: BriefcaseBusiness,
  "briefcase-business": BriefcaseBusiness,
  heart: Heart,
  brain: Brain,
  sun: Sun,
  music: Music,
  "pen-line": PenLine,
  bike: Bike,
};

export function HabitGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = GLYPHS[name] ?? CircleCheck;
  return <Icon className={className} aria-hidden />;
}
