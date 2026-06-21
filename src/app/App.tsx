import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import heroBg from "@/imports/hero.jpg";
import orangeTexture from "@/imports/orange.jpg";
import cardBg from "@/imports/card-bg.jpg";
import videoBg from "@/imports/video-bg.jpg";
import footerBg from "@/imports/footer.jpg";


const TRIGGER_MAP: Record<string, { label: string; value: string; color: string }[]> = {
  revenue: [
    { label: "Q2 Revenue", value: "$240,000", color: "#fb8500" },
    { label: "YoY Growth", value: "+40%", color: "#fb8500" },
    { label: "Churn Rate", value: "1.8%", color: "#5A5550" },
  ],
  team: [
    { label: "Headcount", value: "142", color: "#fb8500" },
    { label: "Open Roles", value: "12", color: "#5A5550" },
    { label: "NPS Score", value: "78", color: "#fb8500" },
  ],
  product: [
    { label: "DAU", value: "48.2K", color: "#fb8500" },
    { label: "Uptime", value: "99.97%", color: "#fb8500" },
    { label: "Latency", value: "18ms", color: "#5A5550" },
  ],
  growth: [
    { label: "MRR", value: "$180K", color: "#fb8500" },
    { label: "Conversion", value: "4.7%", color: "#fb8500" },
    { label: "CAC", value: "$124", color: "#5A5550" },
  ],
};

function findCards(input: string) {
  const lower = input.toLowerCase();
  for (const key of Object.keys(TRIGGER_MAP)) {
    if (lower.includes(key)) return TRIGGER_MAP[key];
  }
  return null;
}

const CHART_DATA = [
  { month: "Jan", value: 42 },
  { month: "Feb", value: 58 },
  { month: "Mar", value: 51 },
  { month: "Apr", value: 74 },
  { month: "May", value: 68 },
  { month: "Jun", value: 91 },
];

const MAX_VAL = 100;

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    y: reduced ? 0 : 8,
  }),
  visible: (reduced: boolean) => ({
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: 0.4, ease: "easeOut" },
  }),
};

const headingVariants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    y: reduced ? 0 : 12,
  }),
  visible: (reduced: boolean) => ({
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: 0.5, ease: "easeOut" },
  }),
};

const rightWingVariants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    y: reduced ? 0 : 10,
  }),
  visible: (reduced: boolean) => ({
    opacity: 1,
    y: 0,
    transition: reduced
      ? { duration: 0.01 }
      : { duration: 0.4, ease: "easeOut", delay: 0.1 },
  }),
};

const cardVariants = {
  hidden: (custom: { index: number; reducedMotion: boolean }) => ({
    opacity: 0,
    y: custom.reducedMotion ? 0 : 6,
  }),
  visible: (custom: { index: number; reducedMotion: boolean }) => ({
    opacity: 1,
    y: 0,
    transition: custom.reducedMotion
      ? { duration: 0.01 }
      : {
          ease: "easeOut",
          duration: 0.3,
          delay: custom.index * 0.04,
        },
  }),
  exit: (custom: { index: number; reducedMotion: boolean }) => ({
    opacity: 0,
    y: custom.reducedMotion ? 0 : -4,
    transition: custom.reducedMotion
      ? { duration: 0.01 }
      : {
          duration: 0.15,
          ease: "easeIn",
        },
  }),
};

export function RevenuePreviewCard({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Q2 REVENUE</p>
          <p className="text-xl sm:text-2xl font-bold text-[#fb8500]">$240,000</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">GROWTH</p>
          <p className="text-xs sm:text-sm font-semibold text-[#fb8500]">+40% YoY</p>
          <p className="text-[9px] text-gray-600">Churn: 1.8%</p>
        </div>
      </div>

      <div className="relative w-full h-20 sm:h-24 bg-[#1A1512]/5 rounded-xl p-2 border border-[rgba(26,21,18,0.04)] overflow-hidden">
        <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="green-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb8500" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#fb8500" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="10" y1="25" x2="290" y2="25" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />
          <line x1="10" y1="50" x2="290" y2="50" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />
          <line x1="10" y1="75" x2="290" y2="75" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />

          {/* Filled Area */}
          <motion.path
            d="M 10,85 C 60,80 80,30 130,50 C 180,70 220,15 290,10 L 290, 95 L 10, 95 Z"
            fill="url(#green-grad)"
            stroke="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              reducedMotion
                ? { duration: 0.01 }
                : { ease: [0.16, 1, 0.3, 1], duration: 1.0, delay: 0.3 }
            }
          />

          {/* Line Path */}
          <motion.path
            d="M 10,85 C 60,80 80,30 130,50 C 180,70 220,15 290,10"
            fill="none"
            stroke="#fb8500"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={
              reducedMotion
                ? { duration: 0.01 }
                : { ease: [0.16, 1, 0.3, 1], duration: 1.2 }
            }
          />

          {/* Pulsing end dot */}
          <g>
            <motion.circle
              cx="290"
              cy="10"
              r="5"
              fill="#fb8500"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={
                reducedMotion
                  ? { scale: 1.1, opacity: 0.5 }
                  : { scale: [1, 2.3], opacity: [0.8, 0] }
              }
              transition={
                reducedMotion
                  ? { duration: 0.1 }
                  : {
                      repeat: Infinity,
                      duration: 2,
                      ease: "easeOut",
                    }
              }
            />
            <circle cx="290" cy="10" r="3" fill="#fb8500" />
          </g>
        </svg>
      </div>
    </div>
  );
}

export function TeamPreviewCard() {
  const members = [
    { name: "Jane Doe", initials: "JD", status: "active", bg: "bg-[#fb8500]/10 text-[#fb8500]" },
    { name: "Alex Miller", initials: "AM", status: "active", bg: "bg-amber-100 text-amber-800" },
    { name: "Sarah Reed", initials: "SR", status: "active", bg: "bg-blue-100 text-blue-800" },
    { name: "Liam King", initials: "LK", status: "active", bg: "bg-purple-100 text-purple-800" },
    { name: "Will Taylor", initials: "WT", status: "idle", bg: "bg-rose-100 text-rose-800" },
    { name: "Penny Lane", initials: "PL", status: "active", bg: "bg-teal-100 text-teal-800" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">HEADCOUNT</p>
          <p className="text-xl sm:text-2xl font-bold text-[#fb8500]">142 Active</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">PERFORMANCE</p>
          <p className="text-xs sm:text-sm font-semibold text-[#fb8500]">78 NPS</p>
          <p className="text-[9px] text-gray-600">12 Open Roles</p>
        </div>
      </div>

      {/* Avatars Grid */}
      <div className="grid grid-cols-6 gap-2 my-1">
        {members.map((member, i) => (
          <div key={i} className="relative flex items-center justify-center">
            <div className={`w-7 h-7 sm:w-8 h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold ${member.bg} shadow-sm`}>
              {member.initials}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-2 h-2 sm:w-2.5 h-2.5 rounded-full border border-white ${
                member.status === "active" ? "bg-[#fb8500]" : "bg-gray-400"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Monospaced activity log */}
      <div className="bg-[#1A1512]/5 rounded-xl p-3 border border-[rgba(26,21,18,0.04)]">
        <p className="text-[10px] uppercase text-gray-500 mb-1.5 tracking-wider font-semibold">
          ACTIVITY LOG
        </p>
        <div className="space-y-1 text-[9px] sm:text-[10px] text-[#2D2520] font-normal leading-relaxed">
          <div className="flex items-center gap-1.5">
            <span className="text-[#fb8500]">✔</span>
            <span>Notion API: jane.doe connected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#fb8500]">✔</span>
            <span>Slack: 4 channels integrated</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#fb8500]">✔</span>
            <span>GitHub: main branch parsed</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductPreviewCard({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">DAILY ACTIVE USERS</p>
          <p className="text-xl sm:text-2xl font-bold text-[#fb8500]">48.2K</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">LATENCY</p>
          <p className="text-xs sm:text-sm font-semibold text-[#fb8500]">18ms</p>
          <p className="text-[9px] text-gray-600">Uptime: 99.97%</p>
        </div>
      </div>

      <div className="relative w-full h-20 sm:h-24 bg-[#1A1512]/5 rounded-xl p-2 border border-[rgba(26,21,18,0.04)] overflow-hidden">
        <div className="absolute top-2 left-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#fb8500] animate-ping" />
          <span className="text-[9px] text-gray-500 uppercase font-normal tracking-wider">
            Real-time Latency Monitor
          </span>
        </div>
        <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible pt-4">
          <defs>
            <linearGradient id="blue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb8500" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#fb8500" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="10" y1="20" x2="290" y2="20" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />
          <line x1="10" y1="45" x2="290" y2="45" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />
          <line x1="10" y1="70" x2="290" y2="70" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />

          {/* Filled Area */}
          <motion.path
            d="M 10,65 C 40,70 60,35 80,45 C 100,55 120,75 140,60 C 160,45 180,30 200,70 C 220,95 240,40 260,35 C 280,30 285,55 290,50 L 290, 95 L 10, 95 Z"
            fill="url(#blue-grad)"
            stroke="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              reducedMotion
                ? { duration: 0.01 }
                : { ease: [0.16, 1, 0.3, 1], duration: 1.0, delay: 0.3 }
            }
          />

          {/* Line Path */}
          <motion.path
            d="M 10,65 C 40,70 60,35 80,45 C 100,55 120,75 140,60 C 160,45 180,30 200,70 C 220,95 240,40 260,35 C 280,30 285,55 290,50"
            fill="none"
            stroke="#fb8500"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={
              reducedMotion
                ? { duration: 0.01 }
                : { ease: [0.16, 1, 0.3, 1], duration: 1.2 }
            }
          />

          {/* Pulsing end dot */}
          <g>
            <motion.circle
              cx="290"
              cy="50"
              r="5"
              fill="#fb8500"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={
                reducedMotion
                  ? { scale: 1.1, opacity: 0.5 }
                  : { scale: [1, 2.3], opacity: [0.8, 0] }
              }
              transition={
                reducedMotion
                  ? { duration: 0.1 }
                  : {
                      repeat: Infinity,
                      duration: 2,
                      ease: "easeOut",
                    }
              }
            />
            <circle cx="290" cy="50" r="3" fill="#fb8500" />
          </g>
        </svg>
      </div>
    </div>
  );
}

export function GrowthPreviewCard({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">MONTHLY RECURRING REVENUE</p>
          <p className="text-xl sm:text-2xl font-bold text-[#fb8500]">$180K</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">CONVERSION</p>
          <p className="text-xs sm:text-sm font-semibold text-[#fb8500]">4.7%</p>
          <p className="text-[9px] text-gray-600">CAC: $124</p>
        </div>
      </div>

      <div className="relative w-full h-20 sm:h-24 bg-[#1A1512]/5 rounded-xl p-2 border border-[rgba(26,21,18,0.04)] overflow-hidden">
        <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="growth-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb8500" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#fb8500" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="10" y1="25" x2="290" y2="25" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />
          <line x1="10" y1="50" x2="290" y2="50" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />
          <line x1="10" y1="75" x2="290" y2="75" stroke="rgba(26,21,18,0.06)" strokeDasharray="3,3" />

          {/* Filled Area */}
          <motion.path
            d="M 10,90 C 70,75 100,60 150,40 C 200,20 240,15 290,8 L 290, 95 L 10, 95 Z"
            fill="url(#growth-grad)"
            stroke="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              reducedMotion
                ? { duration: 0.01 }
                : { ease: [0.16, 1, 0.3, 1], duration: 1.0, delay: 0.3 }
            }
          />

          {/* Line Path */}
          <motion.path
            d="M 10,90 C 70,75 100,60 150,40 C 200,20 240,15 290,8"
            fill="none"
            stroke="#fb8500"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={
              reducedMotion
                ? { duration: 0.01 }
                : { ease: [0.16, 1, 0.3, 1], duration: 1.2 }
            }
          />

          {/* Pulsing end dot */}
          <g>
            <motion.circle
              cx="290"
              cy="8"
              r="5"
              fill="#fb8500"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={
                reducedMotion
                  ? { scale: 1.1, opacity: 0.5 }
                  : { scale: [1, 2.3], opacity: [0.8, 0] }
              }
              transition={
                reducedMotion
                  ? { duration: 0.1 }
                  : {
                      repeat: Infinity,
                      duration: 2,
                      ease: "easeOut",
                    }
              }
            />
            <circle cx="290" cy="8" r="3" fill="#fb8500" />
          </g>
        </svg>
      </div>
    </div>
  );
}

const navItems = [
  { id: "about", label: "about" },
  { id: "demo", label: "how it works" },
  { id: "features", label: "engagement gap" },
  { id: "integrations", label: "integrations" },
];

export default function App() {
  const [inputVal, setInputVal] = useState("");
  const [activeCards, setActiveCards] = useState<typeof TRIGGER_MAP[string] | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [connectedApps, setConnectedApps] = useState<Record<string, boolean>>({});
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("about");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechWarning, setSpeechWarning] = useState<string | null>(null);
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isScrollingToRef = useRef<string | null>(null);
  const [displayedBannerText, setDisplayedBannerText] = useState("");
  const [mockupActiveKey, setMockupActiveKey] = useState<"revenue" | "team" | "product">("revenue");
  const [hideNavbar, setHideNavbar] = useState(false);
  const footerRef = useRef<HTMLElement>(null);

  const desktopDotsConfig = useMemo(() => {
    return Array.from({ length: 20 * 7 }).map(() => {
      const driftX = [0, Math.random() * 8 - 4, Math.random() * 8 - 4, 0];
      const driftY = [0, Math.random() * 8 - 4, Math.random() * 8 - 4, 0];
      const driftDuration = 8 + Math.random() * 12;
      const collapseDelay = Math.random() * 10;
      const collapseDuration = 2 + Math.random() * 2;
      const repeatDelay = 3 + Math.random() * 5;
      return { driftX, driftY, driftDuration, collapseDelay, collapseDuration, repeatDelay };
    });
  }, []);

  const mobileDotsConfig = useMemo(() => {
    return Array.from({ length: 12 * 5 }).map(() => {
      const driftX = [0, Math.random() * 6 - 3, Math.random() * 6 - 3, 0];
      const driftY = [0, Math.random() * 6 - 3, Math.random() * 6 - 3, 0];
      const driftDuration = 6 + Math.random() * 10;
      const collapseDelay = Math.random() * 8;
      const collapseDuration = 2 + Math.random() * 2;
      const repeatDelay = 2 + Math.random() * 4;
      return { driftX, driftY, driftDuration, collapseDelay, collapseDuration, repeatDelay };
    });
  }, []);

  useEffect(() => {
    const keys: ("revenue" | "team" | "product")[] = ["revenue", "team", "product"];
    const interval = setInterval(() => {
      setMockupActiveKey((prev) => {
        const nextIndex = (keys.indexOf(prev) + 1) % keys.length;
        return keys[nextIndex];
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHideNavbar(entry.isIntersecting);
      },
      {
        threshold: 0.05, // trigger when 5% of the footer is visible
      }
    );

    observer.observe(footer);
    return () => {
      if (footer) observer.unobserve(footer);
    };
  }, []);


  // Banner Typewriter Effect Loop (4-second cycle per tagline)
  useEffect(() => {
    const taglines = [
      "Visualize what you speak.",
      "Speak your metrics into view.",
      "Present with pure presence."
    ];
    let currentIdx = 0;
    let typeTimer: ReturnType<typeof setInterval>;
    let loopTimer: ReturnType<typeof setInterval>;

    const runTypewriter = () => {
      const fullText = taglines[currentIdx];
      setDisplayedBannerText("");
      let i = 0;
      clearInterval(typeTimer);
      typeTimer = setInterval(() => {
        if (i < fullText.length) {
          setDisplayedBannerText(fullText.slice(0, i + 1));
          i++;
        } else {
          clearInterval(typeTimer);
        }
      }, 40); // ~1.0s typing duration
      currentIdx = (currentIdx + 1) % taglines.length;
    };

    if (reducedMotion) {
      setDisplayedBannerText(taglines[0]);
    } else {
      runTypewriter();
      loopTimer = setInterval(runTypewriter, 4000);
    }

    return () => {
      clearInterval(typeTimer);
      clearInterval(loopTimer);
    };
  }, [reducedMotion]);

  // Automatically clear speech error after 4 seconds
  useEffect(() => {
    if (speechError) {
      const timer = setTimeout(() => {
        setSpeechError(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [speechError]);

  // Scroll-Spy observer
  useEffect(() => {
    const sections = ["about", "demo", "features", "integrations"];
    const observers = sections.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isScrollingToRef.current) {
            setActiveSection(id);
          }
        },
        {
          rootMargin: "-20% 0px -60% 0px",
          threshold: 0.15,
        }
      );
      observer.observe(el);
      return { observer, el };
    });

    return () => {
      observers.forEach((obs) => {
        if (obs) {
          obs.observer.unobserve(obs.el);
        }
      });
    };
  }, []);

  // Update active cards and active key on input change
  useEffect(() => {
    const cards = findCards(inputVal);
    setActiveCards(cards);

    const lower = inputVal.toLowerCase();
    let foundKey: string | null = null;
    for (const key of Object.keys(TRIGGER_MAP)) {
      if (lower.includes(key)) {
        foundKey = key;
        break;
      }
    }
    setActiveKey(foundKey);

    if (foundKey) {
      setSpeechWarning(null);
    }
  }, [inputVal]);

  const toggleListening = () => {
    if (isListening || isSpeechActive) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error(e);
        }
      }
      setIsListening(false);
      setIsSpeechActive(false);
      return;
    }

    setSpeechWarning(null);
    setSpeechError(null);
    setInputVal("");

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError("Speech recognition not supported in this browser. Running demo typing simulator...");
      setIsListening(true);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsSpeechActive(true);
        setIsListening(true);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error event:", event);
        setSpeechError(`Speech error: ${event.error || "failed"}. Running demo typing simulator...`);
        setIsSpeechActive(false);
        setIsListening(true);
      };

      recognition.onend = () => {
        setIsSpeechActive(false);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.trim().toLowerCase();
        console.log("Speech Result:", transcript);
        const keywords = ["revenue", "team", "product", "growth"];
        let matched = "";
        for (const kw of keywords) {
          if (transcript.includes(kw)) {
            matched = kw;
            break;
          }
        }

        if (matched) {
          setInputVal(matched);
          setSpeechWarning(null);
        } else {
          setSpeechWarning(`Matched '${event.results[0][0].transcript}'. Try saying: 'revenue', 'team', or 'product'!`);
        }
        setIsListening(false);
      };

      recognition.start();
    } catch (e: any) {
      console.error(e);
      setSpeechError("Initialization error. Running demo typing simulator...");
      setIsListening(true);
    }
  };

  // Voice engine simulator when listening state is active and Speech API is not active
  useEffect(() => {
    if (!isListening || isSpeechActive) return;

    // Reset input
    setInputVal("");

    const keywords = ["revenue", "team", "product", "growth"];
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];

    let currentLength = 0;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    let keepTimer: ReturnType<typeof setTimeout> | null = null;

    const typeLetter = () => {
      currentLength++;
      setInputVal(keyword.slice(0, currentLength));
      if (currentLength < keyword.length) {
        typingTimer = setTimeout(typeLetter, 150);
      } else {
        // Fully typed. Keep visible for 6 seconds, then reset.
        keepTimer = setTimeout(() => {
          setInputVal("");
          setIsListening(false);
        }, 6000);
      }
    };

    // Start typing after a short delay
    typingTimer = setTimeout(typeLetter, 300);

    return () => {
      if (typingTimer) clearTimeout(typingTimer);
      if (keepTimer) clearTimeout(keepTimer);
    };
  }, [isListening, isSpeechActive]);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: "#FBF9F6",
        fontFamily: "'Inter', sans-serif",
        color: "#1A1512",
      }}
    >
      {/* ─── HEADER ─── */}
      <motion.header 
        className="fixed top-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-5xl rounded-full z-50 px-4 py-2.5 md:px-8 md:py-3.5"
        animate={{
          y: hideNavbar ? -120 : 0,
          opacity: hideNavbar ? 0 : 1,
        }}
        transition={reducedMotion ? { duration: 0.01 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{
          pointerEvents: hideNavbar ? "none" : "auto",
        }}
      >
        {/* Glass background with hardware accelerated clipping */}
        <div 
          className="absolute inset-0 rounded-full -z-10 overflow-hidden border border-[rgba(26,21,18,0.06)]"
          style={{
            background: "rgba(255, 255, 255, 0.45)",
            backdropFilter: "blur(20px) saturate(120%)",
            WebkitBackdropFilter: "blur(20px) saturate(120%)",
            boxShadow: "0 8px 32px 0 rgba(26, 21, 18, 0.03)",
            transform: "translateZ(0)",
            WebkitTransform: "translateZ(0)",
          }}
        />
        <div className="flex items-center justify-between w-full relative">
          {/* Left Column (Desktop: Nav links, Mobile: Hamburger button) */}
          <div className="flex items-center gap-3">
            {/* Hamburger Button (visible only on mobile) */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-1.5 rounded-full hover:bg-[rgba(26,21,18,0.06)] transition-colors focus:outline-none flex items-center justify-center z-50"
              aria-label="Toggle menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                className="w-5 h-5 text-[#1A1512]"
                strokeWidth="2.2"
              >
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-8 relative">
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                const showPill = hoveredNav === item.id || (hoveredNav === null && isActive);
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onMouseEnter={() => setHoveredNav(item.id)}
                    onMouseLeave={() => setHoveredNav(null)}
                    onClick={(e) => {
                      e.preventDefault();
                      isScrollingToRef.current = item.id;
                      setActiveSection(item.id);
                      const el = document.getElementById(item.id);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth" });
                      }
                      setTimeout(() => {
                        if (isScrollingToRef.current === item.id) {
                          isScrollingToRef.current = null;
                        }
                      }, 800);
                    }}
                    className="relative px-3.5 py-1.5 text-sm rounded-full transition-colors duration-200 hover:text-[#1A1512] whitespace-nowrap"
                    style={{
                      color: (isActive || hoveredNav === item.id) ? "#1A1512" : "#5A5550",
                      fontWeight: isActive ? 600 : 400,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {showPill && (
                      <motion.div
                        layoutId="hover-pill"
                        className="absolute inset-0 bg-[rgba(26,21,18,0.06)] rounded-full -z-10"
                        transition={
                          reducedMotion
                            ? { duration: 0.01 }
                            : { ease: [0.16, 1, 0.3, 1], duration: 0.5 }
                        }
                      />
                    )}
                    <span className="relative z-10 capitalize">{item.label}</span>
                  </a>
                );
              })}
            </nav>
          </div>

          {/* Right Column: Stash Branding (visible on both mobile and desktop) */}
          <div className="flex items-center pr-2 select-none">
            <span
              className="text-lg font-medium tracking-tight"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "1.35rem",
                color: "#1A1512",
              }}
            >
              Stash Live
            </span>
          </div>
        </div>

        {/* Mobile Dropdown Dialog */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute top-[calc(100%+0.5rem)] left-0 right-0 rounded-2xl border border-[rgba(26,21,18,0.06)] shadow-[0_8px_32px_0_rgba(26, 21, 18, 0.03)] p-4 flex flex-col gap-2 md:hidden"
              style={{
                background: "rgba(255, 255, 255, 0.45)",
                backdropFilter: "blur(20px) saturate(120%)",
                WebkitBackdropFilter: "blur(20px) saturate(120%)",
              }}
            >
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setIsMenuOpen(false);
                    const el = document.getElementById(item.id);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left capitalize ${
                    activeSection === item.id
                      ? "bg-[rgba(26,21,18,0.06)] text-[#1A1512] font-semibold"
                      : "text-[#5A5550] hover:text-[#1A1512] hover:bg-[rgba(26,21,18,0.03)]"
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* ─── HERO ─── */}
      <section id="about" className="relative w-full min-h-screen lg:h-screen overflow-x-hidden lg:overflow-hidden">
        {/* Background */}
        <motion.div
          className="absolute inset-0 w-full h-full overflow-hidden"
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reducedMotion ? { duration: 0.01 } : { duration: 0.5, ease: "easeOut" }}
        >
          <ImageWithFallback
            src={heroBg}
            alt="Person standing at the threshold of a glowing orange portal"
            className="w-full h-full object-cover object-center"
          />
        </motion.div>

        {/* Vignette Overlays - Feathery Light (5% intensity) */}
        <div className="absolute top-0 bottom-0 left-0 w-32 bg-gradient-to-r from-[#FBF9F6]/[0.05] to-transparent pointer-events-none z-10" />
        <div className="absolute top-0 bottom-0 right-0 w-32 bg-gradient-to-l from-[#FBF9F6]/[0.05] to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#FBF9F6]/[0.05] to-transparent pointer-events-none z-10" />


        {/* Content layer */}
        <div className="relative z-10 min-h-screen lg:h-full flex flex-col lg:flex-row items-center justify-between px-6 md:px-16 lg:px-24 pt-28 pb-16 lg:py-0">
          {/* Left wing */}
          <motion.div
            className="w-full lg:w-[36%] pr-0 lg:pr-8 text-center lg:text-left mb-8 lg:mb-0"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            custom={reducedMotion}
          >
            <motion.h1
              custom={reducedMotion}
              variants={headingVariants}
              className="mb-6"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "clamp(2.2rem, 6vw, 4.5rem)",
                fontWeight: 400,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
                color: "#FBF9F6",
              }}
            >
              Project live data overlays the moment you speak.
            </motion.h1>
            <motion.p
              custom={reducedMotion}
              variants={itemVariants}
              className="text-sm mobile-shift-desc lg:mt-0"
              style={{
                color: "rgba(251, 249, 246, 0.85)",
                lineHeight: 1.7,
              }}
            >
              Stash Live integrates with Airtable, Notion, and Google Drive to automatically project context-aware metrics and charts directly onto your meeting feed in real time.
            </motion.p>
          </motion.div>

          {/* Spacer — the center figure lives here */}
          <div className="hidden lg:block flex-1" />

          {/* Right wing */}
          <motion.div
            className="w-[90%] lg:w-[38%] pl-0 lg:pl-10 lg:translate-x-4 flex flex-col gap-4 self-center mx-auto lg:mx-0 mt-12 lg:mt-0"
            initial="hidden"
            animate="visible"
            variants={rightWingVariants}
            custom={reducedMotion}
          >
            {/* Presenter Webcam HUD Card */}
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-[0_24px_50px_rgba(0,0,0,0.3)] border border-white/10 bg-[#1A1512]">
              {/* Camera view grid / lines */}
              <div className="absolute inset-0 bg-gradient-to-tr from-stone-900/30 to-transparent pointer-events-none" />
              
              {/* Corner focus brackets */}
              <div className="absolute top-4 left-4 w-3.5 h-3.5 border-t border-l border-white/20 pointer-events-none" />
              <div className="absolute top-4 right-4 w-3.5 h-3.5 border-t border-r border-white/20 pointer-events-none" />
              <div className="absolute bottom-4 left-4 w-3.5 h-3.5 border-b border-l border-white/20 pointer-events-none" />
              <div className="absolute bottom-4 right-4 w-3.5 h-3.5 border-b border-r border-white/20 pointer-events-none" />
              
              {/* LIVE Badge */}
              <div className="absolute top-6 left-6 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-[8px] font-bold text-white tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fb8500] animate-pulse" />
                <span>LIVE HUD</span>
              </div>

              {/* Presenter silhouette SVG placeholder (reduced size and shifted left to prevent collisions on mobile, original size on desktop) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.18] -translate-x-[15%] sm:-translate-x-[10%]">
                <svg viewBox="0 0 100 100" className="w-16 h-16 sm:w-20 h-20 md:w-24 h-24 text-[#fb8500]">
                  <circle cx="50" cy="35" r="18" fill="currentColor" />
                  <path d="M50,58 C32,58 18,72 18,90 L82,90 C82,72 68,58 50,58 Z" fill="currentColor" />
                </svg>
              </div>

              {/* Rotating overlay cards floating near shoulder */}
              <div className="absolute right-2 sm:right-4 top-6 bottom-16 flex items-start justify-end pointer-events-none">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mockupActiveKey}
                    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -20, scale: 0.95 }}
                    transition={
                      reducedMotion
                        ? { duration: 0.01 }
                        : { ease: [0.16, 1, 0.3, 1], duration: 0.5 }
                    }
                    className="w-[125px] xs:w-[145px] sm:w-[170px] md:w-[185px] rounded-lg p-1.5 xs:p-2 sm:p-2.5 border border-white/20 shadow-2xl bg-white/10 backdrop-blur-md pointer-events-auto"
                  >
                    {mockupActiveKey === "revenue" && (
                      <div className="flex flex-col gap-0.5 xs:gap-1 text-white">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[6px] xs:text-[7.5px] text-white/50 uppercase tracking-widest font-mono">REVENUE TELEMETRY</p>
                            <p className="text-xs xs:text-sm sm:text-base font-bold text-white leading-tight">$2.4M Q3</p>
                          </div>
                          <span className="text-[6px] xs:text-[7.5px] px-1 py-0.5 rounded bg-[#fb8500]/20 text-[#fb8500] font-bold font-mono whitespace-nowrap">
                            +34% YoY
                          </span>
                        </div>
                        <div className="h-6 xs:h-8 w-full mt-0.5 overflow-hidden relative">
                          <svg viewBox="0 0 150 32" className="w-full h-full overflow-visible">
                            <defs>
                              <linearGradient id="hud-orange-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#fb8500" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#fb8500" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <path
                              d="M 5,28 C 35,25 50,12 80,18 C 110,24 125,5 145,3"
                              fill="none"
                              stroke="#fb8500"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                            <path
                              d="M 5,28 C 35,25 50,12 80,18 C 110,24 125,5 145,3 L 145,32 L 5,32 Z"
                              fill="url(#hud-orange-grad)"
                              stroke="none"
                            />
                            <circle cx="145" cy="3" r="2" fill="#fb8500" />
                          </svg>
                        </div>
                        <p className="text-[5.5px] xs:text-[7px] text-white/60 font-mono">cloud workspace synchronized</p>
                      </div>
                    )}

                    {mockupActiveKey === "team" && (
                      <div className="flex flex-col gap-0.5 xs:gap-1 text-white">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[6px] xs:text-[7.5px] text-white/50 uppercase tracking-widest font-mono">TEAM ENGAGEMENT</p>
                            <p className="text-xs xs:text-sm sm:text-base font-bold text-white leading-tight">142 Active</p>
                          </div>
                          <span className="text-[6px] xs:text-[7.5px] px-1 py-0.5 rounded bg-[#fb8500]/20 text-[#fb8500] font-bold font-mono whitespace-nowrap">
                            78 NPS
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 xs:gap-1 my-0.5 flex-wrap">
                          {["JD", "AM", "SR", "WT"].map((init, i) => (
                            <div key={i} className="w-3.5 h-3.5 xs:w-4 xs:h-4 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[5.5px] xs:text-[7px] font-bold text-white font-mono">
                              {init}
                            </div>
                          ))}
                          <span className="text-[5.5px] xs:text-[7px] text-[#fb8500] font-bold font-mono ml-0.5 animate-pulse">●</span>
                          <span className="text-[5.5px] xs:text-[7px] text-white/70 font-mono">Sync...</span>
                        </div>
                        <div className="border-t border-white/5 pt-1 text-[5.5px] xs:text-[7px] text-white/60 font-mono space-y-0.5">
                          <div>✔ Notion API: connected</div>
                          <div>✔ Slack: 4 channels logged</div>
                        </div>
                      </div>
                    )}

                    {mockupActiveKey === "product" && (
                      <div className="flex flex-col gap-0.5 xs:gap-1 text-white">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[6px] xs:text-[7.5px] text-white/50 uppercase tracking-widest font-mono">PRODUCT METRICS</p>
                            <p className="text-xs xs:text-sm sm:text-base font-bold text-white leading-tight">48.2K DAU</p>
                          </div>
                          <span className="text-[6px] xs:text-[7.5px] px-1 py-0.5 rounded bg-[#fb8500]/20 text-[#fb8500] font-bold font-mono whitespace-nowrap">
                            18ms
                          </span>
                        </div>
                        <div className="h-6 xs:h-8 w-full mt-0.5 overflow-hidden relative">
                          <svg viewBox="0 0 150 32" className="w-full h-full overflow-visible">
                            <path
                              d="M 5,16 C 25,20 45,8 65,14 C 85,22 105,4 125,10 C 135,12 140,6 145,8"
                              fill="none"
                              stroke="#fb8500"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                            <circle cx="145" cy="8" r="2" fill="#fb8500" />
                          </svg>
                        </div>
                        <p className="text-[5.5px] xs:text-[7px] text-white/60 font-mono">uptime reliability: 99.97%</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Audio waveform / telemetry at bottom-left */}
              <div className="absolute bottom-6 left-6 flex items-center gap-0.5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-0.5 bg-[#fb8500] rounded-full"
                    animate={
                      reducedMotion
                        ? { height: 6 }
                        : {
                            height: [3, Math.random() * 12 + 4, 3],
                          }
                    }
                    transition={
                      reducedMotion
                        ? { duration: 0.1 }
                        : {
                            duration: 0.6 + Math.random() * 0.4,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.04,
                          }
                    }
                    style={{ height: 3 }}
                  />
                ))}
              </div>

              {/* Speech-caption bubble at bottom-center */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md border border-white/10 rounded-full px-2 py-0.5 xs:px-2.5 xs:py-0.5 flex items-center gap-1 text-white max-w-[90%] whitespace-nowrap">
                <span className="w-1 h-1 rounded-full bg-[#fb8500] animate-ping" />
                <span className="font-mono text-white/40 text-[6px] xs:text-[7px] tracking-wider uppercase">AUDIO</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={mockupActiveKey}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.25 }}
                    className="text-[7px] xs:text-[8px] font-mono text-white/90"
                  >
                    {mockupActiveKey === "revenue" && '"...our Q3 revenue increased..."'}
                    {mockupActiveKey === "team" && '"...the active team size..."'}
                    {mockupActiveKey === "product" && '"...product metrics DAU..."'}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── VIDEO DEMO SECTION ─── */}
      <section
        id="demo"
        className="w-full grid md:grid-cols-2 items-stretch"
        style={{ minHeight: "80vh" }}
      >
        {/* Left — video on top of a background image */}
        <div className="relative overflow-hidden min-h-[350px] md:min-h-[500px] flex items-center justify-center">
          <ImageWithFallback
            src={videoBg}
            alt="Video background texture"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Dark overlay for contrast */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(26,21,18,0.18)" }}
          />
          {/* Center the video player */}
          <div className="relative z-10 w-full max-w-md px-4 sm:px-6">
            {/* Unified glassmorphic card */}
            <motion.div
              layout
              className="rounded-2xl p-4 border border-[rgba(26,21,18,0.08)] shadow-[0_8px_32px_0_rgba(26,21,18,0.06)] bg-white/90 md:bg-white/45"
              style={{
                backdropFilter: "blur(20px) saturate(120%)",
                WebkitBackdropFilter: "blur(20px) saturate(120%)",
              }}
              transition={
                reducedMotion
                  ? { duration: 0.01 }
                  : { ease: [0.16, 1, 0.3, 1], duration: 0.6 }
              }
            >
              <div>
                <p
                  className="text-xs mb-3 uppercase tracking-widest text-[#5A5550]"
                >
                  try saying
                </p>
                <div className="relative flex items-center w-full border-b border-[rgba(26,21,18,0.1)] pb-1.5">
                  <input
                    ref={inputRef}
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder={(isListening || isSpeechActive) ? "Listening... say 'revenue'…" : "revenue, team, product, growth…"}
                    className="w-full bg-transparent text-sm outline-none placeholder-[#6B7280] md:placeholder-[#A8A4A0] pr-8 text-[#1A1512]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center">
                    {(isListening || isSpeechActive) && (
                      <>
                        <motion.div
                          className="absolute w-8 h-8 rounded-full bg-[#fb8500]/25 pointer-events-none"
                          animate={
                            reducedMotion
                              ? { scale: 1.2, opacity: 0.4 }
                              : {
                                  scale: [1, 2.2],
                                  opacity: [0.8, 0],
                                }
                          }
                          transition={
                            reducedMotion
                              ? { duration: 0.1 }
                              : {
                                  repeat: Infinity,
                                  duration: 1.6,
                                  ease: "easeOut",
                                }
                          }
                        />
                        {!reducedMotion && (
                          <motion.div
                            className="absolute w-8 h-8 rounded-full bg-[#fb8500]/25 pointer-events-none"
                            animate={{
                              scale: [1, 2.2],
                              opacity: [0.8, 0],
                            }}
                            transition={{
                              repeat: Infinity,
                              duration: 1.6,
                              ease: "easeOut",
                              delay: 0.8,
                            }}
                          />
                        )}
                      </>
                    )}
                    <button
                      onClick={toggleListening}
                      className="p-1 rounded-full hover:bg-[rgba(26,21,18,0.06)] transition-colors focus:outline-none z-10 flex items-center justify-center"
                      style={{ color: (isListening || isSpeechActive) ? "#fb8500" : "#5A5550" }}
                      title={(isListening || isSpeechActive) ? "Stop listening" : "Start listening"}
                    >
                      {(isListening || isSpeechActive) ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4.5 h-4.5 animate-pulse text-[#fb8500]"
                        >
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" x2="12" y1="19" y2="22" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4.5 h-4.5 text-[#5A5550]"
                        >
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" x2="12" y1="19" y2="22" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Live cards */}
                <motion.div
                  layout
                  className="grid grid-cols-3 gap-2 overflow-hidden"
                  initial={false}
                  animate={
                    activeCards
                      ? { height: "auto", opacity: 1, marginTop: "16px" }
                      : { height: 0, opacity: 0, marginTop: "0px" }
                  }
                  transition={
                    reducedMotion
                      ? { duration: 0.01 }
                      : {
                          height: { ease: [0.16, 1, 0.3, 1], duration: 0.6 },
                          opacity: { duration: 0.25 },
                          marginTop: { duration: 0.2 },
                        }
                  }
                >
                  <AnimatePresence>
                    {activeCards &&
                      activeCards.map((card, index) => (
                        <motion.div
                          key={card.label}
                          custom={{ index, reducedMotion }}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          variants={cardVariants}
                          className="rounded-xl p-2 sm:p-3 text-center"
                          style={{
                            background: "rgba(255,255,255,0.7)",
                            border: "1px solid rgba(26,21,18,0.07)",
                          }}
                        >
                          <p
                            className="text-sm sm:text-base md:text-lg font-semibold leading-none mb-1"
                            style={{ color: card.color }}
                          >
                            {card.value}
                          </p>
                          <p className="text-[8px] sm:text-[10px] text-[#5A5550]">
                            {card.label}
                          </p>
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </motion.div>

                <AnimatePresence>
                  {!activeCards && (
                    <motion.p
                      initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-3 text-[10px] text-[#5A5550]"
                      style={{
                        color: (isListening || isSpeechActive) ? "#fb8500" : undefined,
                      }}
                    >
                      {isSpeechActive
                        ? "Listening... say 'revenue', 'team', or 'product'..."
                        : isListening
                        ? "● voice engine listening — cycling keywords…"
                        : "● engine idle — speak a keyword to project"}
                    </motion.p>
                  )}
                </AnimatePresence>

                {speechWarning && (
                  <div
                    className="mt-3 p-3 text-xs rounded-xl border bg-[rgba(220,38,38,0.05)] border-[rgba(220,38,38,0.15)] text-[#DC2626]"
                  >
                    ⚠ {speechWarning}
                  </div>
                )}

                {speechError && (
                  <div
                    className="mt-3 p-3 text-xs rounded-xl border bg-[rgba(26,21,18,0.04)] border-[rgba(26,21,18,0.08)] text-[#5A5550]"
                  >
                    ℹ {speechError}
                  </div>
                )}
              </div>

              {/* Stream Overlay Preview Card INSIDE the same card */}
              <AnimatePresence initial={false}>
                {activeKey && (
                  <motion.div
                    key="stream-preview"
                    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    transition={
                      reducedMotion
                        ? { duration: 0.01 }
                        : { ease: [0.16, 1, 0.3, 1], duration: 0.6 }
                    }
                    className="overflow-hidden mt-4 pt-4 border-t border-[rgba(26,21,18,0.08)]"
                  >
                    {/* Header: STREAM OVERLAY PREVIEW */}
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[rgba(26,21,18,0.06)]">
                      <span className="text-[10px] tracking-widest font-bold text-[#5A5550] uppercase">
                        STREAM OVERLAY PREVIEW
                      </span>
                      <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-[#fb8500]/10 text-[#fb8500] font-semibold">
                        ● live in meeting
                      </span>
                    </div>

                    {activeKey === "revenue" && (
                      <RevenuePreviewCard reducedMotion={reducedMotion} />
                    )}
                    {activeKey === "team" && (
                      <TeamPreviewCard />
                    )}
                    {activeKey === "product" && (
                      <ProductPreviewCard reducedMotion={reducedMotion} />
                    )}
                    {activeKey === "growth" && (
                      <GrowthPreviewCard reducedMotion={reducedMotion} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Relocated description text, styled light-colored for dark background */}
            <p
              className="text-sm text-center mt-6"
              style={{
                color: "rgba(251, 249, 246, 0.85)",
                lineHeight: 1.7,
              }}
            >
              Our real-time cloud engine listens to your stream, matches spoken topics with your connected tools, and projects responsive data overlays directly into your meeting feed.
            </p>
          </div>
        </div>

        {/* Right — copy explaining data and setup */}
        <div
          className="flex flex-col justify-center px-6 py-16 sm:px-12 md:py-20 lg:px-20"
          style={{ background: "#FBF9F6" }}
        >
          <p
            className="text-xs uppercase tracking-widest mb-6"
            style={{ color: "#fb8500" }}
          >
            How it works
          </p>
          <h2
            className="mb-6 leading-tight"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(2rem, 3.5vw, 3rem)",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              color: "#1A1512",
            }}
          >
            Real-time data overlays, powered by your voice.
          </h2>
          <div className="space-y-6" style={{ color: "#5A5550", fontSize: "0.9rem", lineHeight: 1.8 }}>
            <div>
              <h3 className="text-sm font-semibold text-[#1A1512] uppercase tracking-wider mb-2">Types of Overlay Data</h3>
              <p>
                Stash Live reads your spoken cues and projects beautifully designed glassmorphic cards right onto your video stream. This includes live <span className="font-semibold text-[#1A1512]">Financial Metrics</span> (such as Q2 Revenue of $240,000 and YoY Growth of +40%), <span className="font-semibold text-[#1A1512]">Team Analytics</span> (active headcount of 142 and NPS score of 78), and <span className="font-semibold text-[#1A1512]">Product Performance</span> (DAU of 48.2K and latency of 18ms).
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold text-[#1A1512] uppercase tracking-wider mb-2">How to Setup</h3>
              <p>
                Getting started takes less than 60 seconds:
              </p>
              <ol className="list-decimal pl-5 mt-2 space-y-1">
                <li>Connect your workspaces (Notion, Airtable, or Google Drive) inside the Stash Dashboard.</li>
                <li>Configure your custom voice triggers and link them to specific metrics or charts.</li>
                <li>Select Stash Live Virtual Camera as your video input in Zoom, Teams, or Google Meet.</li>
              </ol>
            </div>
          </div>
          
          <div className="mt-10 flex items-center gap-6">
            <button
              className="px-6 py-3 text-sm font-medium rounded-full transition-opacity hover:opacity-80"
              style={{ background: "#1A1512", color: "#FBF9F6" }}
            >
              Start Setup
            </button>
            <a
              href="#"
              className="text-sm transition-opacity hover:opacity-60 flex items-center gap-2"
              style={{ color: "#5A5550" }}
            >
              View Documentation
              <span>→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ─── VALUE SECTION ─── */}
      <section
        id="features"
        className="w-full grid md:grid-cols-2 items-stretch"
        style={{ minHeight: "80vh" }}
      >
        {/* Left — copy */}
        <div
          className="flex flex-col justify-center px-6 py-16 sm:px-12 md:py-20 lg:px-20 order-2 md:order-1"
          style={{ background: "#FBF9F6" }}
        >
          <p
            className="text-xs uppercase tracking-widest mb-6"
            style={{ color: "#fb8500" }}
          >
            The Engagement Gap
          </p>
          <h2
            className="mb-6 leading-tight"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(2rem, 3.5vw, 3rem)",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              color: "#1A1512",
            }}
          >
            What virtual meetings cost you is hiding in plain sight.
          </h2>
          <div className="space-y-5" style={{ color: "#5A5550", fontSize: "0.9rem", lineHeight: 1.8 }}>
            <p>
              Every time a presenter minimizes their face to share a screen, the audience loses the
              human signal they subconsciously rely on — micro-expressions, eye contact, natural
              emphasis. Engagement plummets in the first 90 seconds.
            </p>
            <p>
              Stash Live resolves this asymmetry. The engine listens locally on your device,
              identifies the keywords in your flow, and automatically projects clean, context-aware
              data cards directly beside your shoulder in the video frame.
            </p>
            <p>
              You maintain direct eye contact. Your audience stays present. The data appears exactly
              when it&apos;s relevant — never a beat too early or too late.
            </p>
          </div>
          <div className="mt-10 flex items-center gap-6">
            <button
              className="px-6 py-3 text-sm font-medium rounded-full transition-opacity hover:opacity-80"
              style={{ background: "#1A1512", color: "#FBF9F6" }}
            >
              Book Live Demo
            </button>
            <a
              href="#"
              className="text-sm transition-opacity hover:opacity-60 flex items-center gap-2"
              style={{ color: "#5A5550" }}
            >
              How it works
              <span>→</span>
            </a>
          </div>
        </div>

        {/* Right — grayscale texture + glassmorphic chart */}
        <div className="relative overflow-hidden min-h-[350px] md:min-h-[500px] order-1 md:order-2">
          <ImageWithFallback
            src={cardBg}
            alt="Abstract card background texture"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Dark overlay for legibility */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(26,21,18,0.18)" }}
          />

          {/* Glass chart card */}
          <div
            className="absolute inset-0 flex items-center justify-center p-4 sm:p-8"
          >
            <div
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                background: "rgba(255,255,255,0.45)",
                backdropFilter: "blur(20px) saturate(120%)",
                border: "1px solid rgba(26,21,18,0.06)",
                boxShadow: "0 8px 32px 0 rgba(26,21,18,0.08)",
              }}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p
                    className="text-xs uppercase tracking-widest text-[#5A5550]"
                  >
                    Engagement Index
                  </p>
                  <p
                    className="text-2xl font-semibold mt-0.5 text-[#fb8500]"
                  >
                    91 <span className="text-sm font-normal text-[#5A5550]">/ 100</span>
                  </p>
                </div>
                <span
                  className="text-xs px-3 py-1.5 rounded-full text-[#fb8500]"
                  style={{ background: "rgba(251,133,0,0.12)" }}
                >
                  ● live
                </span>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-2" style={{ height: "80px" }}>
                {CHART_DATA.map((d) => (
                  <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${(d.value / MAX_VAL) * 68}px`,
                        background:
                          d.month === "Jun"
                            ? "#1A1512"
                            : "rgba(26,21,18,0.15)",
                        transition: "height 0.4s ease",
                      }}
                    />
                    <span
                      className="text-[9px] text-[#5A5550]"
                    >
                      {d.month}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="mt-4 pt-4 flex justify-between text-[10px] text-[#5A5550]"
                style={{ borderTop: "1px solid rgba(26,21,18,0.08)" }}
              >
                <span>real-time · cloud connected</span>
                <span className="text-[#fb8500]">↑ +18 pts this quarter</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── BANNER STRIP ─── */}
      <section className="py-12 bg-[#FBF9F6] flex justify-center items-center">
        <div className="relative w-full max-w-5xl mx-auto px-4 md:px-8">
          <div className="relative w-full aspect-[16/8] sm:aspect-[21/8] md:aspect-[21/6] rounded-[20px] sm:rounded-[32px] overflow-hidden border border-[rgba(26,21,18,0.06)] shadow-sm bg-[#FFFBF7]">
            <ImageWithFallback
              src={orangeTexture}
              alt="Abstract orange cloud texture"
              className="w-full h-full object-cover"
            />
            
            {/* Desktop Polka dots grid */}
            <div 
              className="hidden md:grid absolute inset-4 md:inset-8 justify-items-center items-center pointer-events-none"
              style={{
                gridTemplateColumns: "repeat(20, minmax(0, 1fr))",
                gridTemplateRows: "repeat(7, minmax(0, 1fr))",
                gap: "clamp(4px, 1.5vw, 16px)",
              }}
            >
              {Array.from({ length: 20 * 7 }).map((_, i) => {
                const r = Math.floor(i / 20);
                const c = i % 20;
                const isCenterArea = r >= 2 && r <= 4 && c >= 4 && c <= 15;
                // Put back dots on both sides of the text (including the middle row)
                const isPutBackDot = 
                  ((r >= 2 && r <= 4) && (c === 4 || c === 5)) ||
                  ((r >= 2 && r <= 4) && (c === 14 || c === 15));
                const hasDot = !isCenterArea || isPutBackDot;
                return !hasDot ? (
                  <div key={i} className="w-1.5 h-1.5 md:w-2 h-2" />
                ) : (
                  <motion.div 
                    key={i} 
                    className="w-1.5 h-1.5 md:w-2 h-2 rounded-full bg-white/95 shadow-[0_1px_2px_rgba(0,0,0,0.15)]" 
                    animate={reducedMotion ? {} : {
                      x: desktopDotsConfig[i].driftX,
                      y: desktopDotsConfig[i].driftY,
                      scale: [1, 1, 0, 1, 1],
                      opacity: [1, 1, 0, 1, 1],
                    }}
                    transition={reducedMotion ? {} : {
                      x: { duration: desktopDotsConfig[i].driftDuration, repeat: Infinity, ease: "easeInOut" },
                      y: { duration: desktopDotsConfig[i].driftDuration, repeat: Infinity, ease: "easeInOut" },
                      scale: {
                        duration: desktopDotsConfig[i].collapseDuration,
                        repeat: Infinity,
                        repeatDelay: desktopDotsConfig[i].repeatDelay,
                        delay: desktopDotsConfig[i].collapseDelay,
                        ease: "easeInOut"
                      },
                      opacity: {
                        duration: desktopDotsConfig[i].collapseDuration,
                        repeat: Infinity,
                        repeatDelay: desktopDotsConfig[i].repeatDelay,
                        delay: desktopDotsConfig[i].collapseDelay,
                        ease: "easeInOut"
                      }
                    }}
                  />
                );
              })}
            </div>

            {/* Mobile Polka dots grid - Less congested, spaced out */}
            <div 
              className="grid md:hidden absolute inset-3 justify-items-center items-center pointer-events-none"
              style={{
                gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                gridTemplateRows: "repeat(5, minmax(0, 1fr))",
                gap: "6px",
              }}
            >
              {Array.from({ length: 12 * 5 }).map((_, i) => {
                const r = Math.floor(i / 12);
                const c = i % 12;
                const isCenterArea = r >= 1 && r <= 3 && c >= 2 && c <= 9;
                // Put back dots on both sides of the text (including the middle row)
                const isPutBackDot = 
                  ((r >= 1 && r <= 3) && (c === 2)) ||
                  ((r >= 1 && r <= 3) && (c === 9));
                const hasDot = !isCenterArea || isPutBackDot;
                return !hasDot ? (
                  <div key={i} className="w-1.5 h-1.5" />
                ) : (
                  <motion.div 
                    key={i} 
                    className="w-1.5 h-1.5 rounded-full bg-white/95 shadow-[0_1px_2px_rgba(0,0,0,0.15)]" 
                    animate={reducedMotion ? {} : {
                      x: mobileDotsConfig[i].driftX,
                      y: mobileDotsConfig[i].driftY,
                      scale: [1, 1, 0, 1, 1],
                      opacity: [1, 1, 0, 1, 1],
                    }}
                    transition={reducedMotion ? {} : {
                      x: { duration: mobileDotsConfig[i].driftDuration, repeat: Infinity, ease: "easeInOut" },
                      y: { duration: mobileDotsConfig[i].driftDuration, repeat: Infinity, ease: "easeInOut" },
                      scale: {
                        duration: mobileDotsConfig[i].collapseDuration,
                        repeat: Infinity,
                        repeatDelay: mobileDotsConfig[i].repeatDelay,
                        delay: mobileDotsConfig[i].collapseDelay,
                        ease: "easeInOut"
                      },
                      opacity: {
                        duration: mobileDotsConfig[i].collapseDuration,
                        repeat: Infinity,
                        repeatDelay: mobileDotsConfig[i].repeatDelay,
                        delay: mobileDotsConfig[i].collapseDelay,
                        ease: "easeInOut"
                      }
                    }}
                  />
                );
              })}
            </div>

            {/* Center text overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <h3 
                className="text-base xs:text-lg sm:text-xl md:text-3xl font-light text-white tracking-wide text-center"
                style={{ 
                  fontFamily: "'Cormorant Garamond', serif",
                  textShadow: "0 2px 12px rgba(0,0,0,0.2)"
                }}
              >
                {displayedBannerText}
                <span className="animate-[pulse_1s_infinite] font-light">|</span>
              </h3>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INTEGRATIONS SECTION ─── */}
      <section
        id="integrations"
        className="pt-20 pb-10 px-6 md:px-16 lg:px-24"
        style={{ background: "#FBF9F6", borderBottom: "1px solid rgba(26,21,18,0.06)" }}
      >
        <div className="max-w-5xl mx-auto text-center mb-16">
          <p
            className="text-xs uppercase tracking-widest mb-6 font-semibold"
            style={{ color: "#fb8500" }}
          >
            Integrations
          </p>
          <h2
            className="mb-6 leading-tight"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(2rem, 3.5vw, 3rem)",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              color: "#1A1512",
            }}
          >
            Connect your entire workflow in seconds.
          </h2>
          <p
            className="max-w-xl mx-auto text-sm"
            style={{ color: "#5A5550", lineHeight: 1.7 }}
          >
            Stash Live connects directly to your favorite tools to project real-time metrics, documents, and logs without leaving your video feed.
          </p>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10 max-w-5xl mx-auto">
          {[
            {
              id: "notion",
              name: "Notion",
              description: "Sync database records and active workspace tables.",
              buttonStyle: "gray",
              extraInfo: "*requires workspace access",
              icon: (
                <svg className="w-6 h-6 text-[#1A1512]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.6 2h14.8c1.4 0 2.6 1.2 2.6 2.6v14.8c0 1.4-1.2 2.6-2.6 2.6H4.6C3.2 22 2 20.8 2 19.4V4.6C2 3.2 3.2 2 4.6 2zm1.6 3.6v12.8h2.3V7.2l5.6 9.2h2.3V5.6h-2.3v9.2L8.5 5.6H6.2z"/>
                </svg>
              ),
            },
            {
              id: "airtable",
              name: "Airtable",
              description: "Pull live inventory databases and customer records.",
              buttonStyle: "black",
              extraInfo: "",
              icon: (
                <svg className="w-6 h-6 text-[#1A1512]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.5 2.23l9 4.88a1 1 0 0 1 .5.87v8.08a1 1 0 0 1-.5.87l-9 4.88a1 1 0 0 1-1 0l-9-4.88a1 1 0 0 1-.5-.87V7.98a1 1 0 0 1 .5-.87l9-4.88a1 1 0 0 1 1 0zM12 4.14L4.85 8 12 11.86 19.15 8 12 4.14zM3.5 10.05v5.82L10.5 19.7v-5.83l-7-3.82zm17 0l-7 3.82v5.83l7-3.83v-5.82z"/>
                </svg>
              ),
            },
            {
              id: "google-drive",
              name: "Google Drive",
              description: "Embed presentation slides and active spreadsheet charts.",
              buttonStyle: "gray",
              extraInfo: "",
              icon: (
                <svg className="w-6 h-6 text-[#1A1512]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.2 2H8.8L2 13.8L5.2 19.3L12 7.5L18.8 19.3H22L15.2 2ZM9.4 14.8L6 20.8H18L21.4 14.8H9.4ZM3 13.8L8.2 20.8L11.6 14.8L6.4 7.8L3 13.8Z" />
                </svg>
              ),
            },
            {
              id: "hubspot",
              name: "HubSpot",
              description: "Project pipeline metrics, deal statuses, and sales logs.",
              buttonStyle: "black",
              extraInfo: "*requires enterprise edition",
              icon: (
                <svg className="w-6 h-6 text-[#1A1512]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.88 12.35a3.86 3.86 0 0 0-3.13-2.14V7.58a3.11 3.11 0 1 0-1.5 0v2.63a3.86 3.86 0 0 0-2.31 1.7L7.33 9.47A3.11 3.11 0 1 0 6 10.74l4.63 2.45a3.86 3.86 0 1 0 6.64.91l4.08.77a1.55 1.55 0 1 0 .28-1.47zm-11.88-2.6a1.56 1.56 0 1 1 0-3.11 1.56 1.56 0 0 1 0 3.11zm7.75-5a1.56 1.56 0 1 1 0 3.11 1.56 1.56 0 0 1 0-3.11zm-2.75 9.75a2.31 2.31 0 1 1 2.31-2.31 2.31 2.31 0 0 1-2.31 2.31z"/>
                </svg>
              ),
            },
            {
              id: "salesforce",
              name: "Salesforce",
              description: "Display live sales dashboards and customer growth stats.",
              buttonStyle: "gray",
              extraInfo: "",
              icon: (
                <svg className="w-6 h-6 text-[#1A1512]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 9.87A6.49 6.49 0 0 0 7.4 8.7a4.67 4.67 0 0 0-3.69 4.56 4.78 4.78 0 0 0 .19 1.34 4.19 4.19 0 0 0-1.6 3.32 4.29 4.29 0 0 0 4.29 4.29h12a3.81 3.81 0 0 0 .5-7.59 4 4 0 0 0 .35-4.75z"/>
                </svg>
              ),
            },
            {
              id: "slack",
              name: "Slack",
              description: "Stream workspace channel alerts and live notifications.",
              buttonStyle: "black",
              extraInfo: "*requires workspace admin access",
              icon: (
                <svg className="w-6 h-6 text-[#1A1512]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.04 15.12a2.52 2.52 0 1 1-2.52-2.52h2.52zm1.26 0a2.52 2.52 0 0 1 5.04 0v5.04a2.52 2.52 0 1 1-5.04 0zM8.88 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52zm0 1.26a2.52 2.52 0 0 1 0 5.04H3.84a2.52 2.52 0 1 1 0-5.04zM18.96 8.88a2.52 2.52 0 1 1 2.52 2.52h-2.52zm-1.26 0a2.52 2.52 0 0 1-5.04 0V3.84a2.52 2.52 0 1 1 5.04 0zM15.12 18.96a2.52 2.52 0 1 1-2.52 2.52v-2.52zm0-1.26a2.52 2.52 0 0 1 0-5.04h5.04a2.52 2.52 0 1 1 0 5.04z"/>
                </svg>
              ),
            },
          ].map((app) => {
            const isConnected = !!connectedApps[app.id];
            return (
              <div
                key={app.id}
                className="flex items-start gap-4 pb-8 border-b border-[rgba(26,21,18,0.06)]"
              >
                {/* Icon wrapper */}
                <div
                  className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-[rgba(26,21,18,0.06)] shadow-[0_4px_12px_rgba(26,21,18,0.02)] flex-shrink-0"
                >
                  {app.icon}
                </div>

                {/* Content info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-[#1A1512] leading-tight">
                    {app.name}
                  </h3>
                  <p className="text-xs text-[#5A5550] mt-1 mb-3.5 leading-relaxed">
                    {app.description}
                  </p>
                  
                  {/* Button + Extra Info */}
                  <div className="flex items-center flex-wrap gap-2.5">
                    <button
                      onClick={() =>
                        setConnectedApps((prev) => ({
                          ...prev,
                          [app.id]: !prev[app.id],
                        }))
                      }
                      className={`text-[9px] uppercase font-bold tracking-wider px-4 py-2 rounded-full transition-all duration-200 select-none ${
                        isConnected
                          ? "bg-[#fb8500] text-white border border-transparent shadow-[0_2px_8px_rgba(251,133,0,0.2)]"
                          : app.buttonStyle === "black"
                          ? "bg-[#1A1512] text-[#FBF9F6] border border-transparent hover:opacity-90"
                          : "bg-[#F3F3F5] text-[#1A1512] border border-[rgba(26,21,18,0.1)] hover:bg-[#E4E4E6]"
                      }`}
                    >
                      {isConnected ? "✓ Connected" : "Connect"}
                    </button>
                    {app.extraInfo && (
                      <span className="text-[10px] text-[#A8A4A0] italic">
                        {app.extraInfo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer 
        ref={footerRef}
        className="relative px-6 md:px-14 pt-[3.5rem] md:pt-[6.5rem] pb-20 md:pb-28 w-full" 
        style={{ 
          backgroundColor: "#FBF9F6",
          backgroundImage: `url(${footerBg})`,
          backgroundSize: "100% auto",
          backgroundPosition: "bottom center",
          backgroundRepeat: "no-repeat"
        }}
      >
        {/* Call to Action Block */}
        <div className="max-w-3xl mx-auto text-center mb-16 md:mb-20 flex flex-col items-center gap-6 relative z-10">
          <h2 
            className="leading-tight"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              color: "#1A1512"
            }}
          >
            Ready to integrate this into your team meetings?
          </h2>
          <button 
            className="px-8 py-3.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 select-none hover:opacity-90 shadow-sm"
            style={{
              background: "#1A1512",
              color: "#FBF9F6",
              fontFamily: "'Inter', sans-serif"
            }}
          >
            Book a Call
          </button>
        </div>

        {/* Link grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {[
            {
              title: "Product",
              links: ["features", "integrations", "changelog", "api reference"],
            },
            {
              title: "Company",
              links: ["team", "privacy policy", "terms of service", "security"],
            },
            {
              title: "Resources",
              links: ["documentation", "developer api", "case studies", "blog"],
            },
            {
              title: "Status",
              links: [],
              custom: true,
            },
          ].map((col) => (
            <div key={col.title}>
              <p
                className="text-xs uppercase tracking-widest mb-4 text-[#1A1512]"
              >
                {col.title}
              </p>
              {col.custom ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: "#fb8500" }}
                    />
                    <span className="text-sm text-[#fb8500]">
                      system operational
                    </span>
                  </div>
                  <p
                    className="text-xs text-[#5A5550]"
                  >
                    v1.4.2 cloud
                  </p>
                  <p
                    className="text-xs text-[#A8A4A0]"
                  >
                    cloud stream active
                  </p>
                  {/* Motion toggle */}
                  <div className="pt-3 flex items-center gap-3">
                    <button
                      onClick={() => setReducedMotion((v) => !v)}
                      className="relative inline-flex items-center rounded-full transition-colors"
                      style={{
                        width: "36px",
                        height: "20px",
                        background: reducedMotion ? "#1A1512" : "rgba(26,21,18,0.15)",
                        flexShrink: 0,
                      }}
                      aria-label="Toggle reduced motion"
                    >
                      <span
                        className="absolute rounded-full transition-transform"
                        style={{
                          width: "14px",
                          height: "14px",
                          background: "#FBF9F6",
                          top: "3px",
                          left: "3px",
                          transform: reducedMotion ? "translateX(16px)" : "translateX(0)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </button>
                    <span className="text-[10px] text-[#5A5550]">
                      {reducedMotion ? "motion off" : "motion on"}
                    </span>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {col.links.map((link) => {
                    const navItem = navItems.find((item) => item.label === link || item.id === link);
                    return (
                      <li key={link}>
                        {navItem ? (
                          <a
                            href={`#${navItem.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              const el = document.getElementById(navItem.id);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth" });
                              }
                            }}
                            className="text-sm transition-opacity hover:opacity-60 capitalize"
                            style={{ color: "#5A5550" }}
                          >
                            {navItem.label}
                          </a>
                        ) : (
                          <a
                            href="#"
                            className="text-sm transition-opacity hover:opacity-60 capitalize"
                            style={{ color: "#5A5550" }}
                          >
                            {link}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Bottom line */}
        <div
          className="mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left"
          style={{ borderTop: "1px solid rgba(26,21,18,0.06)" }}
        >
          <p className="text-xs text-[#A8A4A0]">
            © 2026 Stash Live Inc. All rights reserved.
          </p>
          <p className="text-xs text-[#A8A4A0]">
            ambient presenter suite
          </p>
        </div>
      </footer>
    </div>
  );
}
