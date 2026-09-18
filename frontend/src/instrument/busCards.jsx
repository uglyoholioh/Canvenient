// Bus card variants for the Home dashboard — one feed, several instruments.
// All of them read the same arrivals payload and speak the same tones; the
// difference is how much of the hour they put on the wall.

/* eslint-disable react-refresh/only-export-components -- the variant registry
   travels with the components it names */

import { ribbonTicks } from "./ledger";
import { serviceTone } from "./busTones";

function etaText(minute) {
  return minute === 0 ? "now" : `${minute} min`;
}

function Empty({ compact }) {
  return (
    <p className="ins-cap" style={compact ? undefined : { padding: "2px 0" }}>
      No departures in the feed.
    </p>
  );
}

function CardShell({ stopName, caption, onOpen, children, className = "" }) {
  return (
    <button
      type="button"
      className={`ins-buscard ${className}`}
      onClick={onOpen}
      title="Open Campus · Bus"
    >
      <span className="ins-buscard-head">
        <span className="ins-label">{stopName}</span>
        {caption && <span className="ins-mono ins-cap">{caption}</span>}
      </span>
      {children}
    </button>
  );
}

// Board — the departure board, miniaturised: services in their tones, the
// next two arrivals each, the feed stamp in the corner.
function Board({ arrivals, stopName, onOpen, failed }) {
  const services = (arrivals?.arrivals || []).filter(
    (entry) => Array.isArray(entry.minutes) && entry.minutes.length > 0,
  );
  return (
    <CardShell
      stopName={stopName}
      caption="ISB"
      onOpen={onOpen}
      className={`is-board${failed ? " is-stale" : ""}`}
    >
      {services.length === 0 ? (
        <Empty />
      ) : (
        <span className="ins-busboard">
          {services.slice(0, 4).map((service) => (
            <span key={service.service} className="ins-busboard-row">
              <span
                className="ins-busboard-chip"
                style={{ "--tone": serviceTone(service.service) }}
              >
                {service.service}
              </span>
              <span className="ins-mono ins-busboard-etas">
                {service.minutes
                  .slice(0, 2)
                  .map((m) => (
                    <span key={m} className="ins-tickvalue">
                      {etaText(m)}
                    </span>
                  ))
                  .reduce((acc, item, index) => (index ? [...acc, " · ", item] : [item]), [])}
              </span>
            </span>
          ))}
        </span>
      )}
    </CardShell>
  );
}

// Hero — the next departure, and only that: one numeral, one tone, then.
function Hero({ arrivals, stopName, onOpen, failed }) {
  const { next } = ribbonTicks(arrivals?.arrivals || []);
  const services = arrivals?.arrivals || [];
  const after = next
    ? services
        .filter((s) => s.service === next.service && s.minutes[1] != null)
        .map((s) => s.minutes[1])[0]
    : null;
  return (
    <CardShell
      stopName={stopName}
      onOpen={onOpen}
      className={`is-hero${failed ? " is-stale" : ""}`}
    >
      {next ? (
        <span className="ins-bushero">
          <span className="ins-bushero-chip" style={{ "--tone": serviceTone(next.service) }}>
            {next.service}
          </span>
          <span className="ins-numeral ins-bushero-numeral">{etaText(next.minute)}</span>
          <span className="ins-cap">
            {after != null ? `then ${etaText(after)}` : "single departure"}
          </span>
        </span>
      ) : (
        <Empty />
      )}
    </CardShell>
  );
}

// Ribbon — the hour as a scale, in a proper card this time.
function Ribbon({ arrivals, stopName, onOpen, failed }) {
  const { ticks, next } = ribbonTicks(arrivals?.arrivals || []);
  return (
    <CardShell
      stopName={stopName}
      caption={next ? `${next.service} · ${etaText(next.minute)}` : null}
      onOpen={onOpen}
      className={`is-ribbon${failed ? " is-stale" : ""}`}
    >
      {ticks.length > 0 ? (
        <span className="ins-busribbon">
          <span className="ins-busribbon-scale">
            {["now", "30", "60"].map((label, index) => (
              <span
                key={label}
                className="ins-mono ins-busribbon-mark"
                style={{ left: `${index * 50}%` }}
              >
                {label}
              </span>
            ))}
          </span>
          <span className="ins-busribbon-track">
            {ticks.map((tick, index) => (
              <i
                key={index}
                className="ins-tip ins-busribbon-tick"
                style={{
                  left: `${(tick.minute / 60) * 100}%`,
                  "--tone": serviceTone(tick.service),
                }}
                data-tip={`${tick.service} · ${etaText(tick.minute)}`}
              />
            ))}
          </span>
        </span>
      ) : (
        <Empty compact />
      )}
    </CardShell>
  );
}

// Chips — one tone-tinted chip per service, next arrival each.
function Chips({ arrivals, stopName, onOpen, failed }) {
  const services = (arrivals?.arrivals || []).filter(
    (entry) => Array.isArray(entry.minutes) && entry.minutes.length > 0,
  );
  return (
    <CardShell
      stopName={stopName}
      onOpen={onOpen}
      className={`is-chips${failed ? " is-stale" : ""}`}
    >
      {services.length === 0 ? (
        <Empty compact />
      ) : (
        <span className="ins-buschips">
          {services.slice(0, 6).map((service) => (
            <span
              key={service.service}
              className="ins-buschip"
              style={{ "--tone": serviceTone(service.service) }}
            >
              <b>{service.service}</b>
              <span className="ins-mono">{etaText(service.minutes[0])}</span>
            </span>
          ))}
        </span>
      )}
    </CardShell>
  );
}

// Line — the whole hour as one quiet line of type.
function Line({ arrivals, stopName, onOpen, failed }) {
  const { ticks } = ribbonTicks(arrivals?.arrivals || [], 60, 5);
  return (
    <button
      type="button"
      className={`ins-busline${failed ? " is-stale" : ""}`}
      onClick={onOpen}
      title="Open Campus · Bus"
    >
      {ticks.length === 0 ? (
        <span className="ins-cap ins-mono">{stopName} · no departures</span>
      ) : (
        <span className="ins-mono">
          {ticks
            .map((tick) => `${tick.service} ${tick.minute === 0 ? "now" : `${tick.minute}m`}`)
            .join(" · ")}
          <span className="ins-cap ins-mono"> — {stopName}</span>
        </span>
      )}
    </button>
  );
}

export const BUS_CARDS = [
  {
    id: "board",
    name: "Board",
    caption: "services in their tones, next two each",
    Component: Board,
  },
  { id: "hero", name: "Hero", caption: "the next departure, large", Component: Hero },
  { id: "ribbon", name: "Ribbon", caption: "the hour as a scale", Component: Ribbon },
  { id: "chips", name: "Chips", caption: "one chip per service", Component: Chips },
  { id: "line", name: "Line", caption: "the hour as one line of type", Component: Line },
];

export function BusCard({ variant = "board", ...props }) {
  const found = BUS_CARDS.find((card) => card.id === variant) || BUS_CARDS[0];
  return <found.Component {...props} />;
}
