import SettingsClient from "./settings-client";

export const metadata = {
  title: "الإعدادات | بيت ورد",
};

export default function SettingsPage() {
  const cloudinaryConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );

  return <SettingsClient cloudinaryConfigured={cloudinaryConfigured} />;
}
