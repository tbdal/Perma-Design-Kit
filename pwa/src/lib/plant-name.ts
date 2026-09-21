import type { PlantData } from './types';
import { getLang } from './i18n/core';

/** Common name in the UI language: English UI prefers `commonNameEn`, falling
 *  back to the (German) `commonName`; German UI always uses `commonName`.
 *  Empty string if neither is known. */
export function displayCommonName(p: Pick<PlantData, 'commonName' | 'commonNameEn'>): string {
  if (getLang() === 'en' && p.commonNameEn) return p.commonNameEn;
  return p.commonName || '';
}

/** displayCommonName with the Latin name as last resort. */
export function displayName(p: Pick<PlantData, 'commonName' | 'commonNameEn' | 'latinName'>): string {
  return displayCommonName(p) || p.latinName;
}
