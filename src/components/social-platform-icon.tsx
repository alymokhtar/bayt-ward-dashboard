type SocialPlatformIconProps = {
  platform: "youtube" | "snapchat";
  size?: number;
};

export default function SocialPlatformIcon({ platform, size = 20 }: SocialPlatformIconProps) {
  if (platform === "youtube") {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M23.5 6.2a3 3 0 0 0-2.12-2.12C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.53A3 3 0 0 0 .5 6.2C0 8.08 0 12 0 12s0 3.92.5 5.8a3 3 0 0 0 2.12 2.12c1.88.53 9.38.53 9.38.53s7.5 0 9.38-.53a3 3 0 0 0 2.12-2.12C24 15.92 24 12 24 12s0-3.92-.5-5.8Z" fill="#FF0033" transform="scale(1)"/>
        <path d="m9.6 15.1 6.2-3.1-6.2-3.1v6.2Z" fill="white" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.3c-3.2 0-5.4 2.5-5.4 6.2 0 .8.1 1.6.2 2.4-.4.3-1.1.8-1.8.8-.5 0-.8-.2-1.1-.2-.4 0-.7.2-.8.7-.1.6.7 1.1 1.5 1.3.5.1.9.1 1.2.4.2.2.1.5-.1.9-.4.7-1.5 1.5-2.3 1.8-.7.3-.5.9 0 1.1.6.3 1.4.4 2 .5.3.1.4.4.5.8.1.4.3.7 1 .7 1.2 0 2-.6 3.4-.6s2.2.6 3.4.6c.7 0 .9-.3 1-.7.1-.4.2-.7.5-.8.6-.1 1.4-.2 2-.5.5-.2.7-.8 0-1.1-.8-.3-1.9-1.1-2.3-1.8-.2-.4-.3-.7-.1-.9.3-.3.7-.3 1.2-.4.8-.2 1.6-.7 1.5-1.3-.1-.5-.4-.7-.8-.7-.3 0-.6.2-1.1.2-.7 0-1.4-.5-1.8-.8.1-.8.2-1.6.2-2.4 0-3.7-2.2-6.2-5.4-6.2Z" fill="currentColor" />
    </svg>
  );
}
