/**
 * Jumlah diproses sebagai bilangan bulat per seperseribu (milli) agar penjumlahan berulang tidak menggeser
 * angka (0.1 + 0.2) dan tidak melahirkan stok negatif palsu atau galat "stok tidak cukup" yang salah.
 */
export const toMilli = (n: number): number => Math.round(n * 1000)
export const fromMilli = (m: number): number => m / 1000
