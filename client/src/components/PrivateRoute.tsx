import { useEffect, useState, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";

// =====================================================================
// CONFIG — edit these
// =====================================================================
const PASSWORD = "2462"; // ← change this to your actual password
const UNLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const STORAGE_KEY = "private:unlocked-until";

// =====================================================================
// Helpers
// =====================================================================
function isUnlocked(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const until = parseInt(raw, 10);
    if (isNaN(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

function setUnlocked() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + UNLOCK_DURATION_MS));
  } catch {
    // ignore — localStorage might be disabled
  }
}

function clearUnlock() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// =====================================================================
// PrivateRoute wrapper
// =====================================================================
export function PrivateRoute({ children }: { children: ReactNode }) {
  const [unlocked, setUnlockedState] = useState(() => isUnlocked());

  // Auto-relock when the 10-min window expires
  useEffect(() => {
    if (!unlocked) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const until = parseInt(raw, 10);
    const remaining = until - Date.now();
    if (remaining <= 0) {
      setUnlockedState(false);
      clearUnlock();
      return;
    }
    const timer = setTimeout(() => {
      setUnlockedState(false);
      clearUnlock();
    }, remaining);
    return () => clearTimeout(timer);
  }, [unlocked]);

  // Cross-tab sync — if another tab locks, this one locks too
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setUnlockedState(isUnlocked());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const handleUnlock = () => {
    setUnlocked();
    setUnlockedState(true);
  };

  return (
    <AnimatePresence mode="wait">
      {unlocked ? (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      ) : (
        <motion.div
          key="lock"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <LockScreen onUnlock={handleUnlock} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =====================================================================
// Lock screen
// =====================================================================
function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus password field on mount
    inputRef.current?.focus();
  }, []);

  const submit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (value === PASSWORD) {
      setError(false);
      onUnlock();
    } else {
      setError(true);
      setShake((s) => s + 1);
      setValue("");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="w-full max-w-[420px] mx-auto pt-16 md:pt-24">
      <motion.div
        key={shake}
        animate={shake > 0 ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"
              >
                <Lock className="h-6 w-6 text-muted-foreground" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.25 }}
                className="text-lg font-semibold tracking-tight"
              >
                Private page
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.25 }}
                className="text-sm text-muted-foreground mt-1"
              >
                Enter your password to continue
              </motion.p>
            </div>

            <motion.form
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.25 }}
              onSubmit={submit}
              className="mt-6 space-y-3"
            >
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Password
                </Label>
                <Input
                  ref={inputRef}
                  type="password"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) setError(false);
                  }}
                  autoComplete="off"
                  className="font-mono"
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded"
                      style={{
                        color: "var(--color-off-sick)",
                        background: "var(--color-off-sick-bg)",
                      }}
                    >
                      <AlertCircle className="h-3 w-3" />
                      Incorrect password
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                variant="default"
                size="default"
                type="submit"
                className="w-full h-9"
              >
                Unlock
              </Button>
            </motion.form>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.25 }}
              className="mt-5 pt-5 border-t border-border text-[11px] text-muted-foreground text-center"
            >
              Unlocks for 10 minutes
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}