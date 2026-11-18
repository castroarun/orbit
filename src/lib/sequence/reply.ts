/**
 * What kind of customer reply is this? Pure, unit-tested.
 *  - "ack": a short okay/thanks ("ok", "Hi, sure", "நன்றி", 👍). Sequence carries on.
 *  - "needs_owner": anything else — a complaint, a question, a long message,
 *    a voice note or photo. Review messages pause until someone marks it resolved.
 * When unsure we say "needs_owner": an extra alert costs less than a missed complaint.
 */

export type ReplyKind = "ack" | "needs_owner";

const ACK_WORDS = new Set([
  "ok", "okay", "okk", "okey", "k", "kk", "sure", "yes", "yeah", "yep", "ya", "yaa", "fine", "done",
  "thanks", "thank", "you", "thx", "tq", "ty", "hi", "hello", "hey", "good", "nice", "super", "great",
  "awesome", "excellent", "sir", "madam", "mam", "bro", "will", "do", "noted", "welcome", "most",
  "சரி", "நன்றி", "ஓகே", "நல்லது", "சூப்பர்", "sari", "nandri", "seri",
]);
const ACK_EMOJI = /^[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍️]+$/u;
const OKAY_EMOJI = ["👍", "🙏", "😊", "🙂", "❤", "♥", "👌", "😀", "😃", "😄", "🤝", "✅", "💯", "👏", "🥰", "😍"];

export function classifyReply(text: string | null | undefined, messageType = "text"): ReplyKind {
  if (messageType !== "text" && messageType !== "button") return "needs_owner"; // voice, photo, location…
  const t = (text ?? "").trim().toLowerCase();
  if (!t || t.length > 40) return "needs_owner";
  const tokens = t.split(/[\s,.!?;:'"()\-]+/u).filter(Boolean);
  if (!tokens.length) return "needs_owner";
  for (const tok of tokens) {
    if (ACK_WORDS.has(tok)) continue;
    if (ACK_EMOJI.test(tok) && [...tok].every((ch) => OKAY_EMOJI.includes(ch) || /[\u{1F3FB}-\u{1F3FF}‍️]/u.test(ch))) continue;
    return "needs_owner";
  }
  return "ack";
}
