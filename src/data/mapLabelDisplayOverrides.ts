const mapLabelScreenScaleByCountryId: Readonly<
  Partial<Record<number, number>>
> = {
  3: 0.84,
  4: 1.18,
};

export function getMapLabelScreenScale(countryId: number): number {
  return mapLabelScreenScaleByCountryId[countryId] ?? 1;
}
