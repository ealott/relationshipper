export function Avatar({ name, who, size = 28 }: { name: string; who: 'me' | 'partner'; size?: number }) {
  const initial = [...(name.trim() || '?')][0]!.toUpperCase();
  return (
    <span class={`avatar avatar--${who}`} style={{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.45}px` }} aria-hidden="true">
      {initial}
    </span>
  );
}

export function CoupleAvatars({ me, partner }: { me: string; partner: string }) {
  return (
    <span class="couple-avatars" aria-label={`${me} and ${partner}`}>
      <Avatar name={me} who="me" size={34} />
      <Avatar name={partner} who="partner" size={34} />
    </span>
  );
}
