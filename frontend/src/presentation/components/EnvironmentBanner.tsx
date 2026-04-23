export function EnvironmentBanner() {
  const environmentName = import.meta.env.VITE_ENVIRONMENT_NAME || 'dev';

  if (environmentName === 'production') {
    return null;
  }

  const bannerColor =
    environmentName === 'staging' ? 'bg-yellow-500' : 'bg-red-500';
  const bannerText = `${environmentName.toUpperCase()} ENVIRONMENT`;

  return (
    <div className={`${bannerColor} text-white text-center py-2 text-sm font-semibold`}>
      {bannerText}
    </div>
  );
}
