/**
 * Ready-made message structures for the template builder.
 * Wording follows our ground rules: same review link to everyone (no gating),
 * friendly owner voice, marketing messages carry a STOP line.
 * English first; Tamil versions are added as separate templates.
 */

export type Starter = {
  id: string;
  group: "Review engine" | "Offers & greetings" | "Other";
  label: string;
  hint: string;
  name: string;
  category: "UTILITY" | "MARKETING";
  headerType: "NONE" | "TEXT" | "IMAGE";
  headerText?: string;
  body: string;
  examples: string[];
  footer?: string;
};

const STOP = "Reply STOP to stop offers";

export const STARTERS: Starter[] = [
  {
    id: "visit_checkin",
    group: "Review engine",
    label: "Visit check-in",
    hint: "Sent 30 min after a visit, no link. Their reply tells us if something went wrong.",
    name: "visit_checkin",
    category: "UTILITY",
    headerType: "NONE",
    body: "Hi {{1}}, this is {{2}} from {{3}}. Thank you for visiting us today. Is everything good after your visit?",
    examples: ["Priya", "Ravi", "Sri Sakthi Bakery"],
  },
  {
    id: "review_request",
    group: "Review engine",
    label: "Review request",
    hint: "Sent to everyone after the check-in, with their own tracked review link.",
    name: "review_request",
    category: "UTILITY",
    headerType: "NONE",
    body: "Thank you, {{1}}! If you have a minute, please share your experience of {{2}} on Google. It really helps a local business like ours: {{3}}\n\nThank you!",
    examples: ["Priya", "Sri Sakthi Bakery", "https://example.com/r/k7f2"],
  },
  {
    id: "review_reminder",
    group: "Review engine",
    label: "Gentle reminder",
    hint: "One reminder after 48 hours, only if the link wasn't tapped.",
    name: "review_reminder",
    category: "UTILITY",
    headerType: "NONE",
    body: "Hi {{1}}, a gentle reminder: if you'd like to share your experience of {{2}}, here is the link: {{3}}\n\nNo worries if not. Thank you!",
    examples: ["Priya", "Sri Sakthi Bakery", "https://example.com/r/k7f2"],
  },
  {
    id: "complaint_checkback",
    group: "Review engine",
    label: "Complaint check-back",
    hint: "After the owner calls back about a complaint. Same review link, whatever their answer.",
    name: "complaint_checkback",
    category: "UTILITY",
    headerType: "NONE",
    body: "Hi {{1}}, this is {{2}}. Is everything sorted now after our call? If you'd like to share your experience, here is the link: {{3}}\n\nThank you for giving us the chance to put it right.",
    examples: ["Priya", "Ravi", "https://example.com/r/k7f2"],
  },
  {
    id: "festival_offer",
    group: "Offers & greetings",
    label: "Festival offer (with picture)",
    hint: "Poster on top, greeting and offer below. Owner approves before it goes out.",
    name: "festival_offer",
    category: "MARKETING",
    headerType: "IMAGE",
    body: "Hi {{1}}, festival greetings from all of us at {{2}}! Enjoy {{3}} on your next visit, valid till {{4}}. Just show this message at the counter.",
    examples: ["Priya", "Sri Sakthi Bakery", "10% off", "20 Jan"],
    footer: STOP,
  },
  {
    id: "we_miss_you",
    group: "Offers & greetings",
    label: "We miss you",
    hint: "For customers who haven't visited in 60+ days.",
    name: "we_miss_you",
    category: "MARKETING",
    headerType: "NONE",
    body: "Hi {{1}}, we haven't seen you at {{2}} for a while and we miss you! Here's {{3}} on your next visit, valid till {{4}}.",
    examples: ["Priya", "Sri Sakthi Bakery", "a free coffee", "30 Nov"],
    footer: STOP,
  },
  {
    id: "birthday_wish",
    group: "Offers & greetings",
    label: "Birthday wish",
    hint: "On the customer's birthday, if they shared it.",
    name: "birthday_wish",
    category: "MARKETING",
    headerType: "TEXT",
    headerText: "Happy birthday!",
    body: "Dear {{1}}, everyone at {{2}} wishes you a wonderful year ahead 🎂. Enjoy {{3}} on us any time this month.",
    examples: ["Priya", "Sri Sakthi Bakery", "a free dessert"],
    footer: STOP,
  },
  {
    id: "referral_reward",
    group: "Offers & greetings",
    label: "Referral reward",
    hint: "Thanks the referrer once their friend's order is paid.",
    name: "referral_reward",
    category: "MARKETING",
    headerType: "NONE",
    body: "Hi {{1}}, thank you for referring {{2}} to {{3}}! Your reward is {{4}}. Just show this message on your next visit.",
    examples: ["Priya", "Karthik", "Sri Sakthi Bakery", "15% off"],
    footer: STOP,
  },
  {
    id: "blank",
    group: "Other",
    label: "Blank: write my own",
    hint: "Start from an empty message.",
    name: "",
    category: "UTILITY",
    headerType: "NONE",
    body: "",
    examples: [],
  },
];
