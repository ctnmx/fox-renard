// Every string the Widget shows on its own; the Site provides the rest. Only
// French ships in V1, and another language is one more object of the same shape.
const fr = {
  poweredBy: "Propulsé par Fox Renard",
};

export type MessageKey = keyof typeof fr;

export function t(key: MessageKey): string {
  return fr[key];
}
