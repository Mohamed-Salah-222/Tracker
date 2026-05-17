import { Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "./useTheme";
import { Button } from "./ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggle = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <Button variant="outline" size="icon" onClick={toggle} className="relative h-9 w-9 rounded-full overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={resolvedTheme} initial={{ opacity: 0, rotate: -90, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 90, scale: 0.6 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0 flex items-center justify-center">
          {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
