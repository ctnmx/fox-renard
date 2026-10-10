const ipv4MappedToIpv6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

function hextets(part: string): string[] {
  return part ? part.split(":") : [];
}

/**
 * The network a client IP address belongs to, which abuse limits count as
 * one client: the address itself for IPv4, and its /64 for IPv6, since one
 * subscriber holds a whole /64.
 */
export function networkOf(clientIp: string | null): string {
  if (!clientIp) return "unknown";

  const ipv4 = ipv4MappedToIpv6.exec(clientIp)?.[1];
  if (ipv4) return ipv4;
  if (!clientIp.includes(":")) return clientIp;

  // Expand `::` into the missing zero hextets, then keep the first four.
  const [address = ""] = clientIp.split("%");
  const [head = "", tail] = address.split("::");
  const headHextets = hextets(head);
  const tailHextets = hextets(tail ?? "");
  const missing =
    tail === undefined ? 0 : 8 - headHextets.length - tailHextets.length;
  const prefix = [
    ...headHextets,
    ...Array<string>(Math.max(0, missing)).fill("0"),
    ...tailHextets,
  ]
    .slice(0, 4)
    .map((hextet) => Number.parseInt(hextet, 16).toString(16));
  return `${prefix.join(":")}::/64`;
}
