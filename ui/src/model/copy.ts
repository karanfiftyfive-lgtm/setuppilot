// Plain-language text the demo UI adds on top of data/explanations.json. Honest by rule:
// speeds are estimates, nothing is installed or measured in the demo, never "unlimited".
import type { SpeedWord, StepId } from "../../../core/types";

export const COPY = {
  appName: "SetupPilot",
  welcome: {
    title: "Your own private AI, set up for you",
    lead: "Pick what you want. SetupPilot does the rest and explains every step.",
    points: [
      { icon: "lock", title: "Private", text: "Runs on your own PC. Your words stay on your PC." },
      { icon: "bolt", title: "No monthly bill", text: "No subscription for the AI itself, and it works offline once set up." },
      { icon: "check", title: "You stay in control", text: "Nothing happens until you approve it, and everything can be undone." },
    ],
    limit:
      "Honest limits: AI models that run on a normal PC are smaller than ChatGPT or Claude, so answers are simpler. How fast it answers depends on your PC.",
    demoNote: "This is a demo. Nothing is installed and nothing on this computer changes.",
    start: "Start",
  },
  goal: { title: "What do you want to do?", hint: "Pick one. You can change it later." },
  scan: {
    title: "Your PC",
    hint: "Here is the best AI for this PC.",
    pickLabel: "Which PC?",
    pick: "Best fit for this PC",
    why: "Why this pick?",
    speed: "Speed",
    next: "Want a bigger AI?",
    noNext: "This is already the biggest AI in the list for this goal.",
    specs: { memory: "Memory", disk: "Free disk", graphics: "Graphics", processor: "Processor" },
  },
  plan: {
    title: "Set up your private AI",
    lead: "Here is everything that will happen. Nothing runs until you approve.",
    stepsLine: (n: number, minutes: number) => `${n} steps, about ${minutes} minutes (estimate)`,
    whatHappens: "What does this step do?",
    approveAll: "Approve all",
    reviewEach: "Review each step",
    approve: "Approve",
    skip: "Skip",
    details: "Show technical details",
    hideDetails: "Hide technical details",
    requiredNote: "This step is needed, so it can't be skipped.",
    userSkipped: "You chose to skip this step.",
    osPrompt: "In the real app, Windows asks \"Allow this app to make changes?\" for this program. Click Yes. (The demo shows no box.)",
    outputCaption: "Example of what the real app would show. Nothing ran.",
    allDone: "All steps finished (simulated).",
    approveAllHint: (prompts: number) =>
      `"Approve all" runs every step below, one after another. ${prompts > 0 ? `In the real app, Windows asks for permission ${prompts === 1 ? "once" : `${prompts} times`}: click Yes each time.` : "No Windows permission box is expected."}`,
    totalTime: "Total time (estimate)",
  },
  test: {
    title: "Try your AI",
    lead: "Ask a first question to check that everything works.",
    ask: "Ask (simulated)",
    you: "You",
    ai: "Your AI",
    question: "In one sentence, what can you help me with?",
    answer:
      "(Simulated answer) I can help you write, summarise and answer questions, privately on this PC.",
    speed: "Speed: Demo mode: simulated, not measured. The real app measures it on your PC after setup.",
  },
  reanalyze: {
    title: "My PC changed",
    lead: "Added memory or a graphics card? Check again to see what a bigger AI would need.",
    sampleNote: "The demo compares your PC with a sample upgraded PC.",
    button: "Check again",
    changes: "What changed",
    ladder: "Bigger AIs, and what each one needs",
    tips: "Ways to get more from your AI",
    youWouldNeed: (needs: string) => `You would need ${needs}.`,
    rollback: "Your current AI model is kept, so you can switch back at any time.",
    fitsNow: "Fits now",
    needsMore: "Needs more",
  },
  uninstall: {
    title: "Remove everything (simulated)",
    hint: "SetupPilot keeps a list of everything it changed, and undoes only that, in a fixed order.",
    approve: "Approve removal",
    done: "Removal finished (simulated). Nothing on this computer was changed.",
  },
  chat: {
    title: "Chat (simulated)",
    label: "Your message",
    send: "Send",
    reply: "(Simulated reply) In the real app, your own AI answers here, on your PC. This demo can't answer for real.",
  },
  nav: { back: "Back", next: "Next" },
  /** The stepper at the top of every screen, in flow order. */
  stepper: ["Start", "Goal", "Your PC", "Setup", "Try it", "Upgrade"],
  /** Plain names for the progress map (never the internal step ids). */
  stepNames: {
    "scan-pc": "Check your PC", "choose-model": "Pick your AI", "install-runtime": "Install the AI program",
    "download-model": "Download the AI", "safe-defaults": "Safe memory settings", "speed-boost": "Speed boost (optional)",
    "remote-access": "Use from other devices", "connect-coding-tool": "Connect coding tool",
    "workflow-rules": "Coding rules file (optional)", "test-run": "Test question",
  } satisfies Record<StepId, string>,
} as const;

/** The speed word from core/recommend, always labelled as an estimate. Never a number. */
export function speedText(word: SpeedWord): string {
  const plain = { fast: "Feels quick", okay: "Usable, a bit slower", slow: "Slow, but it works" }[word];
  return `${plain} (estimate)`;
}
