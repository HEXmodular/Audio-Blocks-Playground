
export function getCurrentDateAsSeed(): number {
  const date = new Date();
  // Simple seed: YYYYMMDD
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // getMonth() is 0-indexed
  const day = date.getDate();
  
  // Combine into a number, e.g., 20231225
  return parseInt(`${year}${month < 10 ? '0' : ''}${month}${day < 10 ? '0' : ''}${day}`, 10);
}
