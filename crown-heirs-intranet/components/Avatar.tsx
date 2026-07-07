function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Avatar({
  name,
  src,
  size = 44,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="avatar" src={src} alt={name} style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
}
