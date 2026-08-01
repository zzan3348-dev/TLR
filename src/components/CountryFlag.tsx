import type { MapCountryIndex } from "../types/mapCountry";

type CountryFlagProps = {
  country: MapCountryIndex;
  flagPath: string | null;
  className?: string;
};

export function CountryFlag({
  country,
  flagPath,
  className,
}: CountryFlagProps) {
  if (flagPath) {
    return (
      <img
        className={className}
        src={flagPath}
        alt={`${country.name} 국기`}
        draggable={false}
      />
    );
  }

  return (
    <div
      className={`${className ?? ""} country-flag-placeholder`}
      role="img"
      aria-label={`${country.name} 국기 미등록`}
    />
  );
}
