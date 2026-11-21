import { useId } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowUpRight,
  Captions,
  Mic,
  MonitorUp,
  Sparkles,
  Video,
} from "lucide-react";
import { useReducedMotion, EASE } from "@/app/motion";
import { TOPIC_CAPTIONS, TOPIC_METRICS, type TopicKey } from "./content";
import presenter from "@/imports/presenter.webp";

/** A bounded, responsive sample call. All content stays inside its video frame. */
export function PresenterStage({
  topic,
  className = "",
}: {
  topic: TopicKey;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const gradientId = useId();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [2, -2]), {
    stiffness: 120,
    damping: 24,
  });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-2, 2]), {
    stiffness: 120,
    damping: 24,
  });
  const metrics = TOPIC_METRICS[topic];
  return (
    <motion.div
      className={`presenter-stage ${className}`}
      style={
        reduced ? undefined : { rotateX, rotateY, transformPerspective: 1200 }
      }
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left) / rect.width - 0.5);
        y.set((event.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <div className="stage-top">
        <span>
          <i className="live-dot" /> Weekly product review
        </span>
        <span className="stage-sample">SAMPLE MEETING</span>
      </div>
      <div className="stage-video">
        <img
          src={presenter}
          alt="A presenter speaking on a video call"
          width="960"
          height="540"
          fetchPriority="high"
        />
        <span className="stage-you">
          <Video size={12} /> You · presenting
        </span>
        <div className="stage-metric" aria-label={`Sample ${topic} card`}>
          <div className="metric-heading">
            <span>{topic}</span>
            <ArrowUpRight size={15} />
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={topic}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -6 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <p className="metric-label">{metrics[0].label}</p>
              <strong>{metrics[0].value}</strong>
              <svg
                viewBox="0 0 220 70"
                className="metric-chart"
                role="img"
                aria-label="Illustrative upward trend"
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff9c45" stopOpacity=".25" />
                    <stop offset="100%" stopColor="#ff9c45" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M2 56C24 56 27 43 48 46S77 60 96 35S127 43 148 26S182 35 218 7V70H2Z"
                  fill={`url(#${gradientId})`}
                />
                <path
                  d="M2 56C24 56 27 43 48 46S77 60 96 35S127 43 148 26S182 35 218 7"
                  stroke="#fb8500"
                  strokeWidth="2.5"
                  fill="none"
                />
              </svg>
              <div className="metric-secondary">
                <span>
                  {metrics[1].label}
                  <b>{metrics[1].value}</b>
                </span>
                <span>
                  {metrics[2].label}
                  <b>{metrics[2].value}</b>
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="metric-source">
            <span className="live-dot" /> Sample data · on air
          </div>
        </div>
        <div className="stage-transcript">
          <Mic size={12} />
          <span>{TOPIC_CAPTIONS[topic]}</span>
        </div>
      </div>
      <div className="stage-bottom">
        <div className="stage-avatars">
          <span>AR</span>
          <span>MJ</span>
          <span>SK</span>
          <small>+ you</small>
        </div>
        <div className="stage-controls" aria-hidden="true">
          <Mic />
          <Video />
          <MonitorUp />
          <span>
            <Sparkles />
          </span>
          <Captions />
        </div>
        <span className="stage-live">LIVE</span>
      </div>
    </motion.div>
  );
}
